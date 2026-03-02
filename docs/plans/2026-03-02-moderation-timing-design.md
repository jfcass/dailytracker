# Moderation Timing — Design Doc
**Date:** 2026-03-02
**Status:** Approved

## Problem

The moderation section tracks substance quantity per day (e.g. 2 cups of coffee, 3 drinks) but has no timing information. Caffeine timing and alcohol timing relative to sleep are important future correlation data points. The system needs to capture *when* substances were consumed, not just how much.

## Key Usability Insight

Logging happens at the **pour**, not at the finish. Defaulting the time field to the current time when opening a new entry means no extra effort for real-time logging, while still allowing manual time entry for end-of-day summaries. This design must work gracefully for both logging styles as habits may shift over time.

## Decision

**Multi-entry per substance per day**, where each entry represents one pour/session and carries its own timestamp.

Rejected alternatives:
- *Single entry + time field*: loses first-pour data when you go back to log a second session; the logged time would only reflect the last update, not the last pour.
- *Single entry + two time fields (start/end)*: adds schema complexity for marginal correlation value.

---

## Data Schema

### Before
```json
"moderation": {
  "coffee":  { "quantity": 2, "unit": "cups", "note": "" },
  "alcohol": null
}
```

### After
```json
"moderation": {
  "coffee": [
    { "id": "<uuid>", "quantity": 2, "unit": "cups", "time": "07:15", "note": "" },
    { "id": "<uuid>", "quantity": 1, "unit": "cup",  "time": "13:00", "note": "latte from shop" }
  ],
  "alcohol": null
}
```

### Rules
- `null` = nothing logged today (same as before)
- Empty array never persists — if all entries are removed, value reverts to `null`
- `time` is `"HH:MM"` (24h) or `null` if user skips it
- Each entry has a `crypto.randomUUID()` `id` for edit/delete targeting

### Migration
Runs once on load in `migrateData()`. Converts old flat object → single-element array with `time: null`. Arrays and nulls are skipped (idempotent).

```
null                     → null
{ quantity, unit, note } → [{ id: uuid, quantity, unit, time: null, note }]
```

---

## UI Design

### Display row — no entries
```
☕ Coffee                              [+ Log]
```

### Display row — one entry
```
☕ Coffee    2 cups · 7:15am    [✎]   [+ Add]
```

### Display row — multiple entries
```
☕ Coffee    3 cups total              [+ Add]
            · 2 cups · 7:15am         [✎]  [×]
            · 1 cup  · 1:00pm         [✎]  [×]
              latte from shop
```

Notes render inline beneath their own entry. Total quantity is summed across all entries.

### Add / Edit form
```
☕ Coffee
─────────────────────────────
Time   [ 13:00 ]   ← defaults to now on Add; pre-fills existing time on Edit
       [−]  [ 1 ]  [+]   [ cup       ]
       Note (optional)
─────────────────────────────
[Remove]          [Cancel] [Save]
```

- `<input type="time">` defaults to current HH:MM on new entries
- Quantity defaults to `1` for new entries
- `Remove` button only appears when editing an existing entry
- Removing the last entry sets the substance back to `null`

---

## Code Architecture

### `js/data.js`
Add `migrateModeration(d)` function; call from `migrateData()`.

```js
function migrateModeration(d) {
  Object.values(d.days ?? {}).forEach(day => {
    const mod = day.moderation ?? {};
    Object.keys(mod).forEach(subId => {
      const entry = mod[subId];
      if (!entry || Array.isArray(entry)) return; // null or already migrated
      mod[subId] = [{
        id:       crypto.randomUUID(),
        quantity: entry.quantity,
        unit:     entry.unit,
        time:     null,
        note:     entry.note ?? '',
      }];
    });
  });
  return d;
}
```

### `js/moderation.js`
Primary logic changes:

- Module state: add `fTime` (HH:MM string or `''`) alongside `fQty`, `fUnit`, `fNote`
- `editingId` becomes `{ subId, entryId }` — `entryId` is `null` when adding a new entry
- `buildDisplay()` — sum entries for total quantity; render per-entry rows with ✎ and × buttons
- `buildForm()` — add `<input type="time">` defaulting to current time on new, pre-filled on edit
- `saveEntry()` — push new entry into array, or find-and-update by `id`
- `clearEntry(sub, entryId)` — splice by `id`; if array becomes empty, set to `null`

### `js/reports.js`
Read-path update only. Add two helpers; swap old field reads for them:

- `modTotal(entries)` — sums `quantity` across array, returns `0` if null/empty
- `modLastTime(entries)` — returns the latest `time` value across entries, or `null`

No structural changes to the reports UI.

### `CLAUDE.md`
Update moderation schema block to show the new array format.

### `js/config.js`
Bump `APP_VERSION`.

---

## Correlation Usage (future)
- **Last consumed time**: `modLastTime(entries)` — the latest `time` across all entries for the day
- **Total quantity**: `modTotal(entries)` — sum across all entries
- If all entry `time` values are `null`, the day contributes quantity data but no timing data to correlation
