# Streaks + Report Default Period — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add consecutive-day streak badges to the Gratitudes and Daily Notes section headers on the Today tab; make the Reports default period configurable (default 7d) via a new Settings → Display preference.

**Architecture:** Streak functions follow the exact pattern of `calcStreak()` in `habits.js` — walk backwards from today (skipping today if not yet filled), cap at 3,650 iterations, format ≥365 days as "Xy Zd". Streak badges are rendered into static `<span>` placeholder elements in `index.html`. The report period default is stored in `settings.default_report_period`; `Reports.init()` reads it on load; `buildDisplayCard()` in `settings.js` gets a third toggle row to configure it.

**Tech Stack:** Vanilla JS (IIFE modules), no framework, no build step. All data in Google Drive JSON via `Data.getSettings()` / `Data.getData()`.

---

### Task 1: Add streak badge placeholders to `index.html`

**Files:**
- Modify: `index.html`

**Step 1: Find the Gratitudes section title in index.html**

Search for "Gratitudes" or "grat" in `index.html` to find the section header element. It will look something like:
```html
<h2 class="section-title">Gratitudes</h2>
```
or be inside a `<div class="section-header">` block.

**Step 2: Add a streak badge span after the title text**

Inside the Gratitudes section title element, after the "Gratitudes" text, add:
```html
<span id="grat-streak" class="habit-streak" hidden></span>
```

The full element should look like (exact structure may vary — preserve whatever wrapper exists):
```html
<h2 class="section-title">Gratitudes <span id="grat-streak" class="habit-streak" hidden></span></h2>
```

**Step 3: Find the Daily Notes section title**

Search for "Daily Notes" or "daily-note" or "notes" in `index.html` to find the Daily Notes section header.

**Step 4: Add a streak badge span there too**

```html
<span id="notes-streak" class="habit-streak" hidden></span>
```

Example result:
```html
<h2 class="section-title">Daily Notes <span id="notes-streak" class="habit-streak" hidden></span></h2>
```

**Step 5: Verify**

Open the app → Today tab. Both sections should look visually identical to before (the spans are `hidden`).

**Step 6: Commit**
```bash
git add index.html
git commit -m "feat: add streak badge placeholder spans to Gratitudes and Daily Notes headers"
```

---

### Task 2: Gratitude streak calculation and rendering (`js/gratitudes.js`)

**Files:**
- Modify: `js/gratitudes.js`

**Context:** `gratitudes.js` is a vanilla JS IIFE. Gratitude data lives at `Data.getDay(date).gratitudes` (array of strings). A day "counts" if at least one entry is non-empty after trimming. The render() function already rebuilds the list on every call — we'll add a streak update to the end of it.

**Step 1: Add helper functions after the module's opening `const Gratitudes = (() => {` line**

Find the top of the Gratitudes IIFE (near `let currentDate` or the first `let`/`const` declarations). Add these three helpers right before the first function definition:

```js
// ── Streak helpers ───────────────────────────────────────────────────────
function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00'); // noon avoids DST edge cases
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatStreakLabel(n) {
  if (n < 365) return String(n);
  const years = Math.floor(n / 365);
  const rem   = n % 365;
  return rem === 0 ? `${years}y` : `${years}y ${rem}d`;
}

function calcGratitudeStreak() {
  const allDays = Data.getData().days ?? {};
  const today   = Data.today();
  const todayHas = (allDays[today]?.gratitudes ?? []).some(g => g.trim());
  let date = todayHas ? today : shiftDate(today, -1);
  let n    = 0;
  for (let i = 0; i < 3650; i++) {
    const hasEntry = (allDays[date]?.gratitudes ?? []).some(g => g.trim());
    if (hasEntry) { n++; date = shiftDate(date, -1); }
    else          { break; }
  }
  return n;
}
```

**Step 2: Add a streak badge update helper**

Right after the three helpers above, add:

```js
function updateGratitudeStreakBadge() {
  const el = document.getElementById('grat-streak');
  if (!el) return;
  const streak = calcGratitudeStreak();
  if (streak === 0) {
    el.hidden    = true;
    el.className = 'habit-streak';
    el.textContent = '';
  } else if (streak === 1) {
    el.hidden    = false;
    el.className = 'habit-streak habit-streak--one';
    el.textContent = '1';
  } else {
    el.hidden    = false;
    el.className = 'habit-streak';
    el.textContent = '🔥 ' + formatStreakLabel(streak);
  }
}
```

**Step 3: Call `updateGratitudeStreakBadge()` at the end of `render()`**

Find the `render()` function. At the very end, before its closing `}`, add:
```js
  updateGratitudeStreakBadge();
```

**Step 4: Also call it from `setDate()`**

`setDate(date)` calls `render()` already, so no extra call needed. But if there's an `init()` function that doesn't call render(), add `updateGratitudeStreakBadge()` there too.

**Step 5: Verify**

Open the app → Today tab → Gratitudes section. If you have consecutive days of gratitude entries, a 🔥 badge should appear in the header. Enter a new gratitude and save — badge updates. (If you have no data, badge stays hidden — that's correct.)

**Step 6: Commit**
```bash
git add js/gratitudes.js
git commit -m "feat: add consecutive-day streak badge to Gratitudes section header"
```

---

### Task 3: Daily Notes streak calculation and rendering (`js/mood.js`)

**Files:**
- Modify: `js/mood.js`

**Context:** `mood.js` manages mood, energy, and the daily notes textarea. Notes live at `Data.getData().days?.[date]?.note` (a single string). A day "counts" if `note.trim()` is non-empty. The existing `render()` already updates DOM elements by ID — we follow the same pattern with `notes-streak`.

**Step 1: Add helper functions near the top of the mood.js IIFE**

Find the module-level `let currentDate` or first declarations. Add these three helpers right before the first function definition (same pattern as Task 2):

```js
// ── Notes streak helpers ─────────────────────────────────────────────────
function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatStreakLabel(n) {
  if (n < 365) return String(n);
  const years = Math.floor(n / 365);
  const rem   = n % 365;
  return rem === 0 ? `${years}y` : `${years}y ${rem}d`;
}

function calcNotesStreak() {
  const allDays = Data.getData().days ?? {};
  const today   = Data.today();
  const todayHas = !!(allDays[today]?.note ?? '').trim();
  let date = todayHas ? today : shiftDate(today, -1);
  let n    = 0;
  for (let i = 0; i < 3650; i++) {
    const hasEntry = !!(allDays[date]?.note ?? '').trim();
    if (hasEntry) { n++; date = shiftDate(date, -1); }
    else          { break; }
  }
  return n;
}
```

**Step 2: Add badge update helper**

```js
function updateNotesStreakBadge() {
  const el = document.getElementById('notes-streak');
  if (!el) return;
  const streak = calcNotesStreak();
  if (streak === 0) {
    el.hidden    = true;
    el.className = 'habit-streak';
    el.textContent = '';
  } else if (streak === 1) {
    el.hidden    = false;
    el.className = 'habit-streak habit-streak--one';
    el.textContent = '1';
  } else {
    el.hidden    = false;
    el.className = 'habit-streak';
    el.textContent = '🔥 ' + formatStreakLabel(streak);
  }
}
```

**Step 3: Call `updateNotesStreakBadge()` at the end of `render()`**

Find the `render()` function in mood.js. At the very end, before its closing `}`, add:
```js
  updateNotesStreakBadge();
```

**Step 4: Also update on note save**

Find `onNoteInput()` (the function that saves the note, called on textarea input). At the end of its debounce callback — the part that actually writes `day.note = ...` and saves — add `updateNotesStreakBadge()`. This ensures the badge updates as soon as the user starts typing.

**Step 5: Verify**

Open the app → Today tab → Daily Notes section. If you have consecutive days with notes, the 🔥 badge should appear. Type a note — badge updates after the debounce fires.

**Step 6: Commit**
```bash
git add js/mood.js
git commit -m "feat: add consecutive-day streak badge to Daily Notes section header"
```

---

### Task 4: Reports default period — read from settings on init (`js/reports.js` + `js/data.js`)

**Files:**
- Modify: `js/reports.js` line 13
- Modify: `js/data.js` (SCHEMA_DEFAULTS)

**Step 1: Add `default_report_period` to SCHEMA_DEFAULTS in `data.js`**

Find `SCHEMA_DEFAULTS` in `data.js` (the `settings` object inside it). Add one field:
```js
settings: {
  pin_hash: null,
  habits: [...],
  // ... existing fields ...
  theme: 'system',
  weather_unit: 'auto',
  default_report_period: '7d',   // ← ADD THIS LINE
},
```

**Step 2: Change the initial `period` value in `reports.js`**

Find line 13:
```js
let period = '30d';
```

Replace with:
```js
let period = Data.getSettings?.()?.default_report_period ?? '7d';
```

> **Why `?.()?.`?** `Data` is loaded before `Reports`, but `getSettings()` might return null before data loads. The `??` fallback handles that safely. When `Reports.init()` is called (after data is loaded), this will already have the correct value because the IIFE runs when the script loads — but `render()` and `init()` are called after data loads, so it's safe to also set `period` in `init()`.

**Step 3: Also set `period` at the start of `Reports.init()`**

Find `Reports.init()` (called when the Reports tab is first opened, after data is fully loaded). At the very beginning of the function body, add:
```js
period = Data.getSettings().default_report_period ?? '7d';
```

This ensures the period resets to the user's preference each time the tab is opened (not sticky across sessions).

**Step 4: Verify**

Open app → Reports tab. The period selector should default to "7 days" (the `7d` button should be active). If you have no `default_report_period` in your saved Drive data yet, it will fall back to `'7d'` correctly.

**Step 5: Commit**
```bash
git add js/reports.js js/data.js
git commit -m "feat: reports default period reads from settings, falls back to 7d"
```

---

### Task 5: Reports default period — Settings UI (`js/settings.js`)

**Files:**
- Modify: `js/settings.js` — `buildDisplayCard()`

**Context:** `buildDisplayCard()` currently has two `stg-pref-row` blocks: Theme and Temperature. We add a third for "Default report period". Uses the same `stg-toggle-group` / `stg-toggle-btn` pattern.

**Step 1: Add the new row inside `buildDisplayCard()`**

Find the end of `buildDisplayCard()` — just before `return card;`. Add this block after `body.appendChild(unitRow)`:

```js
  // Default report period row
  const rptPeriod = Data.getSettings().default_report_period ?? '7d';
  const rptRow = document.createElement('div');
  rptRow.className = 'stg-pref-row';
  rptRow.innerHTML = `
    <span class="stg-pref-label">Default period</span>
    <div class="stg-toggle-group" role="group" aria-label="Default report period">
      ${[['7d', '7d'], ['30d', '30d'], ['90d', '90d'], ['all', 'All']].map(([v, lbl]) =>
        `<button class="stg-toggle-btn${rptPeriod === v ? ' stg-toggle-btn--active' : ''}"
                 data-value="${v}" type="button">${escHtml(lbl)}</button>`
      ).join('')}
    </div>
  `;
  rptRow.querySelectorAll('.stg-toggle-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      Data.getSettings().default_report_period = btn.dataset.value;
      scheduleSave();
      render();
    })
  );
  body.appendChild(rptRow);
```

**Step 2: Verify**

Open app → Settings → expand the Display card. Three rows should appear: Theme, Temperature, Default period. Selecting a period option highlights it. Switching to the Reports tab should now default to the selected period.

**Step 3: Commit**
```bash
git add js/settings.js
git commit -m "feat: add default report period preference to Settings Display card"
```

---

### Task 6: Version bump and push

**Files:**
- Modify: `js/config.js`

**Step 1: Bump version**

In `js/config.js`, change:
```js
const APP_VERSION = '2026.03.07';
```
to:
```js
const APP_VERSION = '2026.03.08';
```

**Step 2: Commit and push**
```bash
git add js/config.js
git commit -m "chore: bump version to 2026.03.08"
git push
```

---

## Final verification checklist

- [ ] Gratitudes section header shows 🔥 streak badge when ≥2 consecutive days; shows `1` badge for 1 day; hidden for 0 days
- [ ] Badge formats `365+ days` as `🔥 1y`, `400 days` as `🔥 1y 35d`
- [ ] Daily Notes section header shows same badge behavior
- [ ] Entering a gratitude or note today makes the badge appear/update in real time
- [ ] Reports tab defaults to 7d period on first open
- [ ] Settings → Display card shows "Default period" toggle (7d / 30d / 90d / All)
- [ ] Selecting a period in Settings changes the Reports default on next tab open
- [ ] Version badge in Settings shows `v2026.03.08`
