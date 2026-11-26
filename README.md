# SkyMood

**Know the sky, plan your day.**

SkyMood is a mobile-first lifestyle weather app. Live conditions become one of **six dynamic moods** (with an **Easy Going** fallback for in-between skies), each with its own full-screen gradient and a deliberately short recommendation. The page also carries a 24-hour forecast strip, a five-day outlook, four quick metrics and a mood-preview lab.

- **Live app:** <https://skymood-eight.vercel.app>
- **Source:** <https://github.com/deepika-47/SkyMood>
- **Data:** [WeatherAPI.com](https://www.weatherapi.com/) `/v1/forecast.json`

No login, profiles, history, database or notifications. The WeatherAPI key stays on the server.

---

## What it does

- Loads **Mumbai** automatically and fetches live weather immediately.
- Searches by **button or Enter**, accepts repeated searches, blocks empty input and keeps the typed city in the field.
- Offers eleven presets: **Mumbai, Chennai, London, Tokyo, New York, Delhi, Bengaluru, Hyderabad, Kolkata, Pune, Ahmedabad**.
- Shows the city, region/country, current temperature in **°C**, condition text and icon, city-local time, feels-like, high/low and last-updated time.
- Produces one of six moods — **Scorching, Pleasant, Breezy, Rainy, Cold, Starry Night** — plus an **Easy Going** fallback when none match, using the exact copy below.
- Includes a **Mood lab** that previews all six gradients and recommendations without changing any live measurement.
- Renders the next **24 hours** in a horizontally scrollable glass strip (time, icon, temperature).
- Renders a **five-day outlook** with weekday, date, condition, rain chance and high/low.
- Shows four quick metrics: **Humidity, Wind, UV Index, Feels Like**.
- Keeps a formatted/raw JSON viewer as a secondary, collapsible panel.
- Handles loading, invalid input, invalid cities, invalid keys, rate limits, network failures, server errors, timeouts, malformed payloads and stale responses.

---

## Project structure

```
index.html              Page shell and accessible UI
css/styles.css          Design tokens, six skies, glass UI, responsive layout
js/app.js               Search/state, API client, mood engine, rendering, JSON viewer, errors
api/weather.js          Vercel Node function — WeatherAPI proxy; key stays server-side
tools/dev_server.py     Local static server + the same proxy (Python standard library)
.env.example            Local environment template
.vercelignore           Keeps .env and developer-only files out of the deployment
package.json            Convenience `npm run dev` script; no build step
robots.txt              Search-engine directives
```

There is no build step and no frontend framework.

---

## Design system

- **Plus Jakarta Sans** for the brand, city, headlines and recommendation.
- **Inter** Light / Regular / Medium for temperatures and forecast data, with tabular numerals.
- Text: `#FFFFFF` / `#F8FAFC`; `0px 2px 10px rgba(0, 0, 0, 0.15)` on the 64px light hero number and bold headlines.
- Glass cards: `rgba(255, 255, 255, 0.18)`, `backdrop-filter: blur(12px)`, `1px solid rgba(255, 255, 255, 0.3)`, `20px` radius.
- CTAs: solid `#FFFFFF` background with `#0F172A` text.
- Sky changes cross-fade over `0.6s ease-in-out`.

Exact gradients:

```css
Scorching   linear-gradient(180deg, #FF7E5F 0%, #FEB47B 100%)
Pleasant    linear-gradient(180deg, #38BDF8 0%, #818CF8 100%)
Breezy      linear-gradient(180deg, #2DD4BF 0%, #3B82F6 100%)
Rainy       linear-gradient(180deg, #334155 0%, #0F172A 100%)
Cold        linear-gradient(180deg, #1E3A8A 0%, #312E81 100%)
Starry Night linear-gradient(180deg, #0F172A 0%, #1E1B4B 100%)
```

Easy Going reuses the Pleasant gradient; it is a fallback title, not a seventh preview.

The mood lab changes **only** the sky, the recommendation card and its preview badge. Temperature, humidity, wind, UV, feels-like, hourly data and the five-day outlook stay bound to the live payload until the next search.

---

## Mood priority

Priority is applied top-down; the first match wins. “Clear” means the condition contains no rain, drizzle, shower, thunder, storm, snow, sleet, blizzard, freezing, fog, mist, haze, smoke, dust or sand, **and** it either names clear/sunny or reports cloud cover at or below 25%.

| Priority | Mood | Rule |
| --- | --- | --- |
| 1 | **Rainy** — Rain Check | Condition contains rain, drizzle, shower, thunder, storm or sleet |
| 2 | **Cold** — Freeze Frame | Condition contains snow, blizzard, freezing or ice |
| 3 | **Cold** — Freeze Frame | Temperature **below 15°C** |
| 4 | **Starry Night** | Night-time (`is_day = 0`) with a clear sky |
| 5 | **Scorching** — Sun Alert | Temperature **above 32°C** or UV index **above 7** |
| 6 | **Breezy** — Breezy Mode | Temperature **18–25°C inclusive** and wind **at least 20 km/h** |
| 7 | **Pleasant** — Perfect Day | Temperature **22–31°C inclusive** with a clear sky |
| Fallback | **Easy Going** | Any remaining conditions, including mild haze or overcast skies |

Defined overlap behaviour:

- Rain beats snow and temperature: a 10°C rain shower is **Rainy**, and a condition naming both rain and snow is **Rainy**. Sleet counts as rain.
- Cold beats heat when it is not raining: below 15°C wins even if UV is high.
- A clear night beats Scorching and Breezy: a clear 20°C night with 30 km/h wind is **Starry Night**.
- Breezy beats Pleasant: 25°C, clear, 20 km/h is **Breezy**.
- Boundaries: 15°C is **not** Cold, 32°C and UV 7 are **not** Scorching, 18°C/25°C are inside Breezy, 22°C/31°C are inside Pleasant.
- **20 km/h** is this app’s definition of “windy” for the Breezy mood.
- **Easy Going** avoids claiming “clear skies” when the sky is hazy or overcast.

Exact recommendation copy:

- **Scorching / High UV:** “Don't get eaten by the sun today—stay shaded and hydrated!”
- **Clear / Pleasant:** “Clear skies ahead—plan a day out with your loved ones!”
- **Breezy / Mild:** “A cool breeze that touches your soul—step outside and enjoy!”
- **Rainy / Drizzle / Storm:** “Step out with an umbrella—don't get soaked!”
- **Cold:** “Bone-chilling cold outside—cuddle up tight!”
- **Starry Night:** “Starry skies ahead—sleep tight!”
- **Easy Going** fallback: “Mild and steady—a good day to head outside!”

The mood is an app-generated interpretation, **not safety advice**.

---

## Data flow

The browser calls `/api/weather?q=…`; it never receives `WEATHER_API_KEY`. The proxy:

1. Accepts only `GET` and a 1–80 character city query with simple punctuation.
2. Calls WeatherAPI **`/v1/forecast.json`** with `days=5`, `aqi=no` and `alerts=no`.
3. Validates that `location`, `current` and at least one `forecast.forecastday` entry are present.
4. If a plan returns fewer than five days (the free plan caps a request at three), requests the remaining dates through WeatherAPI’s `dt` parameter and appends those real provider days. No temperatures or conditions are invented.
5. Returns a WeatherAPI-shaped JSON body. Because days 4–5 may be assembled from separate WeatherAPI calls, the JSON viewer shows this assembled payload rather than a byte-identical single-provider response.
6. Maps provider failures to small `{ ok: false, error: { code, message } }` responses: `CITY_NOT_FOUND` 404, `BAD_REQUEST` 400, `RATE_LIMITED` 429, `METHOD_NOT_ALLOWED` 405, `INVALID_API_KEY`/`API_KEY_MISSING` 500, `SERVICE_UNAVAILABLE`/`UPSTREAM_UNAVAILABLE` 502 and `TIMEOUT` 504 where applicable.

`tools/dev_server.py` mirrors this behaviour for local development. It reads `.env` (which is git-ignored), serves only known static asset types, blocks dotfiles, and returns the same error codes.

---

## Error and state model

- **First load:** skeleton with a spinner, `aria-busy` on the weather stage, then content or a fatal error card.
- **Later load:** the existing card is dimmed under a loading chip; it stays visible if the request fails.
- **Non-fatal failure:** a dismissible alert names the problem and, where useful, offers **Retry**; the previous city is explicitly labelled as the last successful update.
- **Fatal failure (no data yet):** an error card replaces the skeleton and offers retry when appropriate.
- **Stale responses:** each request gets a sequence number and an `AbortController`; an older response cannot overwrite a newer one.
- **Unexpected payloads:** incomplete or non-JSON 200 responses are rejected before rendering, so the card is never partially updated.
- **Preview:** buttons are enabled once live data is present. Choosing a city resets the preview to the live mood.

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

`npm run dev` runs the same Python server. The server has no third-party Python dependencies.

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

The Vercel project is currently not Git-linked, so a GitHub push does **not** trigger a new production deployment by itself.

---

## Verification

Manual and scripted checks were run on **25–26 November 2026** in **Chromium 157–158** on Windows against the live deployment and local proxy harness. Live WeatherAPI values changed between runs; the examples below are snapshots.

### Requirement checklist

| Area | Status | Evidence |
| --- | --- | --- |
| Branding + tagline | ✅ Passed | “SkyMood” and “Know the sky, plan your day.” in the header and page metadata. |
| Default city | ✅ Passed | Mumbai loaded automatically; input and selected chip showed Mumbai. |
| Search button and Enter | ✅ Passed | Button searches and Enter-in-field searches both loaded live cities. |
| Required presets | ✅ Passed | Chennai, London, Tokyo and New York each loaded their matching city, country, 24 hourly cards and five daily rows; their chips highlighted. |
| Empty input | ✅ Passed | Inline error, `aria-invalid`, focus returned, no API request, previous city retained. |
| Current hero | ✅ Passed | City, rounded `temp_c`, condition text/icon, feels-like, high/low, local time and last-updated time all rendered; UI values matched the live payload. |
| Six moods | ✅ Passed | Controlled payloads produced Rainy, Cold, Starry Night, Scorching, Breezy, Pleasant and the Easy Going fallback as expected; sleet-as-rain, rain-over-snow, snow, rain-over-heat, clear-night-over-heat, clear-night-over-breeze, breeze-over-pleasant and boundary overlaps were exercised. |
| Exact recommendation copy | ✅ Passed | All six strings matched character-for-character, including em dashes. |
| Six exact gradients | ✅ Passed | Every mood and every preview produced exactly one active layer with the required computed gradient. |
| 0.6s sky transition | ✅ Passed | Computed `transition-property: opacity`, `transition-duration: 0.6s`, `transition-timing-function: ease-in-out`. |
| Mood preview toggle | ✅ Passed | All six previews changed the background, mood title, copy and badge; live temperature, humidity, wind, UV, feels-like, 24 hours and five days were unchanged; “Live” restored the derived mood. |
| Hourly forecast | ✅ Passed | 24 cards with local hour labels, provider icons, temperatures and accessible labels; the strip scrolls horizontally and its arrow controls work. |
| Five-day outlook | ✅ Passed | Five rows with weekday/date, condition, rain chance and high/low from the assembled live payload. |
| Four quick metrics | ✅ Passed | Humidity, Wind, UV Index and Feels Like cards, each with a secondary descriptor. |
| Glass tokens | ✅ Passed | Computed glass background `rgba(255, 255, 255, 0.18)`, `blur(12px)`, `1px solid rgba(255, 255, 255, 0.3)`, `20px` radius. |
| Fonts + shadows | ✅ Passed | Plus Jakarta Sans on brand/headlines; Inter 300 on the hero temperature; tabular numerals on forecast data; required text shadow on the hero number and headlines. |
| CTA treatment | ✅ Passed | Search and solid action buttons computed to white background with `rgb(15, 23, 42)` text. |
| Responsive layout | ✅ Passed | 320/390/768/1024/1440 px: `scrollWidth === clientWidth`, all primary blocks in view, five days and four metrics present; mobile presets and mood buttons wrap instead of clipping. |
| Keyboard access | ✅ Passed | First Tab exposes the skip link; Enter activates it; mood pills activate by Enter and keep focus; ArrowRight scrolls the hourly strip; Enter submits a city search; 2px focus ring visible. |
| Axe-core 4.10.2 | ✅ Passed | **0 violations** at 1440px and 390px for the live mood and all six previews. |
| Loading states | ✅ Passed | Skeleton before the first response; dimmed content plus loading chip for later requests; `aria-busy` toggled correctly. |
| Error states | ✅ Passed | Controlled network failure, 429, invalid key, 502, malformed 200, hanging request and stale response all produced the intended UI; prior data was retained. |
| Proxy contract | ✅ Passed | Success 200 with `X-Weather-Endpoint: /v1/forecast.json`, five days, no key in the body; 400, 404, 405 and 500 paths mapped correctly. |
| No client-side key | ✅ Passed | Weather traffic only reached `/api/weather`; no browser request hit `api.weatherapi.com`, and the response did not contain the WeatherAPI key. |
| JSON viewer | ✅ Passed | Formatted and raw views of the assembled forecast payload, copy action, tab keyboard support and scrollable panel. |
| Separate HTML/CSS/JS | ✅ Passed | No inline application logic; `index.html` links `css/styles.css` and `js/app.js`. |

### Local data snapshots

- Mumbai: live current conditions, **24** hourly cards, **5** daily rows.
- Chennai, London, Tokyo, New York: live current conditions, **24** hourly cards, **5** daily rows each; temperature, condition, humidity and UV matched their API payloads.
- The five-day list included dates from the provider; on 26 November 2026 the free-plan base response held three days and the proxy fetched the remaining two through `dt`.

### Known limitations / incomplete items

1. **WeatherAPI free-plan assembly.** A single free-plan forecast request returns three days. Days 4–5 are fetched with separate live `dt` requests, so the first load can cost three upstream requests and a little extra latency. If a future plan or provider change removes `dt` access, the five-day assembly would need revisiting.
2. **Real rate limiting was not triggered.** The 429 path was exercised with a controlled response; the live account was not exhausted.
3. **Real provider outage and timeout were not induced at the provider.** The UI paths were exercised with controlled 502/hanging responses. A real invalid key and a real unknown city were tested end-to-end through the proxy.
4. **Offline testing used failed fetches**, not an OS-level network disconnect.
5. **Only Chromium was tested.** Safari and Firefox were not executed in this environment.
6. **No screen-reader session was performed.** Axe-core reported no WCAG A/AA violations, and keyboard behaviour was tested directly.
7. **No automated test suite is committed.** The checks above were run with temporary Chromium DevTools Protocol scripts; adding Playwright coverage would be the next quality step.
8. **The Vercel project is not Git-linked.** Deployments are currently manual (Vercel CLI or REST API); GitHub pushes alone do not redeploy.
9. The mood is an app-generated interpretation, **not safety advice**.

---

## Credits

Weather data by [WeatherAPI.com](https://www.weatherapi.com/). SkyMood's vibes are playful interpretations, not safety advice.
