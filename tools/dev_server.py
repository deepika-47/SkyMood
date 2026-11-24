#!/usr/bin/env python3
"""SkyMood local development server.

Serves the static app and mirrors the Vercel /api/weather function so the
front end can be exercised without the Vercel CLI. Reads WEATHER_API_KEY from
.env (stdlib only).

Usage: python tools/dev_server.py [port]
"""

from __future__ import annotations

import json
import mimetypes
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(ROOT, ".env")
WEATHER_BASE = "https://api.weatherapi.com/v1"
ALLOWED_EXTENSIONS = {".html", ".css", ".js", ".svg", ".png", ".ico", ".json", ".webmanifest", ".txt"}
KEY_ERROR_CODES = {1002, 1007, 2006, 2008, 2009, 2010}
BAD_REQUEST_CODES = {1003, 1004, 1005}


def load_env() -> None:
    if not os.path.exists(ENV_PATH):
        return
    with open(ENV_PATH, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


class UpstreamError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def map_error(status: int, body: dict) -> UpstreamError:
    provider_code = 0
    try:
        provider_code = int((body.get("error") or {}).get("code") or 0)
    except (TypeError, ValueError):
        provider_code = 0

    if provider_code == 1006:
        return UpstreamError(404, "CITY_NOT_FOUND", "No location matched that city name.")
    if provider_code == 2007 or status == 429:
        return UpstreamError(429, "RATE_LIMITED", "The weather service request limit was reached.")
    if provider_code in KEY_ERROR_CODES or status in {401, 403}:
        return UpstreamError(500, "INVALID_API_KEY", "The WeatherAPI key is missing, invalid or out of quota.")
    if provider_code in BAD_REQUEST_CODES:
        return UpstreamError(400, "BAD_REQUEST", "The city query was rejected.")
    if status >= 500:
        return UpstreamError(502, "SERVICE_UNAVAILABLE", "WeatherAPI is temporarily unavailable.")
    return UpstreamError(502, "UPSTREAM_UNAVAILABLE", "Unexpected upstream response.")


def fetch_current(query: str) -> dict:
    params = {
        "key": os.environ.get("WEATHER_API_KEY", ""),
        "q": query,
        "aqi": "no",
    }
    url = f"{WEATHER_BASE}/current.json?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "SkyMood-dev-server/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
            if payload.get("error"):
                raise map_error(200, payload)
            if not isinstance(payload.get("location"), dict) or not isinstance(payload.get("current"), dict):
                raise UpstreamError(502, "UNEXPECTED_RESPONSE", "WeatherAPI returned an incomplete response.")
            return payload
    except urllib.error.HTTPError as error:
        try:
            body = json.loads(error.read().decode("utf-8"))
        except Exception:
            body = {}
        raise map_error(error.code, body) from error
    except UpstreamError:
        raise
    except Exception as error:  # network / timeout / bad JSON
        raise UpstreamError(502, "SERVICE_UNAVAILABLE", f"Could not reach WeatherAPI: {error}") from error


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("X-Weather-Provider", "WeatherAPI.com")
        self.send_header("X-Weather-Endpoint", "/v1/current.json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/api/weather":
            try:
                self.handle_weather(parsed)
            except (BrokenPipeError, ConnectionAbortedError):
                # The browser aborted an in-flight search (for example when a
                # newer query superseded it). Nothing left to send.
                pass
            return

        parts = [part for part in parsed.path.split("/") if part]
        if any(part.startswith(".") for part in parts):
            self.send_error(404)
            return
        extension = os.path.splitext(parsed.path)[1].lower()
        if extension and extension not in ALLOWED_EXTENSIONS:
            self.send_error(404)
            return

        super().do_GET()

    def handle_weather(self, parsed: urllib.parse.ParseResult) -> None:
        if not os.environ.get("WEATHER_API_KEY"):
            self.send_json(
                500,
                {"ok": False, "error": {"code": "API_KEY_MISSING", "message": "WEATHER_API_KEY is not configured."}},
            )
            return

        query = (urllib.parse.parse_qs(parsed.query).get("q") or [""])[0]
        query = " ".join(query.split()).strip()

        if not query or len(query) > 80:
            self.send_json(
                400,
                {"ok": False, "error": {"code": "BAD_REQUEST", "message": "Provide a city name between 1 and 80 characters."}},
            )
            return

        try:
            self.send_json(200, fetch_current(query))
        except UpstreamError as error:
            self.send_json(
                error.status,
                {"ok": False, "error": {"code": error.code, "message": error.message}},
            )
        except Exception as error:  # pragma: no cover - defensive
            self.send_json(
                500,
                {"ok": False, "error": {"code": "UNEXPECTED", "message": str(error)}},
            )

    def log_message(self, fmt: str, *args) -> None:
        sys.stdout.write("%s - %s\n" % (self.address_string(), fmt % args))


def main() -> None:
    load_env()
    mimetypes.add_type("application/javascript", ".js")
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    key_state = "configured" if os.environ.get("WEATHER_API_KEY") else "MISSING (.env)"
    print(f"SkyMood dev server: http://127.0.0.1:{port}  |  WeatherAPI key: {key_state}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping SkyMood dev server.")
        server.server_close()


if __name__ == "__main__":
    main()
