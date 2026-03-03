# Weather + Pollen Conditions Bar — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the tiny inline weather chip with a collapsible conditions bar (below the date nav) showing temp high/low, elevated pollen alerts, and an expandable detail panel with pressure, UV, humidity, and per-species pollen.

**Architecture:** `weather.js` is completely rewritten — two parallel Open-Meteo fetches (forecast + air quality) via `Promise.allSettled`, merged into an expanded `days[date].weather` schema. The bar is always-collapsed by default; a click toggles `.conditions-bar--expanded` and re-renders. No framework, no build step — pure vanilla JS.

**Tech Stack:** Vanilla JS/HTML/CSS · Open-Meteo Forecast API · Open-Meteo Air Quality API · Browser Geolocation API

---

### Task 1: data.js — Add migrateWeather()

**Files:**
- Modify: `js/data.js` (near line 205 — add function before `migrateData`, then call inside it)

**What to do:**

Add `migrateWeather(d)` immediately before the `migrateData(d)` function (around line 207):

```js
function migrateWeather(d) {
  // Convert old { temp_c, temp_f, code } records to new expanded schema.
  // Idempotent — skips days that already have temp_max_c or no weather at all.
  Object.values(d.days ?? {}).forEach(day => {
    const w = day.weather;
    if (!w || w.temp_max_c != null) return;   // already migrated or missing
    if (!('temp_c' in w)) return;             // unexpected shape — leave alone
    day.weather = {
      temp_max_c: w.temp_c,
      temp_max_f: w.temp_f,
      temp_min_c: null,
      temp_min_f: null,
      code:       w.code,
    };
  });
  return d;
}
```

Then inside `migrateData(d)`, add one line after `migrateModeration(d)`:

```js
  migrateModeration(d);
  migrateWeather(d);   // ← add this
  return d;
```

**Verify:**
Open browser console and run:
```js
// Simulate an old weather record in memory
const fakeDay = { weather: { temp_c: 20, temp_f: 68, code: 2 } };
Data.getData().days['TEST-MIGRATE'] = fakeDay;
// Then re-check the structure — it should NOT auto-migrate in memory like this;
// real migration happens on load(). Just confirm the function exists:
console.log(typeof migrateWeather); // should NOT be in scope (it's private to the IIFE)
// Instead verify via Data.load() that old records get renamed on the next load.
```

No automated test framework — verify manually by checking the browser doesn't throw on load.

**Commit:**
```
git add js/data.js
git commit -m "feat: add migrateWeather() for expanded weather schema"
```

---

### Task 2: index.html — Swap weather chip for conditions bar

**Files:**
- Modify: `index.html` (around lines 197–198)

**What to do:**

**Remove** the inline weather chip from inside `.app-date-bar` (lines 197–198):
```html
        <!-- Weather chip — populated by weather.js -->
        <div id="weather-strip" class="weather-strip-inline" hidden aria-live="polite"></div>
```

**After** the closing `</div>` of `.app-date-bar` (currently line 207), **add** the new conditions bar:
```html
      <!-- ── Conditions bar: weather + pollen (populated by weather.js) ── -->
      <div id="conditions-bar" class="conditions-bar" hidden aria-live="polite"></div>
```

The result should look like:
```html
      </div><!-- end .app-date-bar -->

      <!-- ── Conditions bar: weather + pollen (populated by weather.js) ── -->
      <div id="conditions-bar" class="conditions-bar" hidden aria-live="polite"></div>

      <!-- ── Section: Habit Tracker (Phase 2) ─────────────────────────── -->
```

**Verify:**
Open the app in the browser — the old "⛅ 74°F" chip in the date nav bar should be gone (weather.js still references `#weather-strip` which no longer exists, so nothing will render yet — that's fine until Task 4).

**Commit:**
```
git add index.html
git commit -m "feat: replace weather-strip chip with conditions-bar element"
```

---

### Task 3: css/styles.css — Replace weather chip styles with conditions bar styles

**Files:**
- Modify: `css/styles.css` (around lines 4659–4683)

**What to do:**

**Replace** the entire `/* ── Weather chip ── */` block (lines 4659–4683):

```css
/* ── Weather chip (inside the date bar) ─────────────────────────────────────── */
.weather-strip-inline {
  display:     flex;
  ...
}
...
.weather-fetching {
  font-size: 0.8rem;
  color:     var(--clr-text-2);
}
```

**With** this new block:

```css
/* ── Conditions bar (weather + pollen, collapsible) ─────────────────────────── */
.conditions-bar {
  background:    var(--clr-surface-2);
  border-bottom: 1px solid var(--clr-border);
  cursor:        pointer;
  user-select:   none;
  overflow:      hidden;
}
.conditions-bar[hidden] { display: none; }

.conditions-summary {
  display:     flex;
  align-items: center;
  gap:         0.5rem;
  padding:     0.35rem 1rem;
  flex-wrap:   wrap;
}

.conditions-emoji {
  font-size:   1.1rem;
  line-height: 1;
}

.conditions-temp {
  font-size:   0.8rem;
  font-weight: 700;
  color:       var(--clr-text);
}

.conditions-toggle {
  margin-left: auto;
  font-size:   0.75rem;
  color:       var(--clr-text-2);
  flex-shrink: 0;
}

/* ── Expanded detail panel ───────────────────────────────────────────────────── */
.conditions-detail {
  padding:    0.5rem 1rem 0.6rem;
  border-top: 1px solid var(--clr-border);
}
.conditions-detail[hidden] { display: none; }

.conditions-full-label {
  font-size:     0.8rem;
  font-weight:   600;
  color:         var(--clr-text);
  margin-bottom: 0.5rem;
}

.conditions-metrics {
  display:        flex;
  gap:            1.25rem;
  flex-wrap:      wrap;
  margin-bottom:  0.5rem;
  padding-bottom: 0.5rem;
  border-bottom:  1px solid var(--clr-border);
}

.conditions-metric {
  display:        flex;
  flex-direction: column;
  gap:            0.1rem;
}

.conditions-metric-val {
  font-size:   0.8rem;
  font-weight: 700;
  color:       var(--clr-text);
}

.conditions-uv-label {
  font-style:  normal;
  font-weight: 500;
  color:       var(--clr-text-2);
}

.conditions-metric-label {
  font-size: 0.7rem;
  color:     var(--clr-text-2);
}

.conditions-pollen {
  display:        flex;
  flex-direction: column;
  gap:            0.25rem;
  margin-top:     0.25rem;
}

.pollen-row {
  display:     flex;
  align-items: center;
  gap:         0.5rem;
  flex-wrap:   wrap;
  font-size:   0.78rem;
}

.pollen-row-icon {
  font-size:   0.9rem;
  line-height: 1;
  flex-shrink: 0;
}

.pollen-species       { color: var(--clr-text-2); }
.pollen-species strong { font-weight: 600; }

.conditions-no-pollen {
  font-size: 0.75rem;
  color:     var(--clr-text-2);
  margin:    0.25rem 0 0;
}

/* ── Pollen level color modifiers ────────────────────────────────────────────── */
.pollen--low       { color: var(--clr-text-2); }
.pollen--moderate  { color: #d4910b; }
.pollen--high      { color: #e05c00; }
.pollen--very-high { color: var(--clr-error); }

/* ── Pollen chips (collapsed summary row) ────────────────────────────────────── */
.pollen-chip {
  font-size:     0.7rem;
  font-weight:   600;
  padding:       0.15rem 0.4rem;
  border-radius: 3px;
  line-height:   1.4;
  white-space:   nowrap;
}
.pollen-chip.pollen--moderate  { background: #fef3cd; color: #d4910b; }
.pollen-chip.pollen--high      { background: #ffe4cc; color: #e05c00; }
.pollen-chip.pollen--very-high { background: #fde8e8; color: var(--clr-error); }

@media (prefers-color-scheme: dark) {
  .pollen-chip.pollen--moderate  { background: #3d2e08; color: #f0b429; }
  .pollen-chip.pollen--high      { background: #3d1e08; color: #ff8c42; }
  .pollen-chip.pollen--very-high { background: #3d0808; color: var(--clr-error); }
}

.weather-fetching {
  font-size: 0.8rem;
  color:     var(--clr-text-2);
}
```

Note: `.weather-fetching` is kept because it's reused in the loading state of the new conditions bar.

**Verify:**
Open the app — layout shouldn't be broken. No conditions bar visible yet (weather.js still needs rewriting).

**Commit:**
```
git add css/styles.css
git commit -m "feat: add conditions-bar CSS (weather + pollen collapsible widget)"
```

---

### Task 4: weather.js — Full rewrite

**Files:**
- Modify: `js/weather.js` (complete replacement)

**What to do:**

Replace the entire file with:

```js
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
```

**Verify manually in the browser:**
1. Load the app — a conditions bar should appear below the date nav (after geolocation is granted)
2. It shows `⛅ 74° / 58°F` (or whatever today's weather is)
3. During fetch it shows `…` (the loading state)
4. If tree or grass pollen is elevated, a chip appears: e.g. `🌳 Tree: High`
5. Click the bar — it expands showing pressure, UV, humidity, and per-species pollen
6. Click again — it collapses
7. Navigate to a previous date that has saved weather — it shows that saved data
8. Navigate to a date with no saved data — the bar hides entirely
9. Open browser console — no errors

**Commit:**
```
git add js/weather.js
git commit -m "feat: rewrite weather.js for conditions bar with pollen + pressure"
```

---

### Task 5: CLAUDE.md + config.js — Docs and version bump

**Files:**
- Modify: `CLAUDE.md` (add weather field to the days schema section)
- Modify: `js/config.js` (bump APP_VERSION)

**What to do in CLAUDE.md:**

In the `days` schema block, after the `"bowel": []` or `"steps": null` section (wherever the day fields are listed), add a `"weather"` entry. Find the section that starts with the `"days"` object and add:

```json
      "weather": {
        "temp_max_c":     23.5,
        "temp_max_f":     74.3,
        "temp_min_c":     14.2,
        "temp_min_f":     57.6,
        "code":           2,
        "pressure_hpa":   1013.2,
        "pressure_trend": "rising",
        "uv_index":       6,
        "humidity_pct":   55,
        "alder_pollen":   12.5,
        "birch_pollen":   45.0,
        "grass_pollen":   8.0,
        "mugwort_pollen": 0.0,
        "ragweed_pollen": 0.1
      },
```

Also add a Schema Field Notes entry after the existing notes:

```markdown
### `days[date].weather`
Fetched automatically for today via Open-Meteo (no API key). Saved on fetch so past dates display
historical conditions. `null` if never fetched for that date.
- `code`: WMO weather code (mapped to emoji + label in weather.js).
- `pressure_trend`: `"rising"` | `"steady"` | `"falling"` (noon vs 6am intra-day delta, > 1 hPa threshold).
- Pollen values in grains/m³ (daily max). Thresholds: Low < 10, Moderate 10–30, High 30–100, Very High > 100.
- `alder_pollen` / `birch_pollen` → "Tree" category; `mugwort_pollen` / `ragweed_pollen` → "Weed" proxy.
```

**What to do in config.js:**

Change line 1:
```js
const APP_VERSION = '2026.03.02';
```
to:
```js
const APP_VERSION = '2026.03.02b';
```
(Using suffix `b` since this is the second feature shipped on the same date. Alternatively use today's date if this is run on a later date.)

**Commit:**
```
git add CLAUDE.md js/config.js
git commit -m "docs: update weather schema in CLAUDE.md, bump APP_VERSION"
```

---

## Done

All five tasks complete. The conditions bar is live. Verify end-to-end one final time:

1. Load today — bar appears with temp high/low, weather emoji, any elevated pollen chips
2. Expand — see pressure + trend, UV with level label, humidity %, all 5 pollen species
3. Collapse — returns to compact view
4. Navigate to a past date — saved weather shows (or bar is hidden if never fetched)
5. No console errors
