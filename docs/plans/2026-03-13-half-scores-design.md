# Half-Score Double Press — Design Doc

**Date:** 2026-03-13
**Affects:** `js/mood.js`, `js/bowel.js`, `css/styles.css`, `CLAUDE.md`

---

## Problem

Mood/energy/stress/focus ratings (1–5) and bowel quality ratings (1–7) use whole integers only. Users sometimes feel the honest answer falls between two levels. Adding half-scores (e.g., 3.5) adds nuance without changing the data model or requiring migration.

---

## Interaction Model

Double-press cycle on any rating button:

```
unset → press N → score = N (whole)
               → press N again → score = N - 0.5 (half)
                             → press N again → score = null (unset)
```

- Pressing a **different** button always sets to that whole value immediately (no half-step)
- Button "1" double-pressed → `0.5` (valid; means "barely 1")
- This applies identically to mood/energy/stress/focus and bowel quality

---

## Visual Design

### Button states

| State | CSS class | Appearance |
|-------|-----------|------------|
| Unset | (none) | Default button style |
| Whole | `mood-btn--active` / `bwl-quality-btn--active` | Fully lit (existing) |
| Half  | `mood-btn--half` / `bwl-quality-btn--half` | Reduced opacity + `::after` "½" badge |

The "½" badge is a small superscript rendered via CSS `::after` on the `--half` class — no DOM changes required.

### Value labels

- Whole scores: existing text label ("Good", "High", "Normal", etc.)
- Half scores: numeric string, e.g. `"3.5"`

### Bowel display chip

- Whole scores: existing label from `QUALITY_LABELS` (e.g., "Normal")
- Half scores: `"Type 3.5"` — simple, unambiguous

---

## Logic Changes

### mood.js — `setMood(field, val)`

Current:
```js
day.mood[field] = day.mood[field] === val ? null : val;
```

New:
```js
const current = day.mood[field];
if (current === val - 0.5) {
  day.mood[field] = null;          // half → unset
} else if (current === val) {
  day.mood[field] = val - 0.5;    // whole → half
} else {
  day.mood[field] = val;           // anything else → whole
}
```

Active class logic in `renderMood()` updates to check both whole and half states:
- `mood-btn--active` when `val === current`
- `mood-btn--half` when `val - 0.5 === current`

Value label lookup: if value is not an integer, skip label lookup and show the number directly.

### bowel.js — quality button click handler

Same three-way logic as above, applied to `fQuality` (the form's in-progress quality value).

Active class logic in `renderForm()` updates similarly.

Display chip: `QUALITY_LABELS[entry.quality]` — add fallback for non-integer: show `"Type " + entry.quality`.

---

## Data Model

No schema changes. Both fields already store numbers; JSON floats are valid. Old integer entries remain valid. Wellness composite (`calcWellness()`) already averages floats — no change needed.

**Defensive handling in consumers:**
- Health Log and Reports display: use `QUALITY_LABELS[Math.round(q)]` or show numeric for half values
- Mood value label lookup: guard with `Number.isInteger(val)` before label array access

---

## CLAUDE.md Fix

Update bowel schema entry from:
```
type: "normal | soft | hard | liquid"
```
to:
```
quality: 1–7 integer (Bristol Stool Scale; 1=Hard … 7=Watery)
```
