# Medications Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the PRN-only medication tracker with a unified system supporting scheduled AM/Afternoon/PM batch-logging, as-needed quick-log, and per-med reminder buttons — all managed from a dedicated Medications screen accessible from Settings and Health Log.

**Architecture:** Extend the existing `medications{}` dict with new fields (`slots`, `slot_doses`, `med_reminder`, `recommended_dose`) — purely additive, no migration needed. Add `med_slots` and `med_reminders` to each day object. Create a new `js/meds-manage.js` full-screen overlay (same pattern as `#view-issues`) for medication management. Rewrite `js/medications.js` for the Today-tab daily logging section (AM/Afternoon/PM/PRN/Reminders). Treatment medications and the Treatments tab are left completely untouched.

**Tech Stack:** Vanilla JS IIFE modules, HTML innerHTML templating, CSS custom properties, existing dark/light theme tokens. No new dependencies.

---

## What Changes, What Stays

| Item | Change |
|---|---|
| `medications{}` dict | Extended (additive fields only) |
| `treatment_medications{}` dict | **Untouched** |
| Treatments tab | **Untouched** |
| `prn_doses[]` per day | **Untouched** — PRN log format unchanged |
| `medications_taken[]` per day | Ignored (was unused) |
| `js/medications.js` | **Full rewrite** — today-tab daily logging |
| `js/meds-manage.js` | **New file** — full-screen management overlay |
| `js/settings.js` | Replace buildPrnMedsCard with link to meds-manage |
| `js/health-log.js` | Add "Medications" link button to header |
| `js/app.js` | Init MedsManage; popstate handler |
| `index.html` | New #section-meds; new #view-meds-manage overlay; move PRN out of Symptoms |
| `css/styles.css` | New styles for all the above |

---

## New Data Schema

### Extended `medications{}` entry (all new fields are optional with safe defaults)

```json
"<uuid>": {
  "id":                 "<uuid>",
  "name":               "Metformin",
  "active":             true,
  "as_needed":          false,
  "slots":              ["am", "pm"],
  "slot_doses":         { "am": "500mg", "pm": "1000mg" },
  "med_reminder":       false,
  "recommended_dose":   "500–1000mg/day",
  "min_interval_hours": null,
  "max_daily_doses":    null,
  "notes":              ""
}
```

- `slots`: array of `"am"` | `"afternoon"` | `"pm"` (can be combined with `as_needed: true`)
- `slot_doses`: default dose string per slot (shown in edit form, logged in history)
- `med_reminder`: appears as a standalone reminder button in the Today tab (for meds like nasal sprays that need individual confirmation, not batch logging)
- `recommended_dose`: informational string, shown in the management screen
- `min_interval_hours` + `max_daily_doses`: PRN cooldown/limit fields (unchanged)

### New `med_slots` per day

```json
"med_slots": {
  "am":        { "time": "08:32", "skipped": ["<med_id>"], "extras": [] },
  "afternoon": { "time": null,    "skipped": [],            "extras": [] },
  "pm":        { "time": null,    "skipped": [],            "extras": [] }
}
```

- `time`: `"HH:MM"` when the batch was logged, `null` if not yet logged today
- `skipped`: med IDs that are normally in this slot but were not taken today
- `extras`: `[{ medication_id, dose }]` — meds added to this slot outside their usual schedule

Effective meds for a slot = `(all meds with slot in their slots[]) MINUS skipped PLUS extras`.

### New `med_reminders` per day

```json
"med_reminders": {
  "<med_id>": "07:45"
}
```

Key = medication ID, value = `"HH:MM"` when taken, absent key = not yet taken today.

---

## Today-Tab UI (Medications section)

The current Symptoms section contains an embedded `prn-sublabel` + `#prn-list`. This moves to a dedicated `#section-meds` section.

```
┌─ Medications ─────────────────────────────────────────┐
│                                                        │
│  AM Meds          [ Log AM meds ]        (if not done) │
│  AM Meds          ● 8:32am          (tap to edit)      │
│                                                        │
│  Afternoon Meds   [ Log Afternoon meds ] (if not done) │
│  PM Meds          [ Log PM meds ]        (if not done) │
│                                                        │
│  As-Needed Meds                                        │
│  [ Ibuprofen ] [ Cetirizine ] [ Melatonin ] [ ... ]   │
│  Other: [ dropdown ▾ ] [ + Log ]                       │
│  (recent PRN dose cards listed below)                  │
│                                                        │
│  Reminders                                             │
│  Flonase      ✓ 7:45am                                 │
│  Astepro      [ Mark taken ]                           │
│                                                        │
└────────────────────────────────────────────────────────┘
```

Slot rows are only shown if at least one active med has that slot configured.
As-Needed section only shown if at least one active `as_needed: true` med exists.
Reminders section only shown if at least one active `med_reminder: true` med exists.

### Slot edit sheet (tap logged slot row)

```
AM Meds — Edit
──────────────────────────────
Time:         [ 08:32 ]
──────────────────────────────
☑ Metformin       500mg (editable)
☑ Vitamin D       2000IU
☐ Fish Oil        (skipped today)
──────────────────────────────
+ Add another med  [ Med name ▾ ] [ Dose ] [ Add ]
──────────────────────────────
[ Cancel ]              [ Save ]
```

---

## Medications Management Screen

Full-screen overlay, same visual pattern as `#view-issues`. Accessible via:
- Settings card "Manage medications →" link
- Health Log header button

```
← Back            Medications            [ + Add ]
──────────────────────────────────────────────────
Metformin
  AM · PM · 500mg / 1000mg

Vitamin D
  AM · 2000IU

Ibuprofen
  As Needed · 8h interval · max 3/day

Flonase
  Reminder

[ archived meds section, collapsed ]
──────────────────────────────────────────────────
```

Each row tappable → opens edit form inline (same panel). Edit form fields:

- Name (text)
- Active (checkbox)
- Slots: AM / Afternoon / PM checkboxes (multi-select)
- Dose per active slot (text input, shown only when slot checked)
- As-Needed checkbox
- Min interval hours (shown if as_needed)
- Max daily doses (shown if as_needed; if blank = no tracking)
- Med Reminder toggle
- Recommended dose (informational text)
- Notes

---

## Task 1: Schema updates — data.js

**File:** `js/data.js`

**Step 1: Add new day fields to `getDay()` defaults**

Find the `getDay()` function's default object and add alongside `prn_doses`:

```js
med_slots: {
  am:        { time: null, skipped: [], extras: [] },
  afternoon: { time: null, skipped: [], extras: [] },
  pm:        { time: null, skipped: [], extras: [] },
},
med_reminders: {},
```

**Step 2: Add new medication fields to SCHEMA_DEFAULTS**

In `SCHEMA_DEFAULTS.settings` (or wherever medication defaults are set), document the new fields. Since medications are stored in `data.medications{}` as individual objects (not in SCHEMA_DEFAULTS), this is handled at the creation point in meds-manage.js (Task 2). Just verify `data.medications` defaults to `{}` — it already does.

**Step 3: Verify**

Open browser console → `Data.getDay(Data.today()).med_slots` → should return `{ am: { time: null, skipped: [], extras: [] }, ... }`.

**Step 4: Commit**

```bash
git add js/data.js
git commit -m "feat(data): add med_slots and med_reminders to day schema"
```

---

## Task 2: Medications Management screen — meds-manage.js (new file)

**File:** `js/meds-manage.js` (new)

This module manages the full-screen `#view-meds-manage` overlay.

**Step 1: Create the module skeleton**

```js
/**
 * meds-manage.js — Medications Management Screen
 *
 * Full-screen overlay (#view-meds-manage) for adding, editing, and archiving
 * medications. Accessible from Settings and Health Log.
 *
 * Public API: { open(returnTab), close(), exit() }
 */
const MedsManage = (() => {

  let _returnTab   = 'today';   // tab to return to on close
  let _editId      = null;      // med id currently being edited, null = list view
  let _showArchive = false;     // show archived meds toggle

  // ── Open / Close ──────────────────────────────────────────────────────────

  function open(returnTab = 'today') {
    _returnTab = returnTab;
    _editId    = null;
    history.pushState({ ht: 'meds-manage', returnTab }, '');
    document.getElementById('view-meds-manage').hidden = false;
    render();
  }

  function close() {
    if (history.state?.ht === 'meds-manage') {
      history.back(); // triggers popstate → exit()
    } else {
      exit();
      if (typeof App !== 'undefined') App.switchTab(_returnTab);
    }
  }

  function exit() {
    document.getElementById('view-meds-manage').hidden = true;
    _editId = null;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  function render() {
    const content = document.getElementById('view-meds-manage-content');
    if (!content) return;
    content.innerHTML = _editId ? renderEditForm() : renderList();
    wireEvents();
  }

  function renderList() {
    const meds = getAllMeds();
    const active   = meds.filter(m => m.active);
    const archived = meds.filter(m => !m.active);

    const medRow = m => {
      const chips = [];
      if (m.slots?.includes('am'))        chips.push(`AM${m.slot_doses?.am ? ' · ' + escHtml(m.slot_doses.am) : ''}`);
      if (m.slots?.includes('afternoon')) chips.push(`Afternoon${m.slot_doses?.afternoon ? ' · ' + escHtml(m.slot_doses.afternoon) : ''}`);
      if (m.slots?.includes('pm'))        chips.push(`PM${m.slot_doses?.pm ? ' · ' + escHtml(m.slot_doses.pm) : ''}`);
      if (m.as_needed) {
        let prn = 'As Needed';
        if (m.min_interval_hours) prn += ` · ${m.min_interval_hours}h interval`;
        if (m.max_daily_doses)    prn += ` · max ${m.max_daily_doses}/day`;
        chips.push(prn);
      }
      if (m.med_reminder)         chips.push('Reminder');

      return `<div class="mmg-med-row" data-med-id="${escHtml(m.id)}">
        <div class="mmg-med-name">${escHtml(m.name)}</div>
        <div class="mmg-med-chips">${chips.map(c => `<span class="mmg-chip">${c}</span>`).join('')}</div>
      </div>`;
    };

    let html = active.map(medRow).join('');
    if (!active.length) {
      html = `<p class="mmg-empty">No medications configured yet. Tap + Add to get started.</p>`;
    }

    if (archived.length) {
      html += `<button class="mmg-archive-toggle" id="mmg-archive-toggle">
        ${_showArchive ? '▾' : '▸'} Archived (${archived.length})
      </button>`;
      if (_showArchive) {
        html += `<div class="mmg-archived">${archived.map(medRow).join('')}</div>`;
      }
    }

    return html;
  }

  function renderEditForm() {
    const isNew = _editId === '__new__';
    const med = isNew ? {} : (getAllMeds().find(m => m.id === _editId) ?? {});

    const slots = med.slots ?? [];
    const slotDoses = med.slot_doses ?? {};

    const slotRow = (key, label) => `
      <label class="mmg-slot-label">
        <input type="checkbox" class="mmg-slot-check" data-slot="${key}"
               ${slots.includes(key) ? 'checked' : ''}>
        ${label}
      </label>
      <div class="mmg-slot-dose-row${slots.includes(key) ? '' : ' mmg-slot-dose-row--hidden'}"
           id="mmg-dose-row-${key}">
        <span class="mmg-field-label">Default dose</span>
        <input type="text" class="mmg-text-input" id="mmg-dose-${key}"
               value="${escHtml(slotDoses[key] ?? '')}" placeholder="e.g. 500mg" maxlength="40">
      </div>`;

    return `
      <div class="mmg-form">
        <button class="mmg-form-back" id="mmg-form-back">← Back</button>
        <h3 class="mmg-form-title">${isNew ? 'Add Medication' : 'Edit Medication'}</h3>

        <label class="mmg-field-label" for="mmg-name">Name</label>
        <input type="text" class="mmg-text-input" id="mmg-name"
               value="${escHtml(med.name ?? '')}" placeholder="Medication name" maxlength="80">

        <div class="mmg-section-label">Scheduled Slots</div>
        ${slotRow('am',        'AM')}
        ${slotRow('afternoon', 'Afternoon')}
        ${slotRow('pm',        'PM')}

        <div class="mmg-section-label">As-Needed</div>
        <label class="mmg-slot-label">
          <input type="checkbox" id="mmg-as-needed" ${med.as_needed ? 'checked' : ''}>
          As needed / PRN
        </label>
        <div class="mmg-prn-fields${med.as_needed ? '' : ' mmg-slot-dose-row--hidden'}" id="mmg-prn-fields">
          <label class="mmg-field-label" for="mmg-interval">Min interval (hours)</label>
          <input type="number" class="mmg-text-input" id="mmg-interval" min="0" step="0.5"
                 value="${med.min_interval_hours ?? ''}" placeholder="e.g. 8">
          <label class="mmg-field-label" for="mmg-max-doses">Max daily doses (blank = no limit)</label>
          <input type="number" class="mmg-text-input" id="mmg-max-doses" min="1" step="1"
                 value="${med.max_daily_doses ?? ''}" placeholder="e.g. 3">
        </div>

        <div class="mmg-section-label">Other</div>
        <label class="mmg-slot-label">
          <input type="checkbox" id="mmg-reminder" ${med.med_reminder ? 'checked' : ''}>
          Med Reminder (shows individual confirm button in Today tab)
        </label>
        <label class="mmg-field-label" for="mmg-rec-dose">Recommended dose (informational)</label>
        <input type="text" class="mmg-text-input" id="mmg-rec-dose"
               value="${escHtml(med.recommended_dose ?? '')}" placeholder="e.g. 500–1000mg/day" maxlength="80">
        <label class="mmg-field-label" for="mmg-notes">Notes</label>
        <input type="text" class="mmg-text-input" id="mmg-notes"
               value="${escHtml(med.notes ?? '')}" placeholder="Optional" maxlength="200">

        <div class="mmg-form-actions">
          ${!isNew ? `<button class="mmg-archive-btn" id="mmg-archive-btn">
            ${med.active ? 'Archive' : 'Restore'}
          </button>` : ''}
          <span style="flex:1"></span>
          <button class="mmg-save-btn" id="mmg-save-btn">
            ${isNew ? 'Add' : 'Save'}
          </button>
        </div>
      </div>`;
  }

  // ── Event wiring ──────────────────────────────────────────────────────────

  function wireEvents() {
    const content = document.getElementById('view-meds-manage-content');

    // List: tap a med row to edit
    content.querySelectorAll('.mmg-med-row[data-med-id]').forEach(row => {
      row.addEventListener('click', () => { _editId = row.dataset.medId; render(); });
    });

    // Archive toggle
    content.querySelector('#mmg-archive-toggle')?.addEventListener('click', () => {
      _showArchive = !_showArchive;
      render();
    });

    // Form: back
    content.querySelector('#mmg-form-back')?.addEventListener('click', () => {
      _editId = null;
      render();
    });

    // Form: slot checkboxes show/hide dose rows
    content.querySelectorAll('.mmg-slot-check').forEach(chk => {
      chk.addEventListener('change', () => {
        const row = document.getElementById(`mmg-dose-row-${chk.dataset.slot}`);
        if (row) row.classList.toggle('mmg-slot-dose-row--hidden', !chk.checked);
      });
    });

    // Form: as-needed toggle shows PRN fields
    content.querySelector('#mmg-as-needed')?.addEventListener('change', e => {
      document.getElementById('mmg-prn-fields')?.classList.toggle('mmg-slot-dose-row--hidden', !e.target.checked);
    });

    // Form: save
    content.querySelector('#mmg-save-btn')?.addEventListener('click', saveMed);

    // Form: archive/restore
    content.querySelector('#mmg-archive-btn')?.addEventListener('click', toggleArchive);
  }

  // ── Save / Archive ────────────────────────────────────────────────────────

  function saveMed() {
    const content = document.getElementById('view-meds-manage-content');
    const name = content.querySelector('#mmg-name')?.value.trim();
    if (!name) { content.querySelector('#mmg-name')?.focus(); return; }

    const slots     = [];
    const slotDoses = {};
    ['am', 'afternoon', 'pm'].forEach(key => {
      if (content.querySelector(`.mmg-slot-check[data-slot="${key}"]`)?.checked) {
        slots.push(key);
        const dose = content.querySelector(`#mmg-dose-${key}`)?.value.trim();
        if (dose) slotDoses[key] = dose;
      }
    });

    const asNeeded   = content.querySelector('#mmg-as-needed')?.checked ?? false;
    const interval   = parseFloat(content.querySelector('#mmg-interval')?.value) || null;
    const maxDoses   = parseInt(content.querySelector('#mmg-max-doses')?.value, 10) || null;
    const reminder   = content.querySelector('#mmg-reminder')?.checked ?? false;
    const recDose    = content.querySelector('#mmg-rec-dose')?.value.trim() ?? '';
    const notes      = content.querySelector('#mmg-notes')?.value.trim() ?? '';

    const meds = Data.getData().medications ?? (Data.getData().medications = {});
    const isNew = _editId === '__new__';

    if (isNew) {
      const id = crypto.randomUUID();
      meds[id] = { id, name, active: true, slots, slot_doses: slotDoses,
                   as_needed: asNeeded, min_interval_hours: interval,
                   max_daily_doses: maxDoses, med_reminder: reminder,
                   recommended_dose: recDose, notes };
    } else {
      const med = meds[_editId];
      if (med) {
        Object.assign(med, { name, slots, slot_doses: slotDoses,
          as_needed: asNeeded, min_interval_hours: interval,
          max_daily_doses: maxDoses, med_reminder: reminder,
          recommended_dose: recDose, notes });
      }
    }

    _editId = null;
    render();
    scheduleSave();
    // Refresh today-tab medications section
    if (typeof Medications !== 'undefined') Medications.render();
  }

  function toggleArchive() {
    const med = getAllMeds().find(m => m.id === _editId);
    if (med) med.active = !med.active;
    _editId = null;
    render();
    scheduleSave();
    if (typeof Medications !== 'undefined') Medications.render();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function getAllMeds() {
    return Object.values(Data.getData().medications ?? {});
  }

  let _saveTimer = null;
  function scheduleSave() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => Data.save(), 1200);
  }

  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  return { open, close, exit, render,
           _openNew: () => { _editId = '__new__'; render(); } };
})();
```

**Step 2: Verify module loads**

Add `<script src="js/meds-manage.js"></script>` to index.html (before closing body). Open console → `MedsManage` → should be defined.

**Step 3: Commit**

```bash
git add js/meds-manage.js
git commit -m "feat(meds-manage): new medications management module"
```

---

## Task 3: index.html — overlay, today-tab section, script tag

**File:** `index.html`

**Step 1: Add `#view-meds-manage` overlay**

Just before the closing `</body>` tag (same location as `#view-issues`), add:

```html
<!-- ── Medications Management Screen ─────────────────────────────────────── -->
<div id="view-meds-manage" class="view-meds-manage" hidden>
  <div class="view-meds-manage-header">
    <button class="view-meds-manage-back-btn" type="button"
            onclick="MedsManage.close()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
           stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
      Back
    </button>
    <span class="view-meds-manage-title">Medications</span>
    <button class="view-meds-manage-add-btn" type="button"
            onclick="MedsManage._openNew()">+ Add</button>
  </div>
  <div id="view-meds-manage-content" class="view-meds-manage-content"></div>
</div>
```

**Step 2: Replace the Symptoms-embedded PRN sublabel with a dedicated Medications section**

Find in index.html:
```html
        <!-- As-Needed Meds sub-section — populated by medications.js -->
        <div class="prn-sublabel">As-Needed Meds</div>
        <div id="prn-list"></div>
        <div id="prn-save-status" class="save-status" aria-live="polite"></div>
```

Remove those three lines from inside the Symptoms section.

Then add a new `<section>` for Medications **after** the closing `</section>` of Symptoms (before the next section or before `</main>`). Use the same card structure as other sections:

```html
      <!-- ── Medications ─────────────────────────────────────────────────── -->
      <section class="card today-card" id="section-meds">
        <div class="section-header" id="meds-section-header">
          <h2 class="section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">
              <path d="M12 22a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"/>
              <path d="M8 12h8M12 8v8"/>
            </svg>
            Medications
          </h2>
          <span id="meds-badge" class="section-badge" aria-live="polite"></span>
        </div>
        <div id="meds-content"></div>
        <div id="meds-save-status" class="save-status" aria-live="polite"></div>
      </section>
```

**Step 3: Add script tag**

In the scripts block at the bottom, add after `js/medications.js`:

```html
  <script src="js/meds-manage.js"></script>
```

**Step 4: Verify page loads**

Open the app — no JS errors, Medications section visible on Today tab (empty for now), Symptoms section no longer has the PRN sublabel.

**Step 5: Commit**

```bash
git add index.html
git commit -m "feat(html): add meds-manage overlay and medications section on today tab"
```

---

## Task 4: Rewrite js/medications.js — Today-tab daily logging

**File:** `js/medications.js`

This module renders into `#meds-content` and handles all daily logging: scheduled slots, PRN quick-log, and Med Reminders.

**Step 1: Write the new module**

Replace the entire contents of `js/medications.js` with:

```js
/**
 * medications.js — Daily Medications Logging (Today tab)
 *
 * Renders into #meds-content.
 * Handles:
 *   - Scheduled batch slots: AM / Afternoon / PM
 *     One-tap log → timestamps all meds in that slot
 *     Tap logged entry → edit sheet (change time, skip/add meds)
 *   - As-Needed / PRN: top-N quick buttons + dropdown + dose cards
 *   - Med Reminders: individual "Mark taken" buttons
 *
 * Data written to Data.getDay(date):
 *   .med_slots   { am, afternoon, pm } — each { time, skipped[], extras[] }
 *   .med_reminders { [med_id]: "HH:MM" }
 *   .prn_doses   [ { id, medication_id, iso_timestamp, dose, notes } ]
 */
const Medications = (() => {

  const SLOT_ORDER  = ['am', 'afternoon', 'pm'];
  const SLOT_LABELS = { am: 'AM Meds', afternoon: 'Afternoon Meds', pm: 'PM Meds' };
  const PRN_QUICK_COUNT = 4;   // top N as-needed meds shown as quick-tap buttons

  let currentDate   = null;
  let tickTimer     = null;

  // Slot edit state
  let editSlot      = null;   // 'am' | 'afternoon' | 'pm' | null
  let editTime      = '';
  let editSkipped   = [];     // med IDs skipped in edit
  let editExtras    = [];     // { medication_id, dose } added in edit
  let editExtraMedId = '';
  let editExtraDose  = '';

  // PRN log form state
  let prnFormOpen   = false;
  let prnMedId      = '';
  let prnDose       = '';
  let prnNote       = '';
  let prnTime       = '';
  let prnEditDoseId = null;
  let prnETime      = '';
  let prnEDose      = '';
  let prnENote      = '';

  let saveTimer     = null;

  // ── Public API ─────────────────────────────────────────────────────────────

  function init() {
    currentDate = DateNav.getDate();
    render();
    startTick();
  }

  function setDate(date) {
    currentDate   = date;
    editSlot      = null;
    prnFormOpen   = false;
    prnEditDoseId = null;
    render();
  }

  function startTick() {
    clearInterval(tickTimer);
    tickTimer = setInterval(render, 30_000);
  }

  // ── Main render ────────────────────────────────────────────────────────────

  function render() {
    const el = document.getElementById('meds-content');
    if (!el) return;

    const allMeds     = getActiveMeds();
    const slotMeds    = slotName => allMeds.filter(m => (m.slots ?? []).includes(slotName));
    const prnMeds     = allMeds.filter(m => m.as_needed);
    const reminderMeds = allMeds.filter(m => m.med_reminder);

    const dayData    = Data.getDay(currentDate);
    const medSlots   = dayData.med_slots   ?? defaultSlots();
    const medRems    = dayData.med_reminders ?? {};

    let html = '';

    // ── Scheduled slots ──
    SLOT_ORDER.forEach(slot => {
      const meds = slotMeds(slot);
      if (!meds.length) return;
      const slotData = medSlots[slot] ?? { time: null, skipped: [], extras: [] };

      if (editSlot === slot) {
        html += renderSlotEditForm(slot, meds, slotData);
      } else if (slotData.time) {
        html += renderSlotLogged(slot, slotData, meds);
      } else {
        html += renderSlotButton(slot);
      }
    });

    // ── PRN / As-Needed ──
    if (prnMeds.length) {
      html += renderPrnSection(prnMeds, dayData.prn_doses ?? []);
    }

    // ── Med Reminders ──
    if (reminderMeds.length) {
      html += renderRemindersSection(reminderMeds, medRems);
    }

    if (!html) {
      html = `<p class="meds-empty">No medications configured.
        <button class="meds-config-link" onclick="MedsManage.open('today')">Set up medications →</button>
      </p>`;
    }

    el.innerHTML = html;
    wireEvents(el);
    updateBadge(allMeds, medSlots, medRems, dayData.prn_doses ?? []);
  }

  // ── Scheduled slot — not yet logged ───────────────────────────────────────

  function renderSlotButton(slot) {
    return `<div class="meds-slot-row meds-slot-row--empty">
      <button class="meds-slot-log-btn" data-log-slot="${slot}">
        Log ${SLOT_LABELS[slot]}
      </button>
    </div>`;
  }

  // ── Scheduled slot — logged (tappable) ────────────────────────────────────

  function renderSlotLogged(slot, slotData, allSlotMeds) {
    const skipped = slotData.skipped ?? [];
    const extras  = slotData.extras  ?? [];
    const taken   = allSlotMeds.filter(m => !skipped.includes(m.id));
    const skipCount  = skipped.length;
    const extraCount = extras.length;
    let meta = '';
    if (skipCount)  meta += ` · ${skipCount} skipped`;
    if (extraCount) meta += ` · ${extraCount} added`;
    return `<div class="meds-slot-row meds-slot-row--done" data-edit-slot="${slot}">
      <div class="meds-slot-done-label">${SLOT_LABELS[slot]}</div>
      <div class="meds-slot-done-time">✓ ${escHtml(slotData.time)}${meta}</div>
    </div>`;
  }

  // ── Slot edit form ─────────────────────────────────────────────────────────

  function renderSlotEditForm(slot, allSlotMeds, slotData) {
    const meds    = allSlotMeds;
    const skipped = editSkipped;
    const extras  = editExtras;

    const medRows = meds.map(m => {
      const isTaken = !skipped.includes(m.id);
      const defDose = (m.slot_doses ?? {})[slot] ?? '';
      return `<div class="meds-edit-med-row">
        <label class="meds-edit-med-check">
          <input type="checkbox" data-check-med="${escHtml(m.id)}" ${isTaken ? 'checked' : ''}>
          ${escHtml(m.name)}
        </label>
        <span class="meds-edit-med-dose">${escHtml(defDose)}</span>
      </div>`;
    }).join('');

    const extraRows = extras.map((ex, i) => {
      const med = getActiveMeds().find(m => m.id === ex.medication_id);
      return `<div class="meds-edit-extra-row">
        <span>${escHtml(med?.name ?? ex.medication_id)}</span>
        <span>${escHtml(ex.dose)}</span>
        <button class="meds-edit-extra-del" data-del-extra="${i}">✕</button>
      </div>`;
    }).join('');

    // Dropdown for adding extra meds (meds not normally in this slot)
    const otherMeds = getActiveMeds().filter(m => !(m.slots ?? []).includes(slot));
    const dropdownOpts = otherMeds.map(m =>
      `<option value="${escHtml(m.id)}" ${m.id === editExtraMedId ? 'selected' : ''}>${escHtml(m.name)}</option>`
    ).join('');

    return `<div class="meds-slot-edit">
      <div class="meds-slot-edit-header">${SLOT_LABELS[slot]} — Edit</div>
      <div class="meds-edit-time-row">
        <span class="meds-edit-label">Time</span>
        <input type="time" class="meds-edit-time-input" id="meds-edit-time"
               value="${escHtml(editTime)}">
      </div>
      <div class="meds-edit-med-list">${medRows}</div>
      ${extraRows ? `<div class="meds-edit-extras">${extraRows}</div>` : ''}
      ${otherMeds.length ? `<div class="meds-edit-add-extra">
        <span class="meds-edit-label">Add another</span>
        <select class="meds-edit-extra-select" id="meds-extra-med-select">
          <option value="">Select med…</option>${dropdownOpts}
        </select>
        <input type="text" class="meds-edit-extra-dose-input" id="meds-extra-dose-input"
               value="${escHtml(editExtraDose)}" placeholder="Dose (optional)" maxlength="30">
        <button class="meds-edit-add-btn" id="meds-extra-add-btn">Add</button>
      </div>` : ''}
      <div class="meds-slot-edit-actions">
        <button class="meds-edit-cancel-btn" id="meds-edit-cancel">Cancel</button>
        <button class="meds-edit-save-btn"   id="meds-edit-save">Save</button>
      </div>
    </div>`;
  }

  // ── PRN / As-Needed section ────────────────────────────────────────────────

  function renderPrnSection(prnMeds, prnDoses) {
    const todayDate = Data.today();
    let recentDoses;
    if (currentDate === todayDate) {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const yest   = Data.getDay(shiftDate(currentDate, -1)).prn_doses ?? [];
      recentDoses  = [...yest, ...prnDoses]
        .filter(d => new Date(d.iso_timestamp).getTime() > cutoff)
        .sort((a, b) => new Date(b.iso_timestamp) - new Date(a.iso_timestamp));
    } else {
      recentDoses = [...prnDoses].sort((a, b) => new Date(b.iso_timestamp) - new Date(a.iso_timestamp));
    }

    // Top N by 30-day frequency
    const topMeds   = getTopPrnMeds(prnMeds, PRN_QUICK_COUNT);
    const otherMeds = prnMeds.filter(m => !topMeds.find(t => t.id === m.id));

    const quickBtns = topMeds.map(m =>
      `<button class="meds-prn-quick-btn" data-prn-quick="${escHtml(m.id)}">${escHtml(m.name)}</button>`
    ).join('');

    const otherOpts = otherMeds.map(m =>
      `<option value="${escHtml(m.id)}">${escHtml(m.name)}</option>`
    ).join('');

    const doseCards = recentDoses.map(d => {
      if (prnEditDoseId === d.id) return renderPrnEditCard(d);
      return renderPrnDoseCard(d, recentDoses, prnMeds);
    }).join('');

    let logForm = '';
    if (prnFormOpen) {
      logForm = renderPrnLogForm(prnMeds, recentDoses);
    }

    return `<div class="meds-prn-section">
      <div class="meds-prn-label">As-Needed Meds</div>
      <div class="meds-prn-quick-row">${quickBtns}${otherMeds.length
        ? `<select class="meds-prn-other-select" id="meds-prn-other-select">
             <option value="">Other…</option>${otherOpts}
           </select>` : ''}</div>
      ${doseCards}
      ${logForm}
      <div id="meds-prn-save-status" class="save-status"></div>
    </div>`;
  }

  function renderPrnDoseCard(dose, allRecentDoses, prnMeds) {
    const med       = prnMeds.find(m => m.id === dose.medication_id)
                      ?? Object.values(Data.getData().medications ?? {}).find(m => m.id === dose.medication_id);
    if (!med) return '';
    const ts        = new Date(dose.iso_timestamp);
    const timeStr   = ts.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    const isoDate   = dose.iso_timestamp.slice(0, 10);
    const dayLabel  = isoDate === currentDate ? '' : 'yesterday · ';
    const lastDose  = allRecentDoses.find(d => d.medication_id === med.id);
    const isLast    = lastDose?.id === dose.id;
    const remaining = isLast ? cooldownRemaining(med, allRecentDoses) : 0;
    const cooling   = remaining > 0;
    const dosesIn24h = allRecentDoses.filter(d => d.medication_id === med.id).length;
    const maxDoses   = med.max_daily_doses ?? null;
    const countLabel = maxDoses ? `${dosesIn24h} of ${maxDoses}` : null;

    return `<div class="prn-card${cooling ? ' prn-card--cooling' : ''} meds-prn-dose-card"
                 data-prn-edit-dose="${escHtml(dose.id)}">
      <div class="prn-card__info">
        <div class="prn-card__name">${escHtml(med.name)}${dose.dose ? ' ' + escHtml(dose.dose) : ''}</div>
        <div class="prn-card__meta">${dayLabel}${timeStr}${dose.notes ? ' · ' + escHtml(dose.notes) : ''}</div>
      </div>
      <div class="prn-card__right">
        ${cooling && isLast ? `<span class="prn-card__countdown">⏱ ${fmtMs(remaining)}</span>` : ''}
        ${countLabel ? `<span class="prn-card__count">${escHtml(countLabel)}</span>` : ''}
        <button class="prn-card__del" data-prn-del-dose="${escHtml(dose.id)}" type="button" aria-label="Remove dose">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>`;
  }

  function renderPrnEditCard(dose) {
    const med   = (getActiveMeds().find(m => m.id === dose.medication_id)
                  ?? Object.values(Data.getData().medications ?? {}).find(m => m.id === dose.medication_id));
    const doses = med?.doses ?? [];
    const chips = doses.map(d =>
      `<button class="prn-dose-chip${d === prnEDose ? ' prn-dose-chip--active' : ''}"
               type="button" data-prn-edc="${escHtml(d)}">${escHtml(d)}</button>`
    ).join('');
    return `<div class="prn-log-form">
      <div class="prn-log-form__row">
        <span class="prn-log-form__label">Time</span>
        <input class="prn-log-form__select" type="time" id="prn-e-time"
               value="${escHtml(prnETime)}" style="max-width:120px">
      </div>
      ${chips ? `<div class="prn-log-form__row">
        <span class="prn-log-form__label">Dose</span>
        <div class="prn-dose-chips">${chips}</div>
      </div>` : ''}
      <div class="prn-log-form__row">
        <span class="prn-log-form__label">Note</span>
        <input class="prn-log-form__note" type="text" id="prn-e-note"
               value="${escHtml(prnENote)}" placeholder="Optional" maxlength="200">
      </div>
      <div class="prn-log-form__actions">
        <button class="prn-cancel-btn" style="color:var(--clr-error);border-color:var(--clr-error)"
                data-prn-delete-from-edit="${escHtml(dose.id)}">Delete</button>
        <span style="flex:1"></span>
        <button class="prn-cancel-btn" id="prn-e-cancel">Cancel</button>
        <button class="prn-log-btn"    id="prn-e-save"  data-dose-id="${escHtml(dose.id)}">Save</button>
      </div>
    </div>`;
  }

  function renderPrnLogForm(prnMeds, recentDoses) {
    if (!prnMedId && prnMeds.length) prnMedId = prnMeds[0].id;
    const med      = prnMeds.find(m => m.id === prnMedId);
    const doses    = med?.doses ?? [];
    const chips    = doses.map(d =>
      `<button class="prn-dose-chip${d === prnDose ? ' prn-dose-chip--active' : ''}"
               type="button" data-prn-fdc="${escHtml(d)}">${escHtml(d)}</button>`
    ).join('');
    const remaining  = med ? cooldownRemaining(med, recentDoses) : 0;
    const dosesIn24h = med ? recentDoses.filter(d => d.medication_id === med.id).length : 0;
    const maxWarn = med?.max_daily_doses && dosesIn24h >= med.max_daily_doses
      ? `<div class="prn-log-form__warning">⚠ Max daily doses reached (${dosesIn24h} of ${med.max_daily_doses})</div>` : '';
    const coolWarn = remaining > 0
      ? `<div class="prn-log-form__warning">⏱ Next dose recommended after ${fmtMs(remaining)}</div>` : '';
    const opts = prnMeds.map(m =>
      `<option value="${escHtml(m.id)}" ${m.id === prnMedId ? 'selected' : ''}>${escHtml(m.name)}</option>`
    ).join('');
    return `<div class="prn-log-form">
      <div class="prn-log-form__row">
        <span class="prn-log-form__label">Med</span>
        <select class="prn-log-form__select" id="prn-f-med">${opts}</select>
      </div>
      <div class="prn-log-form__row">
        <span class="prn-log-form__label">Time</span>
        <input class="prn-log-form__select" type="time" id="prn-f-time"
               value="${escHtml(prnTime)}" style="max-width:120px">
      </div>
      ${chips ? `<div class="prn-log-form__row">
        <span class="prn-log-form__label">Dose</span>
        <div class="prn-dose-chips" id="prn-f-dose-chips">${chips}</div>
      </div>` : ''}
      ${coolWarn}${maxWarn}
      <div class="prn-log-form__row">
        <span class="prn-log-form__label">Note</span>
        <input class="prn-log-form__note" type="text" id="prn-f-note"
               value="${escHtml(prnNote)}" placeholder="Optional" maxlength="200">
      </div>
      <div class="prn-log-form__actions">
        <button class="prn-cancel-btn" id="prn-f-cancel">Cancel</button>
        <button class="prn-log-btn"    id="prn-f-submit">Log</button>
      </div>
    </div>`;
  }

  // ── Med Reminders section ──────────────────────────────────────────────────

  function renderRemindersSection(reminderMeds, medRems) {
    const rows = reminderMeds.map(m => {
      const timeTaken = medRems[m.id];
      if (timeTaken) {
        return `<div class="meds-reminder-row meds-reminder-row--done">
          <span class="meds-reminder-name">${escHtml(m.name)}</span>
          <span class="meds-reminder-time">✓ ${escHtml(timeTaken)}</span>
          <button class="meds-reminder-undo" data-reminder-undo="${escHtml(m.id)}">Undo</button>
        </div>`;
      } else {
        return `<div class="meds-reminder-row">
          <span class="meds-reminder-name">${escHtml(m.name)}</span>
          <button class="meds-reminder-btn" data-reminder-take="${escHtml(m.id)}">Mark taken</button>
        </div>`;
      }
    }).join('');
    return `<div class="meds-reminders-section">
      <div class="meds-reminders-label">Reminders</div>
      ${rows}
    </div>`;
  }

  // ── Event wiring ───────────────────────────────────────────────────────────

  function wireEvents(el) {
    // Log slot buttons
    el.querySelectorAll('[data-log-slot]').forEach(btn => {
      btn.addEventListener('click', () => logSlot(btn.dataset.logSlot));
    });

    // Tap logged slot to edit
    el.querySelectorAll('[data-edit-slot]').forEach(row => {
      row.addEventListener('click', () => openSlotEdit(row.dataset.editSlot));
    });

    // Slot edit form
    if (editSlot) {
      el.querySelector('#meds-edit-time')?.addEventListener('input', e => { editTime = e.target.value; });
      el.querySelectorAll('[data-check-med]').forEach(chk => {
        chk.addEventListener('change', () => {
          const mid = chk.dataset.checkMed;
          if (chk.checked) editSkipped = editSkipped.filter(id => id !== mid);
          else if (!editSkipped.includes(mid)) editSkipped.push(mid);
        });
      });
      el.querySelectorAll('[data-del-extra]').forEach(btn => {
        btn.addEventListener('click', () => {
          editExtras.splice(+btn.dataset.delExtra, 1);
          render();
        });
      });
      el.querySelector('#meds-extra-med-select')?.addEventListener('change', e => { editExtraMedId = e.target.value; });
      el.querySelector('#meds-extra-dose-input')?.addEventListener('input', e => { editExtraDose = e.target.value; });
      el.querySelector('#meds-extra-add-btn')?.addEventListener('click', addExtra);
      el.querySelector('#meds-edit-cancel')?.addEventListener('click', () => { editSlot = null; render(); });
      el.querySelector('#meds-edit-save')?.addEventListener('click', saveSlotEdit);
    }

    // PRN quick buttons
    el.querySelectorAll('[data-prn-quick]').forEach(btn => {
      btn.addEventListener('click', () => openPrnForm(btn.dataset.prnQuick));
    });

    // PRN other select
    el.querySelector('#meds-prn-other-select')?.addEventListener('change', e => {
      if (e.target.value) { openPrnForm(e.target.value); e.target.value = ''; }
    });

    // PRN dose cards — tap to edit
    el.querySelectorAll('[data-prn-edit-dose]').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('[data-prn-del-dose]')) return;
        openPrnEdit(card.dataset.prnEditDose);
      });
    });

    // PRN dose card delete
    el.querySelectorAll('[data-prn-del-dose]').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); deletePrnDose(btn.dataset.prnDelDose); });
    });

    // PRN edit form
    if (prnEditDoseId) {
      el.querySelector('#prn-e-time')?.addEventListener('input', e => { prnETime = e.target.value; });
      el.querySelectorAll('[data-prn-edc]').forEach(btn => {
        btn.addEventListener('click', () => { prnEDose = btn.dataset.prnEdc === prnEDose ? '' : btn.dataset.prnEdc; render(); });
      });
      el.querySelector('#prn-e-note')?.addEventListener('input', e => { prnENote = e.target.value; });
      el.querySelector('#prn-e-cancel')?.addEventListener('click', () => { prnEditDoseId = null; render(); });
      el.querySelector('#prn-e-save')?.addEventListener('click', () => savePrnEdit(el.querySelector('#prn-e-save').dataset.doseId));
      el.querySelectorAll('[data-prn-delete-from-edit]').forEach(btn => {
        btn.addEventListener('click', () => { prnEditDoseId = null; deletePrnDose(btn.dataset.prnDeleteFromEdit); });
      });
    }

    // PRN log form
    if (prnFormOpen) {
      el.querySelector('#prn-f-med')?.addEventListener('change', e => { prnMedId = e.target.value; prnDose = ''; render(); });
      el.querySelector('#prn-f-time')?.addEventListener('input', e => { prnTime = e.target.value; });
      el.querySelectorAll('[data-prn-fdc]').forEach(btn => {
        btn.addEventListener('click', () => { prnDose = btn.dataset.prnFdc === prnDose ? '' : btn.dataset.prnFdc; render(); });
      });
      el.querySelector('#prn-f-note')?.addEventListener('input', e => { prnNote = e.target.value; });
      el.querySelector('#prn-f-cancel')?.addEventListener('click', () => { prnFormOpen = false; render(); });
      el.querySelector('#prn-f-submit')?.addEventListener('click', submitPrnLog);
    }

    // Reminder buttons
    el.querySelectorAll('[data-reminder-take]').forEach(btn => {
      btn.addEventListener('click', () => markReminderTaken(btn.dataset.reminderTake));
    });
    el.querySelectorAll('[data-reminder-undo]').forEach(btn => {
      btn.addEventListener('click', () => undoReminder(btn.dataset.reminderUndo));
    });
  }

  // ── Slot actions ───────────────────────────────────────────────────────────

  function logSlot(slot) {
    const now = new Date();
    const t   = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
    const day = Data.getDay(currentDate);
    if (!day.med_slots) day.med_slots = defaultSlots();
    day.med_slots[slot] = { time: t, skipped: [], extras: [] };
    scheduleSave();
    render();
  }

  function openSlotEdit(slot) {
    const day      = Data.getDay(currentDate);
    const slotData = (day.med_slots ?? defaultSlots())[slot] ?? { time: null, skipped: [], extras: [] };
    editSlot     = slot;
    editTime     = slotData.time ?? nowHHMM();
    editSkipped  = [...(slotData.skipped ?? [])];
    editExtras   = [...(slotData.extras  ?? [])];
    editExtraMedId = '';
    editExtraDose  = '';
    render();
  }

  function addExtra() {
    if (!editExtraMedId) return;
    if (!editExtras.find(e => e.medication_id === editExtraMedId)) {
      editExtras.push({ medication_id: editExtraMedId, dose: editExtraDose.trim() });
    }
    editExtraMedId = '';
    editExtraDose  = '';
    render();
  }

  function saveSlotEdit() {
    if (!editSlot || !editTime) return;
    const day = Data.getDay(currentDate);
    if (!day.med_slots) day.med_slots = defaultSlots();
    day.med_slots[editSlot] = { time: editTime, skipped: [...editSkipped], extras: [...editExtras] };
    editSlot = null;
    scheduleSave();
    render();
  }

  // ── PRN actions ────────────────────────────────────────────────────────────

  function openPrnForm(medId) {
    prnFormOpen   = true;
    prnEditDoseId = null;
    prnMedId      = medId;
    prnDose       = '';
    prnNote       = '';
    prnTime       = nowHHMM();
    render();
  }

  function submitPrnLog() {
    if (!prnMedId) return;
    const iso  = `${currentDate}T${prnTime || nowHHMM()}:00`;
    const dose = { id: crypto.randomUUID(), medication_id: prnMedId,
                   iso_timestamp: iso, dose: prnDose, notes: prnNote.trim() };
    const day  = Data.getDay(currentDate);
    if (!Array.isArray(day.prn_doses)) day.prn_doses = [];
    day.prn_doses.push(dose);
    prnFormOpen = false;
    prnDose     = '';
    prnNote     = '';
    scheduleSave();
    render();
  }

  function openPrnEdit(doseId) {
    const day  = Data.getDay(currentDate);
    const yest = Data.getDay(shiftDate(currentDate, -1));
    const dose = [...(day.prn_doses ?? []), ...(yest.prn_doses ?? [])].find(d => d.id === doseId);
    if (!dose) return;
    prnEditDoseId = doseId;
    prnETime      = dose.iso_timestamp.slice(11, 16);
    prnEDose      = dose.dose  ?? '';
    prnENote      = dose.notes ?? '';
    prnFormOpen   = false;
    render();
  }

  function savePrnEdit(doseId) {
    if (!prnETime) return;
    [Data.getDay(currentDate), Data.getDay(shiftDate(currentDate, -1))].forEach(day => {
      const arr = day.prn_doses;
      if (!Array.isArray(arr)) return;
      const idx = arr.findIndex(d => d.id === doseId);
      if (idx !== -1) arr[idx] = { ...arr[idx], iso_timestamp: `${arr[idx].iso_timestamp.slice(0,10)}T${prnETime}:00`, dose: prnEDose, notes: prnENote.trim() };
    });
    prnEditDoseId = null;
    scheduleSave();
    render();
  }

  function deletePrnDose(doseId) {
    [Data.getDay(currentDate), Data.getDay(shiftDate(currentDate, -1))].forEach(day => {
      if (Array.isArray(day.prn_doses)) day.prn_doses = day.prn_doses.filter(d => d.id !== doseId);
    });
    scheduleSave();
    render();
  }

  // ── Reminder actions ───────────────────────────────────────────────────────

  function markReminderTaken(medId) {
    const day = Data.getDay(currentDate);
    if (!day.med_reminders) day.med_reminders = {};
    day.med_reminders[medId] = nowHHMM();
    scheduleSave();
    render();
  }

  function undoReminder(medId) {
    const day = Data.getDay(currentDate);
    if (day.med_reminders) delete day.med_reminders[medId];
    scheduleSave();
    render();
  }

  // ── Badge ──────────────────────────────────────────────────────────────────

  function updateBadge(allMeds, medSlots, medRems, prnDoses) {
    const badge = document.getElementById('meds-badge');
    if (!badge) return;
    const slots   = SLOT_ORDER.filter(s => allMeds.some(m => (m.slots ?? []).includes(s)));
    const logged  = slots.filter(s => medSlots[s]?.time);
    const remMeds = allMeds.filter(m => m.med_reminder);
    const remDone = remMeds.filter(m => medRems[m.id]);
    const parts   = [];
    if (slots.length) parts.push(`${logged.length}/${slots.length} slots`);
    if (remMeds.length) parts.push(`${remDone.length}/${remMeds.length} reminders`);
    if (prnDoses.length) parts.push(`${prnDoses.length} PRN`);
    badge.textContent = parts.join(' · ');
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getActiveMeds() {
    return Object.values(Data.getData().medications ?? {}).filter(m => m.active);
  }

  /** Top N PRN meds by frequency in last 30 days */
  function getTopPrnMeds(prnMeds, n) {
    const cutoff  = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutStr  = cutoff.toISOString().slice(0, 10);
    const counts  = {};
    Object.entries(Data.getData().days ?? {}).forEach(([date, day]) => {
      if (date < cutStr) return;
      (day.prn_doses ?? []).forEach(d => {
        counts[d.medication_id] = (counts[d.medication_id] ?? 0) + 1;
      });
    });
    return prnMeds
      .slice()
      .sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0))
      .slice(0, n);
  }

  function defaultSlots() {
    return {
      am:        { time: null, skipped: [], extras: [] },
      afternoon: { time: null, skipped: [], extras: [] },
      pm:        { time: null, skipped: [], extras: [] },
    };
  }

  function nowHHMM() {
    const n = new Date();
    return String(n.getHours()).padStart(2,'0') + ':' + String(n.getMinutes()).padStart(2,'0');
  }

  function cooldownRemaining(med, recentDoses) {
    if (!med.min_interval_hours) return 0;
    const last = recentDoses.find(d => d.medication_id === med.id);
    if (!last) return 0;
    const readyAt = new Date(last.iso_timestamp).getTime() + med.min_interval_hours * 3_600_000;
    return Math.max(0, readyAt - Date.now());
  }

  function fmtMs(ms) {
    const m = Math.ceil(ms / 60_000);
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h > 0 && r > 0) return `${h}h ${r}m`;
    if (h > 0)           return `${h}h`;
    return `${r}m`;
  }

  function shiftDate(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { await Data.save(); } catch (e) { console.error('Meds save error:', e); }
    }, 1200);
  }

  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  return { init, render, setDate };
})();
```

**Step 2: Verify module loads without error**

Reload app → open console → `Medications` should be defined. Today tab → Medications section should appear (empty state with config link if no meds set up).

**Step 3: Commit**

```bash
git add js/medications.js
git commit -m "feat(medications): rewrite for AM/Afternoon/PM batch logging, PRN, reminders"
```

---

## Task 5: app.js — init MedsManage + popstate

**File:** `js/app.js`

**Step 1: Init MedsManage in the app init function**

Find where `Medications.init()` is called (in the section that initialises all modules). After it, add:

```js
if (typeof MedsManage !== 'undefined') MedsManage.render();
```

(MedsManage doesn't need a separate `init()` — `render()` is a no-op until the overlay is shown.)

**Step 2: Update handlePopState**

Find the `handlePopState` function. Add a `meds-manage` case alongside `issues-view`:

```js
// Near the top of handlePopState, alongside _exitIssuesView:
if (typeof MedsManage !== 'undefined') MedsManage.exit();

// In the switch/if-else chain:
} else if (s.ht === 'meds-manage') {
  switchTab(s.returnTab ?? 'today', false);
}
```

**Step 3: Verify**

Open app → navigate to Medications screen (once Settings link is wired) → press browser back → returns to correct tab.

**Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat(app): init MedsManage and handle meds-manage popstate"
```

---

## Task 6: settings.js — replace PRN card with Medications link

**File:** `js/settings.js`

**Step 1: Replace `buildPrnMedsCard()` call in `render()`**

Find in `render()`:
```js
wrap.appendChild(buildPrnMedsCard());
```

Replace with:
```js
wrap.appendChild(buildMedicationsLinkCard());
```

**Step 2: Add `buildMedicationsLinkCard()` function**

After the existing `buildPrnMedsCard()` function definition, add:

```js
function buildMedicationsLinkCard() {
  const { card, body } = makeCard(`
    <span class="stg-card-title">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true">
        <path d="M12 22a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"/>
        <path d="M8 12h8M12 8v8"/>
      </svg>
      Medications
    </span>
  `, 'medications-link');

  const btn = document.createElement('button');
  btn.className = 'stg-link-btn';
  btn.textContent = 'Manage all medications →';
  btn.addEventListener('click', () => {
    if (typeof MedsManage !== 'undefined') MedsManage.open('settings');
  });
  body.appendChild(btn);

  // Show count of active meds as context
  const count = Object.values(Data.getData().medications ?? {}).filter(m => m.active).length;
  if (count > 0) {
    const info = document.createElement('p');
    info.className = 'stg-empty';
    info.textContent = `${count} active medication${count === 1 ? '' : 's'} configured`;
    body.appendChild(info);
  }

  return card;
}
```

**Step 3: Keep `buildTreatmentMedsCard()` call unchanged**

The Treatment Medications card stays exactly as-is.

**Step 4: Remove the old `buildPrnMedsCard()` function**

Delete the entire `buildPrnMedsCard()` function and all its sub-functions (`savePrnMed`, `archivePrnMed`, etc.) — this is now replaced by the MedsManage overlay.

**Step 5: Verify**

Settings tab → shows "Medications — Manage all medications →" button. Tapping it opens the Medications Management overlay. Treatment Medications card still present and unchanged below.

**Step 6: Commit**

```bash
git add js/settings.js
git commit -m "feat(settings): replace PRN meds card with link to MedsManage overlay"
```

---

## Task 7: health-log.js — add Medications link to header

**File:** `js/health-log.js`

**Step 1: Update `renderList()` header**

Find:
```js
function renderList() {
  return `<div class="hl-tab-header"><h2 class="hl-tab-title">Health Log</h2></div>`
    + renderBPSection()
    + ...
```

Replace the header div with one that includes a Medications button:

```js
function renderList() {
  return `<div class="hl-tab-header">
    <h2 class="hl-tab-title">Health Log</h2>
    <button class="hl-meds-link-btn" onclick="MedsManage.open('health-log')" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
        <path d="M12 22a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"/>
        <path d="M8 12h8M12 8v8"/>
      </svg>
      Medications
    </button>
  </div>`
    + renderBPSection()
    + ...
```

**Step 2: Commit**

```bash
git add js/health-log.js
git commit -m "feat(health-log): add Medications link button to header"
```

---

## Task 8: CSS — all new styles

**File:** `css/styles.css`

Add these blocks after the existing `/* ── PRN Medications ── */` section.

**Step 1: Medications Management overlay (view-meds-manage)**

```css
/* ── Medications Management Overlay ────────────────────────────────────────── */
.view-meds-manage {
  position:   fixed;
  inset:      0;
  background: var(--clr-bg);
  z-index:    200;
  display:    flex;
  flex-direction: column;
  overflow:   hidden;
}
.view-meds-manage[hidden] { display: none; }

.view-meds-manage-header {
  display:         flex;
  align-items:     center;
  justify-content: space-between;
  padding:         12px 16px;
  border-bottom:   1px solid var(--clr-border);
  background:      var(--clr-surface);
  flex-shrink:     0;
}
.view-meds-manage-back-btn {
  display:     flex;
  align-items: center;
  gap:         4px;
  background:  none;
  border:      none;
  color:       var(--clr-accent);
  font-size:   0.9rem;
  font-weight: 600;
  cursor:      pointer;
  padding:     6px 0;
}
.view-meds-manage-title {
  font-size:   1rem;
  font-weight: 700;
  color:       var(--clr-text);
}
.view-meds-manage-add-btn {
  background:  none;
  border:      none;
  color:       var(--clr-accent);
  font-size:   0.9rem;
  font-weight: 600;
  cursor:      pointer;
  padding:     6px 0;
}
.view-meds-manage-content {
  flex:       1;
  overflow-y: auto;
  padding:    8px 0 40px;
}

/* Med list rows */
.mmg-med-row {
  padding:       12px 16px;
  border-bottom: 1px solid var(--clr-border);
  cursor:        pointer;
}
.mmg-med-row:active { background: var(--clr-surface-2); }
.mmg-med-name {
  font-size:   0.95rem;
  font-weight: 600;
  color:       var(--clr-text);
  margin-bottom: 4px;
}
.mmg-med-chips {
  display:   flex;
  flex-wrap: wrap;
  gap:       5px;
}
.mmg-chip {
  font-size:     0.72rem;
  font-weight:   500;
  padding:       2px 8px;
  border-radius: 10px;
  background:    var(--clr-surface-2);
  color:         var(--clr-text-2);
  border:        1px solid var(--clr-border);
}
.mmg-empty {
  padding:    24px 16px;
  color:      var(--clr-text-2);
  font-size:  0.88rem;
  text-align: center;
}
.mmg-archive-toggle {
  display:     block;
  width:       100%;
  text-align:  left;
  padding:     10px 16px;
  background:  none;
  border:      none;
  color:       var(--clr-text-2);
  font-size:   0.85rem;
  cursor:      pointer;
  border-top:  1px solid var(--clr-border);
}
.mmg-archived { opacity: 0.65; }

/* Edit form */
.mmg-form {
  padding: 16px;
}
.mmg-form-back {
  background: none;
  border: none;
  color: var(--clr-accent);
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0 0 12px;
}
.mmg-form-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--clr-text);
  margin: 0 0 16px;
}
.mmg-field-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--clr-text-2);
  margin: 12px 0 4px;
}
.mmg-section-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--clr-text-2);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 20px 0 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--clr-border);
}
.mmg-text-input {
  width:         100%;
  background:    var(--clr-surface-2);
  border:        1px solid var(--clr-border);
  border-radius: 8px;
  color:         var(--clr-text);
  font-size:     0.9rem;
  padding:       8px 10px;
  box-sizing:    border-box;
}
.mmg-text-input:focus { border-color: var(--clr-accent); outline: none; }
.mmg-slot-label {
  display:     flex;
  align-items: center;
  gap:         8px;
  font-size:   0.88rem;
  color:       var(--clr-text);
  padding:     6px 0;
  cursor:      pointer;
}
.mmg-slot-dose-row {
  padding-left: 24px;
  margin-bottom: 8px;
}
.mmg-slot-dose-row--hidden { display: none; }
.mmg-prn-fields { padding-left: 24px; }
.mmg-form-actions {
  display:     flex;
  align-items: center;
  margin-top:  24px;
  gap:         10px;
}
.mmg-save-btn {
  background:    var(--clr-accent);
  color:         #fff;
  border:        none;
  border-radius: 8px;
  font-size:     0.9rem;
  font-weight:   600;
  padding:       9px 20px;
  cursor:        pointer;
}
.mmg-archive-btn {
  background:    transparent;
  color:         var(--clr-text-2);
  border:        1px solid var(--clr-border);
  border-radius: 8px;
  font-size:     0.85rem;
  padding:       8px 14px;
  cursor:        pointer;
}
```

**Step 2: Today-tab Medications section**

```css
/* ── Today Tab: Medications Section ────────────────────────────────────────── */
.meds-empty {
  padding:    16px;
  font-size:  0.88rem;
  color:      var(--clr-text-2);
  text-align: center;
}
.meds-config-link {
  background: none;
  border:     none;
  color:      var(--clr-accent);
  font-size:  0.88rem;
  cursor:     pointer;
  padding:    0;
  text-decoration: underline;
}

/* Scheduled slot rows */
.meds-slot-row {
  display:       flex;
  align-items:   center;
  padding:       10px 16px;
  border-bottom: 1px solid var(--clr-border);
  gap:           10px;
}
.meds-slot-row--empty {
  justify-content: center;
}
.meds-slot-log-btn {
  background:    var(--clr-accent);
  color:         #fff;
  border:        none;
  border-radius: 20px;
  font-size:     0.88rem;
  font-weight:   600;
  padding:       8px 20px;
  cursor:        pointer;
  -webkit-tap-highlight-color: transparent;
}
.meds-slot-row--done {
  cursor:        pointer;
  justify-content: space-between;
}
.meds-slot-row--done:active { background: var(--clr-surface-2); }
.meds-slot-done-label {
  font-size:   0.9rem;
  font-weight: 600;
  color:       var(--clr-text);
}
.meds-slot-done-time {
  font-size:  0.85rem;
  color:      var(--clr-accent);
  font-weight: 500;
}

/* Slot edit form */
.meds-slot-edit {
  padding:       12px 16px;
  border-bottom: 1px solid var(--clr-border);
  background:    var(--clr-surface-2);
}
.meds-slot-edit-header {
  font-size:     0.85rem;
  font-weight:   700;
  color:         var(--clr-text-2);
  margin-bottom: 10px;
}
.meds-edit-time-row {
  display:     flex;
  align-items: center;
  gap:         10px;
  margin-bottom: 10px;
}
.meds-edit-label {
  font-size:   0.8rem;
  font-weight: 600;
  color:       var(--clr-text-2);
  min-width:   55px;
}
.meds-edit-time-input {
  background:    var(--clr-surface);
  border:        1px solid var(--clr-border);
  border-radius: 6px;
  color:         var(--clr-text);
  padding:       5px 8px;
  font-size:     0.88rem;
}
.meds-edit-med-list {
  margin-bottom: 8px;
}
.meds-edit-med-row {
  display:       flex;
  align-items:   center;
  justify-content: space-between;
  padding:       6px 0;
  border-bottom: 1px dashed var(--clr-border);
}
.meds-edit-med-check {
  display:     flex;
  align-items: center;
  gap:         8px;
  font-size:   0.88rem;
  color:       var(--clr-text);
  cursor:      pointer;
}
.meds-edit-med-dose {
  font-size: 0.8rem;
  color:     var(--clr-text-2);
}
.meds-edit-extra-row {
  display:     flex;
  align-items: center;
  gap:         8px;
  font-size:   0.85rem;
  color:       var(--clr-text);
  padding:     4px 0;
}
.meds-edit-extra-del {
  background: none;
  border:     none;
  color:      var(--clr-text-2);
  cursor:     pointer;
  font-size:  0.85rem;
}
.meds-edit-add-extra {
  display:     flex;
  align-items: center;
  gap:         6px;
  flex-wrap:   wrap;
  margin-top:  8px;
}
.meds-edit-extra-select,
.meds-edit-extra-dose-input {
  flex:          1;
  min-width:     80px;
  background:    var(--clr-surface);
  border:        1px solid var(--clr-border);
  border-radius: 6px;
  color:         var(--clr-text);
  font-size:     0.82rem;
  padding:       5px 8px;
}
.meds-edit-add-btn {
  background:    var(--clr-accent);
  color:         #fff;
  border:        none;
  border-radius: 6px;
  font-size:     0.82rem;
  font-weight:   600;
  padding:       6px 12px;
  cursor:        pointer;
}
.meds-slot-edit-actions {
  display:         flex;
  justify-content: flex-end;
  gap:             8px;
  margin-top:      12px;
}
.meds-edit-cancel-btn {
  background:    transparent;
  color:         var(--clr-text-2);
  border:        1px solid var(--clr-border);
  border-radius: 8px;
  font-size:     0.88rem;
  padding:       7px 16px;
  cursor:        pointer;
}
.meds-edit-save-btn {
  background:    var(--clr-accent);
  color:         #fff;
  border:        none;
  border-radius: 8px;
  font-size:     0.88rem;
  font-weight:   600;
  padding:       7px 16px;
  cursor:        pointer;
}

/* PRN section */
.meds-prn-section {
  padding:       12px 16px 4px;
  border-bottom: 1px solid var(--clr-border);
}
.meds-prn-label {
  font-size:     0.75rem;
  font-weight:   700;
  color:         var(--clr-text-2);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 10px;
}
.meds-prn-quick-row {
  display:   flex;
  flex-wrap: wrap;
  gap:       8px;
  margin-bottom: 10px;
  align-items: center;
}
.meds-prn-quick-btn {
  background:    var(--clr-surface-2);
  border:        1px solid var(--clr-border);
  border-radius: 20px;
  color:         var(--clr-text);
  font-size:     0.85rem;
  font-weight:   500;
  padding:       7px 14px;
  cursor:        pointer;
}
.meds-prn-quick-btn:active { background: var(--clr-accent-dim); border-color: var(--clr-accent); }
.meds-prn-other-select {
  background:    var(--clr-surface-2);
  border:        1px solid var(--clr-border);
  border-radius: 20px;
  color:         var(--clr-text-2);
  font-size:     0.82rem;
  padding:       6px 10px;
}
.meds-prn-dose-card { cursor: pointer; }

/* Med Reminders section */
.meds-reminders-section {
  padding:       12px 16px;
}
.meds-reminders-label {
  font-size:     0.75rem;
  font-weight:   700;
  color:         var(--clr-text-2);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 10px;
}
.meds-reminder-row {
  display:       flex;
  align-items:   center;
  justify-content: space-between;
  padding:       8px 0;
  border-bottom: 1px solid var(--clr-border);
}
.meds-reminder-row:last-child { border-bottom: none; }
.meds-reminder-name {
  font-size:   0.9rem;
  font-weight: 600;
  color:       var(--clr-text);
}
.meds-reminder-btn {
  background:    var(--clr-accent);
  color:         #fff;
  border:        none;
  border-radius: 14px;
  font-size:     0.8rem;
  font-weight:   600;
  padding:       5px 14px;
  cursor:        pointer;
}
.meds-reminder-row--done .meds-reminder-time {
  font-size:  0.85rem;
  color:      var(--clr-accent);
  font-weight: 500;
}
.meds-reminder-undo {
  background: none;
  border:     none;
  color:      var(--clr-text-2);
  font-size:  0.8rem;
  cursor:     pointer;
  text-decoration: underline;
}
```

**Step 3: Health Log header Medications button**

```css
/* Health Log: Medications link in header */
.hl-meds-link-btn {
  display:       flex;
  align-items:   center;
  gap:           5px;
  background:    var(--clr-surface-2);
  border:        1px solid var(--clr-border);
  border-radius: 8px;
  color:         var(--clr-text-2);
  font-size:     0.82rem;
  font-weight:   600;
  padding:       6px 12px;
  cursor:        pointer;
}
.hl-meds-link-btn:hover { border-color: var(--clr-accent); color: var(--clr-accent); }
```

**Step 4: Settings Medications link card button**

```css
/* Settings: Medications link button */
.stg-link-btn {
  background:    var(--clr-accent);
  color:         #fff;
  border:        none;
  border-radius: 8px;
  font-size:     0.88rem;
  font-weight:   600;
  padding:       9px 18px;
  cursor:        pointer;
  margin-bottom: 8px;
}
```

**Step 5: Verify dark mode**

Toggle device dark mode → all new elements should use CSS variables correctly (no hardcoded light/dark colors).

**Step 6: Commit**

```bash
git add css/styles.css
git commit -m "feat(css): styles for medications management overlay and today-tab sections"
```

---

## Task 9: End-to-end smoke test

**Test each flow:**

1. **Settings → Medications**
   - Settings tab → "Manage medications →" → MedsManage overlay opens
   - Tap "+ Add" → add a medication with AM + PM slots, doses, and Med Reminder = on
   - Save → med appears in list
   - Tap med → edit form → change name → Save → list updates

2. **Today tab — Scheduled slots**
   - AM row appears → "Log AM meds" button
   - Tap → row shows "AM Meds · HH:MM"
   - Tap logged row → edit sheet opens → uncheck one med → Save → "1 skipped" shows
   - Navigate to yesterday → no slot rows for new med (it was just added today)

3. **Today tab — As-Needed**
   - Add a PRN med in Medications → appears as quick button
   - Tap quick button → log form opens with that med pre-selected → Log
   - Dose card appears with cooldown (if min_interval set)
   - Tap dose card → edit form → Save

4. **Today tab — Reminders**
   - Med with `med_reminder: true` → appears in Reminders section
   - "Mark taken" → shows time taken + Undo
   - Undo → resets to "Mark taken"

5. **Health Log → Medications**
   - Health Log tab → "Medications" button in header → MedsManage opens
   - Back → returns to Health Log

6. **Browser back gesture**
   - Open MedsManage → press browser back → returns to originating tab

7. **Data persistence**
   - Log AM meds + a PRN dose + a reminder → reload page → all data preserved

**Step: Commit if all passes**

```bash
git add -A
git commit -m "feat: medications redesign — AM/PM/PRN/Reminder logging complete"
```

---

## Migration Note

No data migration script is needed. The changes are **purely additive**:

| Existing data | Behaviour after redesign |
|---|---|
| `medications{}` (PRN meds with `as_needed: true`) | Still work as PRN meds; `slots: []` (absent field → defaults to empty); appear in As-Needed quick buttons |
| `prn_doses[]` per day | Unchanged — PRN log format identical |
| `treatment_medications{}` | Completely untouched |
| `medications_taken[]` per day | Ignored (was unused; left in place harmlessly) |

---

## Summary of file changes

| File | Change |
|---|---|
| `js/data.js` | Add `med_slots`, `med_reminders` to `getDay()` defaults |
| `js/meds-manage.js` | **New** — full-screen medications management overlay |
| `js/medications.js` | **Full rewrite** — AM/Afternoon/PM batch, PRN, reminders |
| `index.html` | Add `#view-meds-manage`; add `#section-meds`; add script tag; remove PRN sublabel from Symptoms |
| `js/app.js` | Init MedsManage; handle `meds-manage` popstate |
| `js/settings.js` | Replace `buildPrnMedsCard()` with `buildMedicationsLinkCard()` |
| `js/health-log.js` | Add Medications link button to `renderList()` header |
| `css/styles.css` | All new styles for overlay, today-tab sections, HL button, settings button |
