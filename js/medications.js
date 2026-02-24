/**
 * medications.js — Medication Tracker section
 *
 * Renders into the static #section-medications shell in index.html.
 *
 * Master list:  Data.getData().medications  — dict keyed by uuid
 *   { id, name, dose, frequency, timing[], start_date, end_date, active, as_needed, notes }
 *
 * Daily log:    Data.getDay(date).medications_taken  — array
 *   { medication_id, taken, time, dose_override, notes }
 */
const Medications = (() => {

  const TIMING_ORDER = { morning: 0, afternoon: 1, evening: 2 };

  // ── State ─────────────────────────────────────────────────────────────────

  let currentDate  = null;
  let editingMedId = null;   // med.id of row showing inline edit form
  let addingNew    = false;  // whether the add-medication form is open
  let saveTimer    = null;

  // Add-form state
  let fName    = '';
  let fDose    = '';
  let fTimings = [];   // e.g. ['morning', 'evening']

  // Edit-record form state (for an existing taken entry)
  let fTime         = '';
  let fDoseOverride = '';
  let fNotes        = '';

  // ── Public ────────────────────────────────────────────────────────────────

  function init() {
    currentDate = DateNav.getDate();
    render();
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function render() {
    const allMeds = Data.getData().medications ?? {};
    const active  = sortMeds(Object.values(allMeds).filter(m => m.active));
    const taken   = Data.getDay(currentDate).medications_taken ?? [];

    // Progress badge — count only non-as-needed (scheduled) meds
    const scheduled  = active.filter(m => !m.as_needed);
    const takenCount = scheduled.filter(m => taken.some(r => r.medication_id === m.id)).length;
    const badge = document.getElementById('med-progress-text');
    if (badge) {
      badge.textContent = scheduled.length > 0 ? `${takenCount} / ${scheduled.length}` : '';
    }

    const list = document.getElementById('med-list');
    list.innerHTML = '';

    if (active.length === 0 && !addingNew) {
      const empty = document.createElement('p');
      empty.className   = 'section-empty';
      empty.textContent = 'No medications added yet.';
      list.appendChild(empty);
    } else {
      active.forEach(med => {
        const record = taken.find(r => r.medication_id === med.id) ?? null;
        list.appendChild(makeMedRow(med, record));
      });
    }

    // Add form or Add button
    if (addingNew) {
      list.appendChild(buildAddForm());
    } else {
      const addBtn = document.createElement('button');
      addBtn.type      = 'button';
      addBtn.className = 'med-add-btn';
      addBtn.textContent = '+ Add Medication';
      addBtn.addEventListener('click', startAdd);
      list.appendChild(addBtn);
    }
  }

  // ── Medication row ────────────────────────────────────────────────────────

  function makeMedRow(med, record) {
    const wrap = document.createElement('div');
    wrap.className = 'med-row-wrap';

    const isTaken   = !!record;
    const isEditing = editingMedId === med.id;

    // Assemble meta line: dose · timing
    const metaParts = [med.dose, fmtTimings(med)].filter(Boolean);
    const metaText  = metaParts.join(' · ');

    const takenTimeHtml = (isTaken && record.time)
      ? `<span class="med-taken-time">${escHtml(record.time)}</span>`
      : '';

    const row = document.createElement('div');
    row.className = 'med-row'
      + (isTaken   ? ' med-row--taken'   : '')
      + (isEditing ? ' med-row--editing' : '');
    row.setAttribute('role', 'listitem');
    row.innerHTML = `
      <button class="med-check-btn${isTaken ? ' med-check-btn--taken' : ''}"
              type="button"
              aria-pressed="${isTaken}"
              aria-label="${isTaken ? 'Unmark' : 'Mark'} ${escHtml(med.name)} as taken">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"
             width="13" height="13" aria-hidden="true">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </button>
      <div class="med-info">
        <span class="med-name">${escHtml(med.name)}</span>
        ${metaText ? `<span class="med-meta">${escHtml(metaText)}</span>` : ''}
        ${takenTimeHtml}
      </div>
      ${isTaken
        ? `<button class="med-edit-btn" type="button" aria-label="Edit ${escHtml(med.name)} record">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                  width="14" height="14" aria-hidden="true">
               <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
               <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
             </svg>
           </button>`
        : ''
      }
    `;

    row.querySelector('.med-check-btn').addEventListener('click', () => toggleTaken(med));
    row.querySelector('.med-edit-btn')?.addEventListener('click', () => startEdit(med, record));

    wrap.appendChild(row);

    // Inline edit form for the taken record
    if (isEditing) {
      wrap.appendChild(buildEditForm(med, record));
    }

    return wrap;
  }

  // ── Edit-record form ──────────────────────────────────────────────────────

  function buildEditForm(med, record) {
    const form = document.createElement('div');
    form.className = 'med-edit-form';
    form.innerHTML = `
      <div class="med-form-field">
        <label class="med-form-label" for="med-time-input">Time taken</label>
        <input id="med-time-input" class="med-form-input med-time-input" type="time"
               value="${escHtml(fTime)}" aria-label="Time taken">
      </div>
      <div class="med-form-field">
        <label class="med-form-label" for="med-dose-input">
          Dose <span class="med-form-optional">(override)</span>
        </label>
        <input id="med-dose-input" class="med-form-input" type="text"
               value="${escHtml(fDoseOverride)}" maxlength="50"
               placeholder="${escHtml(med.dose || 'e.g. 500mg')}"
               aria-label="Dose override">
      </div>
      <div class="med-form-field">
        <label class="med-form-label" for="med-notes-input">Notes</label>
        <input id="med-notes-input" class="med-form-input" type="text"
               value="${escHtml(fNotes)}" maxlength="200"
               placeholder="Optional notes" aria-label="Notes">
      </div>
      <div class="med-form-actions">
        <button class="med-unmark-btn"  type="button">Unmark</button>
        <button class="med-archive-btn" type="button">Archive</button>
        <span   class="med-form-spacer"></span>
        <button class="med-cancel-btn"      type="button">Cancel</button>
        <button class="med-record-save-btn" type="button">Save</button>
      </div>
    `;

    form.querySelector('#med-time-input').addEventListener('input', e => {
      fTime = e.target.value;
    });
    form.querySelector('#med-dose-input').addEventListener('input', e => {
      fDoseOverride = e.target.value;
    });
    form.querySelector('#med-notes-input').addEventListener('input', e => {
      fNotes = e.target.value;
    });

    form.querySelector('.med-unmark-btn').addEventListener('click', () => clearTaken(med));
    form.querySelector('.med-archive-btn').addEventListener('click', () => archiveMed(med.id));
    form.querySelector('.med-cancel-btn').addEventListener('click', cancelEdit);
    form.querySelector('.med-record-save-btn').addEventListener('click', () => saveEdit(med));

    return form;
  }

  // ── Add-medication form ───────────────────────────────────────────────────

  function buildAddForm() {
    const TIMING_OPTIONS = [
      { value: 'morning',   label: 'Morning'   },
      { value: 'afternoon', label: 'Afternoon' },
      { value: 'evening',   label: 'Evening'   },
      { value: 'as_needed', label: 'As Needed' },
    ];

    const timingChips = TIMING_OPTIONS.map(opt => {
      const active = fTimings.includes(opt.value);
      return `<button class="med-timing-chip${active ? ' med-timing-chip--active' : ''}"
                      type="button" data-timing="${opt.value}"
                      aria-pressed="${active}">${opt.label}</button>`;
    }).join('');

    const form = document.createElement('div');
    form.className = 'med-add-form';
    form.innerHTML = `
      <div class="med-add-form-header">
        <span>Add Medication</span>
        <button class="med-add-cancel-btn" type="button">Cancel</button>
      </div>
      <div class="med-form-field">
        <label class="med-form-label" for="med-add-name">Name</label>
        <input id="med-add-name" class="med-form-input" type="text"
               value="${escHtml(fName)}" maxlength="100"
               placeholder="e.g. Metformin" aria-label="Medication name">
      </div>
      <div class="med-form-field">
        <label class="med-form-label" for="med-add-dose">
          Dose <span class="med-form-optional">(optional)</span>
        </label>
        <input id="med-add-dose" class="med-form-input" type="text"
               value="${escHtml(fDose)}" maxlength="50"
               placeholder="e.g. 500mg" aria-label="Dose">
      </div>
      <div class="med-form-field">
        <label class="med-form-label">Timing</label>
        <div class="med-timing-chips">${timingChips}</div>
      </div>
      <div class="med-form-actions">
        <button class="med-add-save-btn" type="button">Add</button>
      </div>
    `;

    form.querySelector('#med-add-name').addEventListener('input', e => {
      fName = e.target.value;
    });
    form.querySelector('#med-add-dose').addEventListener('input', e => {
      fDose = e.target.value;
    });

    form.querySelectorAll('.med-timing-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.timing;
        if (fTimings.includes(t)) {
          fTimings = fTimings.filter(x => x !== t);
        } else {
          fTimings = [...fTimings, t];
        }
        btn.classList.toggle('med-timing-chip--active', fTimings.includes(t));
        btn.setAttribute('aria-pressed', String(fTimings.includes(t)));
      });
    });

    form.querySelector('.med-add-cancel-btn').addEventListener('click', cancelAdd);
    form.querySelector('.med-add-save-btn').addEventListener('click', saveAdd);

    requestAnimationFrame(() => {
      const inp = form.querySelector('#med-add-name');
      if (inp) {
        inp.focus();
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    return form;
  }

  // ── State transitions ─────────────────────────────────────────────────────

  /** Toggle taken / not-taken. Records current time when marking taken. */
  function toggleTaken(med) {
    const day = Data.getDay(currentDate);
    const idx = day.medications_taken.findIndex(r => r.medication_id === med.id);
    if (idx !== -1) {
      day.medications_taken.splice(idx, 1);
    } else {
      const now  = new Date();
      const time = now.toTimeString().slice(0, 5);   // "HH:MM"
      day.medications_taken.push({
        medication_id: med.id,
        taken:         true,
        time,
        dose_override: null,
        notes:         '',
      });
    }
    editingMedId = null;
    render();
    scheduleSave();
  }

  function startEdit(med, record) {
    fTime         = record?.time ?? '';
    fDoseOverride = record?.dose_override ?? '';
    fNotes        = record?.notes ?? '';
    editingMedId  = med.id;
    addingNew     = false;
    render();
  }

  function cancelEdit() {
    editingMedId = null;
    render();
  }

  function saveEdit(med) {
    const timeEl  = document.getElementById('med-time-input');
    const doseEl  = document.getElementById('med-dose-input');
    const notesEl = document.getElementById('med-notes-input');

    const time  = (timeEl?.value  ?? fTime).trim();
    const dose  = (doseEl?.value  ?? fDoseOverride).trim();
    const notes = (notesEl?.value ?? fNotes).trim();

    const day = Data.getDay(currentDate);
    const idx = day.medications_taken.findIndex(r => r.medication_id === med.id);
    if (idx !== -1) {
      day.medications_taken[idx] = {
        ...day.medications_taken[idx],
        time:          time  || undefined,
        dose_override: dose  || null,
        notes,
      };
    }

    editingMedId = null;
    render();
    scheduleSave();
  }

  function clearTaken(med) {
    const day = Data.getDay(currentDate);
    day.medications_taken = day.medications_taken.filter(
      r => r.medication_id !== med.id
    );
    editingMedId = null;
    render();
    scheduleSave();
  }

  function archiveMed(medId) {
    const med = Data.getData().medications[medId];
    if (med) {
      med.active   = false;
      med.end_date = Data.today();
    }
    editingMedId = null;
    render();
    scheduleSave();
  }

  function startAdd() {
    fName    = '';
    fDose    = '';
    fTimings = [];
    addingNew    = true;
    editingMedId = null;
    render();
  }

  function cancelAdd() {
    addingNew = false;
    render();
  }

  function saveAdd() {
    const nameEl = document.getElementById('med-add-name');
    const doseEl = document.getElementById('med-add-dose');

    const name = (nameEl?.value ?? fName).trim();
    const dose = (doseEl?.value ?? fDose).trim();

    if (!name) {
      nameEl?.classList.add('input--error');
      return;
    }
    nameEl?.classList.remove('input--error');

    const asNeeded = fTimings.includes('as_needed');
    const timings  = fTimings.filter(t => t !== 'as_needed');
    const id       = crypto.randomUUID();

    Data.getData().medications[id] = {
      id,
      name,
      dose,
      frequency:  asNeeded ? 'as_needed' : 'daily',
      timing:     timings,
      start_date: Data.today(),
      end_date:   null,
      active:     true,
      as_needed:  asNeeded,
      notes:      '',
    };

    addingNew = false;
    render();
    scheduleSave();
  }

  // ── Date sync (called by DateNav) ────────────────────────────────────────

  function setDate(date) {
    editingMedId = null;
    addingNew    = false;
    currentDate  = date;
    render();
  }

  // ── Debounced save ────────────────────────────────────────────────────────

  function scheduleSave() {
    setSaveStatus('pending');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await Data.save();
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus(''), 2200);
      } catch (err) {
        console.error('Medications save failed:', err);
        setSaveStatus('error');
      }
    }, 1200);
  }

  function setSaveStatus(s) {
    const el = document.getElementById('med-save-status');
    if (!el) return;
    el.dataset.status = s;
    const labels = {
      pending: 'Unsaved', saving: 'Saving…', saved: 'Saved',
      error: 'Save failed', '': '',
    };
    el.textContent = labels[s] ?? '';
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function sortMeds(meds) {
    return [...meds].sort((a, b) => {
      // As-needed medications go after scheduled ones
      if (a.as_needed !== b.as_needed) return a.as_needed ? 1 : -1;
      // Within scheduled: sort by earliest timing slot
      const aOrder = Math.min(...(a.timing ?? []).map(t => TIMING_ORDER[t] ?? 3), 3);
      const bOrder = Math.min(...(b.timing ?? []).map(t => TIMING_ORDER[t] ?? 3), 3);
      return aOrder - bOrder;
    });
  }

  function fmtTimings(med) {
    if (med.as_needed) return 'as needed';
    if (!med.timing || med.timing.length === 0) return '';
    return med.timing.join(', ');
  }

  function fmtDateLabel(dateStr) {
    const today = Data.today();
    if (dateStr === today)                return 'Today';
    if (dateStr === shiftDate(today, -1)) return 'Yesterday';
    return new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  }

  function shiftDate(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return { init, render, setDate };
})();
