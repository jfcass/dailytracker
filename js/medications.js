/**
 * medications.js — PRN (As-Needed) Medication Tracker
 *
 * Today tab section: shows dose cards for meds taken in the last 24h,
 * with cooldown countdown and daily dose count.
 *
 * Renders into #prn-list (built by render()).
 * A setInterval (30s) keeps countdowns live.
 *
 * Data written:
 *   Data.getDay(date).prn_doses — array of
 *     { id, medication_id, iso_timestamp, dose, notes }
 *
 * Med definitions:
 *   Data.getData().medications[id] — { id, name, doses[], min_interval_hours,
 *                                       max_daily_doses, as_needed, active, notes }
 */
const Medications = (() => {

  // ── State ──────────────────────────────────────────────────────────────────

  let currentDate    = null;
  let showForm       = false;   // is the log-dose form open?
  let fMedId         = '';      // selected med in log form
  let fDose          = '';      // selected dose chip
  let fNote          = '';      // note text
  let fTime          = '';      // time for new dose (HH:MM)
  let editingDoseId  = null;    // id of dose card currently in edit mode
  let eFDose         = '';      // edit form: selected dose
  let eFTime         = '';      // edit form: time
  let eFNote         = '';      // edit form: note
  let tickTimer      = null;

  // ── Public API ─────────────────────────────────────────────────────────────

  function init() {
    currentDate = DateNav.getDate();
    render();
    startTick();
  }

  function setDate(date) {
    currentDate   = date;
    showForm      = false;
    fMedId        = '';
    fDose         = '';
    fNote         = '';
    fTime         = '';
    editingDoseId = null;
    render();
  }

  // ── Tick — refresh countdowns every 30s ────────────────────────────────────

  function startTick() {
    clearInterval(tickTimer);
    tickTimer = setInterval(render, 30_000);
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  function render() {
    const list = document.getElementById('prn-list');
    if (!list) return;

    const activeMeds = getActiveMeds();

    // Collect all prn_doses from today + yesterday that are within 24h
    const now       = Date.now();
    const cutoff    = now - 24 * 60 * 60 * 1000;
    const todayDoses    = (Data.getDay(currentDate).prn_doses ?? []);
    const yesterdayDoses = (Data.getDay(shiftDate(currentDate, -1)).prn_doses ?? []);
    const recentDoses = [...yesterdayDoses, ...todayDoses]
      .filter(d => new Date(d.iso_timestamp).getTime() > cutoff)
      .sort((a, b) => new Date(b.iso_timestamp) - new Date(a.iso_timestamp));

    list.innerHTML = '';

    // Render one card per recent dose (most recent first)
    recentDoses.forEach(dose => {
      const med = activeMeds.find(m => m.id === dose.medication_id)
                  ?? Object.values(Data.getData().medications ?? {}).find(m => m.id === dose.medication_id);
      if (!med) return;
      if (editingDoseId === dose.id) {
        list.appendChild(buildEditForm(dose, med));
      } else {
        list.appendChild(makeDoseCard(dose, med, recentDoses));
      }
    });

    // Log form or Add button
    if (showForm) {
      list.appendChild(buildLogForm(activeMeds, recentDoses));
    } else {
      const btn = document.createElement('button');
      btn.className   = 'prn-add-btn';
      btn.type        = 'button';
      btn.innerHTML   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
        width="14" height="14" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/></svg> Log dose`;
      btn.addEventListener('click', openForm);
      list.appendChild(btn);
    }
  }

  // ── Dose card ──────────────────────────────────────────────────────────────

  function makeDoseCard(dose, med, allRecentDoses) {
    const ts        = new Date(dose.iso_timestamp);
    const timeStr   = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isoDate   = dose.iso_timestamp.slice(0, 10);
    const isToday   = isoDate === currentDate;
    const dayLabel  = isToday ? '' : 'yesterday · ';

    // Cooldown remaining for this med (based on most recent dose of this med)
    const lastDose    = allRecentDoses.find(d => d.medication_id === med.id);
    const isThisLast  = lastDose?.id === dose.id;
    const remaining   = isThisLast ? cooldownRemaining(med, allRecentDoses) : 0;
    const cooling     = remaining > 0;

    // Daily dose count (doses in last 24h for this med)
    const dosesIn24h  = allRecentDoses.filter(d => d.medication_id === med.id).length;
    const maxDoses    = med.max_daily_doses ?? null;
    const countLabel  = maxDoses ? `${dosesIn24h} of ${maxDoses}` : null;

    const card = document.createElement('div');
    card.className = 'prn-card' + (cooling ? ' prn-card--cooling' : '');

    card.innerHTML = `
      <div class="prn-card__info">
        <div class="prn-card__name">${escHtml(med.name)} ${escHtml(dose.dose)}</div>
        <div class="prn-card__meta">${dayLabel}${timeStr}${dose.notes ? ' · ' + escHtml(dose.notes) : ''}</div>
      </div>
      <div class="prn-card__right">
        ${cooling && isThisLast
          ? `<span class="prn-card__countdown">⏱ ${fmtMs(remaining)}</span>`
          : ''}
        ${countLabel ? `<span class="prn-card__count">${escHtml(countLabel)}</span>` : ''}
        <button class="prn-card__del" type="button" aria-label="Remove dose">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `;

    card.querySelector('.prn-card__del').addEventListener('click', e => {
      e.stopPropagation();
      deleteDose(dose);
    });
    card.addEventListener('click', () => startEdit(dose));
    card.style.cursor = 'pointer';
    return card;
  }

  // ── Edit form (for existing dose cards) ────────────────────────────────────

  function startEdit(dose) {
    editingDoseId = dose.id;
    eFTime  = dose.iso_timestamp.slice(11, 16);  // "HH:MM"
    eFDose  = dose.dose  ?? '';
    eFNote  = dose.notes ?? '';
    showForm = false;
    render();
  }

  function buildEditForm(dose, med) {
    const wrap = document.createElement('div');
    wrap.className = 'prn-log-form';

    const doses = med?.doses ?? [];
    const doseChips = doses.map(d =>
      `<button class="prn-dose-chip${d === eFDose ? ' prn-dose-chip--active' : ''}"
               type="button" data-dose="${escHtml(d)}">${escHtml(d)}</button>`
    ).join('');

    wrap.innerHTML = `
      <div class="prn-log-form__row">
        <span class="prn-log-form__label">Time</span>
        <input class="prn-log-form__select" type="time" id="prn-edit-time"
               value="${escHtml(eFTime)}" style="max-width:120px">
      </div>
      ${doses.length > 0 ? `
      <div class="prn-log-form__row">
        <span class="prn-log-form__label">Dose</span>
        <div class="prn-dose-chips">${doseChips}</div>
      </div>` : ''}
      <div class="prn-log-form__row">
        <span class="prn-log-form__label">Note</span>
        <input class="prn-log-form__note" type="text" id="prn-edit-note"
               value="${escHtml(eFNote)}" placeholder="Optional" maxlength="200">
      </div>
      <div class="prn-log-form__actions">
        <button class="prn-cancel-btn" type="button" id="prn-edit-delete"
                style="color:var(--clr-error);border-color:var(--clr-error)">Delete</button>
        <span style="flex:1"></span>
        <button class="prn-cancel-btn" type="button" id="prn-edit-cancel">Cancel</button>
        <button class="prn-log-btn"    type="button" id="prn-edit-save">Save</button>
      </div>
    `;

    wrap.querySelector('#prn-edit-time').addEventListener('input', e => { eFTime = e.target.value; });
    wrap.querySelector('#prn-edit-note').addEventListener('input', e => { eFNote = e.target.value; });

    wrap.querySelectorAll('.prn-dose-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        eFDose = btn.dataset.dose === eFDose ? '' : btn.dataset.dose;
        render();
      });
    });

    wrap.querySelector('#prn-edit-cancel').addEventListener('click', () => {
      editingDoseId = null;
      render();
    });

    wrap.querySelector('#prn-edit-save').addEventListener('click', () => saveEdit(dose));
    wrap.querySelector('#prn-edit-delete').addEventListener('click', () => {
      editingDoseId = null;
      deleteDose(dose);
    });

    return wrap;
  }

  function saveEdit(dose) {
    if (!eFTime) return;
    const datePart = dose.iso_timestamp.slice(0, 10);
    const newIso   = `${datePart}T${eFTime}:00`;

    // Update in whichever day owns this dose
    [Data.getDay(currentDate), Data.getDay(shiftDate(currentDate, -1))].forEach(day => {
      if (!Array.isArray(day.prn_doses)) return;
      const idx = day.prn_doses.findIndex(d => d.id === dose.id);
      if (idx !== -1) {
        day.prn_doses[idx] = {
          ...day.prn_doses[idx],
          iso_timestamp: newIso,
          dose:  eFDose,
          notes: eFNote.trim(),
        };
      }
    });

    editingDoseId = null;
    render();
    scheduleSave();
  }

  // ── Log form ───────────────────────────────────────────────────────────────

  function buildLogForm(activeMeds, recentDoses) {
    const wrap = document.createElement('div');
    wrap.className = 'prn-log-form';

    // Pre-select first med if none chosen yet
    if (!fMedId && activeMeds.length > 0) fMedId = activeMeds[0].id;
    const med = activeMeds.find(m => m.id === fMedId);

    // Build med select options
    const medOptions = activeMeds.map(m =>
      `<option value="${escHtml(m.id)}" ${m.id === fMedId ? 'selected' : ''}>${escHtml(m.name)}</option>`
    ).join('');

    // Warnings
    const remaining = med ? cooldownRemaining(med, recentDoses) : 0;
    const dosesIn24h = med ? recentDoses.filter(d => d.medication_id === med.id).length : 0;
    const maxWarning = med?.max_daily_doses && dosesIn24h >= med.max_daily_doses
      ? `<div class="prn-log-form__warning">⚠ Max daily doses reached (${dosesIn24h} of ${med.max_daily_doses})</div>`
      : '';
    const coolWarn = remaining > 0
      ? `<div class="prn-log-form__warning">⏱ Next dose recommended after ${fmtMs(remaining)}</div>`
      : '';

    // Dose chips from med definition
    const doses = med?.doses ?? [];
    const doseChips = doses.map(d =>
      `<button class="prn-dose-chip${d === fDose ? ' prn-dose-chip--active' : ''}"
               type="button" data-dose="${escHtml(d)}">${escHtml(d)}</button>`
    ).join('');

    wrap.innerHTML = `
      <div class="prn-log-form__row">
        <span class="prn-log-form__label">Med</span>
        <select class="prn-log-form__select" id="prn-form-med">${medOptions}</select>
      </div>
      <div class="prn-log-form__row">
        <span class="prn-log-form__label">Time</span>
        <input class="prn-log-form__select" type="time" id="prn-form-time"
               value="${escHtml(fTime)}" style="max-width:120px">
      </div>
      ${doses.length > 0 ? `
      <div class="prn-log-form__row">
        <span class="prn-log-form__label">Dose</span>
        <div class="prn-dose-chips" id="prn-dose-chips">${doseChips}</div>
      </div>` : ''}
      ${coolWarn}${maxWarning}
      <div class="prn-log-form__row">
        <span class="prn-log-form__label">Note</span>
        <input class="prn-log-form__note" type="text" id="prn-form-note"
               value="${escHtml(fNote)}" placeholder="Optional" maxlength="200">
      </div>
      <div class="prn-log-form__actions">
        <button class="prn-cancel-btn" type="button">Cancel</button>
        <button class="prn-log-btn" type="button" id="prn-log-submit">Log</button>
      </div>
    `;

    wrap.querySelector('#prn-form-med').addEventListener('change', e => {
      fMedId = e.target.value;
      fDose  = '';
      render();
    });

    wrap.querySelector('#prn-form-time').addEventListener('input', e => {
      fTime = e.target.value;
    });

    wrap.querySelectorAll('.prn-dose-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        fDose = btn.dataset.dose === fDose ? '' : btn.dataset.dose;
        render();
      });
    });

    wrap.querySelector('#prn-form-note').addEventListener('input', e => {
      fNote = e.target.value;
    });

    wrap.querySelector('.prn-cancel-btn').addEventListener('click', () => {
      showForm = false;
      render();
    });

    wrap.querySelector('#prn-log-submit').addEventListener('click', submitLog);

    return wrap;
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  function openForm() {
    showForm      = true;
    editingDoseId = null;
    fDose         = '';
    fNote         = '';
    // Default time to now
    const now = new Date();
    fTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    render();
  }

  function submitLog() {
    if (!fMedId) return;

    // Use user-specified time (or fall back to now if somehow empty)
    const timeStr = fTime || (() => {
      const n = new Date();
      return String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
    })();
    const iso = `${currentDate}T${timeStr}:00`;

    const dose = {
      id:             crypto.randomUUID(),
      medication_id:  fMedId,
      iso_timestamp:  iso,
      dose:           fDose,
      notes:          fNote.trim(),
    };

    const day = Data.getDay(currentDate);
    if (!Array.isArray(day.prn_doses)) day.prn_doses = [];
    day.prn_doses.push(dose);

    showForm = false;
    fDose    = '';
    fNote    = '';
    render();
    scheduleSave();
  }

  function deleteDose(dose) {
    // Find which day this dose belongs to
    const today = Data.getDay(currentDate);
    const yest  = Data.getDay(shiftDate(currentDate, -1));

    [today, yest].forEach(day => {
      if (!Array.isArray(day.prn_doses)) return;
      day.prn_doses = day.prn_doses.filter(d => d.id !== dose.id);
    });

    render();
    scheduleSave();
  }

  // ── Cooldown helpers ───────────────────────────────────────────────────────

  /** Returns ms remaining in cooldown for a med (0 = ready). */
  function cooldownRemaining(med, recentDoses) {
    if (!med.min_interval_hours) return 0;
    const last = recentDoses.find(d => d.medication_id === med.id);
    if (!last) return 0;
    const readyAt = new Date(last.iso_timestamp).getTime() + med.min_interval_hours * 3600_000;
    return Math.max(0, readyAt - Date.now());
  }

  /** Format milliseconds as "Xh Ym" or "Ym". */
  function fmtMs(ms) {
    const totalMin = Math.ceil(ms / 60_000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0)           return `${h}h`;
    return `${m}m`;
  }

  // ── Data helpers ───────────────────────────────────────────────────────────

  function getActiveMeds() {
    const all = Data.getData().medications ?? {};
    return Object.values(all).filter(m => m.active && m.as_needed);
  }

  function shiftDate(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  let saveTimer = null;
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
        console.error('PRN save error:', err);
        setSaveStatus('error');
      }
    }, 1200);
  }

  function setSaveStatus(s) {
    const el = document.getElementById('prn-save-status');
    if (!el) return;
    el.dataset.status = s;
    el.textContent = { pending: 'Unsaved', saving: 'Saving…', saved: 'Saved',
                       error: 'Save failed', '': '' }[s] ?? '';
  }

  // ── escHtml ────────────────────────────────────────────────────────────────

  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  }

  return { init, render, setDate };
})();
