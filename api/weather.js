"use strict";

/**
 * SkyMood weather proxy (Vercel Node function).
 *
 * GET /api/weather?q=Mumbai
 *
 * Keeps the WeatherAPI key in the server environment and requests only a
 * location's current conditions. Successful responses pass the WeatherAPI
 * body through untouched, so the client-side JSON viewer shows the real
 * provider response.
 */

const WEATHER_BASE = "https://api.weatherapi.com/v1";
const UPSTREAM_TIMEOUT_MS = 10000;
const MAX_QUERY_LENGTH = 80;

const KEY_ERROR_CODES = new Set([1002, 1007, 2006, 2008, 2009, 2010]);
const BAD_REQUEST_CODES = new Set([1003, 1004, 1005]);

function sendJson(res, status, body, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  Object.entries(extraHeaders).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(body));
}

function fail(res, status, code, message) {
  sendJson(res, status, { ok: false, error: { code, message } });
}

function getApiKey() {
  return (process.env.WEATHER_API_KEY || process.env.WEATHERAPI_KEY || "").trim();
}

function cleanQuery(raw) {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim();
}

function mapUpstreamError(status, body) {
  const providerCode = Number(body && body.error && body.error.code);

  if (providerCode === 1006) {
    return {
      status: 404,
      code: "CITY_NOT_FOUND",
      message: "No location matched that city name.",
    };
  }

  if (providerCode === 2007 || status === 429) {
    return {
      status: 429,
      code: "RATE_LIMITED",
      message: "The weather service request limit was reached.",
    };
  }

  if (KEY_ERROR_CODES.has(providerCode) || status === 401 || status === 403) {
    return {
      status: 500,
      code: "INVALID_API_KEY",
      message: "The WeatherAPI key is missing, invalid or out of quota.",
    };
  }

  if (BAD_REQUEST_CODES.has(providerCode)) {
    return {
      status: 400,
      code: "BAD_REQUEST",
      message: "The city query was rejected.",
    };
  }

  if (status >= 500) {
    return {
      status: 502,
      code: "SERVICE_UNAVAILABLE",
      message: "WeatherAPI is temporarily unavailable.",
    };
  }

  return {
    status: 502,
    code: "UPSTREAM_UNAVAILABLE",
    message: "WeatherAPI could not complete the request.",
  };
}

async function fetchCurrent(apiKey, query) {
  const url = new URL(`${WEATHER_BASE}/current.json`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", query);
  url.searchParams.set("aqi", "no");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      throw mapUpstreamError(response.status, body);
    }

    // Validate that this is a complete current-conditions response before
    // handing the untouched provider body to the browser.
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw {
        status: 502,
        code: "UNEXPECTED_RESPONSE",
        message: "WeatherAPI returned an unreadable response.",
      };
    }

    if (
      !parsed ||
      !parsed.location ||
      !parsed.current ||
      typeof parsed.current.temp_c !== "number" ||
      typeof parsed.location.name !== "string" ||
      typeof parsed.location.tz_id !== "string"
    ) {
      throw {
        status: 502,
        code: "UNEXPECTED_RESPONSE",
        message: "WeatherAPI returned an incomplete weather response.",
      };
    }

    return text;
  } catch (error) {
    if (error && error.code) throw error;
    if (error && error.name === "AbortError") {
      throw {
        status: 504,
        code: "TIMEOUT",
        message: "WeatherAPI took too long to respond.",
      };
    }
    throw {
      status: 502,
      code: "SERVICE_UNAVAILABLE",
      message: "Could not reach WeatherAPI.",
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return fail(res, 405, "METHOD_NOT_ALLOWED", "Only GET is supported.");
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return fail(
      res,
      500,
      "API_KEY_MISSING",
      "WEATHER_API_KEY is not configured on the server."
    );
  }

  let query = "";
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    query = cleanQuery(url.searchParams.get("q") || "");
  } catch {
    return fail(res, 400, "BAD_REQUEST", "Could not read the city query.");
  }

  if (!query || query.length > MAX_QUERY_LENGTH) {
    return fail(
      res,
      400,
      "BAD_REQUEST",
      `Provide a city name between 1 and ${MAX_QUERY_LENGTH} characters.`
    );
  }

  if (!/^[\p{L}\p{N}\s,.'’()\-]+$/u.test(query)) {
    return fail(res, 400, "BAD_REQUEST", "The city name contains unsupported characters.");
  }

  try {
    const rawBody = await fetchCurrent(apiKey, query);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Weather-Provider", "WeatherAPI.com");
    res.setHeader("X-Weather-Endpoint", "/v1/current.json");
    return res.end(rawBody);
  } catch (error) {
    const status = error && error.status ? error.status : 500;
    const code = error && error.code ? error.code : "UNEXPECTED";
    const message =
      error && error.code
        ? error.message
        : "An unexpected error occurred while loading weather.";
    return fail(res, status, code, message);
  }
};
