# Medications Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the medications section of the Today tab into a four-zone layout: 2-column dose buttons that disappear on log, a collapsible PRN trigger, live dosing-window cards, and a collapsible logged-today list.

**Architecture:** All render logic lives in `js/medications.js` (IIFE module). New state variables replace the old `pendingLogSlot` pattern. The existing `logSlot()`, `openSlotEdit()`, `saveSlotEdit()`, PRN log/edit functions, and `scheduleSave()` are preserved and called from new event handlers. CSS additions go at the end of `css/styles.css`. `js/meds-manage.js` gets a single new emoji field.

**Tech Stack:** Vanilla JS IIFE — no framework, no build step.

**⚠️ Prerequisite:** Execute AFTER both `2026-03-07-slot-med-snapshot.md` and `2026-03-07-slot-delete.md` are complete and pushed. Those plans modify `logSlot()`, `openSlotEdit()`, `saveSlotEdit()`, and `renderSlotEditForm()` — the new design calls those updated functions.

---

## Background

### Current render() flow (to be replaced)

The current `render()` in `js/medications.js` (~line 82) loops over SLOT_ORDER and calls one of three renderers per slot (`renderSlotButton`, `renderSlotLogged`, `renderSlotEditForm`), then appends `renderRemindersSection()` and `renderPrnSection()`. All of these are being replaced by four new zone renderers.

**Functions to KEEP unchanged** (called by new event handlers):
- `logSlot(slot, time)` — writes slot record to day data
- `openSlotEdit(slot)` — loads edit state, calls render()
- `saveSlotEdit()` — writes edited slot back
- `deleteSlotLog()` — clears slot record (from slot-delete plan)
- `openPrnForm(medId)` / `savePrnLog()` / `deletePrnDose()` etc.
- `logReminder(medId)` / `saveReminderLog(medId)` etc.
- `scheduleSave()`, `getActiveMeds()`, `getMedById()`, `defaultSlots()`, `nowHHMM()`, `fmt12h()`, `escHtml()`

**Functions to REPLACE** (rendered UI changes):
- `renderSlotButton()`, `renderSlotLogged()` → replaced by Zone 1
- `renderRemindersSection()` → merged into Zone 1
- `renderPrnSection()` → Zone 2 replaces only the trigger/panel; PRN log/edit forms are kept
- `render()` body → rewritten to call four zone renderers

**Key IDs in index.html:**
- `#meds-section-header` — the clickable header div (collapse toggle target)
- `#section-meds` — the `<section>` element (has `tracker-section` class for collapse)
- `#meds-content` — where all rendered HTML goes

### Collapse bug

The `#meds-section-header` div has no click handler. Other sections wire it directly in HTML via `onclick="App.toggleSection('section-X')"`. The fix: add `onclick="App.toggleSection('section-meds')"` to the div in `index.html`.

### State variables (current, ~line 27–53)

```js
let pendingLogSlot = null;   // 'am' | 'afternoon' | 'pm' | null  ← REMOVE
let pendingLogTime = '';                                             ← REMOVE
let editSlot       = null;
let editTime       = '';
let editSkipped    = [];
let editMeds       = [];     // added by slot-med-snapshot plan
let confirmingDelete = false; // added by slot-delete plan
let editExtras     = [];
let editExtraMedId = '';
let editExtraDose  = '';
```

New state to ADD:
```js
let pickingSlot     = null;  // 'am'|'afternoon'|'pm'|null — inline time picker open for a slot
let pickingReminder = null;  // med.id | null — inline time picker open for a reminder med
```

---

## Task 1 — Fix collapse bug + add emoji field

**Files:**
- Modify: `index.html`
- Modify: `js/meds-manage.js`

### Step 1 — Fix the collapse toggle in index.html

Find the meds section header (~line 449):

```html
<div class="section-header" id="meds-section-header">
```

Add the onclick:

```html
<div class="section-header" id="meds-section-header" onclick="App.toggleSection('section-meds')">
```

### Step 2 — Add emoji field to renderEditForm() in meds-manage.js

Find the Name input block in `renderEditForm()` (~line 196):

```js
        <label class="mmg-field-label" for="mmg-name">Name</label>
        <input type="text" class="mmg-text-input" id="mmg-name"
               value="${escHtml(med.name ?? '')}" placeholder="Medication name" maxlength="80">
```

Add an Emoji field directly after the Name field:

```js
        <label class="mmg-field-label" for="mmg-name">Name</label>
        <input type="text" class="mmg-text-input" id="mmg-name"
               value="${escHtml(med.name ?? '')}" placeholder="Medication name" maxlength="80">

        <label class="mmg-field-label" for="mmg-emoji">Icon (emoji — optional)</label>
        <input type="text" class="mmg-text-input mmg-emoji-input" id="mmg-emoji"
               value="${escHtml(med.emoji ?? '')}" placeholder="💊" maxlength="4">
        <p class="mmg-field-hint">Tap the field and use your emoji keyboard.</p>
```

### Step 3 — Save emoji in saveMed()

Find `saveMed()` (~line 332). Locate where `notes` is read:

```js
    const notes    = content.querySelector('#mmg-notes')?.value.trim() ?? '';
```

Add `emoji` on the next line:

```js
    const notes    = content.querySelector('#mmg-notes')?.value.trim() ?? '';
    const emoji    = content.querySelector('#mmg-emoji')?.value.trim() ?? '';
```

Then find the `isNew` branch where the new med object is created:

```js
      meds[id] = { id, name, active: true, slots, slot_doses: slotDoses,
                   as_needed: asNeeded, min_interval_hours: interval,
                   max_daily_doses: maxDoses, med_reminder: reminder,
                   doses, recommended_dose: recDose, notes };
```

Add `emoji` to both the new-med object and the `Object.assign` for edits:

```js
      // isNew branch:
      meds[id] = { id, name, emoji, active: true, slots, slot_doses: slotDoses,
                   as_needed: asNeeded, min_interval_hours: interval,
                   max_daily_doses: maxDoses, med_reminder: reminder,
                   doses, recommended_dose: recDose, notes };

      // edit branch (Object.assign):
      Object.assign(med, { name, emoji, slots, slot_doses: slotDoses,
          as_needed: asNeeded, min_interval_hours: interval,
          max_daily_doses: maxDoses, med_reminder: reminder,
          doses, recommended_dose: recDose, notes });
```

### Step 4 — Manual verify

1. Open the app → Settings → Medications → edit any med
2. Confirm an "Icon (emoji)" field appears between Name and Scheduled Slots
3. Type an emoji (e.g. 🌅), save, re-open → emoji persists ✓
4. Collapse the Medications section on the Today tab — confirm it collapses and expands ✓

### Step 5 — Commit

```bash
git add index.html js/meds-manage.js
git commit -m "feat(meds): fix section collapse, add emoji field to med setup"
```

---

## Task 2 — Zone 1: Today's Doses (2-col grid with inline time picker)

**Files:**
- Modify: `js/medications.js`
- Modify: `css/styles.css`

This task replaces `renderSlotButton()`, `renderSlotLogged()`, and `renderRemindersSection()` with a single `renderTodaysDoses()` function and updates `render()` and `wireEvents()` to use it.

### Step 1 — Add new state variables, remove old pending ones

Find the state block (~line 27):

```js
let pendingLogSlot = null;
let pendingLogTime = '';
```

Replace with:

```js
let pickingSlot     = null;   // 'am'|'afternoon'|'pm'|null
let pickingReminder = null;   // med.id | null
```

Search for all uses of `pendingLogSlot` and `pendingLogTime` in the file — there will be several in the old `render()`, `renderSlotButton()`, and `wireEvents()`. These will be removed or replaced in the following steps.

### Step 2 — Add `renderTodaysDoses()` function

Add this new function just above `renderSlotButton()` (it will replace it):

```js
function renderTodaysDoses(allMeds, medSlots, medRems) {
  const SLOT_SHORT = { am: 'AM', afternoon: 'Afternoon', pm: 'PM' };
  const items = [];

  // Scheduled slots (only if they have meds)
  SLOT_ORDER.forEach(slot => {
    const meds = allMeds.filter(m => (m.slots ?? []).includes(slot));
    if (!meds.length) return;
    const slotData = medSlots[slot] ?? { time: null };
    if (slotData.time) return;  // already logged — not shown
    items.push({ kind: 'slot', slot, label: SLOT_SHORT[slot] + ' Meds', count: `${meds.length} med${meds.length !== 1 ? 's' : ''}` });
  });

  // Reminder meds (only if not yet logged today)
  allMeds.filter(m => m.med_reminder && !m.as_needed).forEach(m => {
    if (medRems[m.id]?.time) return;  // already logged
    items.push({ kind: 'reminder', id: m.id, label: m.name, count: m.recommended_dose || '' });
  });

  if (!items.length) {
    return `<div class="meds-all-done"><span class="meds-all-done-check">✓</span> All doses logged for today</div>`;
  }

  return items.map(item => {
    const icon   = item.kind === 'slot'
      ? (SLOT_ICONS[item.slot] ?? '💊')
      : (item.emoji ?? '💊');
    const isPicking = item.kind === 'slot'
      ? pickingSlot === item.slot
      : pickingReminder === item.id;

    if (isPicking) {
      const dataAttr = item.kind === 'slot'
        ? `data-pick-slot="${escHtml(item.slot)}"`
        : `data-pick-reminder="${escHtml(item.id)}"`;
      return `
        <div class="meds-slot-picker" ${dataAttr}>
          <span class="meds-picker-icon">${icon}</span>
          <span class="meds-picker-name">${escHtml(item.label)}</span>
          <input type="time" class="meds-picker-time" value="${escHtml(nowHHMM())}">
          <button class="meds-picker-ok" data-confirm-pick>OK</button>
          <button class="meds-picker-cancel" data-cancel-pick title="Cancel">✕</button>
        </div>`;
    }

    const dataOpen = item.kind === 'slot'
      ? `data-open-slot="${escHtml(item.slot)}"`
      : `data-open-reminder="${escHtml(item.id)}"`;
    return `
      <button class="meds-dose-btn" ${dataOpen}>
        <div class="meds-dose-btn-top">
          <span class="meds-dose-icon">${icon}</span>
          <span class="meds-dose-name">${escHtml(item.label)}</span>
        </div>
        ${item.count ? `<span class="meds-dose-count">${escHtml(item.count)}</span>` : ''}
      </button>`;
  }).join('');
}
```

Also add a `SLOT_ICONS` constant near `SLOT_LABELS` at the top of the module:

```js
const SLOT_ICONS  = { am: '🌅', afternoon: '☀️', pm: '🌙' };
```

### Step 3 — Update `render()` to call the new renderers

Replace the `render()` function body. The current body (lines ~82–131) loops over slots and calls old renderers. Replace the section from `// ── Scheduled slots ──` through `updateBadge(...)` with:

```js
  function render() {
    const el = document.getElementById('meds-content');
    if (!el) return;

    const allMeds      = getActiveMeds();
    const prnMeds      = allMeds.filter(m => m.as_needed);
    const reminderMeds = allMeds.filter(m => m.med_reminder && !m.as_needed);
    const dayData      = Data.getDay(currentDate);
    const medSlots     = dayData.med_slots   ?? defaultSlots();
    const medRems      = dayData.med_reminders ?? {};

    let html = '';

    // ── Zone 1: Today's Doses ──
    const hasDoses = SLOT_ORDER.some(s => allMeds.some(m => (m.slots ?? []).includes(s)))
                  || reminderMeds.length > 0;
    if (hasDoses) {
      html += `<div class="meds-zone"><div class="meds-zone-label">Today's Doses</div>
               <div class="meds-dose-grid" id="meds-dose-grid">
               ${renderTodaysDoses(allMeds, medSlots, medRems)}
               </div></div>`;
    }

    // ── Zone 2: PRN trigger ──
    // Note: PRN log/edit forms render inline within Zone 4 (see renderLoggedToday).
    // Zone 2 only shows the trigger + quick-pick panel.
    if (prnMeds.length) {
      html += `<div class="meds-zone">${renderPrnTrigger(prnMeds, dayData.prn_doses ?? [])}</div>`;
    }

    // ── Zone 3: Active Dosing Windows ──
    const windowMeds = prnMeds.filter(m => m.min_interval_hours || m.max_daily_doses);
    if (windowMeds.length) {
      const windowHtml = renderDosingWindows(windowMeds, dayData.prn_doses ?? []);
      if (windowHtml) html += `<div class="meds-zone">${windowHtml}</div>`;
    }

    // ── Zone 4: Meds Logged Today ──
    // Edit forms for slot/PRN/reminder entries render inline here, directly below
    // the entry being edited — not at the top of the section.
    html += `<div class="meds-zone">${renderLoggedToday(allMeds, medSlots, medRems, dayData.prn_doses ?? [])}</div>`;

    if (!html.trim()) {
      html = `<p class="meds-empty">No medications configured.
        <button class="meds-config-link" onclick="MedsManage.open('today')">Set up medications →</button></p>`;
    }

    el.innerHTML = html;
    wireEvents(el);
    updateBadge(allMeds, medSlots, medRems, dayData.prn_doses ?? []);
  }
```

> **Note to implementer:** The render() above is a target structure. The existing PRN form state variables (`prnLogOpen`, `prnEditId` or equivalent) are preserved — check the actual variable names in the file and wire them in the same pattern as today. The goal is that the edit form and PRN form both still work; only their outer wrapper changes.

### Step 4 — Add Zone 1 CSS to styles.css

Find `.meds-slot-edit-actions` (~line 7887) and add the new Zone 1 styles just before it:

```css
/* ── Meds redesign: shared zone ── */
.meds-zone {
  border-bottom: 1px solid var(--clr-border);
  padding: 12px 16px;
}
.meds-zone:last-child { border-bottom: none; }

.meds-zone-label {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--clr-text-3);
  margin-bottom: 8px;
}

/* 2-column grid */
.meds-dose-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

/* Unlogged dose button */
.meds-dose-btn {
  padding: 10px 10px 9px;
  background: var(--clr-surface-2);
  border: 1.5px solid var(--clr-border);
  border-radius: 8px;
  color: var(--clr-text);
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  text-align: left;
  min-width: 0;
  transition: border-color 0.15s, background 0.15s;
}
.meds-dose-btn:active {
  background: var(--clr-accent-dim);
  border-color: var(--clr-accent);
}
.meds-dose-btn-top {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  min-width: 0;
}
.meds-dose-icon  { font-size: 0.9rem; flex-shrink: 0; }
.meds-dose-name  { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meds-dose-count { font-size: 0.72rem; color: var(--clr-text-2); font-weight: 400; }

/* Inline time picker — spans both columns */
.meds-slot-picker {
  grid-column: span 2;
  background: var(--clr-accent-dim);
  border: 1.5px solid color-mix(in srgb, var(--clr-accent) 50%, transparent);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.meds-picker-icon { font-size: 0.95rem; flex-shrink: 0; }
.meds-picker-name {
  font-size: 0.85rem;
  font-weight: 600;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meds-picker-time {
  background: var(--clr-surface);
  border: 1px solid var(--clr-border);
  border-radius: 6px;
  color: var(--clr-text);
  font-family: inherit;
  font-size: 0.85rem;
  padding: 5px 8px;
  width: 92px;
  flex-shrink: 0;
}
.meds-picker-ok {
  padding: 5px 14px;
  background: var(--clr-accent);
  border: none;
  border-radius: 6px;
  color: #fff;
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
}
.meds-picker-cancel {
  background: none;
  border: none;
  color: var(--clr-text-2);
  font-size: 1rem;
  cursor: pointer;
  padding: 2px 4px;
  flex-shrink: 0;
}

/* All-done banner */
.meds-all-done {
  grid-column: span 2;
  padding: 10px 14px;
  background: var(--clr-accent-dim);
  border: 1px solid color-mix(in srgb, var(--clr-accent) 30%, transparent);
  border-radius: 8px;
  color: var(--clr-text-2);
  font-size: 0.82rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}
.meds-all-done-check { color: var(--clr-accent); }
```

### Step 5 — Wire Zone 1 events in `wireEvents()`

In `wireEvents(el)`, replace the old `[data-log-slot]` and `[data-confirm-log]` / `[data-cancel-log]` handlers with:

```js
    // Zone 1: open inline time picker
    el.querySelectorAll('[data-open-slot]').forEach(btn => {
      btn.addEventListener('click', () => {
        pickingSlot     = btn.dataset.openSlot;
        pickingReminder = null;
        render();
      });
    });
    el.querySelectorAll('[data-open-reminder]').forEach(btn => {
      btn.addEventListener('click', () => {
        pickingReminder = btn.dataset.openReminder;
        pickingSlot     = null;
        render();
      });
    });

    // Zone 1: confirm or cancel picker
    el.querySelectorAll('[data-confirm-pick]').forEach(btn => {
      btn.addEventListener('click', () => {
        const picker = btn.closest('[data-pick-slot],[data-pick-reminder]');
        const time   = picker?.querySelector('.meds-picker-time')?.value || nowHHMM();
        if (picker?.dataset.pickSlot) {
          logSlot(picker.dataset.pickSlot, time);
        } else if (picker?.dataset.pickReminder) {
          logReminder(picker.dataset.pickReminder, time);
        }
        pickingSlot = pickingReminder = null;
      });
    });
    el.querySelectorAll('[data-cancel-pick]').forEach(btn => {
      btn.addEventListener('click', () => {
        pickingSlot = pickingReminder = null;
        render();
      });
    });
```

Also add `pickingSlot = null; pickingReminder = null;` resets to `openSlotEdit()` and anywhere `editSlot = null` is set.

### Step 6 — Manual verify

1. Reload app. Today tab should show Medications section with a 2-column grid of dose buttons.
2. Tap any button → full-width picker row appears with pre-filled time + OK + ✕
3. Adjust time if desired, tap OK → button disappears from grid ✓
4. Tap ✕ → button reappears ✓
5. Log all items → "✓ All doses logged for today" banner appears ✓

### Step 7 — Commit

```bash
git add js/medications.js css/styles.css
git commit -m "feat(meds): Zone 1 — 2-col dose grid with inline time picker"
```

---

## Task 3 — Zone 2: PRN trigger panel + Zone 3: Dosing Windows

**Files:**
- Modify: `js/medications.js`
- Modify: `css/styles.css`

### Step 1 — Add `renderPrnTrigger()` function

This replaces the top part of the old `renderPrnSection()`. The PRN log form and edit card renderers (`renderPrnLogForm`, `renderPrnDoseCard`, `renderPrnEditCard`) are preserved — they render inline when their state is active.

Add just above the existing `renderPrnSection()`:

```js
function renderPrnTrigger(prnMeds, prnDoses) {
  // Build quick-pick list: up to 5 most-recently-used PRN meds in last 7 days
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentIds = [...prnDoses]
    .filter(d => new Date(d.iso_timestamp).getTime() > sevenDaysAgo)
    .sort((a, b) => new Date(b.iso_timestamp) - new Date(a.iso_timestamp))
    .map(d => d.medication_id)
    .filter((id, i, arr) => arr.indexOf(id) === i)  // unique, preserving order
    .slice(0, 5);

  const quickPick = recentIds
    .map(id => prnMeds.find(m => m.id === id))
    .filter(Boolean);

  // Other PRN meds not in quick-pick
  const otherMeds = prnMeds.filter(m => !recentIds.includes(m.id));

  const quickChips = quickPick.map(m =>
    `<button class="meds-prn-chip" data-prn-quick="${escHtml(m.id)}">${escHtml(m.name)}</button>`
  ).join('');

  const otherOpts = otherMeds.map(m =>
    `<option value="${escHtml(m.id)}">${escHtml(m.name)}</option>`
  ).join('');

  const panelHtml = prnPanelOpen ? `
    <div class="meds-prn-panel">
      ${quickChips ? `<div class="meds-prn-quick">${quickChips}</div>` : ''}
      ${otherMeds.length ? `
        <div class="meds-prn-other">
          <select class="meds-prn-select" id="meds-prn-other-select">
            <option value="">Other med…</option>${otherOpts}
          </select>
          <button class="meds-prn-log-btn" id="meds-prn-other-log">Log</button>
        </div>` : ''}
    </div>` : '';

  return `
    <button class="meds-prn-trigger ${prnPanelOpen ? 'meds-prn-trigger--open' : ''}" id="meds-prn-trigger">
      <span class="meds-prn-plus">＋</span>
      Log as-needed med
    </button>
    ${panelHtml}`;
}
```

Add `let prnPanelOpen = false;` to the module state block.

Reset `prnPanelOpen = false` inside `setDate()`.

### Step 2 — Add `renderDosingWindows()` function

Add directly after `renderPrnTrigger()`:

```js
function renderDosingWindows(windowMeds, prnDoses) {
  const now = Date.now();
  const cutoff24h = now - 24 * 60 * 60 * 1000;

  const cards = windowMeds.map(m => {
    // Most recent dose of this med within 24h
    const dose = [...prnDoses]
      .filter(d => d.medication_id === m.id)
      .filter(d => new Date(d.iso_timestamp).getTime() > cutoff24h)
      .sort((a, b) => new Date(b.iso_timestamp) - new Date(a.iso_timestamp))[0];
    if (!dose) return '';

    const takenMs    = new Date(dose.iso_timestamp).getTime();
    const elapsedMs  = now - takenMs;
    const intervalMs = (m.min_interval_hours ?? 0) * 60 * 60 * 1000;

    // Count today's doses (calendar day)
    const today   = Data.today();
    const todayStart = new Date(today + 'T00:00:00').getTime();
    const dosesToday = prnDoses.filter(d =>
      d.medication_id === m.id && new Date(d.iso_timestamp).getTime() >= todayStart
    ).length;

    const maxReached = m.max_daily_doses && dosesToday >= m.max_daily_doses;
    const intervalElapsed = !intervalMs || elapsedMs >= intervalMs;

    // Progress: 0→1 over the interval window
    const progress = intervalMs ? Math.min(elapsedMs / intervalMs, 1) : 1;

    const elapsedH = Math.floor(elapsedMs / 3_600_000);
    const elapsedM = Math.floor((elapsedMs % 3_600_000) / 60_000);
    const takenAgo = elapsedH > 0 ? `${elapsedH}h ${elapsedM}m ago` : `${elapsedM}m ago`;

    let nextText, nextClass;
    if (maxReached) {
      nextText  = 'max doses reached today';
      nextClass = 'meds-window-next--error';
    } else if (intervalElapsed) {
      nextText  = 'safe to take again';
      nextClass = 'meds-window-next--safe';
    } else {
      const remMs = intervalMs - elapsedMs;
      const remH  = Math.floor(remMs / 3_600_000);
      const remM  = Math.floor((remMs % 3_600_000) / 60_000);
      nextText  = `next dose in ${remH}h ${String(remM).padStart(2,'0')}m`;
      nextClass = '';
    }

    const barClass   = maxReached ? 'meds-window-bar--error' : '';
    const cardFaded  = intervalElapsed ? 'meds-window-card--faded' : '';
    const countLabel = m.max_daily_doses ? `${dosesToday} of ${m.max_daily_doses} today` : `${dosesToday} today`;

    return `
      <div class="meds-window-card ${cardFaded}">
        <div class="meds-window-top">
          <span class="meds-window-name">${escHtml(m.name)}</span>
          ${dose.dose ? `<span class="meds-window-dose">${escHtml(dose.dose)}</span>` : ''}
          <span class="meds-window-count">${countLabel}</span>
        </div>
        <div class="meds-window-bar-wrap">
          <div class="meds-window-bar ${barClass}" style="width:${Math.round(progress*100)}%"></div>
        </div>
        <div class="meds-window-next ${nextClass}">Taken ${takenAgo} · ${nextText}</div>
      </div>`;
  }).filter(Boolean).join('');

  if (!cards) return '';
  return `<div class="meds-windows-label">Active Dosing Windows</div>${cards}`;
}
```

### Step 3 — Wire PRN trigger events in wireEvents()

Add to the `wireEvents()` block:

```js
    // Zone 2: PRN panel toggle
    el.querySelector('#meds-prn-trigger')?.addEventListener('click', () => {
      prnPanelOpen = !prnPanelOpen;
      render();
    });

    // Zone 2: PRN quick-pick chip
    el.querySelectorAll('[data-prn-quick]').forEach(btn => {
      btn.addEventListener('click', () => {
        openPrnForm(btn.dataset.prnQuick);
        prnPanelOpen = false;
      });
    });

    // Zone 2: PRN other-med log button
    el.querySelector('#meds-prn-other-log')?.addEventListener('click', () => {
      const id = el.querySelector('#meds-prn-other-select')?.value;
      if (id) {
        openPrnForm(id);
        prnPanelOpen = false;
      }
    });
```

### Step 4 — Add Zone 2 + Zone 3 CSS

Append to styles.css after the Zone 1 styles:

```css
/* ── Zone 2: PRN trigger ── */
.meds-prn-trigger {
  width: 100%;
  padding: 10px 14px;
  background: transparent;
  border: 1.5px dashed var(--clr-border);
  border-radius: 8px;
  color: var(--clr-text-2);
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: border-color 0.15s, color 0.15s;
}
.meds-prn-trigger--open,
.meds-prn-trigger:hover {
  border-style: solid;
  border-color: var(--clr-accent);
  color: var(--clr-text);
}
.meds-prn-plus { font-size: 1rem; color: var(--clr-accent); }

.meds-prn-panel {
  background: var(--clr-surface-2);
  border: 1px solid var(--clr-border);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}
.meds-prn-quick { display: flex; flex-wrap: wrap; gap: 6px; }
.meds-prn-chip {
  padding: 6px 12px;
  background: var(--clr-surface);
  border: 1px solid var(--clr-border);
  border-radius: 20px;
  color: var(--clr-text);
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
}
.meds-prn-chip:active { background: var(--clr-accent-dim); border-color: var(--clr-accent); }
.meds-prn-other { display: flex; gap: 8px; }
.meds-prn-select {
  flex: 1;
  background: var(--clr-surface);
  border: 1px solid var(--clr-border);
  border-radius: 8px;
  color: var(--clr-text);
  font-family: inherit;
  font-size: 0.82rem;
  padding: 7px 10px;
}
.meds-prn-log-btn {
  padding: 7px 14px;
  background: var(--clr-accent);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

/* ── Zone 3: Dosing Windows ── */
.meds-windows-label {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--clr-text-3);
  margin-bottom: 8px;
}
.meds-window-card {
  background: var(--clr-surface-2);
  border: 1px solid var(--clr-border);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  transition: opacity 0.3s;
}
.meds-window-card + .meds-window-card { margin-top: 6px; }
.meds-window-card--faded { opacity: 0.4; }
.meds-window-top {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.meds-window-name { font-size: 0.9rem; font-weight: 600; }
.meds-window-dose { font-size: 0.78rem; color: var(--clr-text-2); }
.meds-window-count { font-size: 0.75rem; color: var(--clr-text-2); margin-left: auto; white-space: nowrap; }
.meds-window-bar-wrap { height: 4px; background: var(--clr-border); border-radius: 2px; overflow: hidden; }
.meds-window-bar { height: 100%; border-radius: 2px; background: var(--clr-ok, #66bb6a); transition: width 0.4s; }
.meds-window-bar--error { background: var(--clr-error); }
.meds-window-next { font-size: 0.78rem; color: var(--clr-text-2); }
.meds-window-next--safe  { color: var(--clr-accent); font-weight: 600; }
.meds-window-next--error { color: var(--clr-error);  font-weight: 600; }
```

### Step 5 — Manual verify

1. Reload app. "+ Log as-needed med" button appears below Today's Doses.
2. Tap it → panel expands showing chips + dropdown ✓
3. Tap it again → collapses ✓
4. If any PRN meds have been logged today with min_interval_hours set: dosing window cards appear below the PRN section ✓

### Step 6 — Commit

```bash
git add js/medications.js css/styles.css
git commit -m "feat(meds): Zone 2 PRN trigger panel, Zone 3 active dosing windows"
```

---

## Task 4 — Zone 4: Meds Logged Today + clean up old renderers

**Files:**
- Modify: `js/medications.js`
- Modify: `css/styles.css`

### Step 1 — Add `renderLoggedToday()` function

The function builds a list of all logged entries, groups them by time, and — crucially — **injects the relevant edit form inline directly after the last entry in that group**, anchored to the entry being edited. It uses the existing edit state variables (`editSlot`, and whatever PRN/reminder edit state variables already exist in the file) to decide where to inject.

Add after `renderDosingWindows()`:

```js
function renderLoggedToday(allMeds, medSlots, medRems, prnDoses) {
  const SLOT_SHORT = { am: 'AM', afternoon: 'AFT', pm: 'PM' };
  const entries = [];

  // Slot meds (each slot is a group keyed by slot name so we can inject edit form after it)
  SLOT_ORDER.forEach(slot => {
    const slotData = medSlots[slot];
    if (!slotData?.time) return;
    // Resolve meds from snapshot or live list (compat with slot-med-snapshot plan)
    const medIds = slotData.meds ?? allMeds.filter(m => (m.slots ?? []).includes(slot)).map(m => m.id);
    const skipped = slotData.skipped ?? [];
    const extras  = slotData.extras  ?? [];
    medIds.filter(id => !skipped.includes(id)).forEach(id => {
      const med = allMeds.find(m => m.id === id) ?? { id, name: id };
      entries.push({ time: slotData.time, name: med.name, dose: (med.slot_doses ?? {})[slot] ?? '', kind: 'slot', slot, id });
    });
    extras.forEach(ex => {
      const med = allMeds.find(m => m.id === ex.medication_id) ?? { name: ex.medication_id };
      entries.push({ time: slotData.time, name: med.name, dose: ex.dose, kind: 'slot', slot, id: ex.medication_id });
    });
  });

  // Reminder meds
  Object.entries(medRems).forEach(([medId, rem]) => {
    if (!rem?.time) return;
    const med = allMeds.find(m => m.id === medId) ?? { name: medId };
    entries.push({ time: rem.time, name: med.name, dose: rem.dose ?? '', kind: 'reminder', id: medId });
  });

  // PRN doses (today only)
  const today = Data.today();
  const todayStart = new Date(today + 'T00:00:00').getTime();
  prnDoses
    .filter(d => new Date(d.iso_timestamp).getTime() >= todayStart)
    .forEach(d => {
      const med = allMeds.find(m => m.id === d.medication_id) ?? { name: d.medication_id };
      entries.push({ time: fmt12h(d.iso_timestamp.slice(11,16)), name: med.name, dose: d.dose ?? '', kind: 'prn', id: d.id });
    });

  // Sort: time ASC, then name ASC
  entries.sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name));

  const total = entries.length;
  if (!total) {
    return `<button class="meds-logged-trigger">
      <span class="meds-logged-headline">No Meds Logged Yet</span>
      <span class="meds-logged-chevron">▾</span>
    </button>`;
  }

  // Pre-build slot edit form HTML (if a slot edit is open)
  const slotEditHtml = editSlot
    ? (() => {
        const slotMeds = allMeds.filter(m => (m.slots ?? []).includes(editSlot));
        const slotData = medSlots[editSlot] ?? { time: null, skipped: [], extras: [] };
        return `<div class="meds-log-inline-edit">${renderSlotEditForm(editSlot, slotMeds, slotData)}</div>`;
      })()
    : '';

  // Pre-build PRN edit form HTML (check the real variable name for PRN edit state in the file)
  // prnEditId is the existing state variable that holds the dose id being edited
  const prnEditHtml = prnEditId
    ? `<div class="meds-log-inline-edit">${renderPrnEditCard(prnEditId)}</div>`
    : '';

  // Group by time, then render rows + inject edit forms in context
  const groups = {};
  entries.forEach(e => {
    (groups[e.time] = groups[e.time] ?? []).push(e);
  });

  const listHtml = Object.entries(groups).map(([time, grpEntries]) => {
    const rows = grpEntries.map(e => {
      const badgeClass = e.kind === 'prn' ? 'meds-log-badge--prn' : e.kind === 'reminder' ? 'meds-log-badge--rem' : '';
      const badgeText  = e.kind === 'prn' ? 'PRN' : e.kind === 'reminder' ? 'REM' : SLOT_SHORT[e.slot] ?? '';
      const editAttr   = e.kind === 'slot'     ? `data-edit-logged-slot="${escHtml(e.slot)}"` :
                         e.kind === 'prn'       ? `data-edit-logged-prn="${escHtml(e.id)}"` :
                                                  `data-edit-logged-rem="${escHtml(e.id)}"`;
      // Highlight the row that has its edit form open
      const isEditing  = (e.kind === 'slot' && editSlot === e.slot) ||
                         (e.kind === 'prn'  && prnEditId === e.id);
      return `<div class="meds-log-entry ${isEditing ? 'meds-log-entry--editing' : ''}">
        <span class="meds-log-name">${escHtml(e.name)}</span>
        ${e.dose ? `<span class="meds-log-dose">${escHtml(e.dose)}</span>` : ''}
        <span class="meds-log-badge ${badgeClass}">${badgeText}</span>
        <button class="meds-log-edit" ${editAttr}>${isEditing ? 'Close' : 'Edit'}</button>
      </div>`;
    }).join('');

    // Inject slot edit form after ALL rows of that slot's group (slot edit affects the whole slot)
    const slotInThisGroup = grpEntries.find(e => e.kind === 'slot' && editSlot === e.slot);
    // Only inject once — after the last entry in the group if any entry triggered edit
    const injectSlotEdit = slotInThisGroup && grpEntries[grpEntries.length - 1] === grpEntries.filter(e => e.kind === 'slot' && e.slot === editSlot).at(-1)
      ? slotEditHtml : '';

    // Inject PRN edit form directly after the specific PRN dose row
    const prnRows = grpEntries.map(e => {
      if (e.kind === 'prn' && prnEditId === e.id) return prnEditHtml;
      return '';
    }).join('');

    return `<div class="meds-log-group-time">${fmt12h(time)}</div>${rows}${injectSlotEdit}${prnRows}`;
  }).join('');

  // Auto-expand when an edit form is open so the user can see it
  const forceOpen = !!(editSlot || prnEditId);
  const isOpen = loggedListOpen || forceOpen;

  return `
    <button class="meds-logged-trigger" id="meds-logged-trigger">
      <span class="meds-logged-headline">${total} Med${total !== 1 ? 's' : ''} Logged Today</span>
      <span class="meds-logged-chevron ${isOpen ? 'meds-logged-chevron--open' : ''}">▾</span>
    </button>
    <div class="meds-logged-list ${isOpen ? '' : 'meds-logged-list--hidden'}">
      ${listHtml}
    </div>`;
}
```

Add `let loggedListOpen = false;` to the module state block. Reset it in `setDate()`.

> **Note to implementer:** Check the actual name of the PRN edit state variable in the existing file (search for where `renderPrnEditCard` is called — the variable holding the dose id will be nearby). Replace `prnEditId` in the code above with whatever that variable is actually called.

### Step 2 — Wire Zone 4 events in wireEvents()

Edit buttons now open the existing edit functions, which set their state and call `render()`. Because `renderLoggedToday()` checks the same state to inject the form inline, and auto-expands when an edit is open, no extra wiring is needed beyond calling the existing functions.

```js
    // Zone 4: logged today toggle
    el.querySelector('#meds-logged-trigger')?.addEventListener('click', () => {
      loggedListOpen = !loggedListOpen;
      render();
    });

    // Zone 4: edit buttons — open existing edit forms (they render inline in Zone 4)
    el.querySelectorAll('[data-edit-logged-slot]').forEach(btn => {
      btn.addEventListener('click', () => {
        // If already editing this slot, close it; otherwise open it
        if (editSlot === btn.dataset.editLoggedSlot) {
          editSlot = null;
          render();
        } else {
          openSlotEdit(btn.dataset.editLoggedSlot);
        }
      });
    });
    el.querySelectorAll('[data-edit-logged-prn]').forEach(btn => {
      btn.addEventListener('click', () => openPrnEdit(btn.dataset.editLoggedPrn));
    });
    el.querySelectorAll('[data-edit-logged-rem]').forEach(btn => {
      btn.addEventListener('click', () => openReminderEdit(btn.dataset.editLoggedRem));
    });
```

> **Note:** Check the actual function names for PRN and reminder edit in the existing file (`openPrnEdit` / `openReminderEdit` may differ) and substitute accordingly.

### Step 3 — Remove old render functions that are now dead code

Delete the bodies of (or comment out) these functions that are no longer called:
- `renderSlotButton()`
- `renderSlotLogged()`
- `renderRemindersSection()`
- `renderPrnSection()` (replaced by `renderPrnTrigger()` — keep `renderPrnLogForm`, `renderPrnDoseCard`, `renderPrnEditCard`)

Keep the function stubs with a comment if unsure, but remove their render output from `render()`.

### Step 4 — Add Zone 4 CSS

```css
/* ── Zone 4: Logged Today ── */
.meds-logged-trigger {
  width: 100%;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--clr-text);
  font-family: inherit;
}
.meds-logged-headline { font-size: 0.95rem; font-weight: 600; flex: 1; text-align: left; }
.meds-logged-chevron { font-size: 0.75rem; color: var(--clr-text-2); transition: transform 0.2s; }
.meds-logged-chevron--open { transform: rotate(180deg); }
.meds-logged-list { margin-top: 10px; }
.meds-logged-list--hidden { display: none; }

.meds-log-group-time {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--clr-text-3);
  padding: 8px 0 4px;
}
.meds-log-group-time:first-child { padding-top: 0; }
.meds-log-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  background: var(--clr-surface-2);
  border-radius: 6px;
  margin-bottom: 2px;
}
.meds-log-name  { flex: 1; font-size: 0.85rem; font-weight: 500; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meds-log-dose  { font-size: 0.78rem; color: var(--clr-text-2); flex-shrink: 0; }
.meds-log-badge {
  font-size: 0.67rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding: 2px 7px;
  border-radius: 10px;
  background: var(--clr-accent-dim);
  color: var(--clr-accent);
  text-transform: uppercase;
  white-space: nowrap;
  flex-shrink: 0;
}
.meds-log-badge--prn { background: color-mix(in srgb, var(--clr-warn) 15%, transparent); color: var(--clr-warn); }
.meds-log-badge--rem { background: color-mix(in srgb, #4fc3f7 13%, transparent); color: #4fc3f7; }
.meds-log-edit {
  background: none;
  border: 1px solid var(--clr-border);
  border-radius: 5px;
  color: var(--clr-text-2);
  font-size: 0.72rem;
  padding: 3px 8px;
  cursor: pointer;
  font-family: inherit;
  flex-shrink: 0;
}
/* Row with its edit form open — subtle left accent */
.meds-log-entry--editing {
  border-left: 2px solid var(--clr-accent);
  padding-left: 8px;
}
/* Wrapper that holds an edit form injected inline below an entry */
.meds-log-inline-edit {
  margin: 4px 0 6px;
  border-left: 2px solid var(--clr-accent);
  padding-left: 8px;
}
```

### Step 5 — Manual verify

1. Log a slot and a PRN med. The "Meds Logged Today" headline should show the correct count.
2. Tap the headline → list expands showing entries grouped by time with correct badges ✓
3. Tap [Edit] on a slot entry → slot edit form opens ✓
4. Tap [Edit] on a PRN entry → PRN edit form opens ✓
5. Tap headline again → list collapses ✓

### Step 6 — Commit

```bash
git add js/medications.js css/styles.css
git commit -m "feat(meds): Zone 4 Meds Logged Today, remove legacy slot/reminder renderers"
```

---

## Task 5 — Version bump

**Files:**
- Modify: `js/config.js`

### Step 1 — Bump version

The slot-med-snapshot plan bumps to `2026.03.07i` and the slot-delete plan bumps to `2026.03.07j`. Change `APP_VERSION` to `'2026.03.07k'`.

### Step 2 — Commit and push

```bash
git add js/config.js
git commit -m "chore: bump version to 2026.03.07k"
git push
```

---

## Files Changed Summary

| File | Change |
|---|---|
| `index.html` | Add `onclick="App.toggleSection('section-meds')"` to meds header |
| `js/meds-manage.js` | Add emoji field to edit form + saveMed() |
| `js/medications.js` | Replace render() body; add renderTodaysDoses(), renderPrnTrigger(), renderDosingWindows(), renderLoggedToday(); update wireEvents(); add pickingSlot, pickingReminder, prnPanelOpen, loggedListOpen state; remove legacy renderSlotButton, renderSlotLogged, renderRemindersSection |
| `css/styles.css` | Add styles for all 4 zones |
| `js/config.js` | Version bump to 2026.03.07k |
