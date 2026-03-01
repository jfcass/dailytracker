# PRN (As-Needed) Medication Tracker — Design

**Date:** 2026-02-28
**Status:** Approved

---

## Overview

A purpose-built tracker for as-needed medications that shows cooldown status and daily dose counts. Designed around the question "is it safe to take this again?" rather than a daily checklist.

---

## Approach

Reuse the existing `medications` dict schema skeleton but rebuild the daily log model and Today-tab UI from scratch. The existing `medications.js` daily log (one record per med per day) is incompatible with as-needed use — multiple doses per day need full timestamps for cross-midnight cooldown math.

---

## Data Schema

### Medication definition — extends existing `medications` dict

```json
"<uuid>": {
  "id": "<uuid>",
  "name": "Ibuprofen",
  "doses": ["200mg", "400mg", "600mg"],
  "min_interval_hours": 8,
  "max_daily_doses": 3,
  "as_needed": true,
  "active": true,
  "notes": ""
}
```

Only medications with `as_needed: true` appear in this feature.

### PRN dose log — new field on each day object

Replaces `medications_taken` for as-needed meds. An array of timestamped dose events (multiple per day supported):

```json
"prn_doses": [
  {
    "id": "<uuid>",
    "medication_id": "<uuid>",
    "iso_timestamp": "2026-02-28T14:30:00",
    "dose": "400mg",
    "notes": ""
  }
]
```

`iso_timestamp` (full ISO, not just HH:MM) enables cooldown math that works across midnight. Cooldown lookup scans today's + yesterday's `prn_doses` arrays for the most recent dose of each med.

---

## Today Tab — "As-Needed Meds" Section

Placed below the Symptoms section. Only appears/populates when at least one dose has been taken in the last 24 hours — otherwise shows only a "Log dose" button.

### Default (no recent doses)

```
┌─ As-Needed Meds ──────────────────────────┐
│                                            │
│   [ + Log dose ]                           │
│                                            │
└────────────────────────────────────────────┘
```

### With active dose cards

```
┌─ As-Needed Meds ──────────────────────────────────┐
│                                                    │
│  Ibuprofen 400mg · 2:15pm   ⏱ 3h 20m · 2 of 3 ✕  │  ← amber bg
│  Ibuprofen 400mg · 8:00am              · 1 of 3 ✕  │  ← neutral
│                                                    │
│   [ + Log dose ]                                   │
└────────────────────────────────────────────────────┘
```

**Card states:**
- **Cooling down** — amber/muted background, countdown timer `⏱ Xh Ym` on right
- **Ready / expired cooldown** — neutral background, no timer shown
- Both states show dose count against daily max (`2 of 3`) when `max_daily_doses` is set

Cards auto-disappear 24 hours after the dose `iso_timestamp`.
The ✕ button deletes that dose entry.

### Log dose inline form

Tapping "+ Log dose" expands inline (no modal):

```
  Med:   [ Ibuprofen ▾ ]                   ← dropdown of active as-needed meds
  Dose:  [ 200mg ] [ 400mg ] [ 600mg ]     ← chips from that med's doses[]
  Note:  [________________________]        ← optional
              [ Log ]  [ Cancel ]
```

**Soft warnings (inform, never block):**
- Cooldown not yet elapsed: "Next dose recommended after [time]"
- Daily max reached: "Max daily doses reached ([n] of [n])"

---

## Settings — Med Management

New "As-Needed Medications" section in Settings. Lists configured meds and provides add/edit/archive.

### List view

```
  Ibuprofen      8h · max 3/day · 200mg, 400mg, 600mg    [Edit] [Archive]
  Acetaminophen  6h · max 4/day · 325mg, 500mg, 1000mg   [Edit] [Archive]

  [ + Add medication ]
```

### Add / Edit form fields

| Field | Input type | Notes |
|---|---|---|
| Name | Text | Required |
| Min interval | Number + "hours" label | e.g. `8` |
| Max in 24 hours | Number + "doses" label | e.g. `3` |
| Available doses | Tag chip input | Type dose, Enter/comma to add; chips deletable |

**Archive** deactivates the med (hides from Log dose dropdown) without deleting dose history.

---

## Countdown Logic

```
lastDose   = most recent prn_doses entry for this med across today + yesterday
readyAt    = lastDose.iso_timestamp + min_interval_hours
remaining  = readyAt - now

if remaining > 0  → cooling down, show "⏱ Xh Ym"
if remaining ≤ 0  → ready, no timer shown

dosesInLast24h = count of prn_doses for this med where iso_timestamp > now - 24h
```

A `setInterval` (every 30s) re-renders the section to keep countdowns live.

---

## Files Affected

| File | Change |
|---|---|
| `js/data.js` | Add `prn_doses: []` to day schema defaults; add `min_interval_hours`, `max_daily_doses`, `doses[]` to medication defaults |
| `js/medications.js` | Replace with PRN-focused implementation (new module, same filename) |
| `index.html` | Add `#section-prn-meds` shell in Today tab (below symptoms); wire `Medications.init()` in app init |
| `js/app.js` | Call `Medications.init()` and pass date updates |
| `js/settings.js` | Add "As-Needed Medications" management section |
| `css/styles.css` | Card styles, amber cooling-down state, dose chip input styles |
