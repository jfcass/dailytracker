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

  // Dose chip editing state
  let _editDoses      = [];     // doses[] being built in the edit form
  let _editDosesForId = null;   // tracks which _editId the doses were loaded for

  // Collapsible group state (Set of group keys that are collapsed)
  let _collapsedGroups = new Set();

  // Group definitions for list view
  const GROUPS = [
    { key: 'am',        label: 'AM',         test: m => (m.slots ?? []).includes('am') },
    { key: 'afternoon', label: 'Afternoon',   test: m => (m.slots ?? []).includes('afternoon') },
    { key: 'pm',        label: 'PM',          test: m => (m.slots ?? []).includes('pm') },
    { key: 'as_needed', label: 'As Needed',   test: m => !!m.as_needed },
    { key: 'reminder',  label: 'Reminders',   test: m => !!m.med_reminder && !(m.slots ?? []).length && !m.as_needed },
  ];

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

    // Initialise dose list when first entering a specific edit form
    if (_editId) {
      if (_editId !== _editDosesForId) {
        const med = _editId === '__new__' ? {} : (getAllMeds().find(m => m.id === _editId) ?? {});
        _editDoses      = [...(med.doses ?? [])];
        _editDosesForId = _editId;
      }
    } else {
      _editDosesForId = null;
      _editDoses      = [];
    }

    content.innerHTML = _editId ? renderEditForm() : renderList();
    wireEvents();
  }

  // ── List view ─────────────────────────────────────────────────────────────

  function renderList() {
    const meds     = getAllMeds();
    const active   = meds.filter(m => m.active);
    const archived = meds.filter(m => !m.active);

    const medRow = m => {
      const chips = [];
      if ((m.slots ?? []).includes('am'))        chips.push(`AM${m.slot_doses?.am ? ' · ' + escHtml(m.slot_doses.am) : ''}`);
      if ((m.slots ?? []).includes('afternoon')) chips.push(`Afternoon${m.slot_doses?.afternoon ? ' · ' + escHtml(m.slot_doses.afternoon) : ''}`);
      if ((m.slots ?? []).includes('pm'))        chips.push(`PM${m.slot_doses?.pm ? ' · ' + escHtml(m.slot_doses.pm) : ''}`);
      if (m.as_needed) {
        let prn = 'As Needed';
        if (m.min_interval_hours) prn += ` · ${m.min_interval_hours}h interval`;
        if (m.max_daily_doses)    prn += ` · max ${m.max_daily_doses}/day`;
        chips.push(prn);
      }
      if (m.med_reminder) chips.push('Reminder');

      return `<div class="mmg-med-row" data-med-id="${escHtml(m.id)}">
        <div class="mmg-med-name">${escHtml(m.name)}</div>
        <div class="mmg-med-chips">${chips.map(c => `<span class="mmg-chip">${c}</span>`).join('')}</div>
      </div>`;
    };

    let html = '';

    if (!active.length) {
      html = `<p class="mmg-empty">No medications configured yet. Tap + Add to get started.</p>`;
    } else {
      // Render each group
      const assignedIds = new Set();

      GROUPS.forEach(({ key, label, test }) => {
        const groupMeds = active.filter(test).sort((a, b) => a.name.localeCompare(b.name));
        if (!groupMeds.length) return;
        groupMeds.forEach(m => assignedIds.add(m.id));
        const collapsed = _collapsedGroups.has(key);
        html += `<div class="mmg-group">
          <button class="mmg-group-header" data-toggle-group="${escHtml(key)}">
            <span class="mmg-group-chevron">${collapsed ? '▸' : '▾'}</span>
            <span class="mmg-group-name">${label}</span>
            <span class="mmg-group-count">${groupMeds.length}</span>
          </button>
          ${collapsed ? '' : `<div class="mmg-group-body">${groupMeds.map(medRow).join('')}</div>`}
        </div>`;
      });

      // Uncategorised meds (no slot, no as_needed, no reminder)
      const uncat = active.filter(m => !assignedIds.has(m.id)).sort((a, b) => a.name.localeCompare(b.name));
      if (uncat.length) {
        const collapsed = _collapsedGroups.has('_other');
        html += `<div class="mmg-group">
          <button class="mmg-group-header" data-toggle-group="_other">
            <span class="mmg-group-chevron">${collapsed ? '▸' : '▾'}</span>
            <span class="mmg-group-name">Other</span>
            <span class="mmg-group-count">${uncat.length}</span>
          </button>
          ${collapsed ? '' : `<div class="mmg-group-body">${uncat.map(medRow).join('')}</div>`}
        </div>`;
      }
    }

    if (archived.length) {
      html += `<button class="mmg-archive-toggle" id="mmg-archive-toggle">
        ${_showArchive ? '▾' : '▸'} Archived (${archived.length})
      </button>`;
      if (_showArchive) {
        html += `<div class="mmg-archived">${archived.map(m => {
          const chips = [];
          if ((m.slots ?? []).includes('am'))        chips.push('AM');
          if ((m.slots ?? []).includes('afternoon')) chips.push('Afternoon');
          if ((m.slots ?? []).includes('pm'))        chips.push('PM');
          if (m.as_needed)   chips.push('As Needed');
          if (m.med_reminder) chips.push('Reminder');
          return `<div class="mmg-med-row" data-med-id="${escHtml(m.id)}">
            <div class="mmg-med-name">${escHtml(m.name)}</div>
            <div class="mmg-med-chips">${chips.map(c => `<span class="mmg-chip">${c}</span>`).join('')}</div>
          </div>`;
        }).join('')}</div>`;
      }
    }

    return html;
  }

  // ── Edit form ─────────────────────────────────────────────────────────────

  function renderEditForm() {
    const isNew = _editId === '__new__';
    const med = isNew ? {} : (getAllMeds().find(m => m.id === _editId) ?? {});

    const slots     = med.slots     ?? [];
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

    // Dose option chips
    const doseChips = _editDoses.map((d, i) =>
      `<span class="mmg-dose-tag">${escHtml(d)}<button class="mmg-dose-tag-del" data-dose-idx="${i}" type="button" aria-label="Remove ${escHtml(d)}">×</button></span>`
    ).join('');

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

        <div class="mmg-section-label">Dose Options</div>
        <p class="mmg-field-hint">Available doses shown as quick-pick chips when logging</p>
        <div class="mmg-dose-tags" id="mmg-dose-tags">${doseChips}</div>
        <div class="mmg-dose-input-row">
          <input type="text" class="mmg-text-input mmg-dose-input" id="mmg-dose-input"
                 placeholder="e.g. 400mg" maxlength="30">
          <button class="mmg-dose-add-btn" id="mmg-dose-add-btn" type="button">Add</button>
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

    // List: group header toggle collapse
    content.querySelectorAll('[data-toggle-group]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.toggleGroup;
        if (_collapsedGroups.has(key)) _collapsedGroups.delete(key);
        else _collapsedGroups.add(key);
        render();
      });
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

    // Form: dose chip removal
    content.querySelectorAll('[data-dose-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.doseIdx, 10);
        if (!isNaN(idx)) {
          _editDoses.splice(idx, 1);
          render();
        }
      });
    });

    // Form: dose add (button + Enter key)
    const doseInput  = content.querySelector('#mmg-dose-input');
    const doseAddBtn = content.querySelector('#mmg-dose-add-btn');
    const addDose = () => {
      const val = doseInput?.value.trim();
      if (val && !_editDoses.includes(val)) {
        _editDoses.push(val);
        render();
      }
    };
    doseAddBtn?.addEventListener('click', addDose);
    doseInput?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addDose(); }
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

    const asNeeded = content.querySelector('#mmg-as-needed')?.checked ?? false;
    const interval = parseFloat(content.querySelector('#mmg-interval')?.value) || null;
    const maxDoses = parseInt(content.querySelector('#mmg-max-doses')?.value, 10) || null;
    const reminder = content.querySelector('#mmg-reminder')?.checked ?? false;
    const recDose  = content.querySelector('#mmg-rec-dose')?.value.trim() ?? '';
    const notes    = content.querySelector('#mmg-notes')?.value.trim() ?? '';
    const doses    = [..._editDoses];

    const meds  = Data.getData().medications ?? (Data.getData().medications = {});
    const isNew = _editId === '__new__';

    if (isNew) {
      const id = crypto.randomUUID();
      meds[id] = { id, name, active: true, slots, slot_doses: slotDoses,
                   as_needed: asNeeded, min_interval_hours: interval,
                   max_daily_doses: maxDoses, med_reminder: reminder,
                   doses, recommended_dose: recDose, notes };
    } else {
      const med = meds[_editId];
      if (med) {
        Object.assign(med, { name, slots, slot_doses: slotDoses,
          as_needed: asNeeded, min_interval_hours: interval,
          max_daily_doses: maxDoses, med_reminder: reminder,
          doses, recommended_dose: recDose, notes });
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
