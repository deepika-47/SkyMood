/* =========================================================
   SkyMood — app logic (vanilla JS, no dependencies)
   Data: WeatherAPI.com /v1/current.json through /api/weather
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
    ],
    FETCH_TIMEOUT_MS: 15000,
    TOAST_MS: 2400,
  });

  /* Interpretation thresholds. Priority is applied top-down in deriveMood(). */
  const THRESHOLDS = Object.freeze({
    COLD_C: 15,
    HOT_C: 32,
    BREEZE_MIN_KPH: 20,
  });

  /* WeatherAPI can resolve a bare "Delhi" to a different place. Presets and
     matching typed searches are qualified so the result stays predictable,
     while the search field still shows what the person typed. */
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
  });

  const MOODS = Object.freeze({
    cold: {
      key: "cold",
      emoji: "❄️",
      title: "Freeze Frame",
      text: "Bone-chilling cold ahead, cuddle up tight😉",
    },
    clear: {
      key: "clear",
      emoji: "🌤️",
      title: "Perfect Day",
      text: "The weather looks great! Time to plan a day out with your loved ones🫂",
    },
    hot: {
      key: "hot",
      emoji: "☀️",
      title: "Sun Alert",
      text: "Don't get eaten by the sun today! Stay hydrated and slap on some SPF🌞",
    },
    rain: {
      key: "rain",
      emoji: "☔",
      title: "Rain Check",
      text: "Step out with an umbrella — don't get soaked☔",
    },
    breeze: {
      key: "breeze",
      emoji: "🌀",
      title: "Breezy Mode",
      text: "A cool breeze that touches your soul — step outside🌀",
    },
  });

  const GRADIENTS = Object.freeze({
    hot: "linear-gradient(180deg, #FF7E5F 0%, #FEB47B 100%)",
    clear: "linear-gradient(180deg, #38BDF8 0%, #818CF8 100%)",
    breeze: "linear-gradient(180deg, #2DD4BF 0%, #3B82F6 100%)",
    rain: "linear-gradient(180deg, #334155 0%, #0F172A 100%)",
    cold: "linear-gradient(180deg, #1E3A8A 0%, #312E81 100%)",
  });

  const THEME_COLORS = Object.freeze({
    hot: "#FF7E5F",
    clear: "#38BDF8",
    breeze: "#2DD4BF",
    rain: "#334155",
    cold: "#1E3A8A",
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
      message: (query) => `We couldn't find “${query}”. Check the spelling and try another city.`,
    },
    INVALID_API_KEY: {
      title: "API configuration error",
      retryable: false,
      message: () =>
        "The WeatherAPI key is missing or invalid. Add a valid WEATHER_API_KEY in the environment and redeploy.",
    },
    API_KEY_MISSING: {
      title: "API configuration error",
      retryable: false,
      message: () =>
        "The WeatherAPI key is missing or invalid. Add a valid WEATHER_API_KEY in the environment and redeploy.",
    },
    RATE_LIMITED: {
      title: "Temporary service error",
      retryable: true,
      message: () =>
        "The weather service is receiving too many requests right now. Give it a moment, then try again.",
    },
    NETWORK: {
      title: "No internet connection",
      retryable: true,
      message: () =>
        "SkyMood couldn't reach the weather service. Check your connection and try again.",
    },
    TIMEOUT: {
      title: "The sky is taking too long",
      retryable: true,
      message: () => "The weather service didn't respond in time. Please try again.",
    },
    SERVICE_UNAVAILABLE: {
      title: "Service unavailable",
      retryable: true,
      message: () => "The weather service is temporarily unavailable. Please try again shortly.",
    },
    UPSTREAM_UNAVAILABLE: {
      title: "Service unavailable",
      retryable: true,
      message: () => "The weather service is temporarily unavailable. Please try again shortly.",
    },
    UNEXPECTED_RESPONSE: {
      title: "Unexpected response",
      retryable: true,
      message: () => "The weather service returned data we couldn't read. Please try again.",
    },
    BAD_RESPONSE: {
      title: "Unexpected response",
      retryable: true,
      message: () => "The weather service returned data we couldn't read. Please try again.",
    },
    BAD_REQUEST: {
      title: "That search needs a tweak",
      retryable: false,
      message: () => "Enter a city name using letters, numbers and simple punctuation.",
    },
    METHOD_NOT_ALLOWED: {
      title: "Unexpected response",
      retryable: true,
      message: () => "The weather request could not be completed. Please try again.",
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
    loading: false,
    requestSeq: 0,
    controller: null,
    theme: "",
    frontLayer: "a",
    json: { formatted: "", raw: "", tab: "formatted" },
    clockTimer: null,
    toastTimer: null,
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
    lastUpdatedPill: $("lastUpdatedPill"),
    vibeCard: $("vibeCard"),
    vibeEmoji: $("vibeEmoji"),
    vibeTitle: $("vibeTitle"),
    vibeText: $("vibeText"),
    vibeReason: $("vibeReason"),
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
    jsonSection: $("jsonSection"),
    jsonToggle: $("jsonToggle"),
    jsonPanel: $("jsonPanel"),
    jsonPre: $("jsonPre"),
    jsonCode: $("jsonCode"),
    jsonMeta: $("jsonMeta"),
    copyJsonBtn: $("copyJsonBtn"),
    tabFormatted: $("tabFormatted"),
    tabRaw: $("tabRaw"),
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

  function numberText(value, maxFractionDigits = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: maxFractionDigits,
      minimumFractionDigits: 0,
    }).format(number);
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
    if (!Number.isFinite(diff)) return "";
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
    return `${Math.floor(diff / 86400)} d ago`;
  }

  function safeIcon(raw) {
    if (typeof raw !== "string" || !raw) return GENERIC_ICON;
    const absolute = raw.startsWith("//") ? `https:${raw}` : raw;
    if (!absolute.startsWith("https://cdn.weatherapi.com/")) return GENERIC_ICON;
    return absolute.replace("/64x64/", "/128x128/");
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
      /* Fall through to the legacy copy path. */
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
      const copied = document.execCommand("copy");
      area.remove();
      return copied;
    } catch {
      return false;
    }
  }

  /* ----------------------------- Weather model ----------------------------- */

  function normalizeWeather(payload) {
    if (
      !payload ||
      typeof payload !== "object" ||
      !payload.location ||
      !payload.current
    ) {
      throw new AppError("BAD_RESPONSE", "Missing location or current weather");
    }

    const location = payload.location;
    const current = payload.current;

    const numericFields = [
      current.temp_c,
      current.temp_f,
      current.humidity,
      current.wind_kph,
      current.uv,
      current.cloud,
      current.vis_km,
      current.pressure_mb,
      current.last_updated_epoch,
    ];

    if (
      typeof location.name !== "string" ||
      typeof location.tz_id !== "string" ||
      !current.condition ||
      typeof current.condition.text !== "string" ||
      numericFields.some((value) => !Number.isFinite(Number(value)))
    ) {
      throw new AppError("BAD_RESPONSE", "Incomplete current weather");
    }

    return {
      city: location.name,
      region: location.region || "",
      country: location.country || "",
      tz: location.tz_id,
      tempC: Number(current.temp_c),
      tempF: Number(current.temp_f),
      humidity: Number(current.humidity),
      windKph: Number(current.wind_kph),
      windDir: current.wind_dir || "",
      gustKph: Number.isFinite(Number(current.gust_kph)) ? Number(current.gust_kph) : null,
      uv: Number(current.uv),
      cloud: Number(current.cloud),
      visKm: Number(current.vis_km),
      pressureMb: Number(current.pressure_mb),
      condition: current.condition.text,
      conditionIcon: current.condition.icon || "",
      isDay: Number(current.is_day) === 1,
      lastUpdatedEpoch: Number(current.last_updated_epoch),
      fetchedAt: Date.now(),
    };
  }

  /* Priority when conditions overlap:
     1. Snow / ice / freezing                         → Freeze Frame
     2. Rain / drizzle / showers / thunder / storms   → Rain Check
     3. Below 15°C                                    → Freeze Frame
     4. Above 32°C                                    → Sun Alert
     5. Wind at or above 20 km/h                      → Breezy Mode
     6. Everything else                               → Perfect Day
     The first matching rule wins. */
  function deriveMood(weather) {
    const temperature = Number(weather.tempC);
    const wind = Number(weather.windKph);
    const condition = String(weather.condition || "").toLowerCase();

    if (/snow|blizzard|sleet|freezing|\bice\b/.test(condition)) return MOODS.cold;
    if (/rain|drizzle|shower|thunder|storm/.test(condition)) return MOODS.rain;
    if (temperature < THRESHOLDS.COLD_C) return MOODS.cold;
    if (temperature > THRESHOLDS.HOT_C) return MOODS.hot;
    if (wind >= THRESHOLDS.BREEZE_MIN_KPH) return MOODS.breeze;
    return MOODS.clear;
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

  /* ----------------------------- Rendering ----------------------------- */

  function updateClock() {
    if (!state.weather) return;
    setText(els.localTime, clockLabel(Date.now() / 1000, state.weather.tz));
  }

  function uvDescriptor(uv) {
    const value = Number(uv) || 0;
    if (value <= 2) return "Low exposure";
    if (value <= 5) return "Moderate exposure";
    if (value <= 7) return "High exposure";
    if (value <= 10) return "Very high exposure";
    return "Extreme exposure";
  }

  function humidityDescriptor(humidity) {
    const value = Number(humidity);
    if (value < 30) return "Dry air";
    if (value <= 60) return "Comfortable";
    if (value <= 75) return "A little humid";
    return "Very humid";
  }

  function renderVibe(weather) {
    const mood = deriveMood(weather);

    setText(els.vibeEmoji, mood.emoji);
    setText(els.vibeTitle, mood.title);
    setText(els.vibeText, mood.text);
    els.vibeCard.dataset.mood = mood.key;
    els.vibeCard.dataset.emoji = mood.emoji;

    setText(
      els.vibeReason,
      `${weather.condition} · ${numberText(weather.tempC)}°C · ${numberText(weather.windKph, 1)} km/h wind`
    );

    return mood;
  }

  function renderCurrent(weather) {
    setText(els.cityName, weather.city || "—");
    const region = [weather.region, weather.country].filter(Boolean).join(", ");
    setText(els.region, region || "—");
    setText(els.tempC, numberText(weather.tempC));
    setText(els.condText, weather.condition || "—");
    setIcon(els.condIcon, weather.conditionIcon, `${weather.condition || "Current"} weather icon`);

    setText(
      els.lastUpdatedPill,
      `Updated ${clockLabel(weather.lastUpdatedEpoch, weather.tz)} local · ${relativeAgo(weather.lastUpdatedEpoch)}`
    );

    setText(els.humidity, `${numberText(weather.humidity)}%`);
    setText(els.humiditySub, humidityDescriptor(weather.humidity));

    setText(els.wind, `${numberText(weather.windKph, 1)} km/h`);
    const windDetail = [weather.windDir, weather.gustKph !== null ? `gusts ${numberText(weather.gustKph, 1)} km/h` : ""]
      .filter(Boolean)
      .join(" · ");
    setText(els.windSub, windDetail || "Calm");

    setText(els.uv, numberText(weather.uv, 1));
    setText(els.uvSub, uvDescriptor(weather.uv));

    setText(els.cloud, `${numberText(weather.cloud)}%`);
    setText(els.visibility, `${numberText(weather.visKm, 1)} km`);
    setText(els.pressure, `${numberText(weather.pressureMb)} hPa`);
    setText(
      els.windDetail,
      [numberText(weather.windKph, 1) + " km/h", weather.windDir].filter(Boolean).join(" ")
    );
    setText(els.tempF, `${numberText(weather.tempF, 1)}°F`);
    setText(els.updated, `${clockLabel(weather.lastUpdatedEpoch, weather.tz)} local`);

    updateClock();
  }

  function renderJsonPanel() {
    const { formatted, raw, tab } = state.json;
    const content = tab === "raw" ? raw : formatted;

    els.jsonCode.textContent = content || "";
    els.copyJsonBtn.disabled = !content;
    els.jsonPre.setAttribute("aria-label", `${tab === "raw" ? "Raw" : "Formatted"} JSON response`);
    updateTabs();

    if (state.weather) {
      const sizeKb = new Blob([raw || ""]).size / 1024;
      setText(
        els.jsonMeta,
        `${state.weather.city} · ${numberText(sizeKb, 1)} KB · WeatherAPI /v1/current.json`
      );
    }
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
    els.copyJsonBtn.setAttribute(
      "aria-label",
      `Copy ${isFormatted ? "formatted" : "raw"} JSON to clipboard`
    );
  }

  function renderWeather(weather, payload, rawText) {
    state.weather = weather;

    const mood = renderVibe(weather);
    renderCurrent(weather);

    state.json.formatted = JSON.stringify(payload, null, 2);
    state.json.raw = rawText;
    renderJsonPanel();

    applyTheme(mood.key);

    els.skeleton.hidden = true;
    els.fatal.hidden = true;
    els.content.hidden = false;
    els.content.classList.remove("is-updating", "just-updated");
    void els.content.offsetWidth;
    els.content.classList.add("just-updated");

    document.title = `${weather.city} ${numberText(weather.tempC)}° · SkyMood`;
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

  function errorCopy(code) {
    return ERROR_COPY[code] || ERROR_COPY.UNEXPECTED;
  }

  function showError(error, query) {
    const code = error && error.code ? error.code : "UNEXPECTED";
    const copy = errorCopy(code);
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
    setText(
      els.alertNote,
      `Still showing the last successful update for ${state.weather.city}.`
    );
    els.alertNote.hidden = false;
    els.retryBtn.hidden = !copy.retryable;
    els.banner.hidden = false;
    announce(`${copy.title}. ${message}`);
  }

  /* ----------------------------- Network ----------------------------- */

  function errorCodeForResponse(payload, status) {
    const serverCode = payload && payload.error && payload.error.code;
    if (typeof serverCode === "string" && ERROR_COPY[serverCode]) return serverCode;

    if (status === 404) return "CITY_NOT_FOUND";
    if (status === 429) return "RATE_LIMITED";
    if (status === 401 || status === 403) return "INVALID_API_KEY";
    if (status >= 500) return "SERVICE_UNAVAILABLE";
    return "UNEXPECTED";
  }

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
        throw new AppError(
          errorCodeForResponse(payload, response.status),
          (payload && payload.error && payload.error.message) || response.statusText
        );
      }

      if (!payload) {
        throw new AppError("BAD_RESPONSE", "Response was not JSON");
      }

      if (payload.error) {
        throw new AppError(errorCodeForResponse(payload, response.status), payload.error.message);
      }

      return { payload, rawText };
    } catch (error) {
      if (timedOut) throw new AppError("TIMEOUT", "Request timed out");
      if (error instanceof AppError) throw error;
      if (outerSignal && outerSignal.aborted) {
        const aborted = new Error("Aborted");
        aborted.name = "AbortError";
        throw aborted;
      }
      if (error && error.name === "AbortError") throw error;
      throw new AppError("NETWORK", error && error.message ? error.message : "Network request failed");
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
    const sequence = ++state.requestSeq;
    if (state.controller) state.controller.abort();
    state.controller = new AbortController();

    setLoading(true, query);

    try {
      const { payload, rawText } = await requestWeather(apiQuery, state.controller.signal);
      if (sequence !== state.requestSeq) return;

      const weather = normalizeWeather(payload);
      state.requestedQuery = query;
      state.lastFailedQuery = null;
      renderWeather(weather, payload, rawText);
      setLoading(false);
      announce(
        `Weather updated for ${weather.city}: ${numberText(weather.tempC)} degrees Celsius, ${weather.condition}.`
      );
    } catch (error) {
      if ((error && error.name === "AbortError") || sequence !== state.requestSeq) return;
      if (error && error.code) {
        console.warn(`[SkyMood] ${error.code}: ${error.message}`);
      }
      setLoading(false);
      showError(error, query);
    }
  }

  /* ----------------------------- Chips / JSON / events ----------------------------- */

  function buildChips() {
    const fragment = document.createDocumentFragment();

    CONFIG.POPULAR_CITIES.forEach((city) => {
      const chip = create("button", "chip", city);
      chip.type = "button";
      chip.dataset.city = city;
      chip.setAttribute("aria-pressed", "false");
      chip.addEventListener("click", () => {
        clearFieldError();
        els.input.value = city;
        loadCity(city);
      });
      fragment.appendChild(chip);
    });

    els.chips.appendChild(fragment);
  }

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
      const query = state.lastFailedQuery || els.input.value.trim() || state.requestedQuery;
      els.input.value = query;
      loadCity(query);
    });

    els.dismissAlertBtn.addEventListener("click", hideBanner);

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
        const target =
          event.key === "Home" ? "formatted" : event.key === "End" ? "raw" : next;
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
    bindEvents();
    applyTheme("clear");

    els.tempC.textContent = "—";
    loadCity(CONFIG.DEFAULT_CITY);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
