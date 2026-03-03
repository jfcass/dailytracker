# Weather + Pollen Conditions Bar — Design Doc

**Date:** 2026-03-02
**Status:** Approved

---

## Goal

Extend the existing per-day weather strip into a collapsible **conditions bar** that shows weather (high/low temp, condition), elevated pollen alerts at a glance, and expands to reveal full detail: barometric pressure with trend, UV index, humidity, and per-species pollen breakdown.

Data is fetched automatically on load / date change (today only) and saved to `days[date].weather` for retrospective correlation with symptoms, sleep, and mood.

---

## User Allergy Profile (for pollen relevance)

**Seasonal/outdoor:** grass, alder, oak, birch, Box Elder, walnut, lambs quarter, sagebrush
**Perennial/indoor:** cat, dog, dust mites (not trackable via weather API — log manually as symptoms)

Open-Meteo air quality provides: `alder_pollen`, `birch_pollen`, `grass_pollen`, `mugwort_pollen`, `ragweed_pollen`. These cover the user's tree and grass allergies directly; mugwort/ragweed serve as weed proxies for lambs quarter and sagebrush.

---

## Widget Structure

### Collapsed (default)

```
⛅  74° / 58°F     🌳 Tree: High   🌾 Grass: Mod     ›
```

- Weather emoji + condition always visible
- High / Low temperatures always visible
- Pollen alert chips appear only when a category is ≥ Moderate (≥ 10 grains/m³)
- Entire bar is clickable to expand
- Hidden entirely when no data (past date with nothing saved)

### Expanded

```
⛅  Partly Cloudy · 74° / 58°F                         ∨
─────────────────────────────────────────────────────────
  1013 hPa ↑          UV 6 (High)          55% humidity
─────────────────────────────────────────────────────────
  🌳 Alder: High      Birch: Moderate
  🌾 Grass: Moderate
  🌿 Mugwort: Low     Ragweed: Low
```

- Full condition label (e.g. "Partly Cloudy")
- Pressure with intra-day trend arrow (↑ / → / ↓)
- UV index with level label
- Humidity %
- All five pollen species with individual levels

### Pollen Level Thresholds

| Level     | Grains/m³ | UI color          |
|-----------|-----------|-------------------|
| Low       | < 10      | `--clr-text-2` (muted) |
| Moderate  | 10–30     | `--clr-warning` / amber |
| High      | 30–100    | orange            |
| Very High | > 100     | `--clr-error` / red |

Collapsed chips appear at Moderate+. The "Tree" chip shows the worse of alder vs. birch.

---

## Data Schema

`days[date].weather` expands from `{ temp_c, temp_f, code }` to:

```json
{
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
}
```

`pressure_trend` is one of `"rising"` | `"steady"` | `"falling"` — derived at fetch time, stored so past dates render correctly without re-fetching.

### Migration

Any saved `weather` object with a `temp_c` key (old format) is migrated on load:
- `temp_c` → `temp_max_c`, `temp_f` → `temp_max_f`
- `temp_min_c: null`, `temp_min_f: null` (no historical min data available)
- New fields (`pressure_hpa`, pollen, etc.) left absent — widget handles missing fields gracefully
- Migration is idempotent: skips objects that already have `temp_max_c`

---

## API Approach

Two parallel `fetch` calls via `Promise.all`. Both reuse the lat/lon already obtained from `geolocate()`.

### Call 1 — Open-Meteo Forecast (extends existing)

```
GET https://api.open-meteo.com/v1/forecast
  ?latitude=…&longitude=…
  &daily=temperature_2m_max,temperature_2m_min,weather_code,uv_index_max
  &hourly=surface_pressure,relative_humidity_2m
  &timezone=auto&forecast_days=1
```

- `daily[0]`: temp max, temp min, weather code, UV max
- `hourly[12]` (noon): pressure reading used as daily representative
- `hourly[6]` (6am) vs `hourly[12]` (noon): pressure delta → trend (`> +1 hPa` = rising, `< -1 hPa` = falling, else steady)
- `hourly[12]`: humidity reading

### Call 2 — Open-Meteo Air Quality (new)

```
GET https://air-quality-api.open-meteo.com/v1/air-quality
  ?latitude=…&longitude=…
  &hourly=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,ragweed_pollen
  &timezone=auto&forecast_days=1
```

- Hourly pollen forecasts; take **daily max** across all 24 hours for each species (worst-case for the day)

### Error Handling

- If air quality fetch fails → weather still shows; pollen fields left null; expanded panel shows "Pollen data unavailable"
- If forecast fetch fails → entire bar hides (same as current behavior)
- Both calls are best-effort; failures are logged to console, never surfaced to user as errors

### Fetch Timing

- **Today**: always fetch fresh on init and on date change; show cached value instantly while fetching (eliminates flash)
- **Past dates**: display saved data only; no re-fetch
- **Future dates**: hide bar (no data, no fetch)

---

## Code Architecture

### Files Changed

| File | Change |
|------|--------|
| `data.js` | Add `migrateWeather(d)` called from `migrateData()` |
| `weather.js` | Refactor `apiFetch()` → two parallel calls; update `fetchAndSave()`; rewrite `render()` for collapsed/expanded widget |
| `index.html` | Replace `#weather-strip` inline chip with `#conditions-bar` below the date nav |
| `css/styles.css` | New styles: `.conditions-bar`, `.conditions-bar--expanded`, `.pollen-chip`, `.conditions-detail`, pollen level color classes |
| `CLAUDE.md` | Update weather schema block |
| `config.js` | Bump `APP_VERSION` |

### Key Implementation Notes

- **Expand/collapse**: CSS class toggle (`.conditions-bar--expanded`) triggered by click on the bar. State not persisted — always starts collapsed.
- **Pollen chip grouping**: "Tree" chip = `max(alder_pollen, birch_pollen)`; "Grass" = `grass_pollen`; "Weed" = `max(mugwort_pollen, ragweed_pollen)`. Individual species shown in expanded view.
- **Null safety**: All new fields are optional. `render()` checks each field before displaying; missing fields are simply omitted from the UI.
- **Temperature display**: Respects existing `useF()` helper for °F vs °C preference.
