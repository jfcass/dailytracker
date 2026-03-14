# Habit Frequency & Reminders Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-habit frequency settings (daily / N×weekly / N×monthly / N×quarterly / N×custom) and an optional reminder flag that feeds into the hub ticker, rotating through undone habit reminders when no med conditions are pending.

**Architecture:** Habits stay as `settings.habits` (string array, drives order). A new `settings.habit_configs` dict (`{ [name]: HabitConfig }`) holds optional per-habit metadata. Day data (`day.habits[name] = bool`) is unchanged — each day's bool records whether the habit was done *that specific day*. Period progress is computed on-the-fly by counting completions across the relevant date range. The hub ticker's `getNextPendingItem()` is extended to return pending habit reminders (with a rotating index), which the banner renders as a mini-ticker cycling through them.

**Tech Stack:** Vanilla JS (no framework), CSS custom properties. All changes in `js/data.js`, `js/habits.js`, `js/settings.js`, `js/hub.js`, `css/styles.css`.

---

## Habit Config Schema

```js
// settings.habit_configs = {
//   "Gym": {
//     frequency:        "daily" | "weekly" | "monthly" | "quarterly" | "custom",
//     freq_count:       3,          // goal: N times per period
//     freq_period_days: 7,          // only for "custom": rolling window in days
//     reminder:         true        // include in hub ticker when due
//   }
// }
//
// Defaults (when key absent): { frequency: "daily", freq_count: 1, freq_period_days: 7, reminder: false }
```

---

## Task 1: Schema — add `habit_configs` to data.js

**Files:**
- Modify: `js/data.js`

**Step 1: Add `habit_configs: {}` to SCHEMA_DEFAULTS in data.js**

In `js/data.js`, find `SCHEMA_DEFAULTS.settings` (around line 13). Add a new key:

```js
// BEFORE (inside settings: { ... }):
today_layout:    'accordion',   // 'accordion' | 'hub'

// AFTER — add on the next line:
today_layout:    'accordion',   // 'accordion' | 'hub'
habit_configs:   {},            // { [name]: { frequency, freq_count, freq_period_days, reminder } }
```

**Step 2: Add migration in migrateData()**

Find `migrateData()` in `js/data.js`. Add at the end of the function body (before the return or closing brace):

```js
// Migrate: ensure habit_configs exists (all habits default to daily/no-reminder)
if (!d.settings.habit_configs) {
  d.settings.habit_configs = {};
}
```

**Step 3: Verify in browser console after pushing**
```
Data.getSettings().habit_configs  // should return {}
```

**Step 4: Commit**
```bash
git add js/data.js
git commit -m "feat: add habit_configs schema field for frequency + reminder settings"
```

---

## Task 2: Period helpers — add to habits.js

**Files:**
- Modify: `js/habits.js` (in the `// ── Helpers ───` section at the bottom)

**Step 1: Add `getHabitConfig(name)` helper**

Insert after the `escHtml()` helper in habits.js (around line 365):

```js
/** Returns the HabitConfig for a habit, falling back to daily defaults. */
function getHabitConfig(name) {
  const configs = Data.getSettings().habit_configs ?? {};
  return {
    frequency:        'daily',
    freq_count:       1,
    freq_period_days: 7,
    reminder:         false,
    ...(configs[name] ?? {}),
  };
}
```

**Step 2: Add `getPeriodBounds(cfg, refDate)` helper**

Insert after `getHabitConfig`:

```js
/**
 * Returns { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD', shortLabel: 'wk'|'mo'|'qtr'|'Xd' }
 * for the period that contains refDate (or today if not supplied).
 * For daily: start === end === refDate.
 */
function getPeriodBounds(cfg, refDate) {
  const ref = refDate ?? Data.today();
  const d   = new Date(ref + 'T12:00:00');

  if (cfg.frequency === 'daily') {
    return { start: ref, end: ref, shortLabel: 'today' };
  }

  if (cfg.frequency === 'weekly') {
    // ISO week: Monday start
    const dow  = d.getDay(); // 0=Sun
    const diff = (dow === 0 ? -6 : 1 - dow);
    const mon  = new Date(d); mon.setDate(d.getDate() + diff);
    const sun  = new Date(mon); sun.setDate(mon.getDate() + 6);
    return {
      start:      mon.toISOString().slice(0, 10),
      end:        sun.toISOString().slice(0, 10),
      shortLabel: 'wk',
    };
  }

  if (cfg.frequency === 'monthly') {
    const y = d.getFullYear(), m = d.getMonth();
    const last = new Date(y, m + 1, 0);
    return {
      start:      `${y}-${String(m + 1).padStart(2, '0')}-01`,
      end:        last.toISOString().slice(0, 10),
      shortLabel: 'mo',
    };
  }

  if (cfg.frequency === 'quarterly') {
    const y  = d.getFullYear();
    const qm = Math.floor(d.getMonth() / 3) * 3;     // 0, 3, 6, or 9
    const last = new Date(y, qm + 3, 0);
    return {
      start:      `${y}-${String(qm + 1).padStart(2, '0')}-01`,
      end:        last.toISOString().slice(0, 10),
      shortLabel: 'qtr',
    };
  }

  // custom: rolling window of freq_period_days
  const n   = cfg.freq_period_days ?? 7;
  const s   = new Date(d); s.setDate(d.getDate() - (n - 1));
  return {
    start:      s.toISOString().slice(0, 10),
    end:        ref,
    shortLabel: `${n}d`,
  };
}
```

**Step 3: Add `countPeriodCompletions(name, start, end)` helper**

```js
/** Count days in [start, end] where the habit was done. */
function countPeriodCompletions(name, start, end) {
  const allDays = Data.getData().days;
  return Object.entries(allDays)
    .filter(([date, day]) =>
      date >= start && date <= end && day?.habits?.[name] === true
    ).length;
}
```

**Step 4: Add `isHabitDue(name)` helper**

```js
/** Returns true if the habit's period goal is not yet met (habit is still "due"). */
function isHabitDue(name) {
  const cfg = getHabitConfig(name);
  const { start, end } = getPeriodBounds(cfg, Data.today());
  if (cfg.frequency === 'daily') {
    return Data.getDay(Data.today())?.habits?.[name] !== true;
  }
  const done = countPeriodCompletions(name, start, end);
  return done < cfg.freq_count;
}
```

**Step 5: Commit**
```bash
git add js/habits.js
git commit -m "feat: add period-frequency helpers to habits.js (getHabitConfig, getPeriodBounds, etc.)"
```

---

## Task 3: Update habit row rendering in habits.js

**Files:**
- Modify: `js/habits.js`

**Step 1: Update `calcStreak(name)` to return 0 for non-daily habits**

The existing `calcStreak` only makes sense for daily habits. For non-daily, we show period progress instead. Modify the first line of `calcStreak`:

```js
function calcStreak(name) {
  // Non-daily habits use period progress badge instead of streak
  const cfg = getHabitConfig(name);
  if (cfg.frequency !== 'daily') return 0;

  // ... existing streak code unchanged ...
```

**Step 2: Add `buildPeriodBadge(name)` helper**

Insert just before `makeRow()`:

```js
/**
 * Returns HTML for the badge shown after a habit name.
 * - Daily habits: streak badge (existing behaviour)
 * - Period habits: "X/N wk" progress badge
 */
function buildBadge(name) {
  const cfg = getHabitConfig(name);

  if (cfg.frequency === 'daily') {
    const streak = calcStreak(name);
    if (streak >= 2) return `<span class="habit-streak">🔥 ${streak}</span>`;
    if (streak === 1) return `<span class="habit-streak habit-streak--one">1</span>`;
    return '';
  }

  // Period habit
  const { start, end, shortLabel } = getPeriodBounds(cfg, currentDate);
  const done   = countPeriodCompletions(name, start, end);
  const goal   = cfg.freq_count;
  const metCls = done >= goal ? ' habit-period-badge--met' : '';
  return `<span class="habit-period-badge${metCls}">${done}/${goal} ${shortLabel}</span>`;
}
```

**Step 3: Replace inline badge generation in `makeRow()`, `makeReadingRow()`, `makeGymRow()`, `makeMeditationRow()`**

In every row builder that currently does:
```js
const streak = calcStreak(name);
let badge    = '';
if      (streak >= 2) badge = `<span class="habit-streak">🔥 ${streak}</span>`;
else if (streak === 1) badge = `<span class="habit-streak habit-streak--one">1</span>`;
```

Replace with:
```js
const badge = buildBadge(name);
```

There are four places to update (makeRow, makeReadingRow, makeGymRow, makeMeditationRow).

**Step 4: Update progress bar in `render()`**

The current progress bar counts daily habits only. For period habits, a habit "counts" toward progress when its period goal is met. Update the `done` / `total` logic at the top of `render()`:

```js
function render() {
  const habits  = Data.getSettings().habits ?? [];
  const day     = Data.getDay(currentDate);
  const isToday = currentDate === Data.today();

  // Progress: each habit contributes 1 to "done" when its goal is met for the period
  const total = habits.length;
  const done  = habits.filter(name => {
    const cfg = getHabitConfig(name);
    if (cfg.frequency === 'daily') return day.habits[name] === true;
    const { start, end } = getPeriodBounds(cfg, currentDate);
    return countPeriodCompletions(name, start, end) >= cfg.freq_count;
  }).length;

  // ... rest of render() unchanged ...
```

**Step 5: Commit**
```bash
git add js/habits.js
git commit -m "feat: show period progress badge for non-daily habits; update progress bar"
```

---

## Task 4: CSS — period badge styles

**Files:**
- Modify: `css/styles.css`

**Step 1: Add `.habit-period-badge` CSS**

Find where `.habit-streak` is defined in `css/styles.css` and add after it:

```css
/* ── Period habit progress badge ──────────────────────────────────── */
.habit-period-badge {
  margin-left: auto;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--clr-text-2);
  background: var(--clr-surface-2);
  border: 1px solid var(--clr-border);
  border-radius: 10px;
  padding: 1px 7px;
  white-space: nowrap;
  flex-shrink: 0;
}
.habit-period-badge--met {
  color: var(--clr-accent);
  border-color: var(--clr-accent);
  background: var(--clr-accent-dim);
}
```

**Step 2: Commit**
```bash
git add css/styles.css
git commit -m "style: add habit-period-badge CSS for frequency progress display"
```

---

## Task 5: Settings UI — per-habit frequency + reminder editor

**Files:**
- Modify: `js/settings.js`

This task replaces the simple habit list rows with expandable rows that include a frequency editor.

**Step 1: Add module-level edit state**

At the top of `Settings` IIFE, find the existing `let expandedCards = new Set();` and add:

```js
let habitEditName = null;   // name of habit currently being edited (null = none expanded)
```

**Step 2: Add helper to save a habit config**

Add this function in the private section of settings.js:

```js
function saveHabitConfig(name, cfg) {
  const s = Data.getSettings();
  if (!s.habit_configs) s.habit_configs = {};
  s.habit_configs[name] = cfg;
  render(); scheduleSave(); Habits.render();
}
```

**Step 3: Replace the habit list item rendering in `buildHabitsCard()`**

Find the `habits.forEach((name, i) => {` loop in `buildHabitsCard()`. Replace the loop body with the following (preserving the up/down/delete buttons, and adding a configure expand button):

```js
habits.forEach((name, i) => {
  const cfg = (() => {
    const configs = Data.getSettings().habit_configs ?? {};
    return {
      frequency: 'daily', freq_count: 1, freq_period_days: 7, reminder: false,
      ...(configs[name] ?? {}),
    };
  })();

  const isEditing = habitEditName === name;

  const freqLabels = {
    daily: 'Daily',
    weekly:    `${cfg.freq_count}×/wk`,
    monthly:   `${cfg.freq_count}×/mo`,
    quarterly: `${cfg.freq_count}×/qtr`,
    custom:    `${cfg.freq_count}×/${cfg.freq_period_days}d`,
  };
  const freqLabel = freqLabels[cfg.frequency] ?? 'Daily';

  const row = document.createElement('div');
  row.className = 'stg-item-row stg-item-row--habit' + (isEditing ? ' stg-item-row--expanded' : '');

  // Bell icon (reminder toggle)
  const bellActive = cfg.reminder ? ' stg-bell--active' : '';

  row.innerHTML = `
    <div class="stg-habit-main-row">
      <span class="stg-item-name">${escHtml(name)}</span>
      <span class="stg-freq-chip">${freqLabel}</span>
      <div class="stg-row-actions">
        <button class="stg-icon-btn stg-bell-btn${bellActive}" data-op="bell" type="button"
                aria-label="${cfg.reminder ? 'Disable reminder' : 'Enable reminder'}"
                title="${cfg.reminder ? 'Reminder on' : 'Reminder off'}">🔔</button>
        <button class="stg-icon-btn stg-cfg-btn" data-op="cfg" type="button"
                aria-label="Configure frequency" title="Frequency">⚙</button>
        <button class="stg-icon-btn" data-op="up" type="button"
                ${i === 0 ? 'disabled' : ''} aria-label="Move up">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
            <polyline points="18 15 12 9 6 15"/>
          </svg>
        </button>
        <button class="stg-icon-btn" data-op="down" type="button"
                ${i === habits.length - 1 ? 'disabled' : ''} aria-label="Move down">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        <button class="stg-icon-btn stg-icon-btn--danger" data-op="del" type="button"
                aria-label="Remove ${escHtml(name)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
            <line x1="18" y1="6"  x2="6"  y2="18"/>
            <line x1="6"  y1="6"  x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
    ${isEditing ? buildHabitFreqForm(name, cfg) : ''}
  `;

  // Wiring
  row.querySelector('[data-op="up"]').addEventListener('click',  () => moveHabit(i, -1));
  row.querySelector('[data-op="down"]').addEventListener('click', () => moveHabit(i, 1));
  row.querySelector('[data-op="del"]').addEventListener('click',  () => removeHabit(i));

  row.querySelector('[data-op="bell"]').addEventListener('click', () => {
    saveHabitConfig(name, { ...cfg, reminder: !cfg.reminder });
  });

  row.querySelector('[data-op="cfg"]').addEventListener('click', () => {
    habitEditName = (habitEditName === name) ? null : name;
    render();
  });

  if (isEditing) wireHabitFreqForm(row, name, cfg);

  list.appendChild(row);
});
```

**Step 4: Add `buildHabitFreqForm(name, cfg)` helper**

Add this new function in the Settings module (below `buildHabitsCard`):

```js
function buildHabitFreqForm(name, cfg) {
  const showCount  = cfg.frequency !== 'daily';
  const showPeriod = cfg.frequency === 'custom';

  return `
    <div class="stg-habit-freq-form">
      <div class="stg-freq-row">
        <label class="stg-label" for="hf-freq-${escHtml(name)}">Frequency</label>
        <select class="stg-select" id="hf-freq-${escHtml(name)}" data-field="frequency">
          <option value="daily"     ${cfg.frequency === 'daily'     ? 'selected' : ''}>Daily</option>
          <option value="weekly"    ${cfg.frequency === 'weekly'    ? 'selected' : ''}>Weekly</option>
          <option value="monthly"   ${cfg.frequency === 'monthly'   ? 'selected' : ''}>Monthly</option>
          <option value="quarterly" ${cfg.frequency === 'quarterly' ? 'selected' : ''}>Quarterly</option>
          <option value="custom"    ${cfg.frequency === 'custom'    ? 'selected' : ''}>Custom</option>
        </select>
      </div>
      <div class="stg-freq-row${showCount ? '' : ' stg-freq-row--hidden'}" data-row="count">
        <label class="stg-label" for="hf-count-${escHtml(name)}">Times per period</label>
        <input class="stg-num-input" type="number" min="1" max="100"
               id="hf-count-${escHtml(name)}" data-field="freq_count"
               value="${cfg.freq_count}">
      </div>
      <div class="stg-freq-row${showPeriod ? '' : ' stg-freq-row--hidden'}" data-row="period">
        <label class="stg-label" for="hf-period-${escHtml(name)}">Period (days)</label>
        <input class="stg-num-input" type="number" min="2" max="365"
               id="hf-period-${escHtml(name)}" data-field="freq_period_days"
               value="${cfg.freq_period_days}">
      </div>
      <div class="stg-freq-actions">
        <button class="stg-add-btn" data-op="save-freq" type="button">Save</button>
        <button class="stg-cancel-btn" data-op="cancel-freq" type="button">Cancel</button>
      </div>
    </div>
  `;
}
```

**Step 5: Add `wireHabitFreqForm(row, name, cfg)` helper**

```js
function wireHabitFreqForm(row, name, cfg) {
  const freqSel   = row.querySelector('[data-field="frequency"]');
  const countRow  = row.querySelector('[data-row="count"]');
  const periodRow = row.querySelector('[data-row="period"]');

  freqSel.addEventListener('change', () => {
    const v = freqSel.value;
    countRow.classList.toggle('stg-freq-row--hidden',  v === 'daily');
    periodRow.classList.toggle('stg-freq-row--hidden', v !== 'custom');
  });

  row.querySelector('[data-op="save-freq"]').addEventListener('click', () => {
    const newCfg = {
      ...cfg,
      frequency:        freqSel.value,
      freq_count:       Math.max(1, parseInt(row.querySelector('[data-field="freq_count"]')?.value, 10) || 1),
      freq_period_days: Math.max(2, parseInt(row.querySelector('[data-field="freq_period_days"]')?.value, 10) || 7),
    };
    habitEditName = null;
    saveHabitConfig(name, newCfg);
  });

  row.querySelector('[data-op="cancel-freq"]').addEventListener('click', () => {
    habitEditName = null;
    render();
  });
}
```

**Step 6: Commit**
```bash
git add js/settings.js
git commit -m "feat: add per-habit frequency + reminder settings editor"
```

---

## Task 6: CSS — settings habit editor styles

**Files:**
- Modify: `css/styles.css`

**Step 1: Add CSS for habit editor UI**

Find `.stg-item-row` in styles.css and add below it:

```css
/* ── Habit frequency editor ───────────────────────────────────────── */
.stg-item-row--habit .stg-habit-main-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}
.stg-freq-chip {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--clr-text-2);
  background: var(--clr-surface-2);
  border: 1px solid var(--clr-border);
  border-radius: 10px;
  padding: 1px 6px;
  white-space: nowrap;
  flex-shrink: 0;
}
.stg-bell-btn {
  font-size: 0.9rem;
  opacity: 0.4;
}
.stg-bell--active {
  opacity: 1;
  color: var(--clr-accent);
}
.stg-habit-freq-form {
  padding: 10px 4px 4px;
  border-top: 1px solid var(--clr-border);
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.stg-freq-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.stg-freq-row--hidden {
  display: none;
}
.stg-label {
  font-size: 0.8rem;
  color: var(--clr-text-2);
  flex: 1;
}
.stg-select {
  background: var(--clr-surface-2);
  border: 1px solid var(--clr-border);
  border-radius: 6px;
  color: var(--clr-text);
  font-size: 0.85rem;
  padding: 4px 6px;
}
.stg-num-input {
  width: 64px;
  background: var(--clr-surface-2);
  border: 1px solid var(--clr-border);
  border-radius: 6px;
  color: var(--clr-text);
  font-size: 0.85rem;
  padding: 4px 6px;
  text-align: center;
}
.stg-freq-actions {
  display: flex;
  gap: 8px;
}
.stg-cancel-btn {
  background: var(--clr-surface-2);
  border: 1px solid var(--clr-border);
  border-radius: 8px;
  color: var(--clr-text-2);
  font-size: 0.8rem;
  padding: 5px 12px;
  cursor: pointer;
}
```

**Step 2: Commit**
```bash
git add css/styles.css
git commit -m "style: add habit frequency editor CSS in settings"
```

---

## Task 7: Hub ticker — habit reminder rotation

**Files:**
- Modify: `js/hub.js`

**Step 1: Add rotation state variable**

Near the top of the `Hub` IIFE (after the BUCKETS definition), add:

```js
let _habitReminderTimerId = null;   // setInterval for rotating habit reminders in ticker
```

**Step 2: Add `getPendingHabitReminders()` helper**

Add before `getNextPendingItem()`:

```js
/**
 * Returns array of habit names that:
 *   - have reminder: true in habit_configs
 *   - are still "due" today (daily: not done; period: goal not yet met)
 */
function getPendingHabitReminders() {
  const habits  = Data.getSettings().habits ?? [];
  const configs = Data.getSettings().habit_configs ?? {};
  const today   = Data.today();
  const dayData = Data.getDay(today);

  return habits.filter(name => {
    const cfg = { frequency: 'daily', freq_count: 1, freq_period_days: 7, reminder: false, ...(configs[name] ?? {}) };
    if (!cfg.reminder) return false;

    if (cfg.frequency === 'daily') {
      return dayData?.habits?.[name] !== true;
    }

    // Period habit: check if goal is still unmet
    // (Replicate getPeriodBounds logic inline to avoid cross-module dependency)
    const d   = new Date(today + 'T12:00:00');
    let start, end;

    if (cfg.frequency === 'weekly') {
      const dow = d.getDay();
      const diff = (dow === 0 ? -6 : 1 - dow);
      const mon = new Date(d); mon.setDate(d.getDate() + diff);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      start = mon.toISOString().slice(0, 10);
      end   = sun.toISOString().slice(0, 10);
    } else if (cfg.frequency === 'monthly') {
      const y = d.getFullYear(), m = d.getMonth();
      const last = new Date(y, m + 1, 0);
      start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      end   = last.toISOString().slice(0, 10);
    } else if (cfg.frequency === 'quarterly') {
      const y  = d.getFullYear();
      const qm = Math.floor(d.getMonth() / 3) * 3;
      const last = new Date(y, qm + 3, 0);
      start = `${y}-${String(qm + 1).padStart(2, '0')}-01`;
      end   = last.toISOString().slice(0, 10);
    } else {
      // custom
      const n = cfg.freq_period_days ?? 7;
      const s = new Date(d); s.setDate(d.getDate() - (n - 1));
      start = s.toISOString().slice(0, 10);
      end   = today;
    }

    const allDays = Data.getData().days;
    const done = Object.entries(allDays)
      .filter(([date, day]) => date >= start && date <= end && day?.habits?.[name] === true)
      .length;
    return done < cfg.freq_count;
  });
}
```

**Step 3: Update `getNextPendingItem()` to include habit reminders**

In `getNextPendingItem()`, replace the "Habits fallback — only after 6pm" block at the end:

```js
// OLD (remove this):
// Habits fallback — only after 6pm
if (now.getHours() >= 18) {
  const habits  = Data.getSettings().habits ?? [];
  const dayHabs = dayToday.habits ?? {};
  const undone  = habits.filter(h => !dayHabs[h]);
  if (undone.length > 0) {
    return {
      text: `${undone.length} habit${undone.length > 1 ? 's' : ''} left`,
      type: 'habits',
    };
  }
}
return null;
```

```js
// NEW (replace with):
// Habit reminders — at any time, when habit has reminder:true and is still due
const habitReminders = getPendingHabitReminders();
if (habitReminders.length > 0) {
  return { type: 'habit-reminders', habits: habitReminders };
}

return null;
```

**Step 4: Update banner rendering in `renderHome()` for `'habit-reminders'` type**

The banner section (around line 910) currently only handles `slot`, `reminder`, and `habits` types. Update the entire banner rendering block:

```js
// ── Reminder banner ────────────────────────────────────────
const container = document.getElementById('hub-container');

// Clear old banner + timer
const existingBanner = container.querySelector('.hub-reminder');
if (existingBanner) existingBanner.remove();
if (_habitReminderTimerId) { clearInterval(_habitReminderTimerId); _habitReminderTimerId = null; }

const pending = getNextPendingItem();
if (pending) {
  const banner = document.createElement('div');
  banner.className = 'hub-reminder';

  if (pending.type === 'habit-reminders') {
    // Rotating habit reminder ticker
    const habits = pending.habits;
    let idx = 0;

    const textEl = document.createElement('div');
    textEl.className = 'hub-reminder__text';

    function showHabit(i) {
      textEl.textContent = `Reminder: ${habits[i]}`;
    }
    showHabit(0);

    banner.innerHTML = `<div class="hub-reminder__dot"></div>`;
    banner.appendChild(textEl);

    if (habits.length > 1) {
      // Auto-rotate through habits every 4 seconds
      _habitReminderTimerId = setInterval(() => {
        idx = (idx + 1) % habits.length;
        showHabit(idx);
      }, 4000);
    }

    // Tap → open Routine bucket
    banner.addEventListener('click', () => openSection('section-habits'));

  } else {
    // Existing: med slot or reminder
    const isLoggable = pending.type === 'slot' || pending.type === 'reminder';
    banner.innerHTML = `
      <div class="hub-reminder__dot"></div>
      <div class="hub-reminder__text">${pending.text}</div>
      ${isLoggable ? `<button class="hub-reminder__check" aria-label="Mark done" type="button">✓</button>` : ''}`;

    banner.querySelector('.hub-reminder__text')?.addEventListener('click', () => {
      pending.type === 'habits' ? openSection('section-habits') : openSection('section-meds');
    });
    banner.querySelector('.hub-reminder__dot')?.addEventListener('click', () => {
      pending.type === 'habits' ? openSection('section-habits') : openSection('section-meds');
    });

    if (isLoggable) {
      banner.querySelector('.hub-reminder__check')?.addEventListener('click', e => {
        e.stopPropagation();
        if (pending.type === 'slot') Medications.logSlot(pending.slot);
        else if (pending.type === 'reminder') Medications.logReminder(pending.medId);
        renderHome();
      });
    }
  }

  container.insertBefore(banner, home);
}
```

**Step 5: Clear timer in `restoreChrome()` or wherever Hub cleans up**

Find the `restoreChrome()` function (or similar cleanup) in hub.js and add:

```js
if (_habitReminderTimerId) {
  clearInterval(_habitReminderTimerId);
  _habitReminderTimerId = null;
}
```

**Step 6: Commit**
```bash
git add js/hub.js
git commit -m "feat: add habit reminder rotation to hub ticker"
```

---

## Task 8: Streak for non-daily habits (optional enhancement)

If you want to show streak for weekly habits after the core is working:

**Files:**
- Modify: `js/habits.js`

**Add `calcPeriodStreak(name)` after `calcStreak()`:**

```js
/**
 * For non-daily habits: count consecutive completed periods going back from now.
 * A period is "complete" if countPeriodCompletions >= freq_count for that period.
 * Returns streak count in periods (weeks / months / etc.).
 * Cap at 52 iterations to avoid infinite loops.
 */
function calcPeriodStreak(name) {
  const cfg = getHabitConfig(name);
  if (cfg.frequency === 'daily') return calcStreak(name);

  const today = Data.today();
  let streak  = 0;

  // Step back one period at a time
  let refDate = today;
  for (let i = 0; i < 52; i++) {
    const { start, end } = getPeriodBounds(cfg, refDate);
    const done = countPeriodCompletions(name, start, end);

    // For the current (incomplete) period, skip rather than break the streak
    if (i === 0 && end >= today) {
      if (done >= cfg.freq_count) streak++;
      // even if not met yet, don't penalise — move to previous period
    } else {
      if (done >= cfg.freq_count) streak++;
      else break;
    }

    // Rewind: one day before the start of this period
    const prev = new Date(start + 'T12:00:00');
    prev.setDate(prev.getDate() - 1);
    refDate = prev.toISOString().slice(0, 10);
    if (refDate < '2020-01-01') break;  // safety
  }
  return streak;
}
```

**Update `buildBadge(name)` to use `calcPeriodStreak` for non-daily habits:**

```js
function buildBadge(name) {
  const cfg = getHabitConfig(name);

  if (cfg.frequency === 'daily') {
    const streak = calcStreak(name);
    if (streak >= 2) return `<span class="habit-streak">🔥 ${streak}</span>`;
    if (streak === 1) return `<span class="habit-streak habit-streak--one">1</span>`;
    return '';
  }

  const { start, end, shortLabel } = getPeriodBounds(cfg, currentDate);
  const done     = countPeriodCompletions(name, start, end);
  const goal     = cfg.freq_count;
  const metCls   = done >= goal ? ' habit-period-badge--met' : '';
  const streak   = calcPeriodStreak(name);
  const streakHtml = streak >= 2
    ? `<span class="habit-streak" style="margin-left:4px">🔥 ${streak}</span>`
    : '';

  return `<span class="habit-period-badge${metCls}">${done}/${goal} ${shortLabel}</span>${streakHtml}`;
}
```

**Commit:**
```bash
git add js/habits.js
git commit -m "feat: add period streak calculation for non-daily habits"
```

---

## Task 9: Final push and version bump

**Files:**
- Modify: `js/config.js`

**Step 1: Bump patch version in config.js**

Find `APP_VERSION` in `js/config.js` and increment the patch version.

**Step 2: Final commit + push**

```bash
git add js/config.js
git commit -m "chore: bump version for habit frequency + reminders feature"
git push
```

---

## Testing Checklist

After pushing, test at `https://jfcass.github.io/dailytracker`:

**Settings:**
- [ ] Open Settings → Habits card → each habit has 🔔 bell and ⚙ gear icon
- [ ] Click ⚙ on a habit → frequency form expands with dropdown + count field
- [ ] Change to "Weekly", set count to 3, save → chip shows "3×/wk"
- [ ] Click 🔔 on a habit → bell lights up in accent color, 🔔 is "on"
- [ ] Click 🔔 again → bell dims, reminder off

**Habits section (Today tab):**
- [ ] Daily habit shows streak badge as before
- [ ] Weekly habit shows "X/3 wk" progress badge (e.g., "0/3 wk" if nothing done this week)
- [ ] Check the habit today → badge updates to "1/3 wk"
- [ ] Progress bar at top accounts for period completion correctly

**Hub ticker:**
- [ ] Enable reminder on a habit that isn't done today → ticker shows "Reminder: [Name]"
- [ ] Enable reminder on 2+ undone habits → ticker cycles between them every 4 seconds
- [ ] Mark a habit done → it drops out of the rotation
- [ ] Med slots still take priority over habit reminders (verify a pending slot shows med, not habit)
- [ ] When navigating away from Today tab, timer is cleared (no JS errors in console)

**Backward compatibility:**
- [ ] Habits without any config still work (default = daily, no reminder)
- [ ] Old day data (habits as booleans) still renders correctly
- [ ] Accordion layout: habit rows show new badges; no layout breakage
