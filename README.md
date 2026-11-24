# SkyMood

**Know the sky, plan your day.**

SkyMood is a small, single-page weather app that shows the **current conditions** for a city, turns them into one of five playful “vibes”, and exposes the untouched WeatherAPI response in a formatted/raw JSON viewer.

- **Live app:** <https://skymood-eight.vercel.app>
- **Source:** <https://github.com/deepika-47/SkyMood>
- **Data:** [WeatherAPI.com](https://www.weatherapi.com/) `/v1/current.json`

No forecasts, login, profiles, history, database or notifications. The weather API key stays on the server.

---

## What it does

- Loads **Mumbai** automatically and fetches live weather immediately.
- Searches by **button or Enter**, accepts repeated searches, blocks empty input and keeps the typed city in the field.
- Offers the ten preset cities: **Mumbai, Delhi, Bengaluru, Hyderabad, Chennai, Kolkata, Pune, Ahmedabad, New York, London**.
- Shows temperature in **°C**, condition icon and text, **city-local time**, last-updated time, **°F**, humidity, wind, UV index, cloud cover, visibility and pressure.
- Gives exactly **three primary metric cards**: Humidity, Wind and UV index.
- Generates one of five moods: **Freeze Frame, Perfect Day, Sun Alert, Rain Check, Breezy Mode**.
- Opens a **formatted/raw JSON** viewer with tab switching, copy, keyboard support and scrolling; it refreshes after every successful request.
- Handles loading, invalid input, invalid cities, invalid keys, rate limits, network failures, server errors, timeouts, malformed/partial payloads and stale responses.
- Keeps the last valid weather on screen when a later request fails.

---

## Project structure

```
index.html              Page shell and accessible UI
css/styles.css          Design tokens, sky gradients, glass UI, responsive layout
js/app.js               Search/state, API client, mood engine, rendering, JSON viewer, errors
api/weather.js          Vercel Node function — WeatherAPI proxy; key stays server-side
tools/dev_server.py     Local static server + the same proxy (Python standard library)
.env.example            Local environment template
.vercelignore           Keeps .env and developer-only files out of the static deployment
robots.txt              Search-engine directives
```

There is no build step and no frontend framework.

### Data flow

The browser calls `/api/weather?q=…`; it never receives `WEATHER_API_KEY`. The proxy:

1. Accepts only `GET` and a 1–80 character city query.
2. Calls WeatherAPI **`/v1/current.json`** only.
3. Validates that `location` and `current` are complete.
4. Returns the **raw WeatherAPI body** untouched on success, so the JSON viewer shows the real provider payload.
5. Maps provider failures to small `{ ok: false, error: { code, message } }` responses.

`tools/dev_server.py` mirrors this behaviour for local development. It reads `.env` (which is git-ignored), serves only known static asset types, blocks dotfiles, and returns the same error codes.

### Mood rules

Priority is applied top-down; the first match wins.

| Priority | Mood | Condition |
| --- | --- | --- |
| 1 | **Freeze Frame** ❄️ | Condition contains snow, blizzard, sleet, freezing or ice |
| 2 | **Rain Check** ☔ | Condition contains rain, drizzle, shower, thunder or storm |
| 3 | **Freeze Frame** ❄️ | Temperature **below 15°C** |
| 4 | **Sun Alert** ☀️ | Temperature **above 32°C** |
| 5 | **Breezy Mode** 🌀 | Wind **at least 20 km/h** |
| 6 | **Perfect Day** 🌤️ | Everything else (fallback) |

Exact vibe copy:

- **Freeze Frame:** “Bone-chilling cold ahead, cuddle up tight😉”
- **Perfect Day:** “The weather looks great! Time to plan a day out with your loved ones🫂”
- **Sun Alert:** “Don't get eaten by the sun today! Stay hydrated and slap on some SPF🌞”
- **Rain Check:** “Step out with an umbrella — don't get soaked☔”
- **Breezy Mode:** “A cool breeze that touches your soul — step outside🌀”

### Error and state model

- **First load:** skeleton with a spinner, `aria-busy` on the search area, then content or a fatal error card.
- **Later load:** the existing card is dimmed under a loading chip; it stays visible if the request fails.
- **Non-fatal failure:** a dismissible alert names the problem and, where useful, offers **Retry**; the previous city is explicitly labelled as the last successful update.
- **Fatal failure (no data yet):** a focused error card replaces the skeleton.
- **Stale responses:** each request gets a sequence number and an `AbortController`; an older response cannot overwrite a newer one.
- **Unexpected payloads:** incomplete or non-JSON 200 responses are rejected before rendering, so the card is never partially updated.

---

## Run locally

Requirements: Python 3.9+ and a WeatherAPI key.

```bash
# 1. Configure the key
cp .env.example .env
# edit .env: WEATHER_API_KEY=your_key

# 2. Start the local app and proxy
python tools/dev_server.py
# -> http://127.0.0.1:4173

# optional port
python tools/dev_server.py 5000
```

The server has no third-party Python dependencies.

---

## Deploy on Vercel

The production project is `deepika20507-4965/skymood`.

1. Set `WEATHER_API_KEY` in **Project → Settings → Environment Variables** for Production, Preview and Development.
2. Link and deploy from the repository root:

   ```bash
   npx vercel link --project skymood
   npx vercel deploy --prod
   ```

`.vercelignore` excludes `.env*`, `.vercel`, `tools/`, `README.md` and `package.json` from the static upload. The API function is picked up from `api/weather.js`; framework preset **Other**, no build command.

The Vercel project is currently not Git-linked, so a GitHub push does **not** trigger a new production deployment by itself. Run the two commands above to deploy an update.

---

## Verification

Manual and scripted checks were run on **24 November 2026** in **Chromium 157** on Windows, against both the local server and the production URL. Live WeatherAPI values changed between runs; the examples below are snapshots.

### Requirement checklist

| Area | Status | Evidence |
| --- | --- | --- |
| Default city Mumbai + automatic current-weather request | ✅ Passed | Mumbai loaded on first paint from `/api/weather?q=Mumbai%2C%20India`; input and selected chip both showed Mumbai. |
| Loading state on first load | ✅ Passed | Skeleton, spinner, “Fetching Mumbai's sky…”, `aria-busy="true"` observed before the response. |
| Search button | ✅ Passed | Typed “Paris”, clicked Search, Paris/France rendered; one new API request. |
| Enter key | ✅ Passed | Enter submitted London, New York and Berlin searches. |
| Empty input | ✅ Passed | Inline “Enter a city name…” error, input marked `aria-invalid`, focus returned to it, **no** API request, previous city kept. |
| Repeated searches | ✅ Passed | Paris searched twice without reload; JSON refreshed each time. |
| Searched text retained | ✅ Passed | Input kept the typed text after success and after “City not found”. |
| Exactly ten popular cities | ✅ Passed | Mumbai, Delhi, Bengaluru, Hyderabad, Chennai, Kolkata, Pune, Ahmedabad, New York, London; no Tokyo. |
| Chips fetch, sync input, highlight | ✅ Passed | Every chip was clicked on local and production; city, input, one selected chip and JSON all updated. |
| Current temperature °C | ✅ Passed | Hero showed the API `temp_c` (e.g. Mumbai 32.6 → 33). |
| Wind in km/h | ✅ Passed | Primary card showed API `wind_kph` with direction/gust detail (e.g. 6.8 km/h E, gusts 14.6). |
| Condition icon | ✅ Passed | Provider CDN icon loaded at 128×128 with condition-specific alt text. |
| Condition text | ✅ Passed | “Smoky haze”, “Patchy rain nearby”, etc. rendered from the payload. |
| City-local time | ✅ Passed | Eyebrow clock matched the payload `tz_id` (e.g. Asia/Kolkata); it refreshes every 30 seconds. |
| Last updated | ✅ Passed | Provider update time shown in local time plus a relative “11 min ago”; also listed in details. |
| °F, cloud, visibility, pressure | ✅ Passed | All derived from `temp_f`, `cloud`, `vis_km`, `pressure_mb`. |
| Exactly three primary metrics | ✅ Passed | Three cards: Humidity (`humidity`), Wind (`wind_kph`), UV index (`uv`); secondary values sit in a separate details panel. |
| Five moods + PRD copy | ✅ Passed | Each mood rendered the exact copy; priority and boundaries verified with controlled payloads. |
| Mood boundaries | ✅ Passed | 10°C → Freeze Frame; 15°C and 32°C → Perfect Day; 20 km/h → Breezy Mode; snow beats temperature; rain beats heat. |
| JSON formatted tab | ✅ Passed | `JSON.stringify(payload, null, 2)`, current-only, indented. |
| JSON raw tab | ✅ Passed | Original one-line provider body preserved. |
| JSON copy | ✅ Passed | Raw copy matched the real system clipboard; formatted copy matched the visible text through a Clipboard API spy (Windows normalises clipboard line endings). Toast shown. |
| JSON scroll + tabs | ✅ Passed | Formatted JSON `scrollHeight` 960 px vs 358 px visible, `overflow-y: auto`; tabs switch by click and ArrowLeft/ArrowRight/Home/End. |
| JSON refresh after success | ✅ Passed | Viewer city/payload changed after every successful chip and typed search. |
| Invalid city | ✅ Passed | Real WeatherAPI 1006 + proxy 404 → “City not found”; previous city and JSON retained; no retry offered for a lookup error. |
| Invalid/missing API key | ✅ Passed | Real provider rejected a bad key through the proxy (500 `INVALID_API_KEY`); UI fatal state rendered “API configuration error” with no retry. Missing key also mapped to `API_KEY_MISSING`. |
| Rate limit | ⚠️ Exercised with a controlled 429 | “Temporary service error” + Retry; real provider quota was not exhausted. |
| Offline/network failure | ⚠️ Exercise via failed fetch | Fetch rejection and a real local connection abort both produced “No internet connection”; valid data stayed visible. OS-level airplane mode was not used. |
| Server outage | ⚠️ Exercised with a controlled 502 | “Service unavailable” + Retry; Retry recovered to Mumbai after a fixture success. Real provider outage was not triggered. |
| Timeout | ⚠️ Exercised with a hanging request | Loading stayed visible, then “The sky is taking too long” at the 15 s client timeout; previous data retained. |
| Malformed/partial payload | ✅ Passed | A 200 HTML response → “Unexpected response”; a 200 partial `current` object was rejected with the previous card still visible. |
| Stale response protection | ✅ Passed | A delayed London response could not overwrite the newer Delhi result; sequence + abort guard held. |
| Responsive, no horizontal overflow | ✅ Passed | 320/390/768/1024/1440 px: `scrollWidth === clientWidth`; hero stacks, metrics become one column at ≤720 px, chips scroll horizontally inside their own strip. |
| Keyboard accessibility | ✅ Passed | Enter search, focusable controls, skip link, labelled input, visible tab order, roving JSON tabs. Axe-core 4.10.2 (WCAG A/AA) reported **0 violations** locally and in production. |
| Separate HTML/CSS/JS | ✅ Passed | No inline application logic; `index.html` links `css/styles.css` and `js/app.js`. |
| Key never sent to the browser | ✅ Passed | Browser network log contained only the app's `/api/weather`; API response did not contain the key. |
| No out-of-scope features | ✅ Passed | No hourly forecast, multi-day outlook, login, profiles, history, notifications or database. |

### Production checks

- Production URL: <https://skymood-eight.vercel.app>
- Deployment: `dpl_HA2aABZvVGhmKyPeqwTMqErcTJTM` (production, ready).
- Homepage 200; API 200 with `X-Weather-Endpoint: /v1/current.json`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`.
- `/api/weather?q=London%2C%20United%20Kingdom` returned London/United Kingdom with **no** `forecast` property.
- `/.env`, `/.env.local`, `/tools/dev_server.py`, `/README.md` and `/package.json` returned **404** in production.
- A 39-check production regression (ten chips, a typed Enter search, API-value matching, JSON tabs/copy/scroll, 320/390/768/1440 px layouts, axe and console checks) passed on the final deployment with zero failures and zero console errors or uncaught exceptions.

### Known limitations / incomplete items

1. **Real rate limiting was not triggered.** The 429 UI path was exercised with a controlled response; the app's mapping of provider code 2007/HTTP 429 is implemented but the live account was not exhausted for testing.
2. **Real provider outage and timeout were not induced at the provider.** The UI paths were exercised with controlled 502/hanging responses. A real bad key and a real unknown city were tested end-to-end through the proxy.
3. **Offline testing used fetch failures and a real local connection abort**, not an OS-level network disconnect.
4. **Only Chromium was tested.** Safari and Firefox were not executed in this environment; the app uses standard modern APIs (`fetch`, `AbortController`, `Intl`, backdrop-filter).
5. **No screen-reader session was performed.** Axe-core reported no WCAG A/AA violations, and keyboard behaviour was tested directly.
6. **No automated test suite is committed.** The checks above were run with temporary Chromium DevTools Protocol scripts; adding Playwright coverage would be the next quality step.
7. **The Vercel project is not Git-linked.** Deployments are driven by the Vercel CLI; GitHub pushes alone do not redeploy.
8. The mood is an app-generated interpretation, **not safety advice**.

No in-scope functional requirement is currently known to be missing. The caveats above are test-coverage and delivery-process limitations.

---

## Credits

Weather data by [WeatherAPI.com](https://www.weatherapi.com/). SkyMood's vibes are playful interpretations, not safety advice.
