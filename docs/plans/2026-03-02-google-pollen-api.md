# Google Pollen API Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Open-Meteo's Europe-only pollen data with Google Pollen API, giving accurate species-level pollen readings for the user's North American location and specific allergy profile (alder, birch, oak, maple/box elder, grass — plus all other US-available species in the expanded detail).

**Architecture:** `weather.js` gains `fetchGooglePollen()` and `parseGooglePollen()` helpers. Species-level UPI values (0–5 integer scale) replace the old grains/m³ values, stored under new additive field names (`pollen_tree`, `pollen_grass`, `pollen_weed` for type-level chips; `pollen_alder`, `pollen_birch`, etc. for species detail). Old `*_pollen` grains/m³ fields are ignored by the new render code — no migration needed. `config.js` gets a `GOOGLE_POLLEN_KEY` entry. No other files change.

**UPI scale:** 0 = None · 1 = Very Low · 2 = Low · 3 = Medium · 4 = High · 5 = Very High

**Tech Stack:** Vanilla JS · Google Pollen API v1 (`forecast:lookup`) · UPI scale (0–5)

---

## ⚠️ Prerequisite (manual — do before running tasks)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create or select a project
3. **Enable the Pollen API**: APIs & Services → Enable APIs & Services → search "Pollen API" → Enable
4. **Create an API key**: APIs & Services → Credentials → Create Credentials → API Key
5. (Recommended) Click the key → restrict to "Pollen API" only
6. Copy the key — it goes into `config.js` in Task 1

---

## Task 1: Add GOOGLE_POLLEN_KEY to config.js

**File:** `js/config.js`

### Step 1: Add the key to the CONFIG object

After the `FITBIT_AUTH_URL` line, add:

```js
  GOOGLE_POLLEN_KEY: '',   // Google Pollen API key — get one at console.cloud.google.com
```

Fill in the actual key value between the quotes.

The final config.js should look like:
```js
const APP_VERSION = '2026.03.02b';

const CONFIG = Object.freeze({
  CLIENT_ID:      '...',
  SCOPES:         '...',
  DATA_FILE_NAME: 'health-tracker-data.json',
  PIN_LENGTH:     4,
  PIN_SALT:       'ht-v1-',
  DRIVE_API:      '...',
  DRIVE_UPLOAD:   '...',
  BOOKS_API_KEY:  '...',
  FITBIT_CLIENT_ID: '...',
  FITBIT_API:       '...',
  FITBIT_TOKEN_URL: '...',
  FITBIT_AUTH_URL:  '...',
  GOOGLE_POLLEN_KEY: 'YOUR_KEY_HERE',
});
```

### Step 2: Commit
```bash
git add js/config.js
git commit -m "feat(pollen): add GOOGLE_POLLEN_KEY to config"
```

---

## Task 2: weather.js — Replace pollen fetch with Google Pollen API

**File:** `js/weather.js`

### Step 1: Replace fetchAirQuality() with fetchGooglePollen() + parseGooglePollen()

Find and **delete** the entire `fetchAirQuality()` function:
```js
async function fetchAirQuality(lat, lon) {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality`
    + ...
  const res = await fetch(url);
  if (!res.ok) throw new Error(`open-meteo air-quality ${res.status}`);
  return res.json();
}
```

**Replace** it with:
```js
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
```

### Step 2: Update fetchAndSave() to use the new function

Find the section inside `fetchAndSave()` that does the `Promise.allSettled` call. Replace it:

**Before:**
```js
      const [forecastResult, aqResult] = await Promise.allSettled([
        fetchForecast(lat, lon),
        fetchAirQuality(lat, lon),
      ]);

      if (forecastResult.status === 'rejected') throw forecastResult.reason;
      const f = forecastResult.value;
      ...
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
```

**After:**
```js
      const [forecastResult, pollenResult] = await Promise.allSettled([
        fetchForecast(lat, lon),
        fetchGooglePollen(lat, lon),
      ]);

      if (forecastResult.status === 'rejected') throw forecastResult.reason;
      const f = forecastResult.value;
      ...
      // ── Pollen — Google Pollen API (UPI 0–5 per species) ──
      let pollenData = {};
      if (pollenResult.status === 'fulfilled') {
        pollenData = parseGooglePollen(pollenResult.value);
      } else {
        console.warn('Pollen fetch failed:', pollenResult.reason);
      }
```

Also **delete** the `dailyMax()` helper function — it's no longer needed:
```js
/** Return max value in array, ignoring nulls. Returns null if array is empty/all-null. */
function dailyMax(arr) {
  if (!arr || !arr.length) return null;
  const nums = arr.filter(v => v != null);
  return nums.length ? Math.max(...nums) : null;
}
```

### Step 3: Commit
```bash
git add js/weather.js
git commit -m "feat(pollen): replace Open-Meteo AQ fetch with Google Pollen API"
```

---

## Task 3: weather.js — Update pollenLevel() and render/detail for UPI scale + new species

**File:** `js/weather.js`

### Step 1: Replace pollenLevel() and pollenLevelFull() with a single UPI-aware function

**Delete both** existing functions:
```js
function pollenLevel(v) { ... }
function pollenLevelFull(v) { ... }
```

**Replace with one:**
```js
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
```

### Step 2: Update collapsed chip logic in render()

Find the chip section inside `render()`:

**Replace:**
```js
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
```

**With:**
```js
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
```

### Step 3: Replace buildDetail() pollen section

Find the entire pollen rows section inside `buildDetail()`:

**Replace everything from `// ── Pollen rows ──` to the end of the pollen block:**

```js
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
        return `<span class="pollen-species ${lvl?.cls ?? ''}" style="${bold}">${escHtml(s.label)}: <strong>${lvl?.label ?? '—'}</strong></span>`;
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
```

And update the final return in `buildDetail()` — replace `noPollen` with `noPollenData`:
```js
      ${pollenRows.length
          ? `<div class="conditions-pollen">${pollenRows.join('')}</div>`
          : noPollenData
            ? '<p class="conditions-no-pollen">Pollen data unavailable</p>'
            : ''}
```

### Step 4: Verify in browser
1. Load app — conditions bar appears
2. Click to expand — tree species rows show with levels (alder, birch, oak, maple in bold since they're your allergens)
3. If any tree/grass/weed is Medium+, a chip appears in the collapsed bar
4. No console errors

### Step 5: Commit
```bash
git add js/weather.js
git commit -m "feat(pollen): update render for Google UPI scale + species-level detail"
```

---

## Task 4: CLAUDE.md schema update + version bump

**Files:** `CLAUDE.md`, `js/config.js`

### Step 1: Update weather schema in CLAUDE.md

Find the `days[date].weather` example block added in the previous plan and replace it:

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
        "pollen_tree":    3,
        "pollen_grass":   1,
        "pollen_weed":    0,
        "pollen_alder":   4,
        "pollen_birch":   2,
        "pollen_oak":     3,
        "pollen_maple":   2,
        "pollen_elm":     1,
        "pollen_cottonwood": 0,
        "pollen_ash":     1,
        "pollen_pine":    0,
        "pollen_juniper": 0,
        "pollen_ragweed": 0
      },
```

### Step 2: Update the Schema Field Notes for weather

Find the `days[date].weather` schema note block and replace the pollen bullet points:

```markdown
### `days[date].weather`
Fetched automatically for today via Open-Meteo (forecast/UV/pressure/humidity) and Google Pollen API
(species-level pollen). Saved on fetch so past dates display historical conditions. `null` if never fetched.
- `code`: WMO weather code (mapped to emoji + label in weather.js).
- `pressure_trend`: `"rising"` | `"steady"` | `"falling"` (noon vs 6am delta, >1 hPa threshold).
- `pollen_tree` / `pollen_grass` / `pollen_weed`: Google type-level UPI (0–5). Used for collapsed chips.
- `pollen_alder`, `pollen_birch`, `pollen_oak`, `pollen_maple`, `pollen_elm`, `pollen_cottonwood`,
  `pollen_ash`, `pollen_pine`, `pollen_juniper`, `pollen_ragweed`: species-level UPI (0–5).
  UPI scale: 0=None · 1=Very Low · 2=Low · 3=Medium · 4=High · 5=Very High.
  Source: Google Pollen API (`GOOGLE_POLLEN_KEY` in config.js). US coverage only for these species.
```

### Step 3: Bump APP_VERSION in config.js

```js
const APP_VERSION = '2026.03.02c';
```

### Step 4: Commit
```bash
git add CLAUDE.md js/config.js
git commit -m "docs: update weather schema for Google Pollen UPI fields, bump version"
```

---

## Done

Push:
```bash
git push
```

End-to-end check:
1. Conditions bar shows temp + any Medium+ pollen chips
2. Expand → tree species all listed (alder/birch/oak/maple in bold), grass, ragweed
3. Past dates without the new fields → pollen section hidden gracefully
4. Console clean
