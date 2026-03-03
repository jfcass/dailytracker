/**
 * weather.js — Conditions bar (weather + pollen)
 *
 * A collapsible strip below the date nav. Renders into #conditions-bar.
 * Fetches via browser Geolocation + Open-Meteo (free, no key needed):
 *   • Forecast API   → temp max/min, weather code, UV, hourly pressure & humidity
 *   • Air Quality API → hourly pollen for 5 species (daily max taken)
 *
 * Saves to Data.getDay(date).weather so past dates show saved conditions.
 *
 * Schema: days[date].weather = {
 *   temp_max_c, temp_max_f, temp_min_c, temp_min_f,
 *   code, pressure_hpa, pressure_trend, uv_index, humidity_pct,
 *   alder_pollen, birch_pollen, grass_pollen, mugwort_pollen, ragweed_pollen
 * }
 */
const Weather = (() => {

  // ── WMO weather code → display ────────────────────────────────────────────

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

  // ── Temperature ───────────────────────────────────────────────────────────

  function useF() {
    const unit = Data.getSettings?.()?.weather_unit ?? 'auto';
    if (unit === 'f') return true;
    if (unit === 'c') return false;
    return (navigator.language || '').startsWith('en-US');
  }

  function fmtTemp(w) {
    if (useF()) {
      const hi = w.temp_max_f != null ? `${Math.round(w.temp_max_f)}°` : '—';
      const lo = w.temp_min_f != null ? `${Math.round(w.temp_min_f)}°` : null;
      return lo ? `${hi} / ${lo}F` : `${hi}F`;
    } else {
      const hi = w.temp_max_c != null ? `${Math.round(w.temp_max_c)}°` : '—';
      const lo = w.temp_min_c != null ? `${Math.round(w.temp_min_c)}°` : null;
      return lo ? `${hi} / ${lo}C` : `${hi}C`;
    }
  }

  // ── Pollen levels ─────────────────────────────────────────────────────────

  // Short label for collapsed chip
  function pollenLevel(v) {
    if (v == null) return null;
    if (v < 10)  return { label: 'Low',       cls: 'pollen--low' };
    if (v < 30)  return { label: 'Mod',        cls: 'pollen--moderate' };
    if (v < 100) return { label: 'High',       cls: 'pollen--high' };
    return              { label: 'Very High',  cls: 'pollen--very-high' };
  }

  // Full label for expanded detail
  function pollenLevelFull(v) {
    if (v == null) return null;
    if (v < 10)  return { label: 'Low',       cls: 'pollen--low' };
    if (v < 30)  return { label: 'Moderate',  cls: 'pollen--moderate' };
    if (v < 100) return { label: 'High',      cls: 'pollen--high' };
    return              { label: 'Very High', cls: 'pollen--very-high' };
  }

  // ── UV level label ────────────────────────────────────────────────────────

  function uvLevel(v) {
    if (v == null || v < 0) return '';
    if (v < 3)  return 'Low';
    if (v < 6)  return 'Moderate';
    if (v < 8)  return 'High';
    if (v < 11) return 'Very High';
    return 'Extreme';
  }

  // ── Pressure trend arrow ──────────────────────────────────────────────────

  function trendArrow(trend) {
    if (trend === 'rising')  return '↑';
    if (trend === 'falling') return '↓';
    return '→';
  }

  // ── Render ────────────────────────────────────────────────────────────────

  function render(state) {
    const el = document.getElementById('conditions-bar');
    if (!el) return;

    if (!state) {
      el.hidden = true;
      return;
    }

    if (state === 'loading') {
      el.hidden = false;
      el.innerHTML = `<div class="conditions-summary"><span class="weather-fetching">…</span></div>`;
      return;
    }

    el.hidden = false;
    const cond       = condition(state.code);
    const tempStr    = fmtTemp(state);
    const isExpanded = el.classList.contains('conditions-bar--expanded');

    // ── Collapsed pollen chips (Moderate+) ──
    const treeVal  = Math.max(state.alder_pollen  ?? 0, state.birch_pollen   ?? 0);
    const grassVal = state.grass_pollen ?? 0;
    const weedVal  = Math.max(state.mugwort_pollen ?? 0, state.ragweed_pollen ?? 0);

    const treeLevel  = pollenLevel(treeVal  > 0 ? treeVal  : null);
    const grassLevel = pollenLevel(grassVal > 0 ? grassVal : null);
    const weedLevel  = pollenLevel(weedVal  > 0 ? weedVal  : null);

    function chipHtml(emoji, label, level) {
      if (!level || level.cls === 'pollen--low') return '';
      return `<span class="pollen-chip ${level.cls}">${emoji} ${label}: ${level.label}</span>`;
    }

    const pollenChips = [
      chipHtml('🌳', 'Tree',  treeLevel),
      chipHtml('🌾', 'Grass', grassLevel),
      chipHtml('🌿', 'Weed',  weedLevel),
    ].filter(Boolean).join('');

    el.innerHTML = `
      <div class="conditions-summary">
        <span class="conditions-emoji" aria-hidden="true">${cond.emoji}</span>
        <span class="conditions-temp">${tempStr}</span>
        ${pollenChips}
        <span class="conditions-toggle" aria-hidden="true">${isExpanded ? '∨' : '›'}</span>
      </div>
      <div class="conditions-detail"${isExpanded ? '' : ' hidden'}>
        ${buildDetail(state, cond)}
      </div>
    `;
  }

  function buildDetail(state, cond) {
    // ── Metrics row (pressure, UV, humidity) ──
    const metrics = [];
    if (state.pressure_hpa != null) {
      metrics.push(`
        <span class="conditions-metric">
          <span class="conditions-metric-val">${Math.round(state.pressure_hpa)} hPa ${trendArrow(state.pressure_trend)}</span>
          <span class="conditions-metric-label">Pressure</span>
        </span>`);
    }
    if (state.uv_index != null) {
      metrics.push(`
        <span class="conditions-metric">
          <span class="conditions-metric-val">UV ${state.uv_index} <em class="conditions-uv-label">${uvLevel(state.uv_index)}</em></span>
          <span class="conditions-metric-label">UV Index</span>
        </span>`);
    }
    if (state.humidity_pct != null) {
      metrics.push(`
        <span class="conditions-metric">
          <span class="conditions-metric-val">${state.humidity_pct}%</span>
          <span class="conditions-metric-label">Humidity</span>
        </span>`);
    }

    // ── Pollen rows ──
    const pollenRows = [];

    const hasTree = state.alder_pollen != null || state.birch_pollen != null;
    if (hasTree) {
      const a = pollenLevelFull(state.alder_pollen);
      const b = pollenLevelFull(state.birch_pollen);
      pollenRows.push(`
        <div class="pollen-row">
          <span class="pollen-row-icon" aria-hidden="true">🌳</span>
          <span class="pollen-species ${a?.cls ?? ''}">Alder: <strong>${a?.label ?? '—'}</strong></span>
          <span class="pollen-species ${b?.cls ?? ''}">Birch: <strong>${b?.label ?? '—'}</strong></span>
        </div>`);
    }

    if (state.grass_pollen != null) {
      const g = pollenLevelFull(state.grass_pollen);
      pollenRows.push(`
        <div class="pollen-row">
          <span class="pollen-row-icon" aria-hidden="true">🌾</span>
          <span class="pollen-species ${g?.cls ?? ''}">Grass: <strong>${g?.label ?? '—'}</strong></span>
        </div>`);
    }

    const hasWeed = state.mugwort_pollen != null || state.ragweed_pollen != null;
    if (hasWeed) {
      const m = pollenLevelFull(state.mugwort_pollen);
      const r = pollenLevelFull(state.ragweed_pollen);
      pollenRows.push(`
        <div class="pollen-row">
          <span class="pollen-row-icon" aria-hidden="true">🌿</span>
          <span class="pollen-species ${m?.cls ?? ''}">Mugwort: <strong>${m?.label ?? '—'}</strong></span>
          <span class="pollen-species ${r?.cls ?? ''}">Ragweed: <strong>${r?.label ?? '—'}</strong></span>
        </div>`);
    }

    const noPollen = !hasTree && state.grass_pollen == null && !hasWeed;

    return `
      <div class="conditions-full-label">${cond.emoji} ${cond.label}</div>
      ${metrics.length
          ? `<div class="conditions-metrics">${metrics.join('')}</div>`
          : ''}
      ${pollenRows.length
          ? `<div class="conditions-pollen">${pollenRows.join('')}</div>`
          : noPollen
            ? '<p class="conditions-no-pollen">Pollen data unavailable</p>'
            : ''}
    `;
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────

  let activeDate = null;

  async function geolocate() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('no-geo')); return; }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout:    10_000,
        maximumAge: 5 * 60_000,
      });
    });
  }

  async function fetchForecast(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast`
      + `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`
      + `&daily=temperature_2m_max,temperature_2m_min,weather_code,uv_index_max`
      + `&hourly=surface_pressure,relative_humidity_2m`
      + `&timezone=auto&forecast_days=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`open-meteo forecast ${res.status}`);
    return res.json();
  }

  async function fetchAirQuality(lat, lon) {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality`
      + `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`
      + `&hourly=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,ragweed_pollen`
      + `&timezone=auto&forecast_days=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`open-meteo air-quality ${res.status}`);
    return res.json();
  }

  /** Return max value in array, ignoring nulls. Returns null if array is empty/all-null. */
  function dailyMax(arr) {
    if (!arr || !arr.length) return null;
    const nums = arr.filter(v => v != null);
    return nums.length ? Math.max(...nums) : null;
  }

  async function fetchAndSave(dateStr) {
    render('loading');
    try {
      const pos = await geolocate();
      const { latitude: lat, longitude: lon } = pos.coords;

      const [forecastResult, aqResult] = await Promise.allSettled([
        fetchForecast(lat, lon),
        fetchAirQuality(lat, lon),
      ]);

      if (forecastResult.status === 'rejected') throw forecastResult.reason;
      const f = forecastResult.value;

      // ── Daily values ──
      const tempMaxC = f.daily.temperature_2m_max[0];
      const tempMinC = f.daily.temperature_2m_min[0];
      const code     = f.daily.weather_code[0];
      const uvIndex  = f.daily.uv_index_max[0] ?? null;

      // ── Hourly values — use noon (index 12) and 6am (index 6) ──
      const pressureNoon = f.hourly.surface_pressure[12]        ?? null;
      const pressure6am  = f.hourly.surface_pressure[6]         ?? null;
      const humidityNoon = f.hourly.relative_humidity_2m[12]    ?? null;

      let pressureTrend = 'steady';
      if (pressureNoon != null && pressure6am != null) {
        const delta = pressureNoon - pressure6am;
        if      (delta >  1) pressureTrend = 'rising';
        else if (delta < -1) pressureTrend = 'falling';
      }

      // ── Pollen — daily max across all hourly values ──
      let pollenData = {};
      if (aqResult.status === 'fulfilled') {
        const h = aqResult.value.hourly;
        pollenData = {
          alder_pollen:   dailyMax(h.alder_pollen),
          birch_pollen:   dailyMax(h.birch_pollen),
          grass_pollen:   dailyMax(h.grass_pollen),
          mugwort_pollen: dailyMax(h.mugwort_pollen),
          ragweed_pollen: dailyMax(h.ragweed_pollen),
        };
      } else {
        console.warn('Pollen fetch failed:', aqResult.reason);
      }

      const w = {
        temp_max_c:     Math.round(tempMaxC * 10) / 10,
        temp_max_f:     Math.round((tempMaxC * 9 / 5 + 32) * 10) / 10,
        temp_min_c:     Math.round(tempMinC * 10) / 10,
        temp_min_f:     Math.round((tempMinC * 9 / 5 + 32) * 10) / 10,
        code,
        pressure_hpa:   pressureNoon != null ? Math.round(pressureNoon * 10) / 10 : null,
        pressure_trend: pressureTrend,
        uv_index:       uvIndex  != null ? Math.round(uvIndex)  : null,
        humidity_pct:   humidityNoon != null ? Math.round(humidityNoon) : null,
        ...pollenData,
      };

      // Persist to today's day record (best-effort — don't block UI)
      Data.getDay(dateStr).weather = w;
      Data.save().catch(err => console.warn('Weather save failed:', err));

      if (activeDate === dateStr) render(w);
    } catch (err) {
      console.warn('Weather fetch failed:', err);
      if (activeDate === dateStr) render(null);
    }
  }

  // ── Toggle expand/collapse ────────────────────────────────────────────────

  function setupToggle() {
    const el = document.getElementById('conditions-bar');
    if (!el) return;
    el.addEventListener('click', () => {
      el.classList.toggle('conditions-bar--expanded');
      // Re-render so the toggle arrow flips and detail panel shows/hides
      const saved = Data.getData().days?.[activeDate]?.weather ?? null;
      if (saved && typeof saved === 'object') render(saved);
    });
  }

  // ── Public ────────────────────────────────────────────────────────────────

  function setDate(dateStr) {
    activeDate = dateStr;

    // Always collapse on date change
    const el = document.getElementById('conditions-bar');
    if (el) el.classList.remove('conditions-bar--expanded');

    const today = Data.today();
    const saved = Data.getData().days?.[dateStr]?.weather ?? null;

    if (dateStr === today) {
      // Show cached immediately to avoid blank flash, then fetch fresh
      if (saved) render(saved);
      fetchAndSave(today);
    } else if (saved) {
      render(saved);
    } else {
      render(null);
    }
  }

  function init() {
    setupToggle();
    setDate(Data.today());
  }

  return { init, setDate };

})();
