# Streaks, Report Default Period & Digestion Avg — Design

**Date:** 2026-03-02

---

## Feature 1: Gratitude & Daily Notes streaks

### Goal
Show a streak badge in the Gratitudes and Daily Notes section headers on the Today tab, using the same visual style as habit streaks.

### Data rules
- **Gratitudes** — a day "counts" if `day.gratitudes` has ≥1 non-empty string after trimming
- **Notes** — a day "counts" if `day.note` is a non-empty string after trimming
- Today is always included in the streak count even if not yet filled (streak does not reset mid-day)
- Walk backwards from today; stop at the first day that doesn't count
- Safety loop cap: 3,650 iterations (10 years) to avoid infinite loops in degenerate data

### Display format
Same `habit-streak` CSS class as habits:

| Streak | Badge |
|--------|-------|
| 0 | (nothing) |
| 1 | muted `1` badge (`habit-streak--one`) |
| 2–364 | `🔥 N` |
| 365+ | `🔥 Xy` if exactly X years, else `🔥 Xy Zd` (e.g. `🔥 1y 35d`) |

### Implementation locations
- `calcGratitudeStreak()` added to `js/gratitudes.js`
- `calcNotesStreak()` added to `js/mood.js`
- Both copy the `shiftDate(dateStr, days)` helper from `habits.js` (3 lines, uses noon to avoid DST edge cases)
- Streak badge rendered in the section header next to the "Gratitudes" and "Daily Notes" titles

### Helper: `formatStreakBadge(streak)`
Shared logic (inlined in each file):
```js
function formatStreakLabel(n) {
  if (n < 365) return String(n);
  const years = Math.floor(n / 365);
  const days  = n % 365;
  return days === 0 ? `${years}y` : `${years}y ${days}d`;
}
```

---

## Feature 2: Configurable default report period

### Goal
- Change the hardcoded default from `'30d'` to `'7d'`
- Allow users to set their preferred default in Settings → Display card
- The preference persists in Google Drive with the rest of the settings data

### Data schema addition
`settings.default_report_period` — one of `'7d' | '30d' | '90d' | 'all'`; absent = `'7d'`

### Reports init change (`js/reports.js`)
```js
// Before:
let period = '30d';

// After:
let period = Data.getSettings?.()?.default_report_period ?? '7d';
```

`Reports.init()` (called when the tab is first opened) reads the setting to initialise `period`.

### Settings Display card addition (`js/settings.js`)
Add a new `stg-pref-row` inside `buildDisplayCard()`, after the temperature row:

```
Default report period   [7d] [30d] [90d] [All]
```

Uses the existing `stg-toggle-group` / `stg-toggle-btn` pattern. On click: saves `settings.default_report_period`, calls `scheduleSave()`. Does **not** live-update the Reports tab (user can switch tabs to see the effect).

---

## Feature 3: Digestion average — no change

The existing "Average per day" stat (`totalMovements / daysWithMovements`) is kept exactly as-is. No code changes for this item.

---

## Scope summary

| Item | Files | Est. lines |
|------|-------|-----------|
| Gratitude streak | `js/gratitudes.js` | ~25 |
| Notes streak | `js/mood.js` | ~25 |
| Reports default (init) | `js/reports.js` | ~3 |
| Reports default (settings) | `js/settings.js` | ~15 |
| Version bump | `js/config.js` | 1 |
