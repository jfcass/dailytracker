# Design: Daily Gratitudes + Health Log Tab

**Date:** 2026-02-26
**Status:** Approved

---

## Overview

Two features shipping together:

1. **Daily Gratitudes** — a new daily tracking section for logging gratitude entries as a dynamic bullet list
2. **Health Log tab** — a first-class navigation destination for viewing and managing ongoing health issues, with symptom history and resolution management; Settings moves to a top-nav gear icon

---

## Feature 1: Daily Gratitudes

### Placement
New collapsible section on the main Today view, positioned **above Daily Note**.

Final section order: Habits → Mood & Energy → Digestion → Health → Moderation → **Gratitudes** → Daily Note

### UX
- Renders as a dynamic bullet list
- Starts with one empty input field
- As soon as the last bullet has any text, a new empty bullet auto-appends
- Empty trailing bullets are stripped on save
- Auto-saves on change (consistent with other sections)

### Data Schema
```json
"days": {
  "YYYY-MM-DD": {
    "gratitudes": ["Grateful for X", "Grateful for Y"]
  }
}
```
Array of strings. Empty array = nothing logged. Default added to `data.js` schema defaults.

### Reporting
- Streak counter: consecutive days with ≥ 1 gratitude logged
- Shown in Reports section alongside other streaks

### Files Affected
- `index.html` — new `section-gratitudes` block
- `js/gratitudes.js` — new module (init, setDate, render, auto-grow logic)
- `js/app.js` — init and setDate wired in
- `js/data.js` — `gratitudes: []` added to day defaults
- `css/styles.css` — gratitude section styles
- `js/reports.js` — gratitude streak card

---

## Feature 2: Health Log Tab + Navigation Restructure

### Navigation Changes

**Before:** Bottom nav — Today | Library | Settings
**After:** Bottom nav — Today | Health Log | Library
Settings ⚙️ moves to the **top-right corner of the header** (icon only, no label)

### Health Log — List View

- Default view when entering the tab
- Two groups: **Active** (unresolved) then **Resolved**
- Each row shows:
  - Coloured category badge
  - Issue title
  - Date range (start → end or "ongoing")
  - Symptom count (number of daily log entries linked to this issue)
- Tap a row → Detail View

### Health Log — Detail View

Slides in (same panel pattern as books library). Contains:

**Header**
- Issue title (editable inline)
- Category badge
- Start date / end date
- Status: Active or Resolved

**Symptom History**
- Chronological list of every `days[date].symptoms[]` entry where `issue_id` matches this issue
- Each entry: date, time, severity dot (colour-coded 1–5), description
- Most recent first

**Actions**
- **Edit** — opens edit form for title, category, start date, notes
- **Mark Resolved** — date picker defaulting to today; user can select any past date
- **Reopen** — shown instead of Mark Resolved when issue is already resolved; clears end_date and sets resolved: false
- **Delete** — with confirmation prompt

### Files Affected
- `index.html` — new `section-health-log` tab content; Settings tab removed from bottom nav; gear icon added to header
- `js/health-log.js` — new module; list view, detail view, edit, resolve, reopen, delete
- `js/app.js` — switchTab wired for health-log; Settings launch from gear icon
- `css/styles.css` — health log list and detail styles; gear button style

---

## Future Ideas (not in scope)
- AI summarisation of gratitude text (opt-in, third-party API, clearly disclosed)
- Gratitude reporting: surface past entries for reflection
- Health Log: symptom severity trend chart per issue
