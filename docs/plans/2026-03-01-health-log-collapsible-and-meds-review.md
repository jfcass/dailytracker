# Health Log: Collapsible Sections + Medications Review — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make every Health Log section collapsible and add a "Medications" review section that lists recent PRN dose history and lets the user jump to the PRN settings card via a gear icon.

**Architecture:** All changes live in three existing files: `js/health-log.js` (state + render), `js/settings.js` (focusPrnMeds helper), `css/styles.css` (new rules). No new files needed. Each Health Log section gets a chevron toggle; collapse state is stored in a module-level `Set`. The Medications section reads from `Data.getData().days[*].prn_doses` across the last 30 days. The gear icon navigates to Settings and scrolls to the PRN card via `Settings.focusPrnMeds()`.

**Tech Stack:** Vanilla JS, innerHTML string templating, CSS custom properties, existing dark/light theme tokens.

---

### Task 1: Add collapsed-sections state + `_toggleSection` to health-log.js

**File:** `js/health-log.js`

**Step 1: Add state variable**

After line 24 (`let fBpNotes = ''`), insert:

```js
// Which hl sections are collapsed? Keys: 'bp' | 'dig' | 'meds' | 'issues'
let collapsedSections = new Set();
```

**Step 2: Add bridge function**

After the `_setBpNotes` bridge (around line 396), add:

```js
function _toggleSection(key) {
  if (collapsedSections.has(key)) collapsedSections.delete(key);
  else collapsedSections.add(key);
  render();
}
```

**Step 3: Expose in public return**

In the `return { ... }` block at the bottom, add `_toggleSection,`.

**Step 4: Verify**

Open the app → Health Log tab → run in console: `HealthLog._toggleSection('bp')`. Confirm no JS error.

**Step 5: Commit**

```bash
git add js/health-log.js
git commit -m "feat(health-log): add collapsedSections state + _toggleSection"
```

---

### Task 2: Make renderBPSection() collapsible

**File:** `js/health-log.js` — `renderBPSection()` (lines 202–293)

**Step 1: Read the collapsed state at the top of renderBPSection()**

After the `const bpEntries = ...` line, add:

```js
const isCollapsed = collapsedSections.has('bp');
```

**Step 2: Replace the final `return` block**

Replace:
```js
return `<div class="hl-bp-section">
  <div class="hl-section-header">
    <span class="hl-section-title">Blood Pressure</span>
    ${!bpFormMode ? `<button class="hl-section-add-btn" onclick="HealthLog._addBP()">+ Add</button>` : ''}
  </div>
  ${formHtml}
  <div class="hl-bp-list">${listHtml}</div>
</div>`;
```

With:
```js
return `<div class="hl-bp-section${isCollapsed ? ' hl-section--collapsed' : ''}">
  <div class="hl-section-header hl-section-header--toggle"
       onclick="HealthLog._toggleSection('bp')">
    <span class="hl-section-title">Blood Pressure</span>
    <div class="hl-section-header-right">
      ${!bpFormMode && !isCollapsed
        ? `<button class="hl-section-add-btn"
                  onclick="event.stopPropagation(); HealthLog._addBP()">+ Add</button>`
        : ''}
      <span class="hl-section-chevron">▾</span>
    </div>
  </div>
  ${isCollapsed ? '' : `${formHtml}<div class="hl-bp-list">${listHtml}</div>`}
</div>`;
```

**Step 3: Verify**

Reload app → Health Log → click "Blood Pressure" header → section collapses. Click again → expands. "+ Add" still works.

**Step 4: Commit**

```bash
git add js/health-log.js
git commit -m "feat(health-log): make Blood Pressure section collapsible"
```

---

### Task 3: Make renderDigestionSection() + renderIssuesSection() collapsible

**File:** `js/health-log.js`

**Step 1: renderDigestionSection() — add collapsed state at top of function**

```js
const isCollapsed = collapsedSections.has('dig');
```

**Step 2: renderDigestionSection() — replace the final return**

Replace:
```js
return `<div class="hl-dig-section">
  <div class="hl-section-header"><span class="hl-section-title">Digestion</span></div>
  <p class="hl-dig-summary">${escHtml(summary)}</p>
  <div class="hl-dig-list">${rows}</div>
</div>`;
```

With:
```js
return `<div class="hl-dig-section${isCollapsed ? ' hl-section--collapsed' : ''}">
  <div class="hl-section-header hl-section-header--toggle"
       onclick="HealthLog._toggleSection('dig')">
    <span class="hl-section-title">Digestion</span>
    <div class="hl-section-header-right">
      <span class="hl-section-chevron">▾</span>
    </div>
  </div>
  ${isCollapsed ? '' : `<p class="hl-dig-summary">${escHtml(summary)}</p>
    <div class="hl-dig-list">${rows}</div>`}
</div>`;
```

**Step 3: renderIssuesSection() — add collapsed state + refactor**

Add at top of function:
```js
const isCollapsed = collapsedSections.has('issues');
```

Replace the entire body of `renderIssuesSection()`:
```js
function renderIssuesSection() {
  const isCollapsed = collapsedSections.has('issues');
  const issues   = getIssues();
  const active   = issues.filter(i => !i.resolved)
                         .sort((a, b) => b.start_date.localeCompare(a.start_date));
  const resolved = issues.filter(i =>  i.resolved)
                         .sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? ''));

  let html = `<div class="hl-issues-section${isCollapsed ? ' hl-section--collapsed' : ''}">
    <div class="hl-section-header hl-section-header--toggle"
         onclick="HealthLog._toggleSection('issues')">
      <span class="hl-section-title">Issues</span>
      <div class="hl-section-header-right">
        <span class="hl-section-chevron">▾</span>
      </div>
    </div>`;

  if (!isCollapsed) {
    if (!issues.length) {
      html += `<p class="hl-empty">No ongoing issues yet. Add one from the Health section on Today.</p>`;
    } else {
      if (active.length) {
        html += `<p class="hl-group-label">Active</p>`;
        html += active.map(issueRow).join('');
      }
      if (resolved.length) {
        html += `<p class="hl-group-label">Resolved</p>`;
        html += resolved.map(issueRow).join('');
      }
    }
  }

  html += `</div>`;
  return html;
}
```

**Step 4: Verify**

All three sections (Blood Pressure, Digestion, Issues) collapse and expand independently.

**Step 5: Commit**

```bash
git add js/health-log.js
git commit -m "feat(health-log): make Digestion and Issues sections collapsible"
```

---

### Task 4: Add Settings.focusPrnMeds()

**File:** `js/settings.js`

**Step 1: Give the PRN card an id**

In `buildPrnMedsCard()`, after `const card = makeCard(...)`, add:

```js
card.id = 'stg-prn-meds-card';
```

**Step 2: Add focusPrnMeds function**

After `render()` (around line 46), add:

```js
function focusPrnMeds() {
  const el = document.getElementById('stg-prn-meds-card');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
```

**Step 3: Expose in public return**

Change:
```js
return { init, render };
```
To:
```js
return { init, render, focusPrnMeds };
```

**Step 4: Verify**

In console: `App.switchTab('settings'); Settings.focusPrnMeds()` → settings opens and scrolls to the PRN meds card.

**Step 5: Commit**

```bash
git add js/settings.js
git commit -m "feat(settings): expose focusPrnMeds() for gear-icon navigation"
```

---

### Task 5: Add renderMedsSection() + _goToMedsSettings() to health-log.js

**File:** `js/health-log.js`

**Step 1: Add getRecentPrnDoses() helper**

Add this function just before `renderList()`:

```js
/** Returns all prn_doses from the past 30 days, sorted newest-first. */
function getRecentPrnDoses() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutStr = cutoff.toISOString().slice(0, 10);
  const days   = Data.getData().days ?? {};
  const doses  = [];
  Object.entries(days).forEach(([date, day]) => {
    if (date < cutStr) return;
    (day.prn_doses ?? []).forEach(d => doses.push({ ...d, date }));
  });
  doses.sort((a, b) => b.iso_timestamp.localeCompare(a.iso_timestamp));
  return doses;
}
```

**Step 2: Add renderMedsSection() function**

Add this function after `renderDigestionSection()`:

```js
function renderMedsSection() {
  const isCollapsed = collapsedSections.has('meds');
  const doses       = isCollapsed ? [] : getRecentPrnDoses();
  const meds        = Data.getData().medications ?? {};

  const gearBtn = `<button class="hl-section-icon-btn"
    title="Manage medications"
    onclick="event.stopPropagation(); HealthLog._goToMedsSettings()">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06
               a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09
               A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83
               l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09
               A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83
               l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09
               a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83
               l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09
               a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  </button>`;

  let bodyHtml = '';
  if (!isCollapsed) {
    if (!doses.length) {
      bodyHtml = `<p class="hl-empty" style="margin-top:8px">No PRN doses logged in the last 30 days.</p>`;
    } else {
      bodyHtml = `<div class="hl-med-dose-list">${
        doses.map(d => {
          const med     = meds[d.medication_id];
          const name    = med ? escHtml(med.name) : 'Unknown med';
          const doseTag = d.dose
            ? ` <span class="hl-med-dose-chip">${escHtml(d.dose)}</span>`
            : '';
          const ts      = new Date(d.iso_timestamp);
          const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const dateStr = fmtDate(d.date);
          const noteStr = d.notes ? ` · ${escHtml(d.notes)}` : '';
          return `<div class="hl-med-dose-entry">
            <span class="hl-med-dose-name">${name}${doseTag}</span>
            <span class="hl-med-dose-when">${escHtml(dateStr)} · ${escHtml(timeStr)}${noteStr}</span>
          </div>`;
        }).join('')
      }</div>`;
    }
  }

  return `<div class="hl-meds-section${isCollapsed ? ' hl-section--collapsed' : ''}">
    <div class="hl-section-header hl-section-header--toggle"
         onclick="HealthLog._toggleSection('meds')">
      <span class="hl-section-title">Medications</span>
      <div class="hl-section-header-right">
        ${!isCollapsed ? gearBtn : ''}
        <span class="hl-section-chevron">▾</span>
      </div>
    </div>
    ${bodyHtml}
  </div>`;
}
```

**Step 3: Add _goToMedsSettings bridge**

After `_setBpNotes` (or near the other bridge functions):

```js
function _goToMedsSettings() {
  App.switchTab('settings');
  // Settings.render() runs synchronously in switchTab; RAF ensures scrollIntoView
  // runs after the next layout paint.
  requestAnimationFrame(() => {
    if (typeof Settings !== 'undefined' && Settings.focusPrnMeds) Settings.focusPrnMeds();
  });
}
```

**Step 4: Add to renderList()**

Replace:
```js
function renderList() {
  return `<div class="hl-tab-header"><h2 class="hl-tab-title">Health Log</h2></div>`
    + renderBPSection()
    + renderDigestionSection()
    + renderIssuesSection();
}
```

With:
```js
function renderList() {
  return `<div class="hl-tab-header"><h2 class="hl-tab-title">Health Log</h2></div>`
    + renderBPSection()
    + renderDigestionSection()
    + renderMedsSection()
    + renderIssuesSection();
}
```

**Step 5: Expose _goToMedsSettings in public return**

Add `_goToMedsSettings,` to the return object.

**Step 6: Verify**

- Health Log tab shows a "Medications" section between Digestion and Issues.
- If PRN doses exist, they're listed newest-first with date/time/dose.
- Gear icon navigates to Settings and scrolls to the PRN meds card.
- Empty state message shows if no doses in past 30 days.
- Section collapses/expands; gear icon hides when collapsed.

**Step 7: Commit**

```bash
git add js/health-log.js
git commit -m "feat(health-log): add Medications review section with gear-icon nav to settings"
```

---

### Task 6: Add CSS for collapsible sections + medications review

**File:** `css/styles.css`

**Step 1: Add `.hl-meds-section` to the shared section-chrome rule (~line 5304)**

Find:
```css
.hl-bp-section,
.hl-dig-section,
.hl-issues-section {
  padding:       16px 16px 20px;
  border-bottom: 1px solid var(--clr-border);
}
```

Replace with:
```css
.hl-bp-section,
.hl-dig-section,
.hl-meds-section,
.hl-issues-section {
  padding:       16px 16px 20px;
  border-bottom: 1px solid var(--clr-border);
}
```

**Step 2: Add collapsible toggle styles after `.hl-section-add-btn:hover`**

After the `.hl-section-add-btn:hover` rule, insert:

```css
/* Collapsible section toggle */
.hl-section-header--toggle {
  cursor:      pointer;
  user-select: none;
}
.hl-section-header-right {
  display:     flex;
  align-items: center;
  gap:         8px;
}
.hl-section-chevron {
  font-size:   0.7rem;
  color:       var(--clr-text-2);
  transition:  transform 0.2s ease;
  flex-shrink: 0;
  line-height: 1;
}
.hl-section--collapsed .hl-section-chevron {
  transform: rotate(-90deg);
}
.hl-section-icon-btn {
  display:         flex;
  align-items:     center;
  justify-content: center;
  width:           28px;
  height:          28px;
  border-radius:   6px;
  border:          1px solid var(--clr-border);
  background:      transparent;
  color:           var(--clr-text-2);
  cursor:          pointer;
  transition:      background var(--transition), color var(--transition);
}
.hl-section-icon-btn:hover {
  background: var(--clr-surface-2);
  color:      var(--clr-text);
}
```

**Step 3: Add medications review entry styles after the Digestion CSS block**

After the digestion CSS block (`.hl-dig-entry:last-child`, etc.), insert:

```css
/* ── Health Log: Medications ─────────────────────────────────────────── */

.hl-med-dose-list {
  max-height: 220px;
  overflow-y: auto;
}
.hl-med-dose-entry {
  display:         flex;
  justify-content: space-between;
  align-items:     center;
  flex-wrap:       wrap;
  gap:             4px;
  padding:         7px 0;
  border-bottom:   1px solid var(--clr-border);
}
.hl-med-dose-entry:last-child { border-bottom: none; }
.hl-med-dose-name {
  font-size:   0.88rem;
  font-weight: 600;
  color:       var(--clr-text);
  display:     flex;
  align-items: center;
  gap:         6px;
}
.hl-med-dose-chip {
  font-size:     0.72rem;
  font-weight:   500;
  padding:       2px 7px;
  border-radius: 10px;
  background:    var(--clr-accent-dim);
  color:         var(--clr-accent);
}
.hl-med-dose-when {
  font-size:   0.78rem;
  color:       var(--clr-text-2);
  white-space: nowrap;
}
```

**Step 4: Verify visual quality**

- Chevrons rotate smoothly on collapse.
- Medication dose entries are clean and well-spaced.
- Dose chips use accent color (matches PRN cards on Today tab).
- Dark mode looks correct.

**Step 5: Commit**

```bash
git add css/styles.css
git commit -m "feat(health-log): CSS for collapsible sections and medications review"
```

---

## Summary of Changes

| File | Change |
|---|---|
| `js/health-log.js` | `collapsedSections` state; `_toggleSection` bridge; collapsible renders for BP/Dig/Issues; new `renderMedsSection()` + `getRecentPrnDoses()` + `_goToMedsSettings()` |
| `js/settings.js` | `id` on PRN card; new `focusPrnMeds()` function; exposed in public API |
| `css/styles.css` | `.hl-section-header--toggle`, `.hl-section-header-right`, `.hl-section-chevron`, `.hl-section--collapsed`, `.hl-section-icon-btn`; `.hl-meds-section` added to grouped rule; new `.hl-med-dose-*` styles |
