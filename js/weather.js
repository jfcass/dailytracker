/**
 * weather.js — Per-day weather strip
 *
 * Shows current weather below the date bar when viewing today.
 * Fetches via browser Geolocation + Open-Meteo (free, no key needed).
 * Saves the reading to data.days[date].weather so past dates show
 * what the weather was on that day.
 */
const Weather = (() => {

  // ── WMO weather code → display ────────────────────────────────────────────────

  const CONDITIONS = {
    0:  { label: 'Clear',            emoji: '☀️'  },
    1:  { label: 'Mostly clear',     emoji: '🌤️' },
    2:  { label: 'Partly cloudy',    emoji: '⛅'  },
    3:  { label: 'Overcast',         emoji: '☁️'  },
    45: { label: 'Foggy',            emoji: '🌫️' },
    48: { label: 'Icy fog',          emoji: '🌫️' },
    51: { label: 'Light drizzle',    emoji: '🌦️' },
    53: { label: 'Drizzle',          emoji: '🌦️' },
    55: { label: 'Heavy drizzle',    emoji: '🌧️' },
    56: { label: 'Freezing drizzle', emoji: '🌧️' },
    57: { label: 'Freezing drizzle', emoji: '🌧️' },
    61: { label: 'Light rain',       emoji: '🌧️' },
    63: { label: 'Rain',             emoji: '🌧️' },
    65: { label: 'Heavy rain',       emoji: '🌧️' },
    66: { label: 'Freezing rain',    emoji: '🌧️' },
    67: { label: 'Freezing rain',    emoji: '🌧️' },
    71: { label: 'Light snow',       emoji: '🌨️' },
    73: { label: 'Snow',             emoji: '❄️'  },
    75: { label: 'Heavy snow',       emoji: '❄️'  },
    77: { label: 'Snow grains',      emoji: '🌨️' },
    80: { label: 'Light showers',    emoji: '🌦️' },
    81: { label: 'Showers',          emoji: '🌧️' },
    82: { label: 'Heavy showers',    emoji: '⛈️'  },
    85: { label: 'Snow showers',     emoji: '🌨️' },
    86: { label: 'Heavy snow',       emoji: '❄️'  },
    95: { label: 'Thunderstorm',     emoji: '⛈️'  },
    96: { label: 'Thunderstorm',     emoji: '⛈️'  },
    99: { label: 'Thunderstorm',     emoji: '⛈️'  },
  };

  function condition(code) {
    return CONDITIONS[code] ?? { label: 'Unknown', emoji: '🌡️' };
  }

  // °F/°C based on settings preference, falling back to locale
  function useF() {
    const unit = Data.getSettings?.()?.weather_unit ?? 'auto';
    if (unit === 'f') return true;
    if (unit === 'c') return false;
    return (navigator.language || '').startsWith('en-US');
  }

  function fmtTemp(w) {
    return useF()
      ? `${Math.round(w.temp_f)}°F`
      : `${Math.round(w.temp_c)}°C`;
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  function render(state) {
    const el = document.getElementById('weather-strip');
    if (!el) return;

    if (!state) {
      el.hidden = true;
      return;
    }

    el.hidden = false;

    if (state === 'loading') {
      // Tiny spinner dots while fetching
      el.innerHTML = `<span class="weather-fetching">…</span>`;
      return;
    }

    // Compact: just emoji + temperature — fits neatly in the date bar
    const cond = condition(state.code);
    el.innerHTML =
      `<span class="weather-emoji" aria-hidden="true">${cond.emoji}</span>` +
      `<span class="weather-temp">${fmtTemp(state)}</span>`;
  }

  // Track which date is currently displayed so stale async results are ignored
  let activeDate = null;

  // ── Fetch ─────────────────────────────────────────────────────────────────────

  async function geolocate() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('no-geo')); return; }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout:    10_000,
        maximumAge: 5 * 60_000,
      });
    });
  }

  async function apiFetch(lat, lon) {
    // Fetch daily high — temperature_2m_max is the forecast high for the day.
    // timezone=auto derives the correct calendar day from coordinates.
    const url = `https://api.open-meteo.com/v1/forecast`
      + `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`
      + `&daily=temperature_2m_max,weather_code_max&timezone=auto&forecast_days=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    return res.json();
  }

  async function fetchAndSave(dateStr) {
    render('loading');
    try {
      const pos  = await geolocate();
      const json = await apiFetch(pos.coords.latitude, pos.coords.longitude);
      // daily arrays have one entry per day; [0] is today
      const c    = json.daily.temperature_2m_max[0];

      const w = {
        temp_c: Math.round(c * 10) / 10,
        temp_f: Math.round((c * 9 / 5 + 32) * 10) / 10,
        code:   json.daily.weather_code_max[0],
      };

      // Persist to today's day record (best-effort — don't block UI on save)
      Data.getDay(dateStr).weather = w;
      Data.save().catch(err => console.warn('Weather save failed:', err));

      // Only update the strip if the user hasn't navigated away while we fetched
      if (activeDate === dateStr) render(w);
    } catch {
      if (activeDate === dateStr) render(null);
    }
  }

  // ── Public ────────────────────────────────────────────────────────────────────

  // Called whenever the date navigator changes date
  function setDate(dateStr) {
    activeDate = dateStr;  // update before any async work

    const today = Data.today();
    const saved = Data.getData().days?.[dateStr]?.weather ?? null;

    if (dateStr === today) {
      // Always fetch today's high (free API, fast, daily max is stable all day)
      // Show any cached value immediately so there's no blank flash
      if (saved) render(saved);
      fetchAndSave(today);
    } else if (saved) {
      // Past date — show whatever was saved on that day
      render(saved);
    } else {
      // Past date with no saved weather — hide the strip
      render(null);
    }
  }

  // Called once when the app starts (shows weather for today)
  function init() {
    setDate(Data.today());
  }

  return { init, setDate };

})();
