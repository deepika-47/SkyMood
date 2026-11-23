"use strict";

/**
 * SkyMood weather proxy (Vercel Node function).
 *
 * Keeps the WeatherAPI key in the server environment and aggregates the two
 * endpoints the UI needs into one JSON response:
 *   GET /api/weather?q=Mumbai
 *
 * Upstream:
 *   /v1/current.json
 *   /v1/forecast.json?days=5
 *
 * The client's JSON viewer receives these provider payloads untouched inside
 * `data.current` and `data.forecast`.
 */

const WEATHER_BASE = "https://api.weatherapi.com/v1";
const UPSTREAM_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 45 * 1000;
const cache = new Map();

const KEY_ERROR_CODES = new Set([1002, 1003, 2006, 2007, 2008, 2009, 2010]);

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.end(JSON.stringify(body));
}

function fail(res, status, code, message) {
  send(res, status, { ok: false, error: { code, message } });
}

function getApiKey() {
  return (process.env.WEATHER_API_KEY || process.env.WEATHERAPI_KEY || "").trim();
}

function validQuery(raw) {
  return typeof raw === "string" && raw.trim().length > 0 && raw.trim().length <= 80;
}

function mapUpstreamError(status, body) {
  const providerCode = body && body.error && Number(body.error.code);
  const providerMessage = body && body.error && body.error.message;

  if (providerCode === 1006) {
    return { status: 404, code: "CITY_NOT_FOUND", message: "No location matched that city name." };
  }
  if (providerCode === 2007 || status === 429) {
    return { status: 429, code: "RATE_LIMITED", message: "The weather service request limit was reached." };
  }
  if (KEY_ERROR_CODES.has(providerCode) || status === 401 || status === 403) {
    return {
      status: 500,
      code: "INVALID_API_KEY",
      message: "The WeatherAPI key is missing, invalid or out of quota.",
    };
  }
  if (providerCode === 1003 || providerCode === 1004 || providerCode === 1007) {
    return { status: 400, code: "BAD_REQUEST", message: "The city query was rejected." };
  }
  if (status >= 500) {
    return { status: 502, code: "SERVICE_UNAVAILABLE", message: "WeatherAPI is temporarily unavailable." };
  }
  return {
    status: 502,
    code: "UPSTREAM_UNAVAILABLE",
    message: providerMessage ? "WeatherAPI could not complete the request." : "Unexpected upstream response.",
  };
}

async function fetchUpstream(path, params) {
  const url = new URL(`${WEATHER_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }

    if (!response.ok || !body || (body.error && body.error.code)) {
      throw mapUpstreamError(response.status, body);
    }

    return body;
  } catch (error) {
    if (error && error.code) throw error;
    if (error && error.name === "AbortError") {
      throw { status: 504, code: "TIMEOUT", message: "WeatherAPI took too long to respond." };
    }
    throw { status: 502, code: "SERVICE_UNAVAILABLE", message: "Could not reach WeatherAPI." };
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
    query = (url.searchParams.get("q") || "").replace(/\s+/g, " ").trim();
  } catch {
    return fail(res, 400, "BAD_REQUEST", "Could not read the city query.");
  }

  if (!validQuery(query)) {
    return fail(res, 400, "BAD_REQUEST", "Provide a city name between 1 and 80 characters.");
  }

  if (!/^[\p{L}\p{N}\s,.'’()\-]+$/u.test(query)) {
    return fail(res, 400, "BAD_REQUEST", "The city name contains unsupported characters.");
  }

  const cacheKey = query.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return send(res, 200, cached.body);
  }

  try {
    const [current, forecast] = await Promise.all([
      fetchUpstream("/current.json", { key: apiKey, q: query, aqi: "no" }),
      fetchUpstream("/forecast.json", { key: apiKey, q: query, days: "5", aqi: "no", alerts: "no" }),
    ]);

    const payload = {
      ok: true,
      requestedQuery: query,
      provider: "WeatherAPI.com",
      fetchedAt: new Date().toISOString(),
      endpoints: ["/v1/current.json", "/v1/forecast.json?days=5"],
      data: { current, forecast },
    };

    cache.set(cacheKey, { body: payload, expires: Date.now() + CACHE_TTL_MS });
    if (cache.size > 100) {
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }

    return send(res, 200, payload);
  } catch (error) {
    const status = error && error.status ? error.status : 500;
    const code = error && error.code ? error.code : "UNEXPECTED";
    const message =
      error && error.code ? error.message : "An unexpected error occurred while loading weather.";
    return fail(res, status, code, message);
  }
};
