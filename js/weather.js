/**
 * weather.js — Conditions bar (weather + pollen)
 *
 * A collapsible strip below the date nav. Renders into #conditions-bar.
 * Fetches via browser Geolocation + two APIs:
 *   • Open-Meteo Forecast API  → temp max/min, weather code, UV, hourly pressure & humidity
 *   • Google Pollen API (v1)   → species-level UPI (0–5) for US pollen species
 *
 * Saves to Data.getDay(date).weather so past dates show saved conditions.
 *
 * Schema: days[date].weather = {
 *   temp_max_c, temp_max_f, temp_min_c, temp_min_f,
 *   code, pressure_hpa, pressure_trend, uv_index, humidity_pct,
 *   pollen_tree, pollen_grass, pollen_weed,          ← type-level UPI
 *   pollen_alder, pollen_birch, pollen_oak, pollen_maple,
 *   pollen_elm, pollen_cottonwood, pollen_ash, pollen_pine,
 *   pollen_juniper, pollen_ragweed                   ← species-level UPI
 *   aqi_us, aqi_category, pm25, o3_ppb               ← Google Air Quality API
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

  /**
   * Maps UPI value (0–5) to display label + CSS class.
   * Returns null if upi is null/undefined.
   */
  function pollenLevel(upi) {
    if (upi == null) return null;
    if (upi <= 1) return { label: 'Very Low', cls: 'pollen--low' };
    if (upi === 2) return { label: 'Low',      cls: 'pollen--low' };
    if (upi === 3) return { label: 'Medium',   cls: 'pollen--moderate' };
    if (upi === 4) return { label: 'High',     cls: 'pollen--high' };
    return               { label: 'Very High', cls: 'pollen--very-high' };
  }

  // ── AQI level ──────────────────────────────────────────────────────────────

  /** Maps US EPA AQI to display label + CSS class. */
  function aqiLevel(aqi) {
    if (aqi == null) return null;
    if (aqi <= 50)  return { label: 'Good',             cls: 'aqi--good' };
    if (aqi <= 100) return { label: 'Moderate',         cls: 'aqi--moderate' };
    if (aqi <= 150) return { label: 'Sensitive Groups', cls: 'aqi--sensitive' };
    if (aqi <= 200) return { label: 'Unhealthy',        cls: 'aqi--unhealthy' };
    if (aqi <= 300) return { label: 'Very Unhealthy',   cls: 'aqi--very-unhealthy' };
    return                 { label: 'Hazardous',        cls: 'aqi--hazardous' };
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

    // Use Google type-level UPI for summary chips; show Medium+ only (upi >= 3)
    function chipHtml(emoji, label, upi) {
      if (upi == null || upi < 3) return '';
      const level = pollenLevel(upi);
      return `<span class="pollen-chip ${level.cls}">${emoji} ${label}: ${level.label}</span>`;
    }

    const pollenChips = [
      chipHtml('🌳', 'Tree',  state.pollen_tree),
      chipHtml('🌾', 'Grass', state.pollen_grass),
      chipHtml('🌿', 'Weed',  state.pollen_weed),
    ].filter(Boolean).join('');

    // AQI chip — show Moderate+ only (aqi_us >= 51)
    const aqiChip = (() => {
      if (state.aqi_us == null || state.aqi_us <= 50) return '';
      const lvl = aqiLevel(state.aqi_us);
      return `<span class="aqi-chip ${lvl.cls}">AQI ${state.aqi_us}: ${lvl.label}</span>`;
    })();

    el.innerHTML = `
      <div class="conditions-summary">
        <span class="conditions-emoji" aria-hidden="true">${cond.emoji}</span>
        <span class="conditions-temp">${tempStr}</span>
        ${pollenChips}
        ${aqiChip}
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
    if (state.aqi_us != null) {
      const lvl     = aqiLevel(state.aqi_us);
      const pm25Str = state.pm25 != null
        ? ` · PM2.5 ${Math.round(state.pm25 * 10) / 10} µg/m³`
        : '';
      metrics.push(`
        <span class="conditions-metric">
          <span class="conditions-metric-val aqi-metric-val ${lvl.cls}">AQI ${state.aqi_us}${pm25Str}</span>
          <span class="conditions-metric-label">Air Quality</span>
        </span>`);
    }

    // ── Pollen rows — grouped by category, user's allergens first ──
    const pollenRows = [];

    // Trees: user's allergens (alder, birch, oak, maple) + other US species
    const treeSpecies = [
      { code: 'pollen_alder',      label: 'Alder',      mine: true  },
      { code: 'pollen_birch',      label: 'Birch',      mine: true  },
      { code: 'pollen_oak',        label: 'Oak',        mine: true  },
      { code: 'pollen_maple',      label: 'Maple',      mine: true  },  // Box Elder = maple
      { code: 'pollen_elm',        label: 'Elm',        mine: false },
      { code: 'pollen_cottonwood', label: 'Cottonwood', mine: false },
      { code: 'pollen_ash',        label: 'Ash',        mine: false },
      { code: 'pollen_pine',       label: 'Pine',       mine: false },
      { code: 'pollen_juniper',    label: 'Juniper',    mine: false },
    ].filter(s => state[s.code] != null);

    if (treeSpecies.length) {
      const chips = treeSpecies.map(s => {
        const lvl = pollenLevel(state[s.code]);
        const bold = s.mine ? ' font-weight:600' : '';
        return `<span class="pollen-species ${lvl?.cls ?? ''}" style="${bold}">${s.label}: <strong>${lvl?.label ?? '—'}</strong></span>`;
      }).join('');
      pollenRows.push(`
        <div class="pollen-row">
          <span class="pollen-row-icon" aria-hidden="true">🌳</span>
          <div style="display:flex;flex-wrap:wrap;gap:6px">${chips}</div>
        </div>`);
    }

    if (state.pollen_grass != null) {
      const lvl = pollenLevel(state.pollen_grass);
      pollenRows.push(`
        <div class="pollen-row">
          <span class="pollen-row-icon" aria-hidden="true">🌾</span>
          <span class="pollen-species ${lvl?.cls ?? ''}" style="font-weight:600">Grass: <strong>${lvl?.label ?? '—'}</strong></span>
        </div>`);
    }

    if (state.pollen_ragweed != null) {
      const lvl = pollenLevel(state.pollen_ragweed);
      pollenRows.push(`
        <div class="pollen-row">
          <span class="pollen-row-icon" aria-hidden="true">🌿</span>
          <span class="pollen-species ${lvl?.cls ?? ''}">Ragweed: <strong>${lvl?.label ?? '—'}</strong></span>
        </div>`);
    }

    const noPollenData = state.pollen_tree == null && state.pollen_grass == null && state.pollen_weed == null;

    return `
      <div class="conditions-full-label">${cond.emoji} ${cond.label}</div>
      ${metrics.length
          ? `<div class="conditions-metrics">${metrics.join('')}</div>`
          : ''}
      ${pollenRows.length
          ? `<div class="conditions-pollen">${pollenRows.join('')}</div>`
          : noPollenData
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

  async function fetchGooglePollen(lat, lon) {
    const key = CONFIG?.GOOGLE_POLLEN_KEY ?? '';
    if (!key) throw new Error('no-pollen-key');
    const url = `https://pollen.googleapis.com/v1/forecast:lookup`
      + `?key=${encodeURIComponent(key)}`
      + `&location.latitude=${lat.toFixed(4)}`
      + `&location.longitude=${lon.toFixed(4)}`
      + `&days=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`google-pollen ${res.status}`);
    return res.json();
  }

  /**
   * Parses a Google Pollen API response into flat UPI fields.
   * Type-level (TREE/GRASS/WEED) → pollen_tree / pollen_grass / pollen_weed
   * Species-level                 → pollen_alder, pollen_birch, etc.
   * Returns {} if the response has no dailyInfo.
   */
  function parseGooglePollen(data) {
    const day = data.dailyInfo?.[0];
    if (!day) return {};

    const typeMap = {};
    (day.pollenTypeInfo ?? []).forEach(t => {
      typeMap[t.code] = t.indexInfo?.value ?? null;
    });

    const speciesMap = {};
    (day.plantInfo ?? []).forEach(p => {
      speciesMap[p.code] = p.indexInfo?.value ?? null;
    });

    return {
      pollen_tree:       typeMap.TREE        ?? null,
      pollen_grass:      typeMap.GRASS       ?? null,
      pollen_weed:       typeMap.WEED        ?? null,
      pollen_alder:      speciesMap.ALDER      ?? null,
      pollen_birch:      speciesMap.BIRCH      ?? null,
      pollen_oak:        speciesMap.OAK        ?? null,
      pollen_maple:      speciesMap.MAPLE      ?? null,
      pollen_elm:        speciesMap.ELM        ?? null,
      pollen_cottonwood: speciesMap.COTTONWOOD ?? null,
      pollen_pine:       speciesMap.PINE       ?? null,
      pollen_ash:        speciesMap.ASH        ?? null,
      pollen_juniper:    speciesMap.JUNIPER    ?? null,
      pollen_ragweed:    speciesMap.RAGWEED    ?? null,
    };
  }

  async function fetchAirQuality(lat, lon) {
    const key = CONFIG?.GOOGLE_POLLEN_KEY ?? '';
    if (!key) throw new Error('no-pollen-key');
    const url = `https://airquality.googleapis.com/v1/currentConditions:lookup`
      + `?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        location:          { latitude: lat, longitude: lon },
        extraComputations: ['LOCAL_AQI', 'POLLUTANT_CONCENTRATION'],
      }),
    });
    if (!res.ok) throw new Error(`google-air-quality ${res.status}`);
    return res.json();
  }

  /**
   * Parses a Google Air Quality API response into flat fields.
   * aqi_us       — US EPA AQI integer (0–500)
   * aqi_category — "Good" | "Moderate" | "Unhealthy for Sensitive Groups" | etc.
   * pm25         — PM2.5 concentration µg/m³
   * o3_ppb       — Ozone concentration ppb
   */
  function parseAirQuality(data) {
    const aqiUs = (data.indexes    ?? []).find(i => i.code === 'usa_epa');
    const pm25  = (data.pollutants ?? []).find(p => p.code === 'pm25');
    const o3    = (data.pollutants ?? []).find(p => p.code === 'o3');
    return {
      aqi_us:       aqiUs?.aqi                ?? null,
      aqi_category: aqiUs?.category           ?? null,
      pm25:         pm25?.concentration?.value ?? null,
      o3_ppb:       o3?.concentration?.value   ?? null,
    };
  }

  async function fetchAndSave(dateStr) {
    render('loading');
    try {
      const pos = await geolocate();
      const { latitude: lat, longitude: lon } = pos.coords;

      const [forecastResult, pollenResult, aqResult] = await Promise.allSettled([
        fetchForecast(lat, lon),
        fetchGooglePollen(lat, lon),
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

      // ── Pollen — Google Pollen API (UPI 0–5 per species) ──
      let pollenData = {};
      if (pollenResult.status === 'fulfilled') {
        pollenData = parseGooglePollen(pollenResult.value);
      } else {
        console.warn('Pollen fetch failed:', pollenResult.reason);
      }

      // ── Air quality — Google Air Quality API ──
      let aqData = {};
      if (aqResult.status === 'fulfilled') {
        aqData = parseAirQuality(aqResult.value);
      } else {
        console.warn('Air quality fetch failed:', aqResult.reason);
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
        ...aqData,
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
