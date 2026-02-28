# Health Vitals Bar — Design

**Date:** 2026-02-27
**Status:** Approved

## Overview

Two read-only display blocks at the top of the Health section on Today, hidden when empty. Shows Fitbit-synced sleep and vitals data for the current date at a glance.

## Placement

Inside `#section-symptoms` in `index.html`, a new `<div id="symp-vitals-bar">` inserted directly before `<div id="symp-cat-panel">`. Rendered by `symptoms.js`.

## Sleep Block

Visible when `day.sleep.hours > 0`. Shows:
- Hours slept (e.g. `7.5 h`)
- Bedtime (e.g. `Bed 11:15`)
- Wake time (e.g. `Wake 06:45`)

## Vitals Block

Visible when at least one of `steps`, `resting_hr`, `hrv`, `spo2`, `breathing_rate` is non-null. Renders only chips with data — absent fields produce no chip.

| Field | Label | Unit |
|---|---|---|
| `steps` | Steps | (formatted with comma separator) |
| `resting_hr` | Resting HR | bpm |
| `hrv` | HRV | ms |
| `spo2` | SpO2 | % |
| `breathing_rate` | Breathing | br/min |

## Empty State

Both blocks hidden entirely when no data. No placeholders, no dashes.

## Code Changes

| File | Change |
|---|---|
| `index.html` | Add `<div id="symp-vitals-bar"></div>` before `symp-cat-panel` |
| `js/symptoms.js` | Add `renderVitalsBar(date)`, call from `render()` and `setDate()` |
| `css/styles.css` | Add `.symp-vitals-bar`, `.symp-vitals-sleep`, `.symp-vitals-chips`, `.symp-vitals-chip` styles |
