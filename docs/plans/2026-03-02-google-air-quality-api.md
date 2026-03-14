# Google Air Quality API Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Google Air Quality API data (US AQI, PM2.5, O3) to the conditions bar alongside existing weather and pollen data.

**Architecture:** `weather.js` gains `fetchAirQuality()` and `parseAirQuality()` helpers. `fetchAndSave()` expands its `Promise.allSettled` to 3 parallel fetches. New fields (`aqi_us`, `aqi_category`, `pm25`, `o3_ppb`) are stored additively — no migration needed. An AQI chip appears in the collapsed bar when AQI ≥ 51 (Moderate+); the expanded detail panel gets an Air Quality metric tile. Same API key as pollen (`GOOGLE_POLLEN_KEY`). No other files change.

**Tech Stack:** Vanilla JS · Google Air Quality API v1 (`currentConditions:lookup`) · US EPA AQI scale (0–500)

---

## ⚠️ Prerequisite (manual — do before running tasks)

The same Google Cloud project and API key used for the Pollen API works here — just needs to be enabled:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. **Enable the Air Quality API**: APIs & Services → Enable APIs → search "Air Quality API" → Enable
3. **Update key restrictions**: APIs & Services → Credentials → click your key → API restrictions → add "Air Quality API" → Save

---

## Task 1: weather.js — Add fetchAirQuality() + parseAirQuality(), update fetchAndSave()

**File:** `js/weather.js`

### Step 1: Add fetchAirQuality() after fetchGooglePollen()

After the closing `}` of `fetchGooglePollen()`, add:

```js
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
  const aqiUs = (data.indexes   ?? []).find(i => i.code === 'usa_epa');
  const pm25  = (data.pollutants ?? []).find(p => p.code === 'pm25');
  const o3    = (data.pollutants ?? []).find(p => p.code === 'o3');
  return {
    aqi_us:       aqiUs?.aqi                     ?? null,
    aqi_category: aqiUs?.category                ?? null,
    pm25:         pm25?.concentration?.value      ?? null,
    o3_ppb:       o3?.concentration?.value        ?? null,
  };
}
```

### Step 2: Update fetchAndSave() — expand allSettled to 3 fetches

**Find:**
```js
      const [forecastResult, pollenResult] = await Promise.allSettled([
        fetchForecast(lat, lon),
        fetchGooglePollen(lat, lon),
      ]);
```

**Replace with:**
```js
      const [forecastResult, pollenResult, aqResult] = await Promise.allSettled([
        fetchForecast(lat, lon),
        fetchGooglePollen(lat, lon),
        fetchAirQuality(lat, lon),
      ]);
```

### Step 3: Update fetchAndSave() — parse air quality result

After the existing pollen block:
```js
      // ── Pollen — Google Pollen API (UPI 0–5 per species) ──
      let pollenData = {};
      if (pollenResult.status === 'fulfilled') {
        pollenData = parseGooglePollen(pollenResult.value);
      } else {
        console.warn('Pollen fetch failed:', pollenResult.reason);
      }
```

Add immediately after it:
```js
      // ── Air quality — Google Air Quality API ──
      let aqData = {};
      if (aqResult.status === 'fulfilled') {
        aqData = parseAirQuality(aqResult.value);
      } else {
        console.warn('Air quality fetch failed:', aqResult.reason);
      }
```

### Step 4: Spread aqData into the saved weather object

**Find:**
```js
        ...pollenData,
      };
```

**Replace with:**
```js
        ...pollenData,
        ...aqData,
      };
```

### Step 5: Update the file header comment schema block

**Find:**
```js
 *   pollen_juniper, pollen_ragweed                   ← species-level UPI
 * }
```

**Replace with:**
```js
 *   pollen_juniper, pollen_ragweed                   ← species-level UPI
 *   aqi_us, aqi_category, pm25, o3_ppb               ← Google Air Quality API
 * }
```

### Step 6: Commit
```bash
git add js/weather.js
git commit -m "feat(aqi): add Google Air Quality API fetch + parse"
```

---

## Task 2: weather.js + css/styles.css — Render AQI in conditions bar

**Files:** `js/weather.js`, `css/styles.css`

### Step 1: Add aqiLevel() helper in weather.js

After the closing `}` of `pollenLevel()`, add:

```js
  // ── AQI level ──────────────────────────────────────────────────────────────

  /** Maps US EPA AQI to display label + CSS class. */
  function aqiLevel(aqi) {
    if (aqi == null) return null;
    if (aqi <= 50)  return { label: 'Good',              cls: 'aqi--good' };
    if (aqi <= 100) return { label: 'Moderate',          cls: 'aqi--moderate' };
    if (aqi <= 150) return { label: 'Sensitive Groups',  cls: 'aqi--sensitive' };
    if (aqi <= 200) return { label: 'Unhealthy',         cls: 'aqi--unhealthy' };
    if (aqi <= 300) return { label: 'Very Unhealthy',    cls: 'aqi--very-unhealthy' };
    return                 { label: 'Hazardous',         cls: 'aqi--hazardous' };
  }
```

### Step 2: Add AQI chip to collapsed summary in render()

In `render()`, after the `pollenChips` block:

**Find:**
```js
    el.innerHTML = `
      <div class="conditions-summary">
        <span class="conditions-emoji" aria-hidden="true">${cond.emoji}</span>
        <span class="conditions-temp">${tempStr}</span>
        ${pollenChips}
        <span class="conditions-toggle" aria-hidden="true">${isExpanded ? '∨' : '›'}</span>
      </div>
```

**Replace with:**
```js
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
```

### Step 3: Add AQI metric tile to buildDetail()

In `buildDetail()`, after the humidity metric block, add:

```js
    if (state.aqi_us != null) {
      const lvl    = aqiLevel(state.aqi_us);
      const pm25Str = state.pm25 != null
        ? ` · PM2.5 ${Math.round(state.pm25 * 10) / 10} µg/m³`
        : '';
      metrics.push(`
        <span class="conditions-metric">
          <span class="conditions-metric-val aqi-metric-val ${lvl.cls}">AQI ${state.aqi_us}${pm25Str}</span>
          <span class="conditions-metric-label">Air Quality</span>
        </span>`);
    }
```

### Step 4: Add AQI CSS to styles.css

Find the pollen chip dark-mode override block (near end of pollen chip section) and after it add:

```css
/* ── AQI chips ─────────────────────────────────────────────────────────── */
.aqi-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: .75rem;
  font-weight: 600;
  letter-spacing: .02em;
  white-space: nowrap;
}

.aqi--good           { background: #c8e6c9; color: #1b5e20; }
.aqi--moderate       { background: #fff9c4; color: #f57f17; }
.aqi--sensitive      { background: #ffe0b2; color: #e65100; }
.aqi--unhealthy      { background: #ffcccc; color: #b71c1c; }
.aqi--very-unhealthy { background: #e1bee7; color: #4a148c; }
.aqi--hazardous      { background: #880e4f; color: #fff;    }

/* metric val inherits the same color classes (text only, no background) */
.aqi-metric-val.aqi--good           { color: #2e7d32; }
.aqi-metric-val.aqi--moderate       { color: #f57f17; }
.aqi-metric-val.aqi--sensitive      { color: #e65100; }
.aqi-metric-val.aqi--unhealthy      { color: #b71c1c; }
.aqi-metric-val.aqi--very-unhealthy { color: #6a1b9a; }
.aqi-metric-val.aqi--hazardous      { color: #880e4f; }

@media (prefers-color-scheme: dark) {
  .aqi--good           { background: #1b3a1e; color: #81c784; }
  .aqi--moderate       { background: #3d3000; color: #ffd54f; }
  .aqi--sensitive      { background: #3e1f00; color: #ffb74d; }
  .aqi--unhealthy      { background: #3b0000; color: #ef9a9a; }
  .aqi--very-unhealthy { background: #2a0040; color: #ce93d8; }
  .aqi--hazardous      { background: #560027; color: #f8bbd0; }

  .aqi-metric-val.aqi--good           { color: #81c784; }
  .aqi-metric-val.aqi--moderate       { color: #ffd54f; }
  .aqi-metric-val.aqi--sensitive      { color: #ffb74d; }
  .aqi-metric-val.aqi--unhealthy      { color: #ef9a9a; }
  .aqi-metric-val.aqi--very-unhealthy { color: #ce93d8; }
  .aqi-metric-val.aqi--hazardous      { color: #f8bbd0; }
}
```

### Step 5: Verify in browser
1. Load app — conditions bar fetches fresh data
2. Expand — "Air Quality" metric tile shows AQI value + PM2.5 with appropriate color
3. If AQI ≥ 51, an AQI chip appears in the collapsed bar
4. No console errors

### Step 6: Commit
```bash
git add js/weather.js css/styles.css
git commit -m "feat(aqi): render AQI chip + detail metric in conditions bar"
```

---

## Task 3: CLAUDE.md schema update + version bump

**Files:** `CLAUDE.md`, `js/config.js`

### Step 1: Update weather schema example in CLAUDE.md

Find the weather object in the JSON example block and add the new fields after `"pollen_ragweed": 0`:

```json
        "pollen_ragweed": 0,
        "aqi_us":         42,
        "aqi_category":   "Good",
        "pm25":           8.2,
        "o3_ppb":         35.4
```

### Step 2: Update the `days[date].weather` schema notes

Find the line:
```
  Source: Google Pollen API (`GOOGLE_POLLEN_KEY` in config.js). US coverage only for these species.
```

Add after it:
```markdown
- `aqi_us`: US EPA AQI integer (0–500). Scale: 0–50 Good · 51–100 Moderate · 101–150 Sensitive Groups ·
  151–200 Unhealthy · 201–300 Very Unhealthy · 301–500 Hazardous.
- `aqi_category`: Category string from API (e.g. `"Good"`, `"Moderate"`).
- `pm25`: PM2.5 concentration µg/m³. `null` if unavailable.
- `o3_ppb`: Ozone concentration ppb. `null` if unavailable.
  Source: Google Air Quality API (same `GOOGLE_POLLEN_KEY`; enable "Air Quality API" in Cloud Console).
```

### Step 3: Bump APP_VERSION in config.js

```js
const APP_VERSION = '2026.03.02d';
```

### Step 4: Commit
```bash
git add CLAUDE.md js/config.js
git commit -m "docs: update weather schema for Air Quality fields, bump version"
```

---

## Done

Push:
```bash
git push
```

End-to-end check:
1. Expanded conditions panel shows "Air Quality" tile with colored AQI + PM2.5
2. When AQI ≥ 51, colored AQI chip appears in collapsed bar
3. Past dates without new fields → Air Quality tile simply absent (graceful)
4. Console clean
