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
      detailId = formId;
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
