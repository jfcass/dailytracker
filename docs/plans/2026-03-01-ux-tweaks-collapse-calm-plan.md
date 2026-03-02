# UX Tweaks: Collapse Defaults + Calm Button — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Three small UX improvements: Health Log sections collapse by default, Settings cards become collapsible (collapsed by default), and the Meditation habit row gets an "Open Calm" deep-link button.

**Architecture:** All changes are contained to three JS files and one CSS file. No new data is persisted — collapse state resets on each page load (intentional). The Settings `makeCard()` helper is upgraded from returning a `card` element to returning `{ card, body }`, and all 8 card builders are updated accordingly.

**Tech Stack:** Vanilla JS (IIFE modules), CSS custom properties, no build step.

---

### Task 1: Health Log — default collapsed

**Files:**
- Modify: `js/health-log.js` line 27

**Step 1: Make the change**

Find this line (line 27):
```js
let collapsedSections = new Set();
```

Replace with:
```js
let collapsedSections = new Set(['bp', 'dig', 'meds', 'issues']);
```

**Step 2: Verify in browser**

Open the app → navigate to Health Log tab.
Expected: All four sections (Blood Pressure, Digestion, Medications, Issues) are collapsed by default. Clicking a section header expands it. Navigating away and back resets them to collapsed.

**Step 3: Commit**
```bash
git add js/health-log.js
git commit -m "feat: collapse health log sections by default on load"
```

---

### Task 2: Settings — CSS for collapsible cards

**Files:**
- Modify: `css/styles.css` (after `.stg-card-title` block, around line 4587)

**Step 1: Add CSS**

After the `.stg-card-title { ... }` block (ends around line 4587), insert:

```css
/* ── Collapsible card toggle ─────────────────────────────────────────────── */
.stg-card-header--toggle {
  cursor:      pointer;
  user-select: none;
}
.stg-card-chevron {
  font-size:   0.7rem;
  color:       var(--clr-text-2);
  transition:  transform 0.2s ease;
  flex-shrink: 0;
  line-height: 1;
}
.stg-card-chevron--open {
  transform: rotate(0deg);
}
.stg-card-chevron:not(.stg-card-chevron--open) {
  transform: rotate(-90deg);
}
.stg-card--collapsed .stg-card-header {
  border-bottom: none;
}
```

**Step 2: Verify (no JS yet — just check no existing styles broke)**

Open app → Settings tab → cards still look normal.

**Step 3: Commit**
```bash
git add css/styles.css
git commit -m "feat(css): add collapsible card styles for settings"
```

---

### Task 3: Settings — upgrade `makeCard()` and all 8 builders

**Files:**
- Modify: `js/settings.js`

**Step 1: Add `expandedCards` state**

At the top of the `Settings` IIFE, after the existing `let saveTimer = null;` line, add:

```js
// Which settings cards are expanded? (all collapsed by default)
let expandedCards = new Set();
```

**Step 2: Replace `makeCard()`**

Find the current `makeCard` function (lines 71–79):
```js
function makeCard(titleHtml) {
  const card = document.createElement('div');
  card.className = 'stg-card';
  const header = document.createElement('div');
  header.className = 'stg-card-header';
  header.innerHTML = titleHtml;
  card.appendChild(header);
  return card;
}
```

Replace it entirely with:
```js
function makeCard(titleHtml, key) {
  const card = document.createElement('div');
  card.className = 'stg-card';

  const header = document.createElement('div');
  header.className = 'stg-card-header';
  header.innerHTML = titleHtml;

  const body = document.createElement('div');
  body.className = 'stg-card-body';

  if (key) {
    const isExpanded = expandedCards.has(key);
    body.hidden = !isExpanded;
    card.classList.toggle('stg-card--collapsed', !isExpanded);

    const chevron = document.createElement('span');
    chevron.className = 'stg-card-chevron' + (isExpanded ? ' stg-card-chevron--open' : '');
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▾';
    header.classList.add('stg-card-header--toggle');
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.appendChild(chevron);
    header.addEventListener('click', () => {
      if (expandedCards.has(key)) expandedCards.delete(key);
      else expandedCards.add(key);
      render();
    });
    header.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); header.click(); }
    });
  }

  card.appendChild(header);
  card.appendChild(body);
  return { card, body };
}
```

**Step 3: Update `buildHabitsCard()`**

Find:
```js
function buildHabitsCard() {
  const card = makeCard(`
```

Change `const card = makeCard(` → `const { card, body } = makeCard(` and add `'habits'` as the second argument:
```js
function buildHabitsCard() {
  const { card, body } = makeCard(`
      <span class="stg-card-title">
        ...Habits SVG and title...
      </span>
    `, 'habits');
```

Then change the two `card.appendChild(...)` lines (for `list` and `addRow`) to `body.appendChild(...)`:
```js
    body.appendChild(list);
    // ...
    body.appendChild(addRow);

    return card;
```

**Step 4: Update `buildSubstancesCard()`**

Same pattern as Task 3 Step 3. Change:
```js
const card = makeCard(`...`, /* no key */);
```
→
```js
const { card, body } = makeCard(`...Moderation Substances title...`, 'substances');
```

And change `card.appendChild(list)` → `body.appendChild(list)`, `card.appendChild(addRow)` → `body.appendChild(addRow)`.

**Step 5: Update `buildCategoriesCard()`**

```js
const { card, body } = makeCard(`...Health Categories title...`, 'categories');
```

Change:
- `card.appendChild(tagsWrap)` → `body.appendChild(tagsWrap)`
- `card.appendChild(addRow)` → `body.appendChild(addRow)`

**Step 6: Update `buildDisplayCard()`**

```js
const { card, body } = makeCard(`...Display title...`, 'display');
```

Change:
- `card.appendChild(themeRow)` → `body.appendChild(themeRow)`
- `card.appendChild(unitRow)` → `body.appendChild(unitRow)`

**Step 7: Update `buildAccountCard()`**

```js
const { card, body } = makeCard(`...Account title...`, 'account');
```

Change:
- `card.appendChild(pinRow)` → `body.appendChild(pinRow)`
- `card.appendChild(signOutRow)` → `body.appendChild(signOutRow)`

**Step 8: Update `buildFitbitCard()`**

```js
const { card, body } = makeCard(`...Fitbit title...`, 'fitbit');
```

The two lines that append `syncBtn` and `disconnectBtn` to `card.querySelector('.stg-card-header')` stay unchanged (those are header actions, not body content).

Change body content:
- Early return (not-connected) block: `card.appendChild(row)` → `body.appendChild(row)`
- Error state: `card.appendChild(errRow)` → `body.appendChild(errRow)`
- Healthy state: `card.appendChild(statusRow)` → `body.appendChild(statusRow)`

**Step 9: Update `buildPrnMedsCard()`**

```js
const { card, body } = makeCard(`...As-Needed Medications title...`, 'prn');
card.id = 'stg-prn-meds-card';   // ← stays on card, not body
```

Change:
- `card.appendChild(list)` → `body.appendChild(list)`
- `card.appendChild(addRow)` (inside the `if (prnForm !== 'add')` block) → `body.appendChild(addRow)`

**Step 10: Update `buildTreatmentMedsCard()`**

```js
const { card, body } = makeCard(`...Treatment Medications title...`, 'tx');
card.id = 'stg-tx-meds-card';   // ← stays on card
```

Change:
- `card.appendChild(list)` → `body.appendChild(list)`
- `card.appendChild(addRow)` (inside the `if (txMedForm !== 'add')` block) → `body.appendChild(addRow)`

**Step 11: Update `focusPrnMeds()` and `focusTxMeds()`**

Find `focusPrnMeds()` (around line 59):
```js
function focusPrnMeds() {
  const el = document.getElementById('stg-prn-meds-card');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
```

Replace with:
```js
function focusPrnMeds() {
  expandedCards.add('prn');
  render();
  requestAnimationFrame(() => {
    const el = document.getElementById('stg-prn-meds-card');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
```

Find `focusTxMeds()` (around line 64):
```js
function focusTxMeds() {
  const el = document.getElementById('stg-tx-meds-card');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
```

Replace with:
```js
function focusTxMeds() {
  expandedCards.add('tx');
  render();
  requestAnimationFrame(() => {
    const el = document.getElementById('stg-tx-meds-card');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
```

**Step 12: Verify in browser**

Open app → Settings tab.
Expected:
- All 8 cards show only their header (title + chevron pointing right)
- Clicking a header expands it (chevron rotates down, content appears)
- Clicking again collapses it
- Navigating away and back resets all to collapsed
- From Treatments tab, tapping "Set up in Settings →" link opens Settings with the Tx Meds card already expanded and scrolled into view

**Step 13: Commit**
```bash
git add js/settings.js
git commit -m "feat: make all settings cards collapsible, collapsed by default"
```

---

### Task 4: Meditation habit — Open Calm button

**Files:**
- Modify: `js/habits.js`
- Modify: `css/styles.css`

**Step 1: Add CSS for the Calm button**

In `css/styles.css`, find the habit row styles (search for `.habit-row`). After the existing habit row rules, add:

```css
/* ── Meditation: Calm app link ───────────────────────────────────────────── */
.habit-calm-btn {
  margin-left:     auto;
  font-size:       1.1rem;
  text-decoration: none;
  padding:         3px 8px;
  border-radius:   8px;
  background:      var(--clr-surface-2);
  color:           var(--clr-text);
  line-height:     1;
  flex-shrink:     0;
  transition:      background var(--transition);
}
.habit-calm-btn:hover,
.habit-calm-btn:active {
  background: var(--clr-accent-dim);
}
```

**Step 2: Add `makeMeditationRow()` to `habits.js`**

In `js/habits.js`, after the closing brace of `makeRow()` (around line 111), add:

```js
// ── Meditation row (shows "Open Calm" deep-link button) ──────────────────
function makeMeditationRow(name, checked) {
  const streak = calcStreak(name);
  let badge = '';
  if      (streak >= 2) badge = `<span class="habit-streak">🔥 ${streak}</span>`;
  else if (streak === 1) badge = `<span class="habit-streak habit-streak--one">1</span>`;

  const div = document.createElement('div');
  div.className = 'habit-row habit-row--reading' + (checked ? ' habit-row--checked' : '');
  div.setAttribute('role', 'listitem');

  div.innerHTML = `
    <button class="habit-check-btn" type="button"
            aria-pressed="${checked}"
            aria-label="${checked ? 'Mark Meditation undone' : 'Mark Meditation done'}">
      <div class="habit-check" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"
             width="13" height="13">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
    </button>
    <span class="habit-name">${escHtml(name)}</span>
    ${badge}
    <a class="habit-calm-btn" href="calm://" aria-label="Open Calm app" title="Open Calm">🧘</a>
  `;

  div.querySelector('.habit-check-btn').addEventListener('click', () => toggle(name));
  return div;
}
```

**Step 3: Wire the branch in the `habits.forEach` loop**

In `render()`, inside the `habits.forEach(name => { ... })` block, find the existing if/else chain:

```js
if (name.toLowerCase() === 'reading') {
  ...
} else if (name.toLowerCase() === 'gym') {
  ...
} else {
  list.appendChild(makeRow(name, day.habits[name] === true));
}
```

Add a new branch before the `else`:
```js
} else if (name.toLowerCase() === 'meditation') {
  list.appendChild(makeMeditationRow(name, day.habits[name] === true));
} else {
  list.appendChild(makeRow(name, day.habits[name] === true));
}
```

**Step 4: Verify in browser**

Open the app → Daily Log → Habits section.
Expected:
- "Meditation" habit row shows the normal checkmark toggle on the left, habit name in the middle, and a 🧘 button on the right
- Tapping the checkmark toggles the habit (does NOT open Calm)
- Tapping 🧘 attempts to open the Calm app (`calm://` deep link fires)
- On desktop browser: tapping 🧘 does nothing visible (expected — no Calm installed)
- Streak badge still appears when applicable

**Step 5: Bump version and commit**

In `js/config.js`, bump:
```js
const APP_VERSION = '2026.03.07';
```

```bash
git add js/habits.js css/styles.css js/config.js
git commit -m "feat: add Open Calm deep-link button to Meditation habit row (v2026.03.07)"
```

---

## Final verification checklist

- [ ] Health Log: all sections collapsed on fresh load; toggle works
- [ ] Settings: all 8 cards collapsed on load; each expands/collapses independently
- [ ] Settings: "Set up in Settings →" link from Treatments expands the Tx Meds card and scrolls to it
- [ ] Habits: Meditation row shows 🧘 button; checkmark toggles habit; 🧘 fires `calm://`
- [ ] No regressions: other habits (Reading, Gym) still have their expand panels
- [ ] Version badge in Settings shows `v2026.03.07`
