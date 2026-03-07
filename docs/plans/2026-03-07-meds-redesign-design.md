# Medications Section Redesign — Design Doc

**Date:** 2026-03-07
**Status:** Approved

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

The redesigned section has four clearly separated zones, always rendered top-to-bottom:

```
1. TODAY'S DOSES       — action buttons for scheduled slots + reminders
2. LOG AS-NEEDED       — collapsed by default, expands for PRN entry
3. ACTIVE WINDOWS      — live dosing-window cards (PRN meds only)
4. MEDS LOGGED TODAY   — collapsible historical list with edit access
```

---

## Zone 1: Today's Doses

Displays one tappable button per scheduled slot (AM / Afternoon / PM) that has at least one med assigned, plus one button per daily-reminder med. Slots and reminders are merged — from the user's perspective both are "things to log today."

**Unlogged state:**
```
[ Log AM  → ]  [ Log Afternoon  → ]  [ Log PM  → ]
```

**Logged state (chip):**
```
[ AM ✓ 8:30am ]  [ Log PM  → ]
```

- Logged chip: green-tinted, tapping it opens the existing slot edit form (with the new Delete button from the slot-delete plan)
- Unlogged button: tapping once shows an inline confirm ("Confirm AM?") with a time input pre-filled to now; tapping Confirm calls `logSlot()`
- Reminder meds: same button style; tapping logs with current time (no slot-snapshot needed — reminders have no slot grouping)

---

## Zone 2: Log As-Needed

A single dashed "+ Log as-needed med" button. Tapping expands an inline panel:
- **Quick-pick chips** for the most recently-used PRN meds (last 7 days, up to 5)
- **"Other med…" dropdown** listing all active PRN meds not in the quick-pick list
- Tapping a chip or selecting + tapping Log opens the existing PRN log form (time, dose)
- Tapping the button again collapses the panel

---

## Zone 3: Active Dosing Windows

Shows a card for each PRN med that has been taken within the past 24 hours AND has `min_interval_hours` or `max_daily_doses` configured.

**Card contents:**
- Med name + dose taken
- Thin progress bar: fills left→right over the `min_interval_hours` window
- "Taken Xh Ym ago · next dose in Xh Ym" — or "safe to take again" once interval passes
- "X of Y today" count against `max_daily_doses`

**Card states:**
- **Within interval** (bar < 100%): normal opacity, bar colour = `--clr-ok` (green)
- **Interval elapsed, max not reached** (bar = 100%): faded (opacity 0.4), "safe to take again" in green
- **Max daily doses reached**: faded, "max doses reached today" in error red
- **>24h since last dose**: card removed from this section entirely (still in Logged Today)

**Live updates:** A `setInterval` running every 60 seconds calls `render()` so countdowns stay current.

---

## Zone 4: Meds Logged Today

A tappable headline: **"N Meds Logged Today"** with a chevron (▾/▴).

- Collapsed by default
- Mini-summary always visible even when collapsed: e.g. `AM ✓ · PM – · 3 PRN`
- Expanded list: every med logged today, grouped by time (12h format), sorted time ASC then name ASC within each group
- Each entry shows: name · dose · type badge (AM / PM / PRN / REM) · [Edit] button
- [Edit] on a slot entry opens the slot edit form; [Edit] on a PRN entry opens the PRN edit form

---

## Collapsible Section (bug fix)

Restore the section-level collapse toggle. The `tracker-section--collapsed` class and `App.toggleSection()` mechanism are correct — the bug is that the medications section's header click handler was lost during a previous refactor. Fix: ensure `wireEvents()` attaches the section header toggle to `App.toggleSection('section-medications')`.

---

## Schema Notes

All required data already exists in the schema:

| Data needed | Where it lives |
|---|---|
| Slot assignments | `med.slots[]` |
| Min interval | `med.min_interval_hours` (already in meds-manage.js) |
| Max daily doses | `med.max_daily_doses` (already in meds-manage.js) |
| PRN dose timestamps | `day.prn_doses[].iso_timestamp` |
| Slot log times | `day.med_slots[slot].time` |

No schema changes needed.

---

## Files Changed

| File | Change |
|---|---|
| `js/medications.js` | Full rewrite of render functions for all 4 zones; new `deleteSlotLog()`-compatible; add 60s interval for window countdown |
| `css/styles.css` | New component styles (slot chips, dosing window cards, PRN panel, logged list) |
| `js/config.js` | Version bump |

---

## Execution Order Dependency

This plan must execute **after** both:
1. `2026-03-07-slot-med-snapshot.md` (adds `meds` snapshot to slot records)
2. `2026-03-07-slot-delete.md` (adds Delete button to slot edit form)

Those plans modify `js/medications.js` functions (`logSlot`, `openSlotEdit`, `saveSlotEdit`, `renderSlotEditForm`) that this redesign also rewrites. Executing after ensures no merge conflicts and that the Delete button is available in the edit form this redesign opens.

---

## Out of Scope

- Bulk-edit for slot groups (deferred — slot delete + re-log handles the use case)
- Any new medication settings fields (all required data already in schema)
