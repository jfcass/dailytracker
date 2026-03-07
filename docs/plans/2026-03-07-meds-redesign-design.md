# Medications Section Redesign — Design Doc

**Date:** 2026-03-07
**Status:** Approved (iterated via prototype)

---

## Problem

The medications section of the Today tab has grown organically and is now inconsistent and cluttered:
- Slot buttons, logged rows, edit forms, PRN section, and reminders all have different visual treatments
- No clear information hierarchy — "things to do" and "things done" compete for attention
- The section is no longer collapsible (JS regression)
- The PRN/as-needed meds are always expanded even when not needed
- Dosing-window data (min interval, max daily doses) exists in the schema but is not surfaced

---

## New Information Hierarchy

Four clearly separated zones, always rendered top-to-bottom:

```
1. TODAY'S DOSES       — 2-col grid of buttons for scheduled slots + reminder meds
2. LOG AS-NEEDED       — dashed trigger button, expands inline for PRN entry
3. ACTIVE WINDOWS      — live dosing-window cards for recently-taken PRN meds
4. MEDS LOGGED TODAY   — collapsible historical list with per-entry edit access
```

---

## Zone 1: Today's Doses

**Layout:** 2-column grid. Each unlogged slot or reminder med gets one half-width button showing:
- Optional emoji icon (from `med.emoji`, falls back to 💊)
- Label (slot name like "AM Meds", or the reminder med name)
- Subtitle: med count for slots ("4 meds"), dose hint for reminders ("2 sprays")

**Slots and reminders are merged** — both are "things to log today." No visual distinction needed.

**Log flow (single tap, no double-confirm):**
1. Tap button → it transforms into a full-width (span 2 columns) inline picker row:
   `[icon]  [Name]  [time input pre-filled to now]  [OK]  [✕]`
2. User adjusts time if needed, taps OK → item disappears from grid
3. ✕ cancels without logging

**Logged state:** button is removed from the grid entirely. No chips left behind.

**All-done state:** when all items are logged, grid shows a single full-width "✓ All doses logged for today" banner.

---

## Zone 2: Log As-Needed

A single dashed "+ Log as-needed med" button. Tapping expands an inline panel (below the button):
- **Quick-pick chips** — the most recently-used PRN meds (last 7 days, up to 5), shown as rounded chips
- **"Other med…" dropdown** + **Log** button for any active PRN med not in quick-pick list
- Tapping the trigger again (or after logging) collapses the panel

---

## Zone 3: Active Dosing Windows

Shows a card for each PRN med taken within the past 24 hours that has `min_interval_hours` or `max_daily_doses` configured.

**Card layout:**
```
[Med name] [dose]                   [X of Y today]
[████████░░░░░░░░░░░░░░] ← progress bar
Taken 2h ago · next dose in 6h 00m
```

**Progress bar:** fills over `min_interval_hours`. Color = `--clr-ok` (green).

**Card states:**
| Condition | Visual | Text |
|---|---|---|
| Within interval | Normal opacity | "next dose in Xh Ym" |
| Interval elapsed, max not reached | Faded (opacity 0.4), bar full green | "safe to take again" |
| Max daily doses reached | Faded, bar full red | "max doses reached today" |
| > 24h since dose | Hidden (removed from section) | — |

**Live updates:** render is called every 30s (existing `tickTimer` mechanism), so countdowns stay current.

---

## Zone 4: Meds Logged Today

**Header (always visible):** `N Meds Logged Today  ▾`

**Collapsed by default.** All edit access lives here — this replaces tapping a logged chip (which no longer exists).

**Expanded list:** every med logged today, grouped by time (rounded to nearest minute, 12h format), sorted time ASC then name ASC within group.

**Each entry:**
```
[Med name]  [dose]  [TYPE badge]  [Edit]
```
- TYPE badge: AM / AFT / PM (green) · PRN (amber) · REM (blue)
- [Edit] on a slot entry → opens existing slot edit form (with Delete button from slot-delete plan)
- [Edit] on a PRN entry → opens existing PRN edit form

---

## Collapsible Section Bug Fix

The `tracker-section--collapsed` class and `App.toggleSection()` mechanism are intact in app.js. The bug is that the medications section header's click handler was lost during a previous refactor of `wireEvents()`. Fix: ensure the header element inside `#section-medications` has a click handler calling `App.toggleSection('section-medications')`.

---

## Emoji Field on Medications

Add optional `emoji` text field to the med edit form in meds-manage.js. Saved as `med.emoji` (string, e.g. `"💊"`). Falls back to `"💊"` if blank. Mobile keyboard emoji picker works natively in any text input — no special component needed.

---

## Schema Notes

All required data already exists:

| Data needed | Where it lives |
|---|---|
| Slot assignments | `med.slots[]` |
| Min interval | `med.min_interval_hours` |
| Max daily doses | `med.max_daily_doses` |
| PRN dose timestamps | `day.prn_doses[].iso_timestamp` |
| Slot log times | `day.med_slots[slot].time` |
| Med emoji | `med.emoji` ← NEW optional field |

---

## Files Changed

| File | Change |
|---|---|
| `js/medications.js` | Rewrite render(), all render sub-functions, wireEvents() for 4-zone layout; add 2-col grid + inline time picker; add dosing windows renderer |
| `js/meds-manage.js` | Add emoji field to edit form + saveMed() |
| `css/styles.css` | New component styles (2-col grid, time picker, dosing window cards, PRN panel, logged list) |
| `js/config.js` | Version bump |

---

## Execution Order Dependency

Execute **after** both:
1. `2026-03-07-slot-med-snapshot.md` — adds `meds` snapshot; this redesign's Zone 4 edit buttons rely on correct snapshot data
2. `2026-03-07-slot-delete.md` — adds Delete button to slot edit form; this redesign opens that form from Zone 4

---

## Out of Scope

- Bulk-edit for slot groups (deferred)
- Any new medication settings fields beyond `med.emoji`
