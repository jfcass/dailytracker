# Treatments Tab — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Treatments" tab for logging at-home ketamine treatment sessions, including intention, medication & dose (from a pre-configured Settings list), start/end time, notes, and per-treatment blood pressure readings (At Rest / Mid-Treatment / Post-Treatment) that also appear in the global Health Log BP section.

**Architecture:** New `js/treatments.js` module renders into `#treatments-content` using the same innerHTML pattern as `health-log.js` — list view → detail view → add/edit form. Treatment medications are configured in Settings (`treatment_medications` dict). BP readings for a treatment are stored in the existing global `blood_pressure[]` array with a `treatment_id` field, so they show up in both places without duplication. Nav reorders to: Today → Treatments → Health Log → Library → Reports.

**Tech Stack:** Vanilla JS, innerHTML string templating, CSS custom properties, existing `blood_pressure[]` data structure.

---

### Task 1: Extend data schema in data.js

**File:** `js/data.js`

**Step 1:** In `SCHEMA_DEFAULTS` (around line 11), after `blood_pressure: [],` add:

```js
treatment_medications: {},  // { [uuid]: { id, name, doses[], active, notes } }
treatments:            {},  // { [uuid]: { id, date, start_time, end_time, intention, medication_id, dose, notes } }
```

**Step 2:** Verify — open the app, log in, run in console:
```js
JSON.stringify(Object.keys(Data.getData()))
```
Expected output includes `"treatment_medications"` and `"treatments"`.

**Step 3:** Commit:
```bash
git add js/data.js
git commit -m "feat(data): add treatment_medications and treatments to schema"
```

---

### Task 2: Add tab shell, reorder nav, add script tag in index.html

**File:** `index.html`

**Step 1:** Add `#tab-treatments` after the closing `</div>` of `#tab-health-log` (around line 512), before the `<nav>`:

```html
<!-- ── Treatments tab ─────────────────────────────────────────────── -->
<div id="tab-treatments" class="tab-view" hidden>
  <div id="treatments-content"></div>
</div>
```

**Step 2:** Replace the entire `<nav class="bottom-nav">` block (lines 513–561) with the new order (Today → Treatments → Health Log → Library → Reports):

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

  <button class="bottom-nav-btn" data-tab="treatments"
          type="button" onclick="App.switchTab('treatments')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
         width="22" height="22" aria-hidden="true">
      <path d="M9 3h6v8l4 8H5l4-8V3z"/>
      <line x1="6" y1="3" x2="18" y2="3"/>
      <line x1="9" y1="12" x2="15" y2="12"/>
    </svg>
    Treatments
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

</nav>
```

**Step 3:** Add `<script src="js/treatments.js"></script>` in the script block (around line 584), after `medications.js` and before `chart.js`:

```html
<script src="js/medications.js"></script>
<script src="js/treatments.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
```

**Step 4:** Verify — open app, confirm "Treatments" button appears in nav between Today and Health Log. Tapping it shows a blank `#treatments-content` div (no JS errors).

**Step 5:** Commit:
```bash
git add index.html
git commit -m "feat(nav): add Treatments tab shell and reorder nav"
```

---

### Task 3: Create js/treatments.js — full module

**File:** `js/treatments.js` (create new file)

Write the complete module. Every public bridge function is exposed in the return value so `onclick="Treatments._xxx()"` calls work from innerHTML.

```js
/**
 * treatments.js — Treatments tab
 *
 * Renders into #treatments-content.
 * Manages treatment sessions (e.g. at-home ketamine).
 *
 * Data written:
 *   Data.getData().treatments[id]              — treatment records
 *   Data.getData().treatment_medications[id]   — medication configs (managed in Settings)
 *   Data.getData().blood_pressure[]            — BP readings; treatment-linked ones have treatment_id
 */
const Treatments = (() => {

  // ── State ──────────────────────────────────────────────────────────────────

  let detailId   = null;   // null = list view; string = open treatment id
  let formMode   = null;   // null | 'add' | 'edit'
  let formId     = null;   // treatment id when editing

  // Treatment form field state
  let fDate      = '';
  let fStart     = '';
  let fEnd       = '';
  let fIntention = '';
  let fMedId     = '';
  let fDose      = '';
  let fNotes     = '';

  // Inline BP form within detail view
  let bpFormOpen = false;
  let bpEditId   = null;   // null = new BP; string = editing existing BP id
  let fBpDate    = '';
  let fBpTime    = '';
  let fBpSys     = '';
  let fBpDia     = '';
  let fBpPulse   = '';
  let fBpCtx     = 'At Rest';
  let fBpNotes   = '';

  const BP_CTX_OPTIONS = ['At Rest', 'Mid-Treatment', 'Post-Treatment'];
  const BP_CTX_COLORS  = {
    'At Rest':        'var(--clr-accent)',
    'Mid-Treatment':  '#f57f17',
    'Post-Treatment': '#1565c0',
  };

  // ── Public API ──────────────────────────────────────────────────────────────

  function init() { render(); }

  function render() {
    const container = document.getElementById('treatments-content');
    if (!container) return;
    if (formMode) {
      container.innerHTML = renderForm();
    } else if (detailId) {
      container.innerHTML = renderDetail(detailId);
    } else {
      container.innerHTML = renderList();
    }
  }

  // ── List view ──────────────────────────────────────────────────────────────

  function renderList() {
    const treatments = Object.values(Data.getData().treatments ?? {})
      .sort((a, b) => {
        const dc = b.date.localeCompare(a.date);
        return dc !== 0 ? dc : (b.start_time ?? '').localeCompare(a.start_time ?? '');
      });

    const rows = treatments.length
      ? treatments.map(treatmentRow).join('')
      : `<p class="tx-empty">No treatments logged yet.</p>`;

    return `
      <div class="tx-tab-header">
        <h2 class="tx-tab-title">Treatments</h2>
        <button class="tx-add-btn" onclick="Treatments._startAdd()">+ New</button>
      </div>
      <div class="tx-list">${rows}</div>`;
  }

  function treatmentRow(t) {
    const med      = (Data.getData().treatment_medications ?? {})[t.medication_id];
    const medLabel = t.medication_id && med
      ? escHtml(med.name) + (t.dose ? ' · ' + escHtml(t.dose) : '')
      : escHtml(t.dose || '');
    const timeRange = t.start_time
      ? t.end_time
        ? `${escHtml(t.start_time)} – ${escHtml(t.end_time)}`
        : escHtml(t.start_time)
      : '';
    const intentSnip = t.intention
      ? escHtml(t.intention.slice(0, 70)) + (t.intention.length > 70 ? '…' : '')
      : '';

    return `
      <div class="tx-list-item" onclick="Treatments._openDetail('${t.id}')">
        <div class="tx-list-item__row1">
          <span class="tx-list-item__date">${escHtml(fmtDate(t.date))}</span>
          ${timeRange ? `<span class="tx-list-item__time">${timeRange}</span>` : ''}
        </div>
        ${medLabel ? `<div class="tx-list-item__med">${medLabel}</div>` : ''}
        ${intentSnip ? `<div class="tx-list-item__intention">${intentSnip}</div>` : ''}
      </div>`;
  }

  // ── Detail view ────────────────────────────────────────────────────────────

  function renderDetail(id) {
    const t = (Data.getData().treatments ?? {})[id];
    if (!t) { detailId = null; return renderList(); }

    const med      = (Data.getData().treatment_medications ?? {})[t.medication_id];
    const medLabel = t.medication_id && med
      ? escHtml(med.name) + (t.dose ? ' · ' + escHtml(t.dose) : '')
      : escHtml(t.dose || '');
    const timeRange = t.start_time
      ? t.end_time
        ? `${escHtml(t.start_time)} – ${escHtml(t.end_time)}`
        : escHtml(t.start_time)
      : '';

    const bpReadings = getBPForTreatment(id);

    // Group BP readings by context
    let bpGroupsHtml = '';
    BP_CTX_OPTIONS.forEach(ctx => {
      const ctxColor = BP_CTX_COLORS[ctx] ?? 'var(--clr-text-2)';
      const readings = bpReadings.filter(r => r.context === ctx);
      const rowsHtml = readings.map(r => `
        <div class="tx-bp-row">
          <span class="tx-bp-reading">${escHtml(String(r.systolic))}/${escHtml(String(r.diastolic))}</span>
          ${r.pulse != null ? `<span class="tx-bp-pulse">${escHtml(String(r.pulse))} bpm</span>` : ''}
          ${r.time ? `<span class="tx-bp-time">${escHtml(r.time)}</span>` : ''}
          ${r.date !== t.date ? `<span class="tx-bp-date-label">${escHtml(fmtDate(r.date))}</span>` : ''}
          ${r.notes ? `<span class="tx-bp-notes">${escHtml(r.notes)}</span>` : ''}
          <span class="tx-bp-actions">
            <button class="hl-bp-edit-btn" onclick="Treatments._editBP('${r.id}')">Edit</button>
            <button class="hl-bp-del-btn"  onclick="Treatments._deleteBP('${r.id}','${id}')">Delete</button>
          </span>
        </div>`).join('');

      bpGroupsHtml += `
        <div class="tx-bp-ctx-group">
          <span class="tx-bp-ctx-label" style="color:${ctxColor}">${escHtml(ctx)}</span>
          ${rowsHtml || `<span class="tx-bp-ctx-empty">—</span>`}
        </div>`;
    });

    const bpFormHtml = bpFormOpen
      ? buildBPFormHtml(id)
      : `<button class="tx-add-bp-btn" onclick="Treatments._openBPForm('${id}')">+ Add BP reading</button>`;

    return `
      <div class="tx-detail">
        <button class="tx-back-btn" onclick="Treatments._back()">← Back to Treatments</button>

        <div class="tx-detail-header">
          <h2 class="tx-detail-title">${medLabel || 'Treatment'}</h2>
          <p class="tx-detail-sub">${escHtml(fmtDate(t.date))}${timeRange ? ' · ' + timeRange : ''}</p>
        </div>

        ${t.intention ? `
        <div class="tx-detail-section">
          <p class="tx-section-label">Intention</p>
          <p class="tx-intention-text">${escHtml(t.intention)}</p>
        </div>` : ''}

        <div class="tx-detail-section">
          <p class="tx-section-label">Blood Pressure</p>
          <div class="tx-bp-groups">${bpGroupsHtml}</div>
          ${bpFormHtml}
        </div>

        ${t.notes ? `
        <div class="tx-detail-section">
          <p class="tx-section-label">Notes</p>
          <p class="tx-notes-text">${escHtml(t.notes)}</p>
        </div>` : ''}

        <div class="tx-detail-actions">
          <button class="tx-edit-btn"   onclick="Treatments._startEdit('${id}')">Edit</button>
          <button class="tx-delete-btn" onclick="Treatments._delete('${id}')">Delete</button>
        </div>
      </div>`;
  }

  // ── Add/edit treatment form ────────────────────────────────────────────────

  function renderForm() {
    const title  = formMode === 'edit' ? 'Edit Treatment' : 'New Treatment';
    const txMeds = Object.values(Data.getData().treatment_medications ?? {}).filter(m => m.active);

    const medOptions = [
      `<option value="">— None —</option>`,
      ...txMeds.map(m =>
        `<option value="${escHtml(m.id)}"${m.id === fMedId ? ' selected' : ''}>${escHtml(m.name)}</option>`
      ),
    ].join('');

    const selMed    = txMeds.find(m => m.id === fMedId);
    const doseChips = (selMed?.doses ?? []).map(d =>
      `<button class="prn-dose-chip${d === fDose ? ' prn-dose-chip--active' : ''}"
               type="button" onclick="Treatments._selectDose('${escHtml(d)}')">${escHtml(d)}</button>`
    ).join('');

    const doseField = selMed?.doses?.length
      ? `<div class="tx-form-field">
           <label class="tx-form-label">Dose</label>
           <div class="prn-dose-chips">${doseChips}</div>
         </div>`
      : `<div class="tx-form-field">
           <label class="tx-form-label">Dose</label>
           <input class="hl-edit-input" type="text" value="${escHtml(fDose)}"
                  oninput="Treatments._setDose(this.value)" placeholder="e.g. 200mg">
         </div>`;

    const noMedsWarning = txMeds.length === 0
      ? `<p class="tx-no-meds-hint">No treatment medications configured yet.
           <button class="tx-link-btn" onclick="Treatments._goToTxMedsSettings()">Set up in Settings →</button>
         </p>`
      : '';

    return `
      <div class="tx-form-wrap">
        <div class="tx-tab-header">
          <button class="tx-back-btn" style="padding:6px 0" onclick="Treatments._cancelForm()">← Cancel</button>
          <h2 class="tx-tab-title">${title}</h2>
          <button class="tx-save-btn" onclick="Treatments._saveForm()">Save</button>
        </div>
        <div class="tx-form">
          <div class="tx-form-row">
            <div class="tx-form-field">
              <label class="tx-form-label">Date</label>
              <input class="hl-edit-input" type="date" value="${escHtml(fDate)}"
                     oninput="Treatments._setDate(this.value)">
            </div>
            <div class="tx-form-field">
              <label class="tx-form-label">Start time</label>
              <input class="hl-edit-input" type="time" value="${escHtml(fStart)}"
                     oninput="Treatments._setStart(this.value)">
            </div>
            <div class="tx-form-field">
              <label class="tx-form-label">End time</label>
              <input class="hl-edit-input" type="time" value="${escHtml(fEnd)}"
                     oninput="Treatments._setEnd(this.value)">
            </div>
          </div>

          <div class="tx-form-field">
            <label class="tx-form-label">Intention</label>
            <textarea class="tx-form-textarea" rows="2"
                      oninput="Treatments._setIntention(this.value)"
                      placeholder="What do you intend to explore or work on?">${escHtml(fIntention)}</textarea>
          </div>

          ${noMedsWarning}

          <div class="tx-form-field">
            <label class="tx-form-label">Medication</label>
            <select class="hl-edit-select" onchange="Treatments._setMedId(this.value)">${medOptions}</select>
          </div>

          ${doseField}

          <div class="tx-form-field">
            <label class="tx-form-label">Notes</label>
            <textarea class="tx-form-textarea" rows="3"
                      oninput="Treatments._setNotes(this.value)"
                      placeholder="Observations, how you felt, what came up…">${escHtml(fNotes)}</textarea>
          </div>
        </div>
      </div>`;
  }

  // ── Inline BP form (within detail view) ───────────────────────────────────

  function buildBPFormHtml(treatmentId) {
    const isEdit     = !!bpEditId;
    const ctxOptions = BP_CTX_OPTIONS.map(opt =>
      `<option value="${escHtml(opt)}"${fBpCtx === opt ? ' selected' : ''}>${escHtml(opt)}</option>`
    ).join('');

    return `
      <div class="tx-bp-form">
        <p class="tx-section-label" style="margin-bottom:10px">${isEdit ? 'Edit Reading' : 'Add BP Reading'}</p>
        <div class="tx-bp-form-row">
          <div class="tx-form-field">
            <label class="tx-form-label">Date</label>
            <input class="hl-edit-input" type="date" value="${escHtml(fBpDate)}"
                   oninput="Treatments._setBpDate(this.value)">
          </div>
          <div class="tx-form-field">
            <label class="tx-form-label">Time</label>
            <input class="hl-edit-input" type="time" value="${escHtml(fBpTime)}"
                   oninput="Treatments._setBpTime(this.value)">
          </div>
        </div>
        <div class="tx-bp-form-row">
          <div class="tx-form-field">
            <label class="tx-form-label">Systolic</label>
            <input class="hl-edit-input" type="number" placeholder="120"
                   value="${escHtml(fBpSys)}" oninput="Treatments._setBpSys(this.value)">
          </div>
          <div class="tx-form-field">
            <label class="tx-form-label">Diastolic</label>
            <input class="hl-edit-input" type="number" placeholder="80"
                   value="${escHtml(fBpDia)}" oninput="Treatments._setBpDia(this.value)">
          </div>
          <div class="tx-form-field">
            <label class="tx-form-label">Pulse (opt.)</label>
            <input class="hl-edit-input" type="number" placeholder="72"
                   value="${escHtml(fBpPulse)}" oninput="Treatments._setBpPulse(this.value)">
          </div>
        </div>
        <div class="tx-form-field">
          <label class="tx-form-label">Context</label>
          <select class="hl-edit-select" onchange="Treatments._setBpCtx(this.value)">${ctxOptions}</select>
        </div>
        <div class="tx-form-field">
          <label class="tx-form-label">Notes (optional)</label>
          <input class="hl-edit-input" type="text" value="${escHtml(fBpNotes)}"
                 oninput="Treatments._setBpNotes(this.value)" placeholder="e.g. after 30 min">
        </div>
        <div class="tx-bp-form-actions">
          <button class="hl-edit-cancel-btn" onclick="Treatments._cancelBPForm()">Cancel</button>
          <button class="hl-edit-save-btn"   onclick="Treatments._saveBP('${treatmentId}')">
            ${isEdit ? 'Save' : 'Add'}
          </button>
        </div>
      </div>`;
  }

  // ── Treatment CRUD ────────────────────────────────────────────────────────

  function startAdd() {
    const now  = new Date();
    formMode   = 'add';
    formId     = null;
    fDate      = Data.today();
    fStart     = pad(now.getHours()) + ':' + pad(now.getMinutes());
    fEnd       = '';
    fIntention = '';
    fMedId     = '';
    fDose      = '';
    fNotes     = '';
    bpFormOpen = false;
    render();
  }

  function startEdit(id) {
    const t = (Data.getData().treatments ?? {})[id];
    if (!t) return;
    formMode   = 'edit';
    formId     = id;
    fDate      = t.date          ?? Data.today();
    fStart     = t.start_time    ?? '';
    fEnd       = t.end_time      ?? '';
    fIntention = t.intention     ?? '';
    fMedId     = t.medication_id ?? '';
    fDose      = t.dose          ?? '';
    fNotes     = t.notes         ?? '';
    render();
  }

  function cancelForm() {
    if (formMode === 'edit') {
      // Return to the detail view we came from
      formMode = null;
    } else {
      formMode  = null;
      detailId  = null;
    }
    render();
  }

  function saveForm() {
    if (!fDate) { alert('Please enter a date.'); return; }
    const d = Data.getData();
    if (!d.treatments) d.treatments = {};

    if (formMode === 'edit' && formId) {
      const t = d.treatments[formId];
      if (t) {
        t.date          = fDate;
        t.start_time    = fStart     || null;
        t.end_time      = fEnd       || null;
        t.intention     = fIntention.trim();
        t.medication_id = fMedId     || null;
        t.dose          = fDose.trim();
        t.notes         = fNotes.trim();
      }
    } else {
      const id = crypto.randomUUID();
      d.treatments[id] = {
        id,
        date:          fDate,
        start_time:    fStart     || null,
        end_time:      fEnd       || null,
        intention:     fIntention.trim(),
        medication_id: fMedId     || null,
        dose:          fDose.trim(),
        notes:         fNotes.trim(),
      };
      detailId = id;  // open the new treatment's detail view
    }

    formMode = null;
    scheduleSave();
    render();
  }

  function deleteTreatment(id) {
    if (!confirm('Delete this treatment? Its BP readings will remain in the Health Log (unlinked).')) return;
    // Detach treatment_id from linked BP readings (don't delete them)
    const bp = Data.getData().blood_pressure ?? [];
    bp.forEach(r => { if (r.treatment_id === id) delete r.treatment_id; });
    delete (Data.getData().treatments ?? {})[id];
    detailId = null;
    scheduleSave();
    render();
  }

  // ── BP CRUD (within treatment detail) ────────────────────────────────────

  function openBPForm(treatmentId) {
    const existing = getBPForTreatment(treatmentId);
    const usedCtxs = new Set(existing.map(r => r.context));
    // Smart default: pick the first phase not yet logged
    const defaultCtx = BP_CTX_OPTIONS.find(c => !usedCtxs.has(c)) ?? 'At Rest';
    const now = new Date();
    bpFormOpen = true;
    bpEditId   = null;
    fBpDate    = Data.today();
    fBpTime    = pad(now.getHours()) + ':' + pad(now.getMinutes());
    fBpSys     = '';
    fBpDia     = '';
    fBpPulse   = '';
    fBpCtx     = defaultCtx;
    fBpNotes   = '';
    render();
  }

  function editBP(bpId) {
    const bp = (Data.getData().blood_pressure ?? []).find(r => r.id === bpId);
    if (!bp) return;
    bpFormOpen = true;
    bpEditId   = bpId;
    fBpDate    = bp.date    ?? Data.today();
    fBpTime    = bp.time    ?? '';
    fBpSys     = String(bp.systolic  ?? '');
    fBpDia     = String(bp.diastolic ?? '');
    fBpPulse   = bp.pulse != null ? String(bp.pulse) : '';
    fBpCtx     = bp.context ?? 'At Rest';
    fBpNotes   = bp.notes   ?? '';
    render();
  }

  function cancelBPForm() {
    bpFormOpen = false;
    bpEditId   = null;
    render();
  }

  function saveBP(treatmentId) {
    const sys = parseInt(fBpSys, 10);
    const dia = parseInt(fBpDia, 10);
    if (!fBpSys || !fBpDia || isNaN(sys) || isNaN(dia)) {
      alert('Systolic and diastolic readings are required.');
      return;
    }
    const d = Data.getData();
    if (!Array.isArray(d.blood_pressure)) d.blood_pressure = [];

    if (bpEditId) {
      const idx = d.blood_pressure.findIndex(r => r.id === bpEditId);
      if (idx !== -1) {
        d.blood_pressure[idx] = {
          ...d.blood_pressure[idx],
          date:         fBpDate || Data.today(),
          time:         fBpTime || null,
          systolic:     sys,
          diastolic:    dia,
          pulse:        fBpPulse !== '' ? parseInt(fBpPulse, 10) : null,
          context:      fBpCtx,
          notes:        fBpNotes,
          treatment_id: treatmentId,
        };
      }
    } else {
      d.blood_pressure.push({
        id:           crypto.randomUUID(),
        date:         fBpDate || Data.today(),
        time:         fBpTime || null,
        systolic:     sys,
        diastolic:    dia,
        pulse:        fBpPulse !== '' ? parseInt(fBpPulse, 10) : null,
        context:      fBpCtx,
        notes:        fBpNotes,
        treatment_id: treatmentId,
      });
    }

    bpFormOpen = false;
    bpEditId   = null;
    scheduleSave();
    render();
  }

  function deleteBP(bpId) {
    if (!confirm('Delete this BP reading?')) return;
    const d = Data.getData();
    d.blood_pressure = (d.blood_pressure ?? []).filter(r => r.id !== bpId);
    scheduleSave();
    render();
  }

  // ── Navigation helpers ────────────────────────────────────────────────────

  function _openDetail(id) {
    detailId   = id;
    bpFormOpen = false;
    history.pushState({ ht: 'tx-detail', id }, '');
    render();
  }

  function _back() {
    if (history.state?.ht === 'tx-detail') { history.back(); return; }
    detailId   = null;
    formMode   = null;
    bpFormOpen = false;
    render();
  }

  function _exitDetail() {
    detailId   = null;
    formMode   = null;
    bpFormOpen = false;
    render();
  }

  function _goToTxMedsSettings() {
    App.switchTab('settings');
    requestAnimationFrame(() => {
      if (typeof Settings !== 'undefined' && Settings.focusTxMeds) Settings.focusTxMeds();
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function getBPForTreatment(treatmentId) {
    const ctxOrder = { 'At Rest': 0, 'Mid-Treatment': 1, 'Post-Treatment': 2 };
    return (Data.getData().blood_pressure ?? [])
      .filter(r => r.treatment_id === treatmentId)
      .sort((a, b) => {
        const co = (ctxOrder[a.context] ?? 3) - (ctxOrder[b.context] ?? 3);
        return co !== 0 ? co : (a.time ?? '').localeCompare(b.time ?? '');
      });
  }

  function fmtDate(dateStr) {
    if (!dateStr) return '';
    const [y, mo, d] = dateStr.split('-').map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  }

  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() =>
      Data.save().catch(e => console.error('Treatments save failed:', e)), 1000);
  }

  // ── Public return ─────────────────────────────────────────────────────────

  return {
    init, render,
    _openDetail, _back, _exitDetail,
    _startAdd:       () => startAdd(),
    _startEdit:      id => startEdit(id),
    _cancelForm:     () => cancelForm(),
    _saveForm:       () => saveForm(),
    _delete:         id => deleteTreatment(id),
    _setDate:        v => { fDate = v; },
    _setStart:       v => { fStart = v; },
    _setEnd:         v => { fEnd = v; },
    _setIntention:   v => { fIntention = v; },
    _setMedId:       v => { fMedId = v; fDose = ''; render(); },
    _setDose:        v => { fDose = v; },
    _selectDose:     v => { fDose = v === fDose ? '' : v; render(); },
    _setNotes:       v => { fNotes = v; },
    _goToTxMedsSettings,
    _openBPForm:     treatmentId => openBPForm(treatmentId),
    _editBP:         bpId => editBP(bpId),
    _cancelBPForm:   () => cancelBPForm(),
    _saveBP:         treatmentId => saveBP(treatmentId),
    _deleteBP:       bpId => deleteBP(bpId),
    _setBpDate:      v => { fBpDate = v; },
    _setBpTime:      v => { fBpTime = v; },
    _setBpSys:       v => { fBpSys = v; },
    _setBpDia:       v => { fBpDia = v; },
    _setBpPulse:     v => { fBpPulse = v; },
    _setBpCtx:       v => { fBpCtx = v; },
    _setBpNotes:     v => { fBpNotes = v; },
  };
})();
```

**Step 1:** Create the file with the code above.

**Step 2:** Verify — open app, tap Treatments nav button, confirm "Treatments" header + "No treatments logged yet." empty state. No console errors.

**Step 3:** Commit:
```bash
git add js/treatments.js
git commit -m "feat(treatments): add full Treatments module — list, detail, add/edit, BP form"
```

---

### Task 4: Add Treatment Medications card to settings.js

**File:** `js/settings.js`

**Step 1:** Add state variables after the existing PRN form state (after line 18):

```js
// Treatment medication form state
let txMedForm      = null;   // null | 'add' | med-id (editing)
let txMedFName     = '';
let txMedFDoses    = [];     // string[]
let txMedFDoseInput = '';
```

**Step 2:** Add `buildTreatmentMedsCard()` function after `archivePrnMed()` (after line 814), before `scheduleSave()`:

```js
// ── Treatment Medications Card ──────────────────────────────────────────────

function buildTreatmentMedsCard() {
  const card = makeCard(`
    <span class="stg-card-title">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true">
        <path d="M9 3h6v8l4 8H5l4-8V3z"/>
        <line x1="6" y1="3" x2="18" y2="3"/>
        <line x1="9" y1="12" x2="15" y2="12"/>
      </svg>
      Treatment Medications
    </span>
  `);
  card.id = 'stg-tx-meds-card';

  const meds = Object.values(Data.getData().treatment_medications ?? {}).filter(m => m.active);
  const list = document.createElement('div');
  list.className = 'stg-list';

  if (meds.length === 0 && txMedForm !== 'add') {
    const empty = document.createElement('p');
    empty.className   = 'stg-empty';
    empty.textContent = 'No treatment medications configured.';
    list.appendChild(empty);
  }

  meds.forEach(med => {
    const row = document.createElement('div');
    row.className = 'stg-item-row';

    const doseTags = (med.doses ?? [])
      .map(d => `<span class="prn-stg-tag">${escHtml(d)}</span>`)
      .join('');

    row.innerHTML = `
      <div class="stg-item-info">
        <span class="stg-item-name">${escHtml(med.name)}</span>
        <div class="prn-stg-meta">${doseTags}</div>
      </div>
      <div style="display:flex;gap:4px">
        <button class="stg-icon-btn tx-med-edit-btn" type="button" data-id="${escHtml(med.id)}"
                aria-label="Edit ${escHtml(med.name)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="stg-icon-btn stg-icon-btn--danger tx-med-archive-btn" type="button"
                data-id="${escHtml(med.id)}" aria-label="Archive ${escHtml(med.name)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
          </svg>
        </button>
      </div>
    `;

    row.querySelector('.tx-med-edit-btn').addEventListener('click', () => startTxMedEdit(med));
    row.querySelector('.tx-med-archive-btn').addEventListener('click', () => archiveTxMed(med.id));
    list.appendChild(row);

    if (txMedForm === med.id) list.appendChild(buildTxMedForm('edit', med));
  });

  if (txMedForm === 'add') list.appendChild(buildTxMedForm('add'));

  card.appendChild(list);

  if (txMedForm !== 'add') {
    const addRow = document.createElement('div');
    addRow.className = 'stg-add-row';
    const addBtn = document.createElement('button');
    addBtn.className   = 'stg-add-btn';
    addBtn.type        = 'button';
    addBtn.textContent = '+ Add medication';
    addBtn.addEventListener('click', () => {
      txMedForm       = 'add';
      txMedFName      = '';
      txMedFDoses     = [];
      txMedFDoseInput = '';
      render();
    });
    addRow.appendChild(addBtn);
    card.appendChild(addRow);
  }

  return card;
}

function buildTxMedForm(mode, med = null) {
  const wrap = document.createElement('div');
  wrap.className = 'prn-stg-form';

  const tagsHtml = txMedFDoses.map(d =>
    `<span class="prn-dose-tag">${escHtml(d)}<button class="prn-dose-tag__del" type="button" data-dose="${escHtml(d)}" aria-label="Remove ${escHtml(d)}">×</button></span>`
  ).join('');

  wrap.innerHTML = `
    <div class="prn-stg-form__field">
      <label class="prn-stg-form__label" for="tx-f-name">Name</label>
      <input id="tx-f-name" class="prn-stg-form__input" type="text"
             value="${escHtml(txMedFName)}" maxlength="80" placeholder="e.g. Ketamine">
    </div>
    <div class="prn-stg-form__field">
      <label class="prn-stg-form__label">Available doses <span style="font-size:0.72rem">(type + Enter)</span></label>
      <div class="prn-dose-tags" id="tx-dose-tags">
        ${tagsHtml}
        <input class="prn-dose-tag-input" id="tx-dose-tag-input" type="text"
               value="${escHtml(txMedFDoseInput)}" placeholder="e.g. 200mg" maxlength="20">
      </div>
    </div>
    <div class="prn-stg-form__actions">
      <button class="stg-add-btn" style="background:transparent;border:1px solid var(--clr-border);color:var(--clr-text-2)" type="button" id="tx-f-cancel">Cancel</button>
      <button class="stg-add-btn" type="button" id="tx-f-save">${mode === 'add' ? 'Add' : 'Save'}</button>
    </div>
  `;

  wrap.querySelector('#tx-f-name').addEventListener('input', e => { txMedFName = e.target.value; });

  const tagInput = wrap.querySelector('#tx-dose-tag-input');
  tagInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = tagInput.value.trim().replace(/,$/, '');
      if (val && !txMedFDoses.includes(val)) {
        txMedFDoses = [...txMedFDoses, val];
        txMedFDoseInput = '';
      }
      render();
    } else if (e.key === 'Backspace' && tagInput.value === '' && txMedFDoses.length > 0) {
      txMedFDoses = txMedFDoses.slice(0, -1);
      render();
    }
  });
  tagInput.addEventListener('input', e => { txMedFDoseInput = e.target.value; });

  wrap.querySelectorAll('.prn-dose-tag__del').forEach(btn => {
    btn.addEventListener('click', () => {
      txMedFDoses = txMedFDoses.filter(d => d !== btn.dataset.dose);
      render();
    });
  });

  wrap.querySelector('#tx-f-cancel').addEventListener('click', () => {
    txMedForm = null;
    render();
  });

  wrap.querySelector('#tx-f-save').addEventListener('click', () => saveTxMedForm(mode, med?.id));
  return wrap;
}

function startTxMedEdit(med) {
  txMedForm       = med.id;
  txMedFName      = med.name ?? '';
  txMedFDoses     = [...(med.doses ?? [])];
  txMedFDoseInput = '';
  render();
}

function saveTxMedForm(mode, editId) {
  const name = txMedFName.trim();
  if (!name) {
    const el = document.getElementById('tx-f-name');
    if (el) el.classList.add('prn-stg-form__input--error');
    return;
  }

  const d = Data.getData();
  if (!d.treatment_medications) d.treatment_medications = {};

  if (mode === 'add') {
    const id = crypto.randomUUID();
    d.treatment_medications[id] = {
      id,
      name,
      doses:  [...txMedFDoses],
      active: true,
      notes:  '',
    };
  } else {
    const med = d.treatment_medications[editId];
    if (med) {
      med.name  = name;
      med.doses = [...txMedFDoses];
    }
  }

  txMedForm = null;
  render();
  scheduleSave();
}

function archiveTxMed(id) {
  const med = (Data.getData().treatment_medications ?? {})[id];
  if (med) med.active = false;
  txMedForm = null;
  render();
  scheduleSave();
}
```

**Step 3:** In `render()` (around line 27), add `wrap.appendChild(buildTreatmentMedsCard());` after `buildPrnMedsCard()`:

```js
wrap.appendChild(buildHabitsCard());
wrap.appendChild(buildSubstancesCard());
wrap.appendChild(buildPrnMedsCard());
wrap.appendChild(buildTreatmentMedsCard());   // ← add this line
wrap.appendChild(buildCategoriesCard());
```

**Step 4:** Add `focusTxMeds()` function after `focusPrnMeds()`:

```js
function focusTxMeds() {
  const el = document.getElementById('stg-tx-meds-card');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
```

**Step 5:** Add `focusTxMeds` to the public return:

```js
return { init, render, focusPrnMeds, focusTxMeds };
```

**Step 6:** Verify — open Settings, scroll down, confirm "Treatment Medications" card appears. Add a medication (e.g. "Ketamine", dose "200mg"). Confirm it saves.

**Step 7:** Commit:
```bash
git add js/settings.js
git commit -m "feat(settings): add Treatment Medications configuration card"
```

---

### Task 5: Show treatment badge on linked BP entries in health-log.js

**File:** `js/health-log.js` — inside `renderBPSection()`

**Step 1:** In the BP entry row template (around line 266), find the block that builds each entry and add a treatment badge after the context badge:

Find this section inside the `.map(e => { ... })` call:
```js
<span class="hl-bp-ctx-badge" style="--ctx-clr:${ctxColor}">${escHtml(e.context ?? '')}</span>
${e.notes ? `<span class="hl-bp-notes">${escHtml(e.notes)}</span>` : ''}
```

Replace with:
```js
<span class="hl-bp-ctx-badge" style="--ctx-clr:${ctxColor}">${escHtml(e.context ?? '')}</span>
${e.treatment_id ? `<span class="hl-bp-tx-badge" title="Logged during a treatment">Tx</span>` : ''}
${e.notes ? `<span class="hl-bp-notes">${escHtml(e.notes)}</span>` : ''}
```

**Step 2:** Verify — add a BP reading inside a treatment, then open Health Log → Blood Pressure. Confirm the entry shows a small "Tx" badge.

**Step 3:** Commit:
```bash
git add js/health-log.js
git commit -m "feat(health-log): show Tx badge on BP entries linked to a treatment"
```

---

### Task 6: Wire Treatments in app.js

**File:** `js/app.js`

**Step 1:** In `switchTab()` (around line 75), add:

```js
if (name === 'treatments') Treatments.render();
```

After `if (name === 'health-log') HealthLog.render();`

**Step 2:** In `showMain()` (around line 127), add `Treatments.init();` after `HealthLog.init();`:

```js
HealthLog.init();
Treatments.init();
```

**Step 3:** In `handlePopState()`, add Treatments back-navigation handling after the HealthLog exit:

```js
if (typeof HealthLog    !== 'undefined') HealthLog._exitDetail();
if (typeof Treatments   !== 'undefined') Treatments._exitDetail();
switchTab(s.tab, false);
```

Also handle the `tx-detail` history state — when `s.ht === 'tx-detail'`, render the detail again:

```js
function handlePopState(e) {
  const s = e.state;
  if (!s?.ht) return;
  if (s.ht === 'tab') {
    if (typeof HealthLog  !== 'undefined') HealthLog._exitDetail();
    if (typeof Treatments !== 'undefined') Treatments._exitDetail();
    switchTab(s.tab, false);
  } else if (s.ht === 'tx-detail') {
    // Back from within a treatment detail — return to treatment list
    if (typeof Treatments !== 'undefined') {
      Treatments._exitDetail();
      App.switchTab('treatments', false);
    }
  } else if (s.ht === 'hl-detail') {
    if (typeof HealthLog !== 'undefined') HealthLog._exitDetail();
    App.switchTab('health-log', false);
  }
}
```

Note: check what the existing `handlePopState` looks like for `hl-detail` and make sure this matches the pattern already in use. Adapt as needed to stay consistent.

**Step 4:** Verify — open Treatments, add a treatment, view its detail, tap back button, confirm returning to the list.

**Step 5:** Commit:
```bash
git add js/app.js
git commit -m "feat(app): wire Treatments tab init, render, and popstate handling"
```

---

### Task 7: Add CSS for treatments tab

**File:** `css/styles.css`

Add the following block at the end of the file (before the final comment if any):

```css
/* ═══════════════════════════════════════════════════════════════════════════
   Treatments tab
═══════════════════════════════════════════════════════════════════════════ */

#tab-treatments {
  padding-bottom: max(80px, calc(65px + env(safe-area-inset-bottom)));
}

/* ── Header ──────────────────────────────────────────────────────────────── */

.tx-tab-header {
  display:         flex;
  align-items:     center;
  justify-content: space-between;
  padding:         16px 16px 10px;
  border-bottom:   1px solid var(--clr-border);
}
.tx-tab-title {
  font-size:   1.1rem;
  font-weight: 700;
  color:       var(--clr-text);
}
.tx-add-btn {
  font-size:     0.82rem;
  font-weight:   600;
  padding:       6px 12px;
  border-radius: 8px;
  border:        1px solid var(--clr-accent);
  background:    transparent;
  color:         var(--clr-accent);
  cursor:        pointer;
  transition:    background var(--transition), color var(--transition);
}
.tx-add-btn:hover { background: var(--clr-accent-dim); }

/* ── List view ───────────────────────────────────────────────────────────── */

.tx-list {
  padding: 8px 0;
}
.tx-empty {
  padding:    24px 16px;
  color:      var(--clr-text-2);
  font-size:  0.88rem;
  text-align: center;
}
.tx-list-item {
  padding:       12px 16px;
  border-bottom: 1px solid var(--clr-border);
  cursor:        pointer;
  transition:    background var(--transition);
}
.tx-list-item:last-child { border-bottom: none; }
.tx-list-item:active     { background: var(--clr-surface-2); }
.tx-list-item__row1 {
  display:     flex;
  align-items: center;
  gap:         10px;
  margin-bottom: 3px;
}
.tx-list-item__date {
  font-size:   0.88rem;
  font-weight: 600;
  color:       var(--clr-text);
}
.tx-list-item__time {
  font-size: 0.78rem;
  color:     var(--clr-text-2);
}
.tx-list-item__med {
  font-size:     0.82rem;
  font-weight:   500;
  color:         var(--clr-accent);
  margin-bottom: 2px;
}
.tx-list-item__intention {
  font-size:  0.78rem;
  color:      var(--clr-text-2);
  font-style: italic;
}

/* ── Detail view ─────────────────────────────────────────────────────────── */

.tx-back-btn {
  display:       inline-flex;
  align-items:   center;
  gap:           4px;
  margin:        12px 16px 4px;
  font-size:     0.82rem;
  font-weight:   500;
  color:         var(--clr-accent);
  background:    none;
  border:        none;
  cursor:        pointer;
  padding:       4px 0;
}
.tx-detail {
  padding-bottom: 32px;
}
.tx-detail-header {
  padding:       12px 16px 10px;
  border-bottom: 1px solid var(--clr-border);
}
.tx-detail-title {
  font-size:   1.1rem;
  font-weight: 700;
  color:       var(--clr-text);
  margin-bottom: 3px;
}
.tx-detail-sub {
  font-size: 0.82rem;
  color:     var(--clr-text-2);
}
.tx-detail-section {
  padding:       14px 16px;
  border-bottom: 1px solid var(--clr-border);
}
.tx-detail-section:last-of-type { border-bottom: none; }
.tx-section-label {
  font-size:      0.72rem;
  font-weight:    700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color:          var(--clr-text-2);
  margin-bottom:  8px;
}
.tx-intention-text,
.tx-notes-text {
  font-size:   0.9rem;
  color:       var(--clr-text);
  line-height: 1.5;
  white-space: pre-wrap;
}
.tx-detail-actions {
  display:  flex;
  gap:      10px;
  padding:  14px 16px 0;
}
.tx-edit-btn {
  font-size:     0.82rem;
  font-weight:   500;
  padding:       6px 14px;
  border-radius: 7px;
  border:        1px solid var(--clr-border);
  background:    transparent;
  color:         var(--clr-text-2);
  cursor:        pointer;
  transition:    background var(--transition), color var(--transition), border-color var(--transition);
}
.tx-edit-btn:hover  { color: var(--clr-text); background: var(--clr-surface-2); border-color: var(--clr-text-2); }
.tx-delete-btn {
  font-size:     0.82rem;
  font-weight:   500;
  padding:       6px 14px;
  border-radius: 7px;
  border:        1px solid transparent;
  background:    transparent;
  color:         var(--clr-error);
  cursor:        pointer;
  transition:    background var(--transition), border-color var(--transition);
}
.tx-delete-btn:hover { border-color: var(--clr-error); background: var(--clr-surface-2); }

/* ── BP section within treatment detail ──────────────────────────────────── */

.tx-bp-groups {
  display:        flex;
  flex-direction: column;
  gap:            10px;
  margin-bottom:  12px;
}
.tx-bp-ctx-group {
  display:       flex;
  flex-direction: column;
  gap:           4px;
}
.tx-bp-ctx-label {
  font-size:   0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.tx-bp-ctx-empty {
  font-size: 0.8rem;
  color:     var(--clr-text-2);
  padding-left: 4px;
}
.tx-bp-row {
  display:     flex;
  flex-wrap:   wrap;
  gap:         8px;
  align-items: center;
  padding:     5px 0 5px 4px;
}
.tx-bp-reading {
  font-weight:          700;
  font-size:            0.95rem;
  font-variant-numeric: tabular-nums;
  color:                var(--clr-text);
}
.tx-bp-pulse,
.tx-bp-time,
.tx-bp-date-label,
.tx-bp-notes {
  font-size: 0.78rem;
  color:     var(--clr-text-2);
}
.tx-bp-actions {
  display:     flex;
  gap:         6px;
  margin-left: auto;
}
.tx-add-bp-btn {
  font-size:     0.82rem;
  font-weight:   500;
  padding:       6px 12px;
  border-radius: 7px;
  border:        1px solid var(--clr-border);
  background:    transparent;
  color:         var(--clr-text-2);
  cursor:        pointer;
  transition:    background var(--transition), color var(--transition), border-color var(--transition);
}
.tx-add-bp-btn:hover {
  color:        var(--clr-accent);
  border-color: var(--clr-accent);
  background:   var(--clr-accent-dim);
}

/* ── Inline BP form ──────────────────────────────────────────────────────── */

.tx-bp-form {
  background:    var(--clr-surface-2);
  border-radius: 10px;
  padding:       14px;
  margin-top:    8px;
}
.tx-bp-form-row {
  display:  flex;
  gap:      10px;
  flex-wrap: wrap;
}
.tx-bp-form-actions {
  display:         flex;
  justify-content: flex-end;
  gap:             8px;
  margin-top:      10px;
}

/* ── Add/edit treatment form ─────────────────────────────────────────────── */

.tx-form-wrap {
  padding-bottom: 32px;
}
.tx-form {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap:     14px;
}
.tx-form-row {
  display:  flex;
  gap:      10px;
  flex-wrap: wrap;
}
.tx-form-field {
  display:        flex;
  flex-direction: column;
  gap:            5px;
  flex:           1;
  min-width:      110px;
}
.tx-form-label {
  font-size:   0.75rem;
  font-weight: 600;
  color:       var(--clr-text-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.tx-form-textarea {
  width:         100%;
  padding:       8px 10px;
  border-radius: 8px;
  border:        1px solid var(--clr-border);
  background:    var(--clr-surface-2);
  color:         var(--clr-text);
  font-size:     0.9rem;
  font-family:   inherit;
  resize:        vertical;
  transition:    border-color var(--transition);
  box-sizing:    border-box;
}
.tx-form-textarea:focus {
  outline:       none;
  border-color:  var(--clr-accent);
}
.tx-save-btn {
  font-size:     0.82rem;
  font-weight:   600;
  padding:       6px 14px;
  border-radius: 8px;
  border:        none;
  background:    var(--clr-accent);
  color:         #fff;
  cursor:        pointer;
  transition:    opacity var(--transition);
}
.tx-save-btn:hover    { opacity: 0.88; }
.tx-no-meds-hint {
  font-size:     0.82rem;
  color:         var(--clr-text-2);
  background:    var(--clr-surface-2);
  border-radius: 8px;
  padding:       10px 12px;
  display:       flex;
  align-items:   center;
  gap:           8px;
  flex-wrap:     wrap;
}
.tx-link-btn {
  background:  none;
  border:      none;
  color:       var(--clr-accent);
  font-size:   0.82rem;
  font-weight: 600;
  cursor:      pointer;
  padding:     0;
  text-decoration: underline;
}

/* ── Health Log: treatment badge on BP entries ───────────────────────────── */

.hl-bp-tx-badge {
  font-size:     0.68rem;
  font-weight:   700;
  padding:       2px 6px;
  border-radius: 10px;
  background:    var(--clr-accent-dim);
  color:         var(--clr-accent);
  letter-spacing: 0.03em;
  white-space:   nowrap;
}
```

**Step 1:** Append the CSS block above to the end of `css/styles.css`.

**Step 2:** Verify visually:
- Treatment list: clean rows with date, time, med/dose, intention snippet
- Treatment detail: sections are well-spaced with labels
- BP context groups: "At Rest / Mid-Treatment / Post-Treatment" labels are colored
- BP form: inset surface-2 background, matches health log form style
- Add/edit form: consistent with rest of app

**Step 3:** Commit:
```bash
git add css/styles.css
git commit -m "feat(treatments): add CSS for treatments tab — list, detail, forms, BP section"
```

---

### Task 8: Bump version

**File:** `js/config.js`

**Step 1:** Change:
```js
const APP_VERSION = '2026.03.01';
```
To:
```js
const APP_VERSION = '2026.03.02';
```

**Step 2:** Commit and push:
```bash
git add js/config.js
git commit -m "chore: bump version to 2026.03.02 — Treatments tab"
git push
```

---

## Summary of Changes

| File | Change |
|---|---|
| `js/data.js` | Add `treatment_medications: {}` and `treatments: {}` to schema defaults |
| `index.html` | Add `#tab-treatments` div; reorder nav (Today→Treatments→Health Log→Library→Reports); add `<script>` tag |
| `js/treatments.js` | **New file** — full Treatments module (list, detail, add/edit form, inline BP CRUD) |
| `js/settings.js` | Add `buildTreatmentMedsCard()` + form functions + `focusTxMeds()`; wire into `render()` |
| `js/health-log.js` | Add `hl-bp-tx-badge` span on BP entries that have a `treatment_id` |
| `js/app.js` | Add `Treatments.init()`, `Treatments.render()` in `switchTab`, `Treatments._exitDetail()` in `handlePopState` |
| `css/styles.css` | Full treatments tab CSS block + `.hl-bp-tx-badge` |
| `js/config.js` | Bump version to `2026.03.02` |
