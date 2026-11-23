/* =========================================================
   SkyMood — app logic (vanilla JS, no dependencies)
   Data: WeatherAPI.com through /api/weather (key stays server-side)
   ========================================================= */

(() => {
  "use strict";

  /* ----------------------------- Config ----------------------------- */

  const CONFIG = Object.freeze({
    DEFAULT_CITY: "Mumbai",
    API_ENDPOINT: "/api/weather",
    POPULAR_CITIES: [
      "Mumbai",
      "Delhi",
      "Bengaluru",
      "Hyderabad",
      "Chennai",
      "Kolkata",
      "Pune",
      "Ahmedabad",
      "New York",
      "London",
      "Tokyo",
    ],
    HOURLY_COUNT: 24,
    FETCH_TIMEOUT_MS: 15000,
    TOAST_MS: 2400,
  });

  /* Interpretation thresholds. Priority is applied top-down in deriveVibe(). */
  const THRESHOLDS = Object.freeze({
    COLD_C: 15,
    HOT_C: 32,
    HIGH_UV: 7,
    BREEZE_MIN_KPH: 20,
    BREEZE_MIN_C: 18,
    BREEZE_MAX_C: 25,
    PLEASANT_MIN_C: 22,
    PLEASANT_MAX_C: 31,
  });

  /* WeatherAPI resolves some bare city names to unexpected places (e.g.
     "Delhi" → Ontario, Canada). Qualify the preset cities for a predictable
     match while still letting users type a fully qualified query. */
  const CITY_QUERY_ALIASES = Object.freeze({
    mumbai: "Mumbai, India",
    delhi: "Delhi, India",
    bengaluru: "Bengaluru, India",
    hyderabad: "Hyderabad, India",
    chennai: "Chennai, India",
    kolkata: "Kolkata, India",
    pune: "Pune, India",
    ahmedabad: "Ahmedabad, India",
    "new york": "New York, United States",
    london: "London, United Kingdom",
    tokyo: "Tokyo, Japan",
  });

  const MOODS = Object.freeze({
    hot: {
      key: "hot",
      emoji: "☀️",
      title: "Sun Alert",
      short: "Sun",
      label: "Scorching / high UV",
      text: "Don't get eaten by the sun today—stay shaded and hydrated!",
    },
    clear: {
      key: "clear",
      emoji: "🌤️",
      title: "Perfect Day",
      short: "Clear",
      label: "Clear / pleasant",
      text: "Clear skies ahead—plan a day out with your loved ones!",
    },
    breeze: {
      key: "breeze",
      emoji: "🌀",
      title: "Breezy Mode",
      short: "Breeze",
      label: "Cool breeze",
      text: "A cool breeze that touches your soul—step outside and enjoy!",
    },
    rain: {
      key: "rain",
      emoji: "☔",
      title: "Rain Check",
      short: "Rain",
      label: "Rainy / stormy",
      text: "Step out with an umbrella—don't get soaked!",
    },
    cold: {
      key: "cold",
      emoji: "❄️",
      title: "Freeze Frame",
      short: "Cold",
      label: "Bone-chilling cold",
      text: "Bone-chilling cold outside—cuddle up tight!",
    },
    night: {
      key: "night",
      emoji: "🌙",
      title: "Starry Night",
      short: "Night",
      label: "Clear night",
      text: "Starry skies ahead—sleep tight!",
    },
  });

  /* Used when live conditions fall between the six defined moods. */
  const FALLBACK_VIBE = Object.freeze({
    ...MOODS.clear,
    title: "Easy Going",
    text: "Mild and steady—a good day to head outside!",
  });

  const GRADIENTS = Object.freeze({
    hot: "linear-gradient(180deg, #FF7E5F 0%, #FEB47B 100%)",
    clear: "linear-gradient(180deg, #38BDF8 0%, #818CF8 100%)",
    breeze: "linear-gradient(180deg, #2DD4BF 0%, #3B82F6 100%)",
    rain: "linear-gradient(180deg, #334155 0%, #0F172A 100%)",
    cold: "linear-gradient(180deg, #1E3A8A 0%, #312E81 100%)",
    night: "linear-gradient(180deg, #0F172A 0%, #1E1B4B 100%)",
  });

  const THEME_COLORS = Object.freeze({
    hot: "#FF7E5F",
    clear: "#38BDF8",
    breeze: "#2DD4BF",
    rain: "#334155",
    cold: "#1E3A8A",
    night: "#0F172A",
  });

  const GENERIC_ICON =
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="24" cy="24" r="10" fill="#FDE68A"/><path d="M18 44a10 10 0 0 1 1-19.9A13 13 0 0 1 44 27a9 9 0 0 1 0 18H18Z" fill="#F8FAFC" opacity=".92"/></svg>'
    );

  const ERROR_COPY = Object.freeze({
    CITY_NOT_FOUND: {
      title: "City not found",
      retryable: false,
      message: (query) => `We couldn't find “${query}”. Check the spelling and try a nearby city.`,
    },
    INVALID_API_KEY: {
      title: "API configuration error",
      retryable: false,
      message: () => "The WeatherAPI key is missing or invalid. Add a valid WEATHER_API_KEY in the environment and redeploy.",
    },
    API_KEY_MISSING: {
      title: "API configuration error",
      retryable: false,
      message: () => "The WeatherAPI key is missing or invalid. Add a valid WEATHER_API_KEY in the environment and redeploy.",
    },
    RATE_LIMITED: {
      title: "Weather service is busy",
      retryable: true,
      message: () => "We've reached the WeatherAPI request limit. Give it a moment, then try again.",
    },
    NETWORK: {
      title: "No internet connection",
      retryable: true,
      message: () => "SkyMood couldn't reach the weather service. Check your connection and try again.",
    },
    TIMEOUT: {
      title: "The sky is taking too long",
      retryable: true,
      message: () => "The weather service didn't respond in time. Please try again.",
    },
    SERVICE_UNAVAILABLE: {
      title: "Service unavailable",
      retryable: true,
      message: () => "WeatherAPI is temporarily unavailable. Please try again shortly.",
    },
    UPSTREAM_UNAVAILABLE: {
      title: "Service unavailable",
      retryable: true,
      message: () => "WeatherAPI is temporarily unavailable. Please try again shortly.",
    },
    BAD_RESPONSE: {
      title: "Unexpected response",
      retryable: true,
      message: () => "The weather service returned data we couldn't read. Please try again.",
    },
    BAD_REQUEST: {
      title: "That search needs a tweak",
      retryable: false,
      message: () => "Enter a city name and try again.",
    },
    UNEXPECTED: {
      title: "Something went wrong",
      retryable: true,
      message: () => "We hit an unexpected snag while loading the weather. Please try again.",
    },
  });

  /* ----------------------------- State ----------------------------- */

  const state = {
    weather: null,
    requestedQuery: CONFIG.DEFAULT_CITY,
    lastFailedQuery: null,
    previewMood: "auto",
    loading: false,
    requestSeq: 0,
    controller: null,
    theme: "clear",
    frontLayer: "a",
    json: { formatted: "", raw: "", tab: "formatted" },
    clockTimer: null,
    toastTimer: null,
    copyTimer: null,
    initialized: false,
  };

  /* ----------------------------- DOM ----------------------------- */

  const $ = (id) => document.getElementById(id);

  const els = {
    skyA: $("skyLayerA"),
    skyB: $("skyLayerB"),
    themeMeta: document.querySelector('meta[name="theme-color"]'),
    input: $("cityInput"),
    form: $("searchForm"),
    searchBtn: $("searchBtn"),
    searchBtnLabel: $("searchBtnLabel"),
    searchSpinner: $("searchSpinner"),
    fieldError: $("fieldError"),
    chips: $("cityChips"),
    stage: $("weatherStage"),
    skeleton: $("initialSkeleton"),
    skeletonText: $("skeletonText"),
    content: $("weatherContent"),
    loadingOverlay: $("loadingOverlay"),
    loadingText: $("loadingText"),
    fatal: $("fatalError"),
    fatalTitle: $("fatalTitle"),
    fatalText: $("fatalText"),
    fatalRetryBtn: $("fatalRetryBtn"),
    banner: $("statusBanner"),
    alertTitle: $("alertTitle"),
    alertText: $("alertText"),
    alertNote: $("alertNote"),
    retryBtn: $("retryBtn"),
    dismissAlertBtn: $("dismissAlertBtn"),
    localTime: $("localTime"),
    cityName: $("cityName"),
    region: $("region"),
    tempC: $("tempC"),
    condIcon: $("condIcon"),
    condText: $("condText"),
    hiLo: $("hiLo"),
    lastUpdatedPill: $("lastUpdatedPill"),
    vibeCard: $("vibeCard"),
    vibeEmoji: $("vibeEmoji"),
    vibeTitle: $("vibeTitle"),
    vibeText: $("vibeText"),
    vibeReason: $("vibeReason"),
    vibePreviewBadge: $("vibePreviewBadge"),
    copyVibeBtn: $("copyVibeBtn"),
    feelsLike: $("feelsLike"),
    feelsLikeSub: $("feelsLikeSub"),
    humidity: $("humidity"),
    humiditySub: $("humiditySub"),
    wind: $("wind"),
    windSub: $("windSub"),
    uv: $("uv"),
    uvSub: $("uvSub"),
    cloud: $("cloud"),
    visibility: $("visibility"),
    pressure: $("pressure"),
    windDetail: $("windDetail"),
    tempF: $("tempF"),
    updated: $("updated"),
    hourlyTrack: $("hourlyTrack"),
    hourlyCity: $("hourlyCity"),
    outlookGrid: $("outlookGrid"),
    outlookTitle: $("outlookTitle"),
    outlookSub: $("outlookSub"),
    jsonSection: $("jsonSection"),
    jsonToggle: $("jsonToggle"),
    jsonPanel: $("jsonPanel"),
    jsonPre: $("jsonPre"),
    jsonCode: $("jsonCode"),
    jsonMeta: $("jsonMeta"),
    copyJsonBtn: $("copyJsonBtn"),
    tabFormatted: $("tabFormatted"),
    tabRaw: $("tabRaw"),
    moodBtn: $("moodPreviewBtn"),
    moodPanel: $("moodPreviewPanel"),
    moodOptions: $("moodOptions"),
    liveRegion: $("liveRegion"),
    toast: $("toast"),
  };

  /* ----------------------------- Helpers ----------------------------- */

  class AppError extends Error {
    constructor(code, detail) {
      super(detail || code);
      this.name = "AppError";
      this.code = code;
    }
  }

  function setText(node, value) {
    if (node && node.textContent !== String(value)) node.textContent = String(value);
  }

  function round(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : 0;
  }

  function decimal(value, digits = 1) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return n.toFixed(digits).replace(/\.0$/, "");
  }

  function normalizeName(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function resolveApiQuery(query) {
    return CITY_QUERY_ALIASES[String(query || "").trim().toLowerCase()] || query;
  }

  function formatInZone(epochSeconds, timeZone, options) {
    const date = new Date(Number(epochSeconds) * 1000);
    if (Number.isNaN(date.getTime())) return "—";
    try {
      return new Intl.DateTimeFormat("en-US", { timeZone, ...options }).format(date);
    } catch {
      return new Intl.DateTimeFormat("en-US", options).format(date);
    }
  }

  function clockLabel(epochSeconds, timeZone) {
    return formatInZone(epochSeconds, timeZone, { hour: "numeric", minute: "2-digit" });
  }

  function relativeAgo(epochSeconds) {
    const diff = Math.max(0, Math.floor(Date.now() / 1000 - Number(epochSeconds)));
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
    return `${Math.floor(diff / 86400)} d ago`;
  }

  function hourLabelFromApi(apiTime, isNow) {
    if (isNow) return "Now";
    const timePart = String(apiTime || "").split(" ")[1] || "";
    const hour = Number(timePart.split(":")[0]);
    if (!Number.isFinite(hour)) return "—";
    if (hour === 0) return "12 AM";
    if (hour === 12) return "12 PM";
    return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
  }

  function dateLabel(apiDate) {
    const parsed = new Date(`${apiDate}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return "—";
    return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }

  function weekdayLabel(apiDate, index) {
    if (index === 0) return "Today";
    const parsed = new Date(`${apiDate}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return "—";
    return parsed.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  }

  function safeIcon(raw) {
    if (typeof raw !== "string" || !raw) return GENERIC_ICON;
    const url = raw.startsWith("//") ? `https:${raw}` : raw;
    return url.startsWith("https://cdn.weatherapi.com/") ? url : GENERIC_ICON;
  }

  function setIcon(img, raw, alt) {
    img.onerror = () => {
      img.onerror = null;
      img.src = GENERIC_ICON;
    };
    img.src = safeIcon(raw);
    img.alt = alt || "Weather condition icon";
  }

  function create(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function announce(message) {
    if (!els.liveRegion) return;
    els.liveRegion.textContent = "";
    requestAnimationFrame(() => {
      els.liveRegion.textContent = message;
    });
  }

  function showToast(message) {
    window.clearTimeout(state.toastTimer);
    els.toast.textContent = message;
    els.toast.hidden = false;
    state.toastTimer = window.setTimeout(() => {
      els.toast.hidden = true;
    }, CONFIG.TOAST_MS);
  }

  async function copyText(text) {
    if (!text) return false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* fall through to legacy copy */
    }
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.top = "-1000px";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }

  /* ----------------------------- Weather model ----------------------------- */

  function normalizeWeather(payload) {
    const currentBody = payload && payload.data && payload.data.current;
    const forecastBody = payload && payload.data && payload.data.forecast;

    if (!currentBody || !currentBody.location || !currentBody.current) {
      throw new AppError("BAD_RESPONSE", "Missing current weather");
    }
    if (!forecastBody || !forecastBody.forecast || !Array.isArray(forecastBody.forecast.forecastday)) {
      throw new AppError("BAD_RESPONSE", "Missing forecast");
    }

    const loc = currentBody.location;
    const cur = currentBody.current;
    const days = forecastBody.forecast.forecastday;
    const today = days[0];

    if (!today || !today.day || typeof cur.temp_c !== "number") {
      throw new AppError("BAD_RESPONSE", "Incomplete weather data");
    }

    const nowEpoch = Math.floor(Date.now() / 1000);
    const hours = [];
    for (const day of days) {
      if (!Array.isArray(day.hour)) continue;
      for (const hour of day.hour) {
        if (typeof hour.time_epoch === "number" && hour.time_epoch >= nowEpoch - 3600) {
          hours.push(hour);
        }
      }
    }

    /* Guard against device/server clock skew: still offer a usable strip. */
    if (hours.length < 6) {
      for (const day of days[0].hour || []) hours.push(day);
    }

    return {
      requestedQuery: (payload.requestedQuery || loc.name || "").trim(),
      city: loc.name,
      region: loc.region,
      country: loc.country,
      tz: loc.tz_id,
      localtime: loc.localtime,
      localEpoch: loc.localtime_epoch,
      tempC: cur.temp_c,
      tempF: cur.temp_f,
      feelsC: cur.feelslike_c,
      humidity: cur.humidity,
      windKph: cur.wind_kph,
      windDir: cur.wind_dir,
      gustKph: cur.gust_kph,
      uv: cur.uv,
      cloud: cur.cloud,
      visKm: cur.vis_km,
      pressureMb: cur.pressure_mb,
      dewpointC: cur.dewpoint_c,
      condition: cur.condition ? cur.condition.text : "",
      conditionIcon: cur.condition ? cur.condition.icon : "",
      isDay: Boolean(cur.is_day),
      lastUpdated: cur.last_updated,
      lastUpdatedEpoch: cur.last_updated_epoch,
      today: {
        maxC: today.day.maxtemp_c,
        minC: today.day.mintemp_c,
        rainChance: today.day.daily_chance_of_rain,
      },
      hours: hours.slice(0, CONFIG.HOURLY_COUNT),
      days: days.slice(0, 5),
      fetchedAt: payload.fetchedAt || new Date().toISOString(),
    };
  }

  /* Priority order: rain/storm → snow/cold → clear night → scorching → breeze → pleasant. */
  function deriveVibe(weather) {
    const t = Number(weather.tempC);
    const uv = Number(weather.uv) || 0;
    const wind = Number(weather.windKph) || 0;
    const condition = String(weather.condition || "").toLowerCase();

    const isWet = /rain|drizzle|thunder|storm|shower|sleet/.test(condition);
    const isSnowy = /snow|ice|blizzard|freezing/.test(condition);
    const isClear = /clear|sunny/.test(condition);
    const isClearish = /clear|sunny|partly cloudy/.test(condition);

    if (isWet) return MOODS.rain;
    if (isSnowy || t < THRESHOLDS.COLD_C) return MOODS.cold;
    if (!weather.isDay && isClear) return MOODS.night;
    if (t > THRESHOLDS.HOT_C || uv > THRESHOLDS.HIGH_UV) return MOODS.hot;
    if (
      wind >= THRESHOLDS.BREEZE_MIN_KPH &&
      t >= THRESHOLDS.BREEZE_MIN_C &&
      t <= THRESHOLDS.BREEZE_MAX_C
    ) {
      return MOODS.breeze;
    }
    if (t >= THRESHOLDS.PLEASANT_MIN_C && t <= THRESHOLDS.PLEASANT_MAX_C && isClearish) {
      return MOODS.clear;
    }
    return FALLBACK_VIBE;
  }

  function activeVibe() {
    if (!state.weather) return null;
    if (state.previewMood !== "auto") {
      return { ...MOODS[state.previewMood], forced: true };
    }
    return { ...deriveVibe(state.weather), forced: false };
  }

  /* ----------------------------- Theme (sky) ----------------------------- */

  function applyTheme(moodKey) {
    const key = GRADIENTS[moodKey] ? moodKey : "clear";
    if (key === state.theme) {
      document.body.dataset.mood = key;
      if (els.themeMeta) els.themeMeta.setAttribute("content", THEME_COLORS[key]);
      return;
    }

    const outgoing = state.frontLayer === "a" ? els.skyA : els.skyB;
    const incoming = state.frontLayer === "a" ? els.skyB : els.skyA;

    incoming.style.background = GRADIENTS[key];
    incoming.classList.add("is-active");
    outgoing.classList.remove("is-active");

    state.frontLayer = state.frontLayer === "a" ? "b" : "a";
    state.theme = key;
    document.body.dataset.mood = key;
    if (els.themeMeta) els.themeMeta.setAttribute("content", THEME_COLORS[key]);
  }

  /* ----------------------------- Render ----------------------------- */

  function updateClock() {
    if (!state.weather) return;
    setText(els.localTime, clockLabel(Date.now() / 1000, state.weather.tz));
  }

  function renderVibe() {
    const vibe = activeVibe();
    if (!vibe) return;
    const w = state.weather;

    setText(els.vibeEmoji, vibe.emoji);
    setText(els.vibeTitle, vibe.title);
    setText(els.vibeText, vibe.text);
    els.vibeCard.dataset.mood = vibe.key;
    els.vibeCard.dataset.emoji = vibe.emoji;
    els.vibePreviewBadge.hidden = !vibe.forced;

    const parts = [
      w.condition,
      `${decimal(w.tempC)}°C`,
      `${decimal(w.windKph)} km/h wind`,
      `UV ${decimal(w.uv)}`,
    ].filter(Boolean);
    setText(els.vibeReason, parts.join(" · "));
  }

  function uvDescriptor(uv) {
    const n = Number(uv) || 0;
    if (n <= 2) return "Low · no protection needed";
    if (n <= 5) return "Moderate · wear sunscreen";
    if (n <= 7) return "High · seek shade at midday";
    if (n <= 10) return "Very high · stay shaded";
    return "Extreme · avoid the midday sun";
  }

  function renderCurrent(weather) {
    setText(els.cityName, weather.city || "—");
    const region = [weather.region, weather.country].filter(Boolean).join(", ");
    setText(els.region, region || "—");
    setText(els.tempC, round(weather.tempC));
    setText(els.condText, weather.condition || "—");
    setText(els.hiLo, `H ${round(weather.today.maxC)}° · L ${round(weather.today.minC)}°`);
    setIcon(els.condIcon, weather.conditionIcon, `${weather.condition || "Current"} weather icon`);

    setText(
      els.lastUpdatedPill,
      `Updated ${clockLabel(weather.lastUpdatedEpoch, weather.tz)} local · ${relativeAgo(weather.lastUpdatedEpoch)}`
    );

    els.hourlyCity.textContent = weather.city || "the city";
    updateClock();

    setText(els.feelsLike, `${round(weather.feelsC)}°`);
    setText(els.feelsLikeSub, `Actual ${decimal(weather.tempC)}°C`);

    setText(els.humidity, `${round(weather.humidity)}%`);
    setText(els.humiditySub, Number.isFinite(Number(weather.dewpointC)) ? `Dew point ${decimal(weather.dewpointC)}°C` : "Relative humidity");

    setText(els.wind, `${decimal(weather.windKph)} km/h`);
    setText(els.windSub, `${weather.windDir || ""}${weather.gustKph ? ` · gusts ${round(weather.gustKph)} km/h` : ""}`.trim() || "Calm");

    setText(els.uv, decimal(weather.uv));
    setText(els.uvSub, uvDescriptor(weather.uv));

    setText(els.cloud, `${round(weather.cloud)}%`);
    setText(els.visibility, `${decimal(weather.visKm)} km`);
    setText(els.pressure, `${round(weather.pressureMb)} hPa`);
    setText(els.windDetail, `${decimal(weather.windKph)} km/h ${weather.windDir || ""}`.trim());
    setText(els.tempF, `${decimal(weather.tempF)}°F`);
    setText(els.updated, `${clockLabel(weather.lastUpdatedEpoch, weather.tz)} local`);
  }

  function renderHourly(weather) {
    const track = els.hourlyTrack;
    track.textContent = "";
    const frag = document.createDocumentFragment();
    const nowKey = String(weather.localtime || "").slice(0, 13);

    weather.hours.forEach((hour) => {
      const isNow = String(hour.time || "").slice(0, 13) === nowKey;
      const item = create("div", `hour${isNow ? " is-now" : ""}`);
      item.setAttribute("role", "listitem");

      const label = hourLabelFromApi(hour.time, isNow);
      const chance = round(hour.chance_of_rain);
      const condition = hour.condition ? hour.condition.text : "Weather";
      const temp = round(hour.temp_c);

      item.setAttribute(
        "aria-label",
        `${label}: ${condition}, ${temp} degrees Celsius, ${chance}% chance of rain`
      );

      item.appendChild(create("span", "hour__time", label));

      const img = create("img", "hour__icon");
      img.width = 40;
      img.height = 40;
      img.loading = "lazy";
      img.decoding = "async";
      setIcon(img, hour.condition ? hour.condition.icon : "", `${condition} icon`);
      item.appendChild(img);

      item.appendChild(create("span", "hour__temp", `${temp}°`));

      const rain = create("span", "hour__rain");
      rain.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 3.5S6 10.4 6 14.3a6 6 0 0 0 12 0c0-3.9-6-10.8-6-10.8Z"/></svg>';
      rain.appendChild(document.createTextNode(`${chance}%`));
      item.appendChild(rain);

      frag.appendChild(item);
    });

    track.appendChild(frag);
  }

  function renderOutlook(weather) {
    const grid = els.outlookGrid;
    grid.textContent = "";
    const count = weather.days.length;

    setText(els.outlookTitle, count === 1 ? "1-Day Outlook" : `${count}-Day Outlook`);
    setText(
      els.outlookSub,
      count >= 5
        ? "Daily highs, lows and rain chance"
        : `Daily highs, lows and rain chance · ${count} days available from WeatherAPI`
    );

    const frag = document.createDocumentFragment();
    weather.days.forEach((day, index) => {
      const card = create("article", "day");
      const date = day.date;
      const condition = day.day && day.day.condition ? day.day.condition.text : "—";
      const icon = day.day && day.day.condition ? day.day.condition.icon : "";
      const max = round(day.day ? day.day.maxtemp_c : NaN);
      const min = round(day.day ? day.day.mintemp_c : NaN);
      const chance = Math.min(100, Math.max(0, round(day.day ? day.day.daily_chance_of_rain : 0)));

      const head = create("div", "day__head");
      const headCopy = create("div");
      headCopy.appendChild(create("h4", "day__name", weekdayLabel(date, index)));
      headCopy.appendChild(create("p", "day__date", dateLabel(date)));
      head.appendChild(headCopy);

      const img = create("img", "day__icon");
      img.width = 40;
      img.height = 40;
      img.loading = "lazy";
      img.decoding = "async";
      setIcon(img, icon, `${condition} icon`);
      head.appendChild(img);
      card.appendChild(head);

      card.appendChild(create("p", "day__condition", condition));

      const temps = create("div", "day__temps");
      temps.appendChild(create("span", "day__max", `${max}°`));
      temps.appendChild(create("span", "day__min", `${min}°`));
      card.appendChild(temps);

      const rain = create("div", "day__rain");
      rain.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 3.5S6 10.4 6 14.3a6 6 0 0 0 12 0c0-3.9-6-10.8-6-10.8Z"/></svg>';
      rain.appendChild(create("span", "", `${chance}%`));
      const bar = create("span", "rain-bar");
      const fill = create("i");
      fill.style.width = `${chance}%`;
      bar.appendChild(fill);
      rain.appendChild(bar);
      card.appendChild(rain);

      card.setAttribute(
        "aria-label",
        `${weekdayLabel(date, index)}, ${dateLabel(date)}: ${condition}, high ${max} degrees, low ${min} degrees, ${chance}% chance of rain`
      );
      frag.appendChild(card);
    });

    grid.appendChild(frag);
  }

  function renderJsonPanel() {
    const { formatted, raw, tab } = state.json;
    const content = tab === "raw" ? raw : formatted;
    els.jsonCode.textContent = content || "";
    setText(
      els.jsonMeta,
      state.weather
        ? `${state.weather.city} · ${decimal(new Blob([raw || ""]).size / 1024)} KB · fetched ${clockLabel(
            Math.floor(new Date(state.weather.fetchedAt).getTime() / 1000),
            state.weather.tz
          )} local`
        : "Formatted and raw WeatherAPI data"
    );
    els.copyJsonBtn.disabled = !content;
    els.jsonPre.setAttribute("aria-label", `${tab === "raw" ? "Raw" : "Formatted"} JSON response`);
    updateTabs();
  }

  function updateTabs() {
    const isFormatted = state.json.tab === "formatted";
    [els.tabFormatted, els.tabRaw].forEach((tab, index) => {
      const selected = index === 0 ? isFormatted : !isFormatted;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    els.jsonPanel.setAttribute("aria-labelledby", isFormatted ? "tabFormatted" : "tabRaw");
    els.copyJsonBtn.setAttribute("aria-label", `Copy ${isFormatted ? "formatted" : "raw"} JSON to clipboard`);
  }

  function renderWeather(weather, payload, rawText) {
    state.weather = weather;
    state.requestedQuery = weather.requestedQuery || state.requestedQuery;

    renderCurrent(weather);
    renderVibe();
    renderHourly(weather);
    renderOutlook(weather);

    state.json.formatted = JSON.stringify(payload, null, 2);
    state.json.raw = rawText;
    renderJsonPanel();

    applyTheme(state.previewMood === "auto" ? deriveVibe(weather).key : state.previewMood);

    els.skeleton.hidden = true;
    els.fatal.hidden = true;
    els.content.hidden = false;
    els.content.classList.remove("is-updating");
    els.content.classList.remove("just-updated");
    void els.content.offsetWidth;
    els.content.classList.add("just-updated");

    els.hourlyTrack.scrollLeft = 0;
    els.copyVibeBtn.classList.remove("is-copied");
    els.copyJsonBtn.textContent = "";
    els.copyJsonBtn.innerHTML =
      '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6.5A2.5 2.5 0 0 0 4 5.5v6A2.5 2.5 0 0 0 6.5 14"/></svg>Copy';

    document.title = `${weather.city} ${round(weather.tempC)}° · SkyMood`;
    syncChips(state.requestedQuery, weather.city);
    updateClock();
    startClock();
  }

  function syncChips(requestedQuery, resolvedCity) {
    const requested = normalizeName(requestedQuery);
    const resolved = normalizeName(resolvedCity);
    Array.from(els.chips.querySelectorAll(".chip")).forEach((chip) => {
      const name = normalizeName(chip.dataset.city);
      chip.setAttribute("aria-pressed", String(name === requested || name === resolved));
    });
  }

  /* ----------------------------- Loading / errors ----------------------------- */

  function setLoading(isLoading, query) {
    state.loading = isLoading;
    els.searchSpinner.hidden = !isLoading;
    setText(els.searchBtnLabel, isLoading ? "Searching" : "Search");
    els.searchBtn.setAttribute("aria-busy", String(isLoading));
    els.stage.setAttribute("aria-busy", String(isLoading));

    if (isLoading) {
      if (!state.weather) {
        els.content.hidden = true;
        els.fatal.hidden = true;
        els.skeleton.hidden = false;
        els.loadingOverlay.hidden = true;
        if (els.skeletonText) setText(els.skeletonText, `Fetching ${query}'s sky…`);
      } else {
        els.skeleton.hidden = true;
        els.loadingOverlay.hidden = false;
        setText(els.loadingText, `Updating to ${query}…`);
        els.content.classList.add("is-updating");
      }
    } else {
      els.loadingOverlay.hidden = true;
      els.searchSpinner.hidden = true;
      els.content.classList.remove("is-updating");
    }
  }

  function hideBanner() {
    els.banner.hidden = true;
  }

  function clearFieldError() {
    els.fieldError.hidden = true;
    els.fieldError.textContent = "";
    els.input.removeAttribute("aria-invalid");
    els.form.classList.remove("is-invalid");
  }

  function showFieldError(message) {
    els.fieldError.textContent = message;
    els.fieldError.hidden = false;
    els.input.setAttribute("aria-invalid", "true");
    els.form.classList.add("is-invalid");
    announce(message);
    els.input.focus({ preventScroll: true });
  }

  function errorCopy(code, query) {
    return ERROR_COPY[code] || ERROR_COPY.UNEXPECTED;
  }

  function showError(err, query) {
    const code = err && err.code ? err.code : "UNEXPECTED";
    const copy = errorCopy(code, query);
    const message = copy.message(query);
    state.lastFailedQuery = query;

    if (!state.weather) {
      els.fatal.hidden = false;
      els.skeleton.hidden = true;
      els.content.hidden = true;
      els.loadingOverlay.hidden = true;
      setText(els.fatalTitle, copy.title);
      setText(els.fatalText, message);
      els.fatalRetryBtn.hidden = !copy.retryable;
      announce(`${copy.title}. ${message}`);
      return;
    }

    hideBanner();
    setText(els.alertTitle, copy.title);
    setText(els.alertText, message);
    setText(els.alertNote, `Still showing the last successful update for ${state.weather.city}.`);
    els.alertNote.hidden = false;
    els.retryBtn.hidden = !copy.retryable;
    els.banner.hidden = false;
    announce(`${copy.title}. ${message}`);
  }

  /* ----------------------------- Network ----------------------------- */

  async function requestWeather(query, outerSignal) {
    const controller = new AbortController();
    let timedOut = false;

    const forwardAbort = () => controller.abort();
    if (outerSignal) {
      if (outerSignal.aborted) controller.abort();
      else outerSignal.addEventListener("abort", forwardAbort, { once: true });
    }

    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, CONFIG.FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(`${CONFIG.API_ENDPOINT}?q=${encodeURIComponent(query)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });

      const rawText = await response.text();
      let payload = null;
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const code =
          (payload && payload.error && payload.error.code) ||
          (response.status === 404
            ? "CITY_NOT_FOUND"
            : response.status === 429
              ? "RATE_LIMITED"
              : response.status === 401 || response.status === 403
                ? "INVALID_API_KEY"
                : response.status >= 500
                  ? "SERVICE_UNAVAILABLE"
                  : "UNEXPECTED");
        throw new AppError(code, (payload && payload.error && payload.error.message) || response.statusText);
      }

      if (!payload) {
        throw new AppError("BAD_RESPONSE", "Response was not JSON");
      }

      if (payload.ok === false) {
        throw new AppError(
          payload.error && payload.error.code ? payload.error.code : "UNEXPECTED",
          (payload.error && payload.error.message) || "Request failed"
        );
      }

      if (payload.ok !== true) {
        throw new AppError("BAD_RESPONSE", "Unexpected payload");
      }

      return { payload, rawText };
    } catch (err) {
      if (timedOut) throw new AppError("TIMEOUT", "Request timed out");
      if (err instanceof AppError) throw err;
      if (outerSignal && outerSignal.aborted) {
        const abort = new Error("Aborted");
        abort.name = "AbortError";
        throw abort;
      }
      if (err && err.name === "AbortError") throw err;
      throw new AppError("NETWORK", err && err.message ? err.message : "Network request failed");
    } finally {
      window.clearTimeout(timer);
      if (outerSignal) outerSignal.removeEventListener("abort", forwardAbort);
    }
  }

  async function loadCity(rawQuery) {
    const query = String(rawQuery || "").trim().replace(/\s+/g, " ");

    if (!query) {
      showFieldError("Enter a city name to see its weather.");
      return;
    }
    if (query.length > 80) {
      showFieldError("City names must be 80 characters or fewer.");
      return;
    }

    clearFieldError();
    hideBanner();

    const apiQuery = resolveApiQuery(query);
    const seq = ++state.requestSeq;
    if (state.controller) state.controller.abort();
    state.controller = new AbortController();

    setLoading(true, query);

    try {
      const { payload, rawText } = await requestWeather(apiQuery, state.controller.signal);
      if (seq !== state.requestSeq) return;

      const weather = normalizeWeather(payload);
      weather.requestedQuery = query;
      renderWeather(weather, payload, rawText);
      state.lastFailedQuery = null;
      setLoading(false);
      announce(`Weather updated for ${weather.city}: ${round(weather.tempC)} degrees Celsius, ${weather.condition}.`);
    } catch (err) {
      if ((err && err.name === "AbortError") || seq !== state.requestSeq) return;
      if (err && err.code) {
        console.warn(`[SkyMood] ${err.code}: ${err.message}`);
      }
      setLoading(false);
      showError(err, query);
    }
  }

  /* ----------------------------- Chips & preview controls ----------------------------- */

  function buildChips() {
    const frag = document.createDocumentFragment();
    CONFIG.POPULAR_CITIES.forEach((city) => {
      const chip = create("button", "chip", city);
      chip.type = "button";
      chip.dataset.city = city;
      chip.setAttribute("aria-pressed", "false");
      chip.addEventListener("click", () => {
        els.input.value = city;
        clearFieldError();
        loadCity(city);
      });
      frag.appendChild(chip);
    });
    els.chips.appendChild(frag);
  }

  function buildMoodOptions() {
    const options = [
      { key: "auto", emoji: "✨", label: "Auto · live weather", auto: true },
      ...Object.values(MOODS).map((mood) => ({
        key: mood.key,
        emoji: mood.emoji,
        label: mood.short,
        title: mood.label,
      })),
    ];

    const frag = document.createDocumentFragment();
    options.forEach((option) => {
      const button = create("button", `mood-option${option.auto ? " mood-panel__auto" : ""}`);
      button.type = "button";
      button.dataset.mood = option.key;
      button.setAttribute("aria-pressed", String(option.key === "auto"));
      if (option.title) button.title = option.title;
      button.appendChild(create("span", "mood-option__emoji", option.emoji));
      button.appendChild(create("span", "", option.label));
      button.addEventListener("click", () => setPreviewMood(option.key));
      frag.appendChild(button);
    });

    els.moodOptions.appendChild(frag);
  }

  function updateMoodControls() {
    Array.from(els.moodOptions.querySelectorAll(".mood-option")).forEach((button) => {
      const active = button.dataset.mood === state.previewMood;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function setPreviewMood(key) {
    if (key !== "auto" && !MOODS[key]) return;
    state.previewMood = key;
    updateMoodControls();

    if (state.weather) {
      applyTheme(key === "auto" ? deriveVibe(state.weather).key : key);
      renderVibe();
      announce(
        key === "auto"
          ? "Live weather mood restored."
          : `${MOODS[key].title} preview applied. ${MOODS[key].text}`
      );
    } else {
      applyTheme(key === "auto" ? "clear" : key);
      announce(key === "auto" ? "Live weather mood restored." : `${MOODS[key].title} preview applied.`);
    }
  }

  function openMoodPanel(open) {
    els.moodPanel.hidden = !open;
    els.moodBtn.setAttribute("aria-expanded", String(open));
    if (open) {
      const first = els.moodOptions.querySelector(".mood-option");
      if (first) first.focus({ preventScroll: true });
    }
  }

  /* ----------------------------- JSON viewer ----------------------------- */

  function setJsonOpen(open) {
    els.jsonPanel.hidden = !open;
    els.jsonToggle.setAttribute("aria-expanded", String(open));
    els.jsonToggle.setAttribute("aria-label", open ? "Hide API response" : "Show API response");
    if (open) {
      els.jsonSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function switchTab(tab) {
    state.json.tab = tab === "raw" ? "raw" : "formatted";
    renderJsonPanel();
  }

  /* ----------------------------- Events ----------------------------- */

  function bindEvents() {
    els.form.addEventListener("submit", (event) => {
      event.preventDefault();
      loadCity(els.input.value);
    });

    els.input.addEventListener("input", () => {
      if (!els.fieldError.hidden) clearFieldError();
    });

    els.fatalRetryBtn.addEventListener("click", () => {
      const query = state.lastFailedQuery || els.input.value.trim() || CONFIG.DEFAULT_CITY;
      els.input.value = query;
      loadCity(query);
    });

    els.retryBtn.addEventListener("click", () => {
      const query = state.lastFailedQuery || state.requestedQuery || CONFIG.DEFAULT_CITY;
      els.input.value = query;
      loadCity(query);
    });

    els.dismissAlertBtn.addEventListener("click", hideBanner);

    els.moodBtn.addEventListener("click", () => {
      openMoodPanel(els.moodPanel.hidden);
    });

    document.addEventListener("click", (event) => {
      if (els.moodPanel.hidden) return;
      if (!event.target.closest(".mood-preview")) openMoodPanel(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !els.moodPanel.hidden) {
        openMoodPanel(false);
        els.moodBtn.focus({ preventScroll: true });
      }
    });

    els.copyVibeBtn.addEventListener("click", async () => {
      const vibe = activeVibe();
      if (!vibe) return;
      const copied = await copyText(`${vibe.title}: ${vibe.text}`);
      if (copied) {
        els.copyVibeBtn.classList.add("is-copied");
        showToast("Vibe copied to clipboard");
        window.clearTimeout(state.copyTimer);
        state.copyTimer = window.setTimeout(() => {
          els.copyVibeBtn.classList.remove("is-copied");
        }, 1800);
      } else {
        showToast("Couldn't copy — your browser blocked clipboard access.");
      }
    });

    els.copyJsonBtn.addEventListener("click", async () => {
      const content = state.json.tab === "raw" ? state.json.raw : state.json.formatted;
      if (!content) return;
      const copied = await copyText(content);
      showToast(
        copied
          ? `${state.json.tab === "raw" ? "Raw" : "Formatted"} JSON copied`
          : "Couldn't copy — select the JSON and copy manually."
      );
    });

    els.jsonToggle.addEventListener("click", () => {
      setJsonOpen(els.jsonPanel.hidden);
    });

    els.tabFormatted.addEventListener("click", () => switchTab("formatted"));
    els.tabRaw.addEventListener("click", () => switchTab("raw"));

    [els.tabFormatted, els.tabRaw].forEach((tab) => {
      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = tab === els.tabFormatted ? "raw" : "formatted";
        const target = event.key === "Home" ? "formatted" : event.key === "End" ? "raw" : next;
        switchTab(target);
        (target === "raw" ? els.tabRaw : els.tabFormatted).focus();
      });
    });

    window.addEventListener("offline", () => {
      showToast("You're offline. Weather updates are paused.");
    });

    window.addEventListener("online", () => {
      showToast("Back online.");
    });
  }

  function startClock() {
    if (state.clockTimer) return;
    state.clockTimer = window.setInterval(updateClock, 30000);
  }

  /* ----------------------------- Init ----------------------------- */

  function init() {
    if (state.initialized) return;
    state.initialized = true;

    buildChips();
    buildMoodOptions();
    updateMoodControls();
    bindEvents();

    els.tempC.textContent = "—";
    setLoading(true, CONFIG.DEFAULT_CITY);
    loadCity(CONFIG.DEFAULT_CITY);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
