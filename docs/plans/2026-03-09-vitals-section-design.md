# Vitals Section — Design Spec

**Date:** 2026-03-09
**Status:** Approved

## Overview

Extract the vitals bar from `section-symptoms` and the stats bar from the Health bucket header into a new standalone `section-vitals` tracker-section. This gives the data its own collapsible section that can be positioned independently in both the accordion and Hub layouts.

## Problem

- The vitals bar (HR, HRV, SpO2, sleep detail) is embedded inside `section-symptoms`, making it impossible to reorder independently.
- The Health bucket injects a stats bar (sleep hrs / steps / calories) into the bucket header — hardcoded, not a proper section.
- Both display overlapping data with no flexibility on placement.

## Approach

New `vitals.js` module following the standard module pattern. Owns all rendering for `#section-vitals`. Existing rendering logic extracted from `symptoms.js` (vitals bar) and `hub.js` (stats bar injection).

## New File: `js/vitals.js`

Standard module shape:
- `init()` — called from `App.init()` in the main init sequence
- `render()` — renders both sub-rows for the current date
- `setDate(date)` — updates internal date and re-renders (called by `renderBucketSections` and `DateNav` broadcast)

## New Section in `index.html`

```html
<section id="section-vitals" class="tracker-section" aria-label="Vitals">
  <div class="section-header" onclick="App.toggleSection('section-vitals')">
    <h2 class="section-title">Vitals</h2>
    <!-- collapse chevron -->
  </div>
  <div class="section-body">
    <div id="vitals-stats-row"></div>
    <div id="vitals-bar"></div>
  </div>
</section>
```

DOM placement: after `section-meds` (accordion order).

## Section Content

### Stats Row (`#vitals-stats-row`) — always rendered, dashes when empty

| Stat     | Source field   |
|----------|----------------|
| Steps    | `day.steps`    |
| Calories | `day.calories` |
| Floors   | `day.floors`   |

### Vitals Bar (`#vitals-bar`) — only renders items with data; hidden entirely if no Fitbit data

| Vital            | Source field            |
|------------------|-------------------------|
| Sleep quality    | `day.sleep.quality`     |
| Sleep efficiency | `day.sleep_efficiency`  |
| Sleep stages     | `day.sleep_deep`, `.sleep_light`, `.sleep_rem`, `.sleep_awake` |
| Resting HR       | `day.resting_hr`        |
| HRV              | `day.hrv`               |
| SpO2             | `day.spo2`              |
| Breathing rate   | `day.breathing_rate`    |

## Layout Placement

### Accordion (Today tab)
```
Habits → Moderation → Mood → Bowel → Symptoms → Medications → Vitals → Gratitudes → Daily Notes
```
`section-vitals` placed after `section-meds` in DOM.

### Health Bucket (Hub layout)
```
Vitals (order: 10) → Medications (order: 11) → Bowel (order: 12) → Symptoms (order: 13) → Treatments nav (order: 99)
```

`BUCKETS.health.sections`:
```js
['section-vitals', 'section-meds', 'section-bowel', 'section-symptoms', 'tab-treatments']
```

## Changes to Existing Files

### `symptoms.js`
- Remove `renderVitalsBar()` function
- Remove `renderVitalsBar()` call from `render()`

### `index.html`
- Remove `<div id="symp-vitals-bar"></div>` from inside `section-symptoms`
- Add `section-vitals` after `section-meds`

### `hub.js`
- Remove `hub-bucket-statsbar` injection block in `showBucket('health')`
- Remove `.hub-bucket-statsbar` cleanup in `_cleanupBucketView()`
- Update `BUCKETS.health.sections` to put `'section-vitals'` first
- Add `Vitals.setDate(date)` branch in `renderBucketSections()`

### `app.js`
- Add `Vitals.init()` in the main init sequence (alongside other module inits)

### `css/styles.css`
- Add styles for `#vitals-stats-row` and `#vitals-bar`
- Remove `.hub-bucket-statsbar` and `.symp-vitals-*` styles

## Visibility

`section-vitals` participates in the `hidden_sections` setting. Appears in the Settings visibility list as "Vitals". Collapse state stored in `localStorage` key `ht_collapsed` like all other sections.
