# Vitals Section Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the vitals bar from `section-symptoms` and the Health bucket stats bar from `hub.js` into a new standalone `section-vitals` tracker-section owned by a dedicated `vitals.js` module.

**Architecture:** New `vitals.js` module follows the existing module pattern (init/render/setDate). The section renders a stats row (steps/calories/floors) and a vitals bar (sleep detail, HR, HRV, SpO2, breathing rate). Existing rendering is removed from `symptoms.js` (renderVitalsBar) and `hub.js` (hub-bucket-statsbar injection). The section appears in both accordion (after Medications) and Hub Health bucket (first section).

**Tech Stack:** Vanilla JS, HTML, CSS — no framework, no build step. Pushed to GitHub Pages to verify.

**Spec:** `docs/plans/2026-03-09-vitals-section-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `js/vitals.js` | **Create** | Owns all rendering for `#section-vitals` — stats row + vitals bar |
| `index.html` | **Modify** | Add `section-vitals` after `section-meds`; remove `symp-vitals-bar`; add `<script>` tag |
| `js/symptoms.js` | **Modify** | Remove `renderVitalsBar()` function and its call in `render()` |
| `js/hub.js` | **Modify** | Remove statsbar injection + cleanup; add `section-vitals` to `BUCKETS.health`; add `Vitals.setDate()` in `renderBucketSections()` |
| `js/app.js` | **Modify** | Add `Vitals.init()` in init sequence; add `Vitals.setDate()` in DateNav callback and `reRenderAll()`; add `vitals` to `sectionMap` in `applyVisibility()` |
| `js/settings.js` | **Modify** | Add `['vitals', 'Vitals']` to Today Tab visibility list in `buildVisibilityCard()` |
| `css/styles.css` | **Modify** | Add vitals section styles; remove `.hub-bucket-statsbar` and `.symp-vitals-*` blocks |

---

## Chunk 1: Create vitals.js and section-vitals HTML

### Task 1: Create `js/vitals.js`

**Files:**
- Create: `js/vitals.js`

- [ ] **Step 1: Create `js/vitals.js` with this exact content**

```js
/**
 * vitals.js — Vitals section for the Today tab.
 *
 * Renders a stats row (steps / calories / floors) and a vitals bar
 * (sleep detail, HR, HRV, SpO2, breathing rate) from day data.
 * Works in both accordion and Hub bucket layouts.
 */
const Vitals = (() => {

  let currentDate = '';

  // ── Public API ────────────────────────────────────────────────────────────

  function init() {
    currentDate = Data.today();
    render();
  }

  function setDate(date) {
    currentDate = date;
    render();
  }

  function render() {
    _renderStatsRow();
    _renderVitalsBar();
  }

  // ── Stats row (steps / calories / floors) ─────────────────────────────────

  function _renderStatsRow() {
    const el = document.getElementById('vitals-stats-row');
    if (!el) return;
    const day = Data.getDay(currentDate);
    const stats = [
      { ico: '👣', val: day?.steps    != null ? day.steps.toLocaleString()    : null, lbl: 'steps'    },
      { ico: '🔥', val: day?.calories != null ? day.calories.toLocaleString() : null, lbl: 'calories' },
      { ico: '🏢', val: day?.floors   != null && day.floors > 0 ? String(day.floors) : null, lbl: 'floors'   },
    ];
    el.innerHTML = `<div class="vitals-stats-row">${
      stats.map(s => `
        <div class="vitals-stat">
          <span class="vitals-stat__ico">${s.ico}</span>
          <span class="vitals-stat__val">${s.val ?? '—'}</span>
          <span class="vitals-stat__lbl">${s.lbl}</span>
        </div>`).join('')
    }</div>`;
  }

  // ── Vitals bar (sleep detail + HR / HRV / SpO2 / breathing) ──────────────

  function _renderVitalsBar() {
    const el = document.getElementById('vitals-bar');
    if (!el) return;
    const day = Data.getDay(currentDate);
    if (!day) { el.innerHTML = ''; return; }

    let html = '';

    // Sleep block — only if hours logged
    const sl = day.sleep;
    if (sl?.hours > 0) {
      let sleepHtml = `<span class="vitals-sleep-val">${sl.hours}\u202fh</span>`;

      if (day.sleep_efficiency != null) {
        const effCls = day.sleep_efficiency >= 85 ? 'good'
                     : day.sleep_efficiency >= 75 ? 'ok' : 'low';
        sleepHtml += `<span class="vitals-sleep-eff vitals-sleep-eff--${effCls}">${day.sleep_efficiency}%</span>`;
      }

      const deep  = day.sleep_deep  ?? 0;
      const light = day.sleep_light ?? 0;
      const rem   = day.sleep_rem   ?? 0;
      const awake = day.sleep_awake ?? 0;
      const total = deep + light + rem + awake;
      if (total > 0) {
        const pct = v => ((v / total) * 100).toFixed(1);
        sleepHtml += `
          <div class="vitals-sleep-stages"
               title="Deep ${deep}m \u00b7 REM ${rem}m \u00b7 Light ${light}m \u00b7 Awake ${awake}m">
            <span class="vitals-sleep-seg vitals-sleep-seg--deep"  style="width:${pct(deep)}%"></span>
            <span class="vitals-sleep-seg vitals-sleep-seg--rem"   style="width:${pct(rem)}%"></span>
            <span class="vitals-sleep-seg vitals-sleep-seg--light" style="width:${pct(light)}%"></span>
            <span class="vitals-sleep-seg vitals-sleep-seg--awake" style="width:${pct(awake)}%"></span>
          </div>
          <span class="vitals-sleep-stages-label">Deep\u00a0${deep}m \u00b7 REM\u00a0${rem}m \u00b7 Light\u00a0${light}m</span>`;
      }

      html += `<div class="vitals-row">
        <span class="vitals-label">Sleep</span>
        <div class="vitals-sleep-stats">${sleepHtml}</div>
      </div>`;
    }

    // Vitals chips — steps/calories/floors excluded (shown in stats row above)
    const chips = [];
    if (day.resting_hr     != null) chips.push(`${day.resting_hr}\u00a0bpm`);
    if (day.hrv            != null) chips.push(`${day.hrv}\u00a0ms HRV`);
    if (day.spo2           != null) chips.push(`${day.spo2}%\u00a0SpO\u2082`);
    if (day.breathing_rate != null) chips.push(`${day.breathing_rate}\u00a0br/min`);
    if (day.active_minutes != null) chips.push(`${day.active_minutes}\u00a0active\u00a0min`);

    if (chips.length) {
      html += `<div class="vitals-row">
        <span class="vitals-label">Vitals</span>
        <div class="vitals-chips-row">${
          chips.map(c => `<span class="vitals-chip">${c}</span>`).join('')
        }</div>
      </div>`;
    }

    el.innerHTML = html;
  }

  return { init, render, setDate };
})();
```

- [ ] **Step 2: Commit**

```bash
git add js/vitals.js
git commit -m "feat: add vitals.js module (init/render/setDate)"
```

---

### Task 2: Update `index.html`

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add `section-vitals` after the closing `</section>` of `section-meds`**

Find the closing `</section>` tag of `#section-meds` — it is immediately before the `<!-- ── Section: Gratitudes` comment (around line 473). Insert this block after it:

```html
      <!-- ── Section: Vitals ──────────────────────────────────────────────── -->
      <section id="section-vitals" class="tracker-section" aria-label="Vitals">

        <div class="section-header" onclick="App.toggleSection('section-vitals')">
          <h2 class="section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                 width="16" height="16" aria-hidden="true">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            Vitals
            <svg class="section-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                 width="14" height="14" aria-hidden="true">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </h2>
        </div>

        <div class="section-body">
          <div id="vitals-stats-row"></div>
          <div id="vitals-bar"></div>
        </div>

      </section>
```

- [ ] **Step 2: Remove `symp-vitals-bar` from inside `section-symptoms`**

Find and delete these two lines inside `section-symptoms` (around line 441–442):

```html
        <!-- Vitals bar — sleep + Fitbit stats, rendered by symptoms.js -->
        <div id="symp-vitals-bar"></div>
```

- [ ] **Step 3: Add `<script>` tag for `vitals.js`**

In the script block at the bottom of `index.html`, add after `<script src="js/treatments.js"></script>` (around line 668):

```html
  <script src="js/vitals.js"></script>
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add section-vitals to HTML, remove symp-vitals-bar"
```

---

## Chunk 2: Wire up modules

### Task 3: Remove vitals rendering from `symptoms.js`

**Files:**
- Modify: `js/symptoms.js`

- [ ] **Step 1: Remove the `renderVitalsBar(currentDate)` call from `render()`**

In `render()` (around line 171), delete this line:

```js
    renderVitalsBar(currentDate);
```

- [ ] **Step 2: Delete the entire `renderVitalsBar` function**

Delete the complete `renderVitalsBar(date)` function (approximately lines 174–240). It begins with:

```js
  function renderVitalsBar(date) {
    const el = document.getElementById('symp-vitals-bar');
```

and ends with:

```js
    el.innerHTML = html;
  }
```

- [ ] **Step 3: Commit**

```bash
git add js/symptoms.js
git commit -m "refactor: remove renderVitalsBar from symptoms.js"
```

---

### Task 4: Update `hub.js`

**Files:**
- Modify: `js/hub.js`

- [ ] **Step 1: Update `BUCKETS.health.sections` to put `section-vitals` first**

Change (around line 27):

```js
      sections: ['section-meds', 'section-bowel', 'section-symptoms', 'tab-treatments'],
```

To:

```js
      sections: ['section-vitals', 'section-meds', 'section-bowel', 'section-symptoms', 'tab-treatments'],
```

- [ ] **Step 2: Delete the `hub-bucket-statsbar` injection block in `showBucket()`**

Find and delete this entire block (around lines 1079–1092):

```js
    // For the Health bucket, show a sleep/steps/calories stats summary
    // at the top so the user can see those figures without drilling deeper.
    if (bucketKey === 'health') {
      const stats = getTodayStats();
      const statsBar = document.createElement('div');
      statsBar.className = 'hub-bucket-statsbar';
      statsBar.innerHTML = stats.map(s => `
        <div class="hub-bucket-stat">
          <span class="hub-bucket-stat__ico">${s.ico}</span>
          <span class="hub-bucket-stat__val">${s.val ?? '—'}</span>
          <span class="hub-bucket-stat__lbl">${s.lbl}</span>
        </div>`).join('');
      backBar.insertAdjacentElement('afterend', statsBar);
    }
```

- [ ] **Step 3: Remove `.hub-bucket-statsbar` from `_cleanupBucketView()`**

Find and delete this line (around line 984):

```js
      accEl.querySelector('.hub-bucket-statsbar')?.remove();
```

- [ ] **Step 4: Add `Vitals.setDate()` branch in `renderBucketSections()`**

In `renderBucketSections()` (around line 244), add a new branch alongside the other section handlers:

```js
      } else if (sectionId === 'section-vitals' && typeof Vitals !== 'undefined') {
        Vitals.setDate(date);
```

Place it adjacent to the `section-meds` branch for readability.

- [ ] **Step 5: Commit**

```bash
git add js/hub.js
git commit -m "refactor: remove statsbar from hub.js, add section-vitals to Health bucket"
```

---

### Task 5: Update `app.js`

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Add `Vitals.setDate(date)` to the `DateNav.init` callback**

In the `DateNav.init(date => { ... })` callback (around line 152), add after `Medications.setDate(date)`:

```js
      if (typeof Vitals !== 'undefined') Vitals.setDate(date);
```

- [ ] **Step 2: Add `Vitals.init()` to the module init sequence**

After `Medications.init();` (around line 165), add:

```js
    Vitals.init();
```

- [ ] **Step 3: Add `Vitals.setDate(date)` to `reRenderAll()`**

In `reRenderAll()` (around line 254), add after `Gratitudes.setDate(date);`:

```js
    if (typeof Vitals !== 'undefined') Vitals.setDate(date);
```

- [ ] **Step 4: Add `vitals` to `sectionMap` in `applyVisibility()`**

In the `sectionMap` object (around line 221), add:

```js
      vitals:     'section-vitals',
```

- [ ] **Step 5: Commit**

```bash
git add js/app.js
git commit -m "feat: wire Vitals module into app init, date nav, and visibility"
```

---

## Chunk 3: CSS

### Task 6: Update `css/styles.css`

**Files:**
- Modify: `css/styles.css`

- [ ] **Step 1: Add new vitals section styles**

Find the comment `/* ── Health section: vitals bar` (around line 6040) and insert these new styles immediately before it:

```css
/* ── Vitals section ─────────────────────────────────────────────────────── */

/* Stats row */
.vitals-stats-row {
  display:         flex;
  justify-content: space-around;
  padding:         12px 16px 8px;
  border-bottom:   1px solid var(--clr-border);
  margin-bottom:   4px;
}
.vitals-stat {
  flex:           1;
  display:        flex;
  flex-direction: column;
  align-items:    center;
  gap:            2px;
}
.vitals-stat__ico { font-size: 18px; }
.vitals-stat__val {
  font-size:   16px;
  font-weight: 700;
  color:       var(--clr-text);
  line-height: 1.2;
}
.vitals-stat__lbl {
  font-size:      10px;
  color:          var(--clr-text-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* Vitals bar rows */
.vitals-row {
  display:     flex;
  align-items: center;
  gap:         12px;
  padding:     6px 16px;
}
.vitals-row + .vitals-row { padding-top: 2px; }
.vitals-label {
  font-size:      0.7rem;
  font-weight:    700;
  color:          var(--clr-text-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  min-width:      36px;
}
.vitals-sleep-stats {
  display:     flex;
  align-items: center;
  flex-wrap:   wrap;
  gap:         6px;
}
.vitals-sleep-val {
  font-size:   0.9rem;
  font-weight: 700;
  color:       var(--clr-accent);
}
.vitals-sleep-eff {
  font-size:     0.75rem;
  font-weight:   600;
  padding:       2px 6px;
  border-radius: 10px;
}
.vitals-sleep-eff--good { background: #e8f5e9; color: #2e7d32; }
.vitals-sleep-eff--ok   { background: #fff8e1; color: #f57f17; }
.vitals-sleep-eff--low  { background: #ffebee; color: #c62828; }
@media (prefers-color-scheme: dark) {
  .vitals-sleep-eff--good { background: #1b3a1d; color: #81c784; }
  .vitals-sleep-eff--ok   { background: #3e2723; color: #ffcc02; }
  .vitals-sleep-eff--low  { background: #3e0000; color: #ef9a9a; }
}
.vitals-sleep-stages {
  display:       flex;
  height:        6px;
  border-radius: 3px;
  overflow:      hidden;
  width:         80px;
  background:    var(--clr-border);
}
.vitals-sleep-seg--deep  { background: #5c6bc0; }
.vitals-sleep-seg--rem   { background: #26a69a; }
.vitals-sleep-seg--light { background: #78909c; }
.vitals-sleep-seg--awake { background: #ef9a9a; }
.vitals-sleep-stages-label {
  font-size: 0.72rem;
  color:     var(--clr-text-2);
}
.vitals-chips-row {
  display:     flex;
  align-items: center;
  flex-wrap:   wrap;
  gap:         6px;
}
.vitals-chip {
  font-size:     0.78rem;
  padding:       3px 9px;
  background:    var(--clr-surface-2);
  border:        1px solid var(--clr-border);
  border-radius: 12px;
  color:         var(--clr-text);
}
```

- [ ] **Step 2: Delete the old `#symp-vitals-bar` and `.symp-vitals-*` block**

Delete from the line `/* ── Health section: vitals bar` (around line 6040) through and including the line `.symp-sleep-stages-label { font-size: 0.72rem; color: var(--clr-text-2); flex-basis: 100%; line-height: 1.3; }` (around line 6117). The next line after the deletion should be the blank line before `/* ── Symptom redesign: issues toggle button`.

The classes being deleted are: `#symp-vitals-bar`, `.symp-vitals-row`, `.symp-vitals-label`, `.symp-vitals-sleep-stats`, `.symp-vitals-sleep-val`, `.symp-vitals-meta`, `.symp-vitals-chips-row`, `.symp-vitals-chip`, `.symp-sleep-eff` + modifier variants + dark-mode overrides, `.symp-sleep-stages`, `.symp-sleep-seg--*`, `.symp-sleep-stages-label`.

- [ ] **Step 3: Delete the `.hub-bucket-statsbar` block**

Delete from the comment `/* ── Health stats bar in Health bucket view ──` (around line 8988) through and including the closing `}` of `.hub-bucket-stat__lbl` (around line 9017). The classes being deleted are: `.hub-bucket-statsbar`, `.hub-bucket-stat`, `.hub-bucket-stat__ico`, `.hub-bucket-stat__val`, `.hub-bucket-stat__lbl`.

- [ ] **Step 4: Commit**

```bash
git add css/styles.css
git commit -m "style: add vitals section CSS, remove symp-vitals and hub-bucket-statsbar styles"
```

---

### Task 6b: Update `settings.js`

**Files:**
- Modify: `js/settings.js`

- [ ] **Step 1: Add `['vitals', 'Vitals']` to the Today Tab visibility list**

In `buildVisibilityCard()`, find the Today Tab array (around line 520):

```js
    [
      ['habits',     'Habits'],
      ['mood',       'Mood & Energy'],
      ['symptoms',   'Symptoms'],
      ['moderation', 'Moderation'],
      ['bowel',      'Bowel'],
      ['gratitudes', 'Gratitudes'],
      ['note',       'Daily Note'],
    ].forEach(([k, l]) => body.appendChild(makeRow(k, l)));
```

Add `['vitals', 'Vitals']` after `['note', 'Daily Note']`:

```js
    [
      ['habits',     'Habits'],
      ['mood',       'Mood & Energy'],
      ['symptoms',   'Symptoms'],
      ['moderation', 'Moderation'],
      ['bowel',      'Bowel'],
      ['gratitudes', 'Gratitudes'],
      ['note',       'Daily Note'],
      ['vitals',     'Vitals'],
    ].forEach(([k, l]) => body.appendChild(makeRow(k, l)));
```

- [ ] **Step 2: Commit**

```bash
git add js/settings.js
git commit -m "feat: add Vitals to Settings visibility list"
```

---

### Task 7: Push and verify

- [ ] **Step 1: Push to GitHub Pages**

```bash
git push
```

- [ ] **Step 2: Verify accordion layout at `https://jfcass.github.io/dailytracker`**

  - "Vitals" section appears after Medications in the Today tab
  - Stats row shows steps / calories / floors (dashes if no data)
  - Vitals bar shows sleep detail + HR chips if Fitbit data exists, otherwise empty
  - `section-symptoms` no longer shows a vitals bar above the symptom entries
  - Collapse/expand works; state persists across page reload

- [ ] **Step 3: Verify Hub layout**

  - Open Today tab in Hub layout → tap Health tile
  - Vitals section appears first, before Medications
  - No duplicate stats bar below the back button
  - Date navigation updates the Vitals section correctly

- [ ] **Step 4: Verify Settings visibility**

  - Settings → visibility list includes "Vitals"
  - Hiding "Vitals" removes the section from both layouts
