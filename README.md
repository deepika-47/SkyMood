# SkyMood

**Know the sky, plan your day.**

SkyMood is a lifestyle weather app: live current conditions, a plain-English “vibe” for the day, hourly and multi-day outlooks, and a developer JSON viewer. Weather data comes from [WeatherAPI.com](https://www.weatherapi.com/), and the API key stays on the server.

**Live app:** _added after deployment_

---

## What's inside

- **Search any city** with Enter or the Search button, plus quick city presets.
- **Expressive recommendations** that translate weather into one of six moods, with the exact copy from the brief.
- **Six full-screen gradients** that cross-fade over 0.6s when the city or mood changes.
- **Hero weather card** with local time, condition, Celsius temperature, feels-like, daily high/low and last-updated time.
- **Metrics + details**: humidity, wind, UV index, feels-like, cloud cover, visibility, pressure, wind detail, Fahrenheit and update time.
- **24-hour forecast strip** (horizontally scrollable).
- **Outlook cards** with daily high/low, condition and rain chance.
- **Mood preview** popover to preview all six backgrounds/copies without changing the live data, plus one-click copy of the vibe.
- **API response viewer** with formatted/raw tabs, copy and scrolling.
- **Loading, empty, error and outage states**, retry actions, and protection against stale responses.

The visual system uses frosted-glass cards (`rgba(255,255,255,.18)`, `blur(12px)`, `rgba(255,255,255,.3)` borders, 20px radii), Plus Jakarta Sans for display text and Inter for numerals/data.

---

## Architecture

```
index.html              App shell, static UI, accessible landmarks
css/styles.css          Design tokens, sky gradients, glass UI, responsive layouts
js/app.js               State, API client, mood engine, rendering, JSON viewer, errors
api/weather.js          Vercel Node function — WeatherAPI proxy, key stays server-side
tools/dev_server.py     Local static server + same proxy (Python stdlib only)
.env.example            Local environment template (real .env is git-ignored)
package.json            Project metadata + `npm run dev` convenience script
```

There is no build step and no frontend framework. The only server code is a single read-only proxy function.

### Why a proxy?

The brief noted that frontend API keys are not secret. Instead of shipping the key in `app.js`, SkyMood calls its own `/api/weather?q=…` endpoint. The function adds `WEATHER_API_KEY` from the environment, requests `current.json` and `forecast.json?days=5` in parallel, validates the city, maps upstream errors, and returns:

```json
{
  "ok": true,
  "requestedQuery": "Mumbai, India",
  "provider": "WeatherAPI.com",
  "fetchedAt": "…",
  "endpoints": ["/v1/current.json", "/v1/forecast.json?days=5"],
  "data": { "current": { … }, "forecast": { … } }
}
```

The upstream bodies are passed through untouched under `data.current` and `data.forecast`, so the JSON viewer shows the real provider payload. No key is sent to the browser (verified in a live response).

### Mood engine

Priority order, applied top-down:

| Priority | Mood | Condition | Copy |
| --- | --- | --- | --- |
| 1 | Rain Check ☔ | condition text matches rain, drizzle, shower, thunder, storm or sleet | “Step out with an umbrella—don't get soaked!” |
| 2 | Freeze Frame ❄️ | snow/ice/freezing, **or** temp < 15°C | “Bone-chilling cold outside—cuddle up tight!” |
| 3 | Starry Night 🌙 | night (`is_day = 0`) with clear/sunny conditions | “Starry skies ahead—sleep tight!” |
| 4 | Sun Alert ☀️ | temp > 32°C **or** UV index > 7 | “Don't get eaten by the sun today—stay shaded and hydrated!” |
| 5 | Breezy Mode 🌀 | wind ≥ 20 km/h and 18–25°C | “A cool breeze that touches your soul—step outside and enjoy!” |
| 6 | Perfect Day 🌤️ | clear/sunny/partly cloudy and 22–31°C | “Clear skies ahead—plan a day out with your loved ones!” |
| fallback | Easy Going ✨ | anything else (e.g. mild haze) | “Mild and steady—a good day to head outside!” |

The fallback avoids claiming “clear skies” when it is hazy or overcast. Thresholds live in `THRESHOLDS` in `js/app.js` and are easy to tune.

The six gradients are exactly the requested values and are switched by cross-fading two fixed layers (gradients themselves are not animatable).

### City query qualification

WeatherAPI resolves the bare string `Delhi` to Delhi, Ontario (Canada). Preset city searches are therefore qualified (`Delhi, India`, `London, United Kingdom`, `New York, United States`, …) so clicking a preset always shows the expected city. Typed searches that include a country/region are passed through unchanged.

---

## Run locally

Requirements: Python 3.9+ (no Node.js needed for the local server).

```bash
# 1. Add your key
cp .env.example .env
# edit .env → WEATHER_API_KEY=your_key

# 2. Serve the app and proxy
python tools/dev_server.py
# → http://127.0.0.1:4173

# optional: different port
python tools/dev_server.py 5000
```

`tools/dev_server.py` serves only static asset types, blocks dotfiles (including `.env`), and exposes the same `/api/weather` shape as the Vercel function. It caches per city for 45 seconds.

With Node/Vercel CLI installed you can also use `vercel dev`, as long as `WEATHER_API_KEY` is present in the environment.

## Deploy on Vercel

1. Import the GitHub repository into Vercel (or deploy with the CLI).
2. Add an environment variable **`WEATHER_API_KEY`** for Production, Preview and Development.
3. Deploy. Framework preset: **Other**; no build command; output is the repository root.
4. `api/weather.js` is picked up automatically as a Node serverless function.

The key is never exposed to the client. Rotate it in the WeatherAPI dashboard and update the Vercel env var if needed.

---

## Requirement-wise implementation & test checklist

Tested on **23 Nov 2026** in Chromium against the local app (1440×1100, 1000×800, 768×1150 and 390×844 viewports) with live WeatherAPI calls. Lighthouse (with the JSON viewer open): **Accessibility 100, Best Practices 100, SEO 100**.

### FR-01 — Application initialization

| ID | Status | Evidence |
| --- | --- | --- |
| FR-01.1 Default city Mumbai | ✅ Passed | Input prefilled with Mumbai; hero renders Mumbai. |
| FR-01.2 Initial API call | ✅ Passed | `/api/weather?q=Mumbai%2C%20India` fired on load; response 200. |
| FR-01.3 Initial loading | ✅ Passed | Skeleton card + spinner + “Fetching Mumbai's sky…” shown immediately; `aria-busy` set. |
| FR-01.4 Successful response | ✅ Passed | Hero, vibe, metrics, details, hourly (24), outlook (3) and JSON populated. |
| FR-01.5 Failed response | ✅ Passed | With an invalid-key server, a dedicated “API configuration error” fatal state rendered instead of a blank card. |

Acceptance: automatic Mumbai request ✅ · input shows Mumbai ✅ · values come from the API ✅ · no hardcoded weather values (all initial DOM values are “—”, filled at runtime) ✅.

### FR-02 — City search

| ID | Status | Evidence |
| --- | --- | --- |
| FR-02.1 Search input | ✅ Passed | Text entry works. |
| FR-02.2 Search button | ✅ Passed | Mouse click submits. |
| FR-02.3 Enter key | ✅ Passed | Enter in the input submits the form. |
| FR-02.4 Empty validation | ✅ Passed | Inline error shown, focus kept, **zero** extra API requests. |
| FR-02.5 API request | ✅ Passed | Verified for Delhi, Bengaluru, London, Tokyo, Sydney, Dubai, Paris. |
| FR-02.6 Result update | ✅ Passed | All sections re-render from the new payload. |
| FR-02.7 Search failure | ✅ Passed | “City not found” banner; previous data marked as the last successful update. |

Acceptance: Delhi/London fetch correctly ✅ · input retains the searched city (typed or chip) ✅ · old data is dimmed/overlaid during loading and explicitly labelled on error ✅ · multiple searches without refresh ✅.

### FR-03 — Popular cities

| ID | Status | Evidence |
| --- | --- | --- |
| FR-03.1 Chips | ✅ Passed | Mumbai, Delhi, Bengaluru, Hyderabad, Chennai, Kolkata, Pune, Ahmedabad, New York, London (plus Tokyo from the second brief) rendered as chips. |
| FR-03.2 Click fetches | ✅ Passed | Bengaluru chip loaded Karnataka weather. |
| FR-03.3 Search input sync | ✅ Passed | Input updated to the clicked city. |
| FR-03.4 Selected highlight | ✅ Passed | `aria-pressed="true"` + solid white selected style; previous chip clears. |
| FR-03.5 Weather update | ✅ Passed | Hero, vibe, metrics, hourly, outlook and JSON all changed. |

### FR-04 — Current weather

✅ Passed. Every value is populated from the response: temperature in °C (hero + metric + outlook), wind in km/h, API condition icon/alt text, and local time via the returned `tz_id`. Verified against Mumbai’s live payload: 28°C, 54% humidity, 6.5 km/h NNE, UV 0, 32% cloud, 10 km visibility, 1016 hPa, 81.7°F, “Smoky haze”, last updated 10:15 PM local.

### FR-05 — Weather interpretation

✅ Passed. All six titles/copies match the brief exactly (verified by clicking every mood preview option and reading the rendered text and computed gradient). Live mood changes on search (e.g. rainy Bengaluru → Rain Check). Thresholds and priority order are documented above. The fallback “Easy Going” is the only added copy, used for conditions outside the six scenarios (e.g. mild haze).

### FR-06 — Additional metrics

✅ Passed. Primary cards: feels like, humidity (%), wind (km/h), UV index with a descriptor. Secondary: cloud cover, visibility, pressure, wind direction/gusts, Fahrenheit temperature, last updated. All update on every successful city change.

### FR-07 — API response viewer

| ID | Status | Evidence |
| --- | --- | --- |
| FR-07.1 Formatted JSON | ✅ Passed | Indented `JSON.stringify(payload, null, 2)`. |
| FR-07.2 Raw JSON | ✅ Passed | Original response text preserved (single-line server JSON). |
| FR-07.3 Tab switching | ✅ Passed | Click + ArrowLeft/ArrowRight/Home/End; `aria-selected`/`tabpanel` updated. |
| FR-07.4 Copy | ✅ Passed | Copy captures the active representation; toast confirms; verified copied string equals the visible JSON. |
| FR-07.5 Data sync | ✅ Passed | Viewer re-populated after each successful request (e.g. Tokyo appeared after a search). |
| FR-07.6 Scroll | ✅ Passed | `max-height` + overflow auto; long payload scrolls. |

### FR-08 — Errors & exceptions

| Scenario | Status | Evidence |
| --- | --- | --- |
| Empty city | ✅ Passed | Inline validation, no request. |
| Invalid city | ✅ Passed | “City not found”, input retained, previous card kept. |
| Invalid API key | ✅ Passed | Stub server with a bad key → fatal “API configuration error”. |
| Rate limit | ✅ Passed (simulated 429) | “Weather service is busy” + Retry. |
| Internet unavailable | ✅ Passed (fetch rejection simulated) | “No internet connection” + Retry. |
| API server unavailable | ✅ Passed (real local outage → 502) | “Service unavailable” + Retry; recovered via Retry after restart. |
| Slow API | ✅ Passed (hanging request) | Loading overlay visible for 15s; then “The sky is taking too long”. |
| Unexpected response | ✅ Passed | Malformed 200 and incomplete payload both → “Unexpected response”; previous data kept. |
| No blank weather card | ✅ Passed | Data stays visible during updates/failures; fatal state replaces it only when no data exists. |
| No partial replacement | ✅ Passed | Incomplete payload rejected before any render. |
| Retry | ✅ Passed | Used successfully after a real outage. |
| Stale response guard | ✅ Passed | Rapid London→Tokyo searches; only Tokyo could render (request sequence + AbortController). |

The real WeatherAPI rate-limit and offline-network paths were not triggered against the live provider; their UI branches were exercised with controlled stubs. The real 502 outage, invalid key, invalid city, malformed payload and timeout paths were exercised end-to-end.

### FR-09 — Responsive behaviour

✅ Passed. 1440px: centred 1160px content, 2-column hero, 4 metric cards. 1000px: 2-column hero, 4 metrics. 768px: stacked hero, 2×2 metrics, 2-column details. 390px: stacked search/hero, 2×2 metrics, 1-column outlook rows, scrollable chips/hourly, JSON controls wrap. `scrollWidth === clientWidth` at 390, 768, 800 and 1440 — no horizontal page overflow.

### FR-10 — WeatherAPI integration

✅ Passed. `GET /v1/current.json` and `/v1/forecast.json` (proxy), automatic Mumbai load, key + city query parameters server-side, dynamic UI population, fresh data per search, error handling, no mock weather data. `WEATHER_API_KEY` is in `.env` locally and in Vercel env in production; the key is absent from client responses and bundles.

### Non-functional

| Category | Status | Notes |
| --- | --- | --- |
| Performance | ✅ | Static files, no framework/build; initial live request ~1.5s in local testing. |
| API performance | ✅ | Loading feedback is synchronous before the request; 15s client timeout. |
| Reliability | ✅ | Errors handled without blanking valid data; stale responses discarded. |
| Security | ✅ | API key is server-side; dotfiles blocked by the dev server; no key in payloads. (Not a substitute for rotating keys/quota controls.) |
| Maintainability | ✅ | Separate HTML/CSS/JS, small pure functions for mood/normalisation/rendering. |
| Compatibility | ⚠️ Partially verified | Tested in Chromium; uses modern standard APIs (fetch, AbortController, Intl, backdrop-filter). Safari and Firefox were not executed in this environment. |
| Accessibility | ✅ | Lighthouse 100 with JSON open; labelled search, live regions, `aria-busy`, tabs pattern, keyboard chips/buttons, focus return on Escape, skip link, reduced-motion support. Screen-reader testing was not performed. |
| Responsiveness | ✅ | Verified at four widths, no horizontal overflow. |
| Scalability | ✅ | Thresholds, moods, presets and API mapping are centralised and modular. |

### Out of scope

No login, database, profiles, history, forecasts beyond the provider response, notifications, payments, admin dashboard or backend services beyond the weather proxy were added.

---

## Known limitations / incomplete items

1. **5-day outlook is limited to 3 days by the WeatherAPI free plan.** The server requests `days=5`, but the free tier returns 3 forecast days. The UI derives its heading from the payload and shows **“3-Day Outlook”** with a note; it will automatically show 5 cards if the key is upgraded to a plan that returns 5 days. No mock days are added. This is the only functional requirement not fully met, and it is an external plan constraint.
2. **Real rate-limit and offline states were simulated**, not triggered against the provider; the retry/error code paths were exercised.
3. **Safari/Firefox were not tested** in this environment, although only standard modern APIs are used.
4. **No automated test suite** is committed; testing was manual/scripted in Chromium. Suggested future work: Playwright tests for search, error mapping, preview modes and the JSON tabs.
5. The free WeatherAPI key has a shared monthly quota; the proxy caches responses for 45 seconds per Vercel instance to reduce calls.

## Credits

Weather data by [WeatherAPI.com](https://www.weatherapi.com/). SkyMood’s recommendations are playful interpretations, not safety advice.
