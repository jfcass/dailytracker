# Gratitudes + Health Log Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Daily Gratitudes section to the Today view and a Health Log tab for managing ongoing health issues, while moving Settings to a header gear icon.

**Architecture:** Two new vanilla JS modules (`gratitudes.js`, `health-log.js`) following the existing IIFE pattern. Data stored in `Data.getDay(date).gratitudes[]` (array of strings) and existing `Data.getData().ongoing_issues{}`. Navigation restructured: bottom nav becomes Today | Health Log | Reports | Library; Settings becomes a ⚙️ gear button in the app header.

**Tech Stack:** Vanilla JS, CSS custom properties, Google Drive REST API via existing `Data.save()`, `crypto.randomUUID()` for no new IDs needed here.

---

## Task 1: Add `gratitudes` to data schema

**Files:**
- Modify: `js/data.js` (around line 206 in `getDay()`)

**Step 1: Add `gratitudes: []` to the day default object in `getDay()`**

In `getDay()`, the default object currently ends with `bowel: [], note: ''`. Add `gratitudes` before `note`:

```js
// js/data.js  — inside getDay(), the default object
data.days[dateStr] = {
  habits:            {},
  moderation:        {},
  issue_logs:        [],
  sleep:             null,
  mood:              null,
  food:              { notes: '', entries: [] },
  medications_taken: [],
  social:            [],
  reading:           [],
  gym:               { muscle_groups: [] },
  bowel:             [],
  gratitudes:        [],   // ← ADD THIS LINE
  note:              '',
};
```

**Step 2: Commit**
```bash
git add js/data.js
git commit -m "feat(data): add gratitudes array to day schema defaults"
```

---

## Task 2: Create `js/gratitudes.js`

**Files:**
- Create: `js/gratitudes.js`

**Step 1: Create the module**

```js
/**
 * gratitudes.js — Daily Gratitudes section
 *
 * Renders into the static #section-gratitudes shell in index.html.
 * Reads/writes Data.getDay(date).gratitudes  →  ["text", "text", …]
 *
 * Auto-grow: starts with one input; appends a new bullet
 * whenever the last one has content.
 */
const Gratitudes = (() => {

  let currentDate = null;
  let saveTimer   = null;

  // ── Public ────────────────────────────────────────────────────────────────

  function init() {
    currentDate = DateNav.getDate();
    render();
  }

  function setDate(date) {
    currentDate = date;
    render();
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function getEntries() {
    return Data.getDay(currentDate).gratitudes ?? [];
  }

  function render() {
    const list = document.getElementById('grat-list');
    if (!list) return;

    const entries = [...getEntries()];
    // Always show at least one input; append blank slot if last has content
    if (entries.length === 0 || entries[entries.length - 1] !== '') {
      entries.push('');
    }

    list.innerHTML = entries.map((val, idx) => `
      <div class="grat-item">
        <span class="grat-bullet" aria-hidden="true">•</span>
        <input
          class="grat-input"
          type="text"
          placeholder="I'm grateful for…"
          value="${escHtml(val)}"
          data-idx="${idx}"
          oninput="Gratitudes._onInput(this)"
          onkeydown="Gratitudes._onKeydown(event, ${idx})"
        >
      </div>
    `).join('');

    updateSaveStatus('');
  }

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function updateSaveStatus(msg) {
    const el = document.getElementById('grat-save-status');
    if (el) el.textContent = msg;
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  function _onInput(inputEl) {
    const idx     = parseInt(inputEl.dataset.idx, 10);
    const value   = inputEl.value;
    const entries = [...getEntries()];

    // Grow array if needed
    while (entries.length <= idx) entries.push('');
    entries[idx] = value;

    // Auto-append new blank slot when last input has content
    if (idx === entries.length - 1 && value.trim() !== '') {
      entries.push('');
    }

    save(entries);
  }

  function _onKeydown(event, idx) {
    // Enter key: focus next input (or the newly appended one)
    if (event.key === 'Enter') {
      event.preventDefault();
      const inputs = document.querySelectorAll('#grat-list .grat-input');
      const next   = inputs[idx + 1];
      if (next) next.focus();
    }
  }

  function save(entries) {
    // Strip trailing empty strings, keep at least []
    const cleaned = entries.filter((v, i) => v.trim() !== '' || i < entries.length - 1)
                           .filter(v => v.trim() !== '');
    Data.getDay(currentDate).gratitudes = cleaned;

    updateSaveStatus('Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await Data.save();
      updateSaveStatus('Saved');
      setTimeout(() => updateSaveStatus(''), 1500);
      // Re-render to sync displayed inputs with cleaned array + fresh trailing blank
      render();
    }, 800);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return { init, setDate, _onInput, _onKeydown };
})();
```

**Step 2: Commit**
```bash
git add js/gratitudes.js
git commit -m "feat: add Gratitudes module (auto-grow bullet list)"
```

---

## Task 3: Add Gratitudes section HTML to `index.html`

**Files:**
- Modify: `index.html`

**Step 1: Insert section before Daily Note**

Find the comment `<!-- ── Section: Daily Note` (around line 415) and insert the Gratitudes section immediately before it:

```html
      <!-- ── Section: Gratitudes ──────────────────────────────────────── -->
      <section id="section-gratitudes" class="tracker-section" aria-label="Gratitudes">

        <div class="section-header" onclick="App.toggleSection('section-gratitudes')">
          <h2 class="section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                 width="16" height="16" aria-hidden="true">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            Gratitudes
            <svg class="section-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                 width="14" height="14" aria-hidden="true">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </h2>
        </div>

        <div id="grat-list" class="grat-list"></div>

        <div id="grat-save-status" class="save-status" aria-live="polite"></div>

      </section>

```

**Step 2: Add `<script>` tag for gratitudes.js**

Find the line `<script src="js/bowel.js"></script>` and add gratitudes.js below it:

```html
  <script src="js/bowel.js"></script>
  <script src="js/gratitudes.js"></script>   <!-- ← ADD -->
```

**Step 3: Commit**
```bash
git add index.html
git commit -m "feat(html): add Gratitudes section and script tag"
```

---

## Task 4: Wire Gratitudes into `app.js`

**Files:**
- Modify: `js/app.js`

**Step 1: Add `Gratitudes.setDate(date)` to the DateNav callback**

Find the `DateNav.init(date => {` block and add after `Bowel.setDate(date)`:

```js
Bowel.setDate(date);
Gratitudes.setDate(date);   // ← ADD
```

**Step 2: Add `Gratitudes.init()` to `showMain()`**

Find `Bowel.init();` and add after it:

```js
Bowel.init();
Gratitudes.init();   // ← ADD
```

**Step 3: Commit**
```bash
git add js/app.js
git commit -m "feat(app): wire Gratitudes init and date change"
```

---

## Task 5: Add Gratitudes CSS

**Files:**
- Modify: `css/styles.css`

**Step 1: Add styles at the end of the file, before the final closing comment (or at the end)**

```css
/* ── Gratitudes section ──────────────────────────────────────────────────── */
.grat-list {
  display:        flex;
  flex-direction: column;
  gap:            6px;
  padding:        0 0 4px;
}
.grat-item {
  display:     flex;
  align-items: center;
  gap:         8px;
}
.grat-bullet {
  color:       var(--clr-accent);
  font-size:   1.1rem;
  line-height: 1;
  flex-shrink: 0;
  margin-top:  1px;
}
.grat-input {
  flex:          1;
  background:    transparent;
  border:        none;
  border-bottom: 1px solid var(--clr-border);
  color:         var(--clr-text);
  font-family:   inherit;
  font-size:     0.9rem;
  padding:       4px 2px;
  outline:       none;
  transition:    border-color var(--transition);
}
.grat-input:focus {
  border-bottom-color: var(--clr-accent);
}
.grat-input::placeholder {
  color: var(--clr-text-2);
}
```

**Step 2: Commit**
```bash
git add css/styles.css
git commit -m "feat(css): add Gratitudes section styles"
```

---

## Task 6: Navigation restructure — Settings → gear icon, Health Log → bottom nav

**Files:**
- Modify: `index.html`

**Step 1: Add gear button to app header**

Find the `<header class="app-header">` block (around line 142) and add a gear button after the title span:

```html
    <header class="app-header">
      <div class="app-header__logo" aria-hidden="true">
        <!-- existing SVG logo unchanged -->
      </div>
      <span class="app-header__title">Daily Tracker</span>
      <button class="app-header__gear-btn" type="button"
              onclick="App.switchTab('settings')" aria-label="Settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
             width="20" height="20" aria-hidden="true">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </header>
```

**Step 2: Add Health Log tab content div**

After the Settings tab div (`</div><!-- end tab-settings -->`), add:

```html
    <!-- ── Health Log tab ─────────────────────────────────────────────── -->
    <div id="tab-health-log" class="tab-view" hidden>
      <div id="health-log-content"></div>
    </div>
```

**Step 3: Replace bottom nav**

Replace the entire `<nav class="bottom-nav">` block with:

```html
    <nav class="bottom-nav" aria-label="Main navigation">

      <button class="bottom-nav-btn bottom-nav-btn--active" data-tab="today"
              type="button" onclick="App.switchTab('today')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
             width="22" height="22" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8"  y1="2" x2="8"  y2="6"/>
          <line x1="3"  y1="10" x2="21" y2="10"/>
        </svg>
        Today
      </button>

      <button class="bottom-nav-btn" data-tab="health-log"
              type="button" onclick="App.switchTab('health-log')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
             width="22" height="22" aria-hidden="true">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        Health Log
      </button>

      <button class="bottom-nav-btn" data-tab="reports"
              type="button" onclick="App.switchTab('reports')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
             width="22" height="22" aria-hidden="true">
          <line x1="18" y1="20" x2="18" y2="10"/>
          <line x1="12" y1="20" x2="12" y2="4"/>
          <line x1="6"  y1="20" x2="6"  y2="14"/>
        </svg>
        Reports
      </button>

      <button class="bottom-nav-btn" data-tab="library"
              type="button" onclick="App.switchTab('library')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
             width="22" height="22" aria-hidden="true">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        Library
      </button>

    </nav>
```

**Step 4: Commit**
```bash
git add index.html
git commit -m "feat(nav): add gear icon to header, Health Log to bottom nav, remove Settings from nav"
```

---

## Task 7: Add gear button and Health Log CSS

**Files:**
- Modify: `css/styles.css`

**Step 1: Add gear button style**

After the existing `.app-header` rules, add:

```css
.app-header__gear-btn {
  margin-left:   auto;
  background:    transparent;
  border:        none;
  color:         var(--clr-text-2);
  padding:       6px;
  border-radius: 6px;
  cursor:        pointer;
  display:       flex;
  align-items:   center;
  justify-content: center;
  transition:    color var(--transition), background var(--transition);
}
.app-header__gear-btn:hover {
  color:       var(--clr-text);
  background:  var(--clr-surface-2);
}
```

**Step 2: Add Health Log base styles**

```css
/* ── Health Log tab ──────────────────────────────────────────────────────── */
.hl-tab-header {
  padding:       16px 16px 8px;
  border-bottom: 1px solid var(--clr-border);
  margin-bottom: 12px;
}
.hl-tab-title {
  font-size:   1.1rem;
  font-weight: 700;
  color:       var(--clr-text);
  margin:      0;
}
.hl-group-label {
  font-size:      0.72rem;
  font-weight:    700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color:          var(--clr-text-2);
  padding:        0 16px;
  margin:         16px 0 6px;
}
.hl-issue-row {
  display:     flex;
  align-items: center;
  gap:         10px;
  padding:     10px 16px;
  cursor:      pointer;
  border-bottom: 1px solid var(--clr-border);
  transition:  background var(--transition);
}
.hl-issue-row:hover { background: var(--clr-surface-2); }
.hl-issue-row:last-child { border-bottom: none; }
.hl-cat-badge {
  font-size:     0.65rem;
  font-weight:   700;
  text-transform: uppercase;
  background:    var(--clr-accent-dim);
  color:         var(--clr-accent);
  border-radius: 4px;
  padding:       2px 6px;
  white-space:   nowrap;
  flex-shrink:   0;
}
.hl-issue-title {
  flex:        1;
  font-size:   0.9rem;
  font-weight: 600;
  color:       var(--clr-text);
}
.hl-issue-meta {
  font-size:  0.75rem;
  color:      var(--clr-text-2);
  text-align: right;
  flex-shrink: 0;
}
.hl-empty {
  padding:    32px 16px;
  text-align: center;
  color:      var(--clr-text-2);
  font-size:  0.88rem;
}

/* Health Log — detail view */
.hl-detail {
  padding-bottom: 32px;
}
.hl-detail-back {
  display:     flex;
  align-items: center;
  gap:         6px;
  padding:     12px 16px 8px;
  font-size:   0.85rem;
  font-weight: 600;
  color:       var(--clr-accent);
  background:  transparent;
  border:      none;
  cursor:      pointer;
}
.hl-detail-back:hover { opacity: 0.8; }
.hl-detail-header {
  padding:       0 16px 12px;
  border-bottom: 1px solid var(--clr-border);
}
.hl-detail-title {
  font-size:   1.1rem;
  font-weight: 700;
  color:       var(--clr-text);
  margin:      0 0 4px;
}
.hl-detail-sub {
  font-size:  0.8rem;
  color:      var(--clr-text-2);
  margin-top: 2px;
}
.hl-detail-actions {
  display:   flex;
  gap:       8px;
  flex-wrap: wrap;
  padding:   12px 16px;
}
.hl-detail-actions button {
  font-size:     0.82rem;
  padding:       6px 12px;
  border-radius: 6px;
  border:        1px solid var(--clr-border);
  background:    transparent;
  color:         var(--clr-text-2);
  cursor:        pointer;
  transition:    background var(--transition), color var(--transition);
}
.hl-detail-actions button:hover     { background: var(--clr-surface-2); color: var(--clr-text); }
.hl-resolve-btn                     { color: var(--clr-accent) !important; border-color: var(--clr-accent) !important; }
.hl-resolve-btn:hover               { background: var(--clr-accent-dim) !important; }
.hl-delete-btn:hover                { color: var(--clr-error) !important; border-color: var(--clr-error) !important; }
.hl-resolve-form {
  display:    flex;
  align-items: center;
  gap:        8px;
  flex-wrap:  wrap;
  padding:    0 16px 12px;
}
.hl-resolve-date-input {
  font-family:   inherit;
  font-size:     0.85rem;
  padding:       6px 8px;
  border:        1px solid var(--clr-border);
  border-radius: 6px;
  background:    var(--clr-surface);
  color:         var(--clr-text);
}
.hl-resolve-confirm-btn {
  font-size:     0.82rem;
  padding:       6px 12px;
  border-radius: 6px;
  border:        none;
  background:    var(--clr-accent);
  color:         #fff;
  cursor:        pointer;
}
.hl-resolve-cancel-btn {
  font-size:     0.82rem;
  padding:       6px 12px;
  border-radius: 6px;
  border:        1px solid var(--clr-border);
  background:    transparent;
  color:         var(--clr-text-2);
  cursor:        pointer;
}
.hl-edit-form {
  padding: 0 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.hl-edit-label {
  font-size:   0.78rem;
  font-weight: 600;
  color:       var(--clr-text-2);
  display:     block;
  margin-bottom: 3px;
}
.hl-edit-input, .hl-edit-select {
  width:         100%;
  font-family:   inherit;
  font-size:     0.88rem;
  padding:       7px 10px;
  border:        1px solid var(--clr-border);
  border-radius: 6px;
  background:    var(--clr-surface);
  color:         var(--clr-text);
  box-sizing:    border-box;
}
.hl-edit-actions {
  display: flex;
  gap:     8px;
  margin-top: 2px;
}
.hl-edit-save-btn {
  font-size:     0.82rem;
  padding:       6px 12px;
  border-radius: 6px;
  border:        none;
  background:    var(--clr-accent);
  color:         #fff;
  cursor:        pointer;
}
.hl-edit-cancel-btn {
  font-size:     0.82rem;
  padding:       6px 12px;
  border-radius: 6px;
  border:        1px solid var(--clr-border);
  background:    transparent;
  color:         var(--clr-text-2);
  cursor:        pointer;
}
.hl-history-heading {
  font-size:      0.72rem;
  font-weight:    700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color:          var(--clr-text-2);
  padding:        12px 16px 6px;
  border-top:     1px solid var(--clr-border);
}
.hl-symptom-row {
  display:       flex;
  align-items:   flex-start;
  gap:           10px;
  padding:       9px 16px;
  border-bottom: 1px solid var(--clr-border);
}
.hl-symptom-row:last-child { border-bottom: none; }
.hl-sev-dot {
  width:         10px;
  height:        10px;
  border-radius: 50%;
  flex-shrink:   0;
  margin-top:    5px;
}
.hl-symptom-body {
  flex: 1;
}
.hl-symptom-date {
  font-size:   0.75rem;
  color:       var(--clr-text-2);
  margin-bottom: 2px;
}
.hl-symptom-desc {
  font-size:  0.88rem;
  color:      var(--clr-text);
  line-height: 1.4;
}
.hl-symptom-sev-label {
  font-size:  0.72rem;
  color:      var(--clr-text-2);
  margin-top: 2px;
}
.hl-no-history {
  padding:    16px;
  color:      var(--clr-text-2);
  font-size:  0.85rem;
  font-style: italic;
}
```

**Step 3: Commit**
```bash
git add css/styles.css
git commit -m "feat(css): add gear button and Health Log tab styles"
```

---

## Task 8: Create `js/health-log.js`

**Files:**
- Create: `js/health-log.js`

**Step 1: Create the module**

```js
/**
 * health-log.js — Health Log tab
 *
 * Renders into #health-log-content.
 * Shows all ongoing_issues grouped by active/resolved.
 * Clicking an issue → detail view with symptom history, edit, resolve, delete.
 */
const HealthLog = (() => {

  // null = list view; string = issue id currently open in detail view
  let detailId       = null;
  let showResolveForm = false;
  let showEditForm    = false;

  // ── Helpers ───────────────────────────────────────────────────────────────

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(dateStr) {
    if (!dateStr) return '';
    const [y, mo, d] = dateStr.split('-').map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  function today() {
    return Data.today();
  }

  // Severity colour scale (mirrors symptoms.js)
  const SEV_COLORS = ['', '#4caf50', '#8bc34a', '#ffc107', '#ff5722', '#f44336'];
  const SEV_LABELS = ['', 'Mild', 'Low', 'Moderate', 'High', 'Severe'];

  function getIssues() {
    return Object.values(Data.getData().ongoing_issues ?? {});
  }

  // Returns all symptom entries across all days linked to a given issue id
  function getSymptomsForIssue(issueId) {
    const days = Data.getData().days ?? {};
    const results = [];
    Object.entries(days).forEach(([date, day]) => {
      (day.symptoms ?? []).forEach(s => {
        if (s.issue_id === issueId) results.push({ ...s, date });
      });
    });
    // Most recent first
    results.sort((a, b) => b.date.localeCompare(a.date));
    return results;
  }

  // Count symptoms linked to an issue
  function countSymptoms(issueId) {
    return getSymptomsForIssue(issueId).length;
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function init() { render(); }

  function render() {
    const container = document.getElementById('health-log-content');
    if (!container) return;

    if (detailId) {
      container.innerHTML = renderDetail(detailId);
    } else {
      container.innerHTML = renderList();
    }
  }

  function renderList() {
    const issues  = getIssues();
    const active   = issues.filter(i => !i.resolved).sort((a, b) => b.start_date.localeCompare(a.start_date));
    const resolved = issues.filter(i =>  i.resolved).sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? ''));

    let html = `<div class="hl-tab-header"><h2 class="hl-tab-title">Health Log</h2></div>`;

    if (!issues.length) {
      return html + `<p class="hl-empty">No ongoing issues yet. Add one from the Health section on Today.</p>`;
    }

    if (active.length) {
      html += `<p class="hl-group-label">Active</p>`;
      html += active.map(i => issueRow(i)).join('');
    }

    if (resolved.length) {
      html += `<p class="hl-group-label">Resolved</p>`;
      html += resolved.map(i => issueRow(i)).join('');
    }

    return html;
  }

  function issueRow(issue) {
    const count   = countSymptoms(issue.id);
    const dateRange = issue.resolved
      ? `${fmtDate(issue.start_date)} → ${fmtDate(issue.end_date)}`
      : `Since ${fmtDate(issue.start_date)}`;

    return `<div class="hl-issue-row" onclick="HealthLog._openDetail('${issue.id}')">
      <span class="hl-cat-badge">${escHtml(issue.category)}</span>
      <span class="hl-issue-title">${escHtml(issue.title)}</span>
      <span class="hl-issue-meta">
        ${dateRange}<br>
        ${count} entr${count === 1 ? 'y' : 'ies'}
      </span>
    </div>`;
  }

  function renderDetail(issueId) {
    const issue = (Data.getData().ongoing_issues ?? {})[issueId];
    if (!issue) { detailId = null; return renderList(); }

    const symptoms = getSymptomsForIssue(issueId);
    const dateRange = issue.resolved
      ? `${fmtDate(issue.start_date)} → ${fmtDate(issue.end_date)}`
      : `Since ${fmtDate(issue.start_date)}`;

    const categories = Data.getSettings().symptom_categories ?? [];

    let html = `
      <div class="hl-detail">
        <button class="hl-detail-back" onclick="HealthLog._back()">
          ← Back to Health Log
        </button>
        <div class="hl-detail-header">
          <p class="hl-detail-sub">${escHtml(issue.category)}</p>
          <h2 class="hl-detail-title">${escHtml(issue.title)}</h2>
          <p class="hl-detail-sub">${dateRange} · ${symptoms.length} symptom entr${symptoms.length === 1 ? 'y' : 'ies'}</p>
          ${issue.notes ? `<p class="hl-detail-sub" style="margin-top:6px">${escHtml(issue.notes)}</p>` : ''}
        </div>`;

    // Edit form
    if (showEditForm) {
      html += `
        <div class="hl-edit-form">
          <div>
            <label class="hl-edit-label">Title</label>
            <input id="hl-edit-title" class="hl-edit-input" type="text" value="${escHtml(issue.title)}">
          </div>
          <div>
            <label class="hl-edit-label">Category</label>
            <select id="hl-edit-cat" class="hl-edit-select">
              ${categories.map(c => `<option value="${escHtml(c)}" ${c === issue.category ? 'selected' : ''}>${escHtml(c)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="hl-edit-label">Start Date</label>
            <input id="hl-edit-start" class="hl-edit-input" type="date" value="${escHtml(issue.start_date ?? '')}">
          </div>
          <div>
            <label class="hl-edit-label">Notes</label>
            <input id="hl-edit-notes" class="hl-edit-input" type="text" value="${escHtml(issue.notes ?? '')}">
          </div>
          <div class="hl-edit-actions">
            <button class="hl-edit-save-btn" onclick="HealthLog._saveEdit('${issueId}')">Save</button>
            <button class="hl-edit-cancel-btn" onclick="HealthLog._cancelEdit()">Cancel</button>
          </div>
        </div>`;
    } else if (showResolveForm) {
      // Resolve form
      html += `
        <div class="hl-resolve-form">
          <span style="font-size:0.85rem;color:var(--clr-text-2)">Resolved on:</span>
          <input id="hl-resolve-date" class="hl-resolve-date-input" type="date" value="${today()}">
          <button class="hl-resolve-confirm-btn" onclick="HealthLog._confirmResolve('${issueId}')">Confirm</button>
          <button class="hl-resolve-cancel-btn" onclick="HealthLog._cancelResolve()">Cancel</button>
        </div>`;
    } else {
      // Action buttons
      html += `<div class="hl-detail-actions">
        <button onclick="HealthLog._startEdit('${issueId}')">Edit</button>
        ${issue.resolved
          ? `<button onclick="HealthLog._reopen('${issueId}')">Reopen</button>`
          : `<button class="hl-resolve-btn" onclick="HealthLog._startResolve()">Mark Resolved</button>`}
        <button class="hl-delete-btn" onclick="HealthLog._deleteIssue('${issueId}')">Delete</button>
      </div>`;
    }

    // Symptom history
    html += `<p class="hl-history-heading">Symptom History</p>`;
    if (!symptoms.length) {
      html += `<p class="hl-no-history">No symptoms logged against this issue yet.</p>`;
    } else {
      html += symptoms.map(s => {
        const color = SEV_COLORS[s.severity] ?? '#ccc';
        const label = SEV_LABELS[s.severity] ?? '';
        const timeStr = s.time ? ` · ${s.time}` : '';
        return `<div class="hl-symptom-row">
          <div class="hl-sev-dot" style="background:${color}"></div>
          <div class="hl-symptom-body">
            <div class="hl-symptom-date">${fmtDate(s.date)}${timeStr}</div>
            ${s.description ? `<div class="hl-symptom-desc">${escHtml(s.description)}</div>` : ''}
            <div class="hl-symptom-sev-label">Severity ${s.severity} — ${label}</div>
          </div>
        </div>`;
      }).join('');
    }

    html += `</div>`;
    return html;
  }

  // ── Public bridge handlers ────────────────────────────────────────────────

  function _openDetail(id)  { detailId = id; showResolveForm = false; showEditForm = false; render(); }
  function _back()          { detailId = null; showResolveForm = false; showEditForm = false; render(); }
  function _startResolve()  { showResolveForm = true; showEditForm = false; render(); }
  function _cancelResolve() { showResolveForm = false; render(); }
  function _startEdit(id)   { showEditForm = true; showResolveForm = false; render(); }
  function _cancelEdit()    { showEditForm = false; render(); }

  async function _confirmResolve(issueId) {
    const dateInput = document.getElementById('hl-resolve-date');
    const endDate   = dateInput?.value ?? today();
    const issue     = (Data.getData().ongoing_issues ?? {})[issueId];
    if (!issue) return;
    issue.end_date  = endDate;
    issue.resolved  = true;
    showResolveForm = false;
    await Data.save();
    render();
  }

  async function _reopen(issueId) {
    const issue = (Data.getData().ongoing_issues ?? {})[issueId];
    if (!issue) return;
    issue.end_date = null;
    issue.resolved = false;
    await Data.save();
    render();
  }

  async function _saveEdit(issueId) {
    const issue    = (Data.getData().ongoing_issues ?? {})[issueId];
    if (!issue) return;
    const title    = document.getElementById('hl-edit-title')?.value.trim();
    const category = document.getElementById('hl-edit-cat')?.value;
    const start    = document.getElementById('hl-edit-start')?.value;
    const notes    = document.getElementById('hl-edit-notes')?.value.trim();
    if (title)    issue.title      = title;
    if (category) issue.category   = category;
    if (start)    issue.start_date = start;
    issue.notes   = notes ?? '';
    showEditForm  = false;
    await Data.save();
    render();
  }

  async function _deleteIssue(issueId) {
    if (!confirm('Delete this issue? Its symptom entries will remain but will no longer be linked.')) return;
    delete (Data.getData().ongoing_issues ?? {})[issueId];
    detailId = null;
    await Data.save();
    render();
  }

  return {
    init, render,
    _openDetail, _back,
    _startResolve, _cancelResolve, _confirmResolve,
    _reopen,
    _startEdit, _cancelEdit, _saveEdit,
    _deleteIssue,
  };
})();
```

**Step 2: Commit**
```bash
git add js/health-log.js
git commit -m "feat: add HealthLog module (list view, detail, edit, resolve, reopen, delete)"
```

---

## Task 9: Wire Health Log into `app.js` and add script tag

**Files:**
- Modify: `js/app.js`
- Modify: `index.html`

**Step 1: Add Health Log script tag to `index.html`**

After `<script src="js/settings.js"></script>`, add:

```html
  <script src="js/health-log.js"></script>
```

**Step 2: Add `HealthLog.init()` to `showMain()` in `app.js`**

After `Settings.init();` add:

```js
HealthLog.init();
```

**Step 3: Add `health-log` render to `switchTab()` in `app.js`**

After `if (name === 'settings') Settings.render();` add:

```js
if (name === 'health-log') HealthLog.render();
```

**Step 4: Commit**
```bash
git add index.html js/app.js
git commit -m "feat(app): wire HealthLog init, render on tab switch, and script tag"
```

---

## Task 10: Add Gratitudes streak to Reports

**Files:**
- Modify: `js/reports.js`

**Step 1: Find where streaks/habit summaries are rendered and add a gratitude streak**

Locate the `buildHabitsSection` function (or wherever habit streaks render). Add a gratitude streak function:

```js
function buildGratitudeStreak(dates) {
  // Count streak: consecutive days (from most recent backwards) with ≥ 1 gratitude
  let streak = 0;
  for (let i = dates.length - 1; i >= 0; i--) {
    const day = Data.getData().days?.[dates[i]];
    const entries = day?.gratitudes ?? [];
    if (entries.filter(g => g.trim()).length > 0) {
      streak++;
    } else {
      break;
    }
  }

  // Count total days with gratitudes logged in the period
  const totalDays = dates.filter(d => {
    const day = Data.getData().days?.[d];
    return (day?.gratitudes ?? []).filter(g => g.trim()).length > 0;
  }).length;

  return { streak, totalDays };
}
```

Then add a gratitude streak card in the reports render, inside the habits or a new section:

```js
function buildGratitudesSection(dates) {
  const { streak, totalDays } = buildGratitudeStreak(dates);

  return `<div class="rpt-section">
    <h3 class="rpt-section-title">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
           width="16" height="16" aria-hidden="true">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
      Gratitudes
    </h3>
    <div class="rpt-stat-row">
      <div class="rpt-stat-card">
        <div class="rpt-stat-value">${streak}</div>
        <div class="rpt-stat-label">day streak</div>
      </div>
      <div class="rpt-stat-card">
        <div class="rpt-stat-value">${totalDays}</div>
        <div class="rpt-stat-label">days logged this period</div>
      </div>
    </div>
  </div>`;
}
```

Call `buildGratitudesSection(dates)` in the main `render()` function of reports.js and append its output to the reports HTML.

**Step 2: Commit**
```bash
git add js/reports.js
git commit -m "feat(reports): add Gratitudes streak section"
```

---

## Task 11: Final push

```bash
git push
```

---

## Testing Checklist

- [ ] Gratitudes section appears above Daily Note on Today tab
- [ ] Starting with one bullet; typing in it appends a second
- [ ] Pressing Enter moves focus to next bullet
- [ ] Empty bullets are stripped on save; data persists across date changes
- [ ] Health Log appears in bottom nav; Settings no longer in bottom nav
- [ ] Gear icon in header opens Settings
- [ ] Health Log list view shows Active and Resolved groups
- [ ] Clicking an issue opens detail view with symptom history
- [ ] "Mark Resolved" shows date picker; saving sets end_date and resolved=true
- [ ] "Reopen" clears end_date, sets resolved=false
- [ ] Edit form saves title, category, start date, notes
- [ ] Delete removes issue and returns to list
- [ ] Reports shows Gratitudes streak card
