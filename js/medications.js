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
  let editMeds      = [];     // snapshot of med IDs that were in the slot at log time
  let editExtras    = [];     // { medication_id, dose } added in edit
  let editExtraMedId   = '';
  let editExtraDose    = '';
  let confirmingDelete = false;  // true while Delete confirmation is showing

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

  // Reminder edit state (time-input form before confirming + editing logged times)
  let reminderEditId   = null;   // med id whose input row is open (null = none)
  let reminderEditTime = '';     // HH:MM value in the input

  // Slot pending-log state (time input shown before confirming the batch log)
  let pendingLogSlot = null;     // 'am' | 'afternoon' | 'pm' | null
  let pendingLogTime = '';       // HH:MM value in the input

  // ── Public API ─────────────────────────────────────────────────────────────

  function init() {
    currentDate = DateNav.getDate();
    render();
    startTick();
  }

  function setDate(date) {
    currentDate      = date;
    editSlot         = null;
    pendingLogSlot   = null;
    prnFormOpen      = false;
    prnEditDoseId    = null;
    reminderEditId   = null;
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

    // ── Med Reminders (above As-Needed) ──
    if (reminderMeds.length) {
      html += renderRemindersSection(reminderMeds, medRems);
    }

    // ── PRN / As-Needed ──
    if (prnMeds.length) {
      html += renderPrnSection(prnMeds, dayData.prn_doses ?? []);
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
    if (pendingLogSlot === slot) {
      return `<div class="meds-slot-row meds-slot-row--pending">
        <span class="meds-slot-pending-label">${SLOT_LABELS[slot]}</span>
        <input type="time" class="meds-slot-pending-time" id="meds-pending-time-${slot}"
               value="${escHtml(pendingLogTime)}">
        <button class="meds-slot-log-btn meds-slot-confirm-btn" data-confirm-log="${slot}">Log</button>
        <button class="meds-slot-cancel-btn" data-cancel-log="${slot}">Cancel</button>
      </div>`;
    }
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
      <div class="meds-slot-done-time">✓ ${fmt12h(slotData.time)}${meta}</div>
    </div>`;
  }

  // ── Slot edit form ─────────────────────────────────────────────────────────

  function renderSlotEditForm(slot, allSlotMeds, slotData) {
    const meds    = editMeds.map(id => getMedById(id)).filter(Boolean);
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
        ${confirmingDelete ? `
          <span class="meds-delete-confirm-label">Confirm delete?</span>
          <button class="meds-edit-cancel-btn"  id="meds-delete-no">No</button>
          <button class="meds-edit-delete-btn"  id="meds-delete-yes">Yes</button>
        ` : `
          <button class="meds-edit-delete-btn"  id="meds-delete-btn">Delete</button>
          <button class="meds-edit-cancel-btn"  id="meds-edit-cancel">Cancel</button>
          <button class="meds-edit-save-btn"    id="meds-edit-save">Save</button>
        `}
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

      if (reminderEditId === m.id) {
        // ── Time-input form (new log or editing existing) ──
        return `<div class="meds-reminder-row meds-reminder-row--editing">
          <span class="meds-reminder-name">${escHtml(m.name)}</span>
          <input type="time" class="meds-reminder-time-input"
                 id="rem-time-${escHtml(m.id)}"
                 value="${escHtml(reminderEditTime)}">
          <button class="meds-reminder-confirm-btn" data-reminder-confirm="${escHtml(m.id)}">✓ Save</button>
          <button class="meds-reminder-cancel-edit" data-reminder-cancel-edit="${escHtml(m.id)}">Cancel</button>
        </div>`;
      } else if (timeTaken) {
        // ── Logged — tap time to edit ──
        return `<div class="meds-reminder-row meds-reminder-row--done">
          <span class="meds-reminder-name">${escHtml(m.name)}</span>
          <button class="meds-reminder-time-done" data-reminder-edit="${escHtml(m.id)}" title="Tap to edit time">
            ✓ ${fmt12h(timeTaken)}
          </button>
          <button class="meds-reminder-undo" data-reminder-undo="${escHtml(m.id)}">Undo</button>
        </div>`;
      } else {
        // ── Not yet logged ──
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
    // Log slot buttons — open pending time-confirm form
    el.querySelectorAll('[data-log-slot]').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingLogSlot = btn.dataset.logSlot;
        pendingLogTime = nowHHMM();
        render();
      });
    });

    // Pending-log: time input change
    el.querySelectorAll('.meds-slot-pending-time').forEach(inp => {
      inp.addEventListener('input', e => { pendingLogTime = e.target.value; });
    });

    // Pending-log: confirm
    el.querySelectorAll('[data-confirm-log]').forEach(btn => {
      btn.addEventListener('click', () => logSlot(btn.dataset.confirmLog, pendingLogTime || nowHHMM()));
    });

    // Pending-log: cancel
    el.querySelectorAll('[data-cancel-log]').forEach(btn => {
      btn.addEventListener('click', () => { pendingLogSlot = null; render(); });
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

    // Reminder: "Mark taken" → open time-input form defaulting to now
    el.querySelectorAll('[data-reminder-take]').forEach(btn => {
      btn.addEventListener('click', () => {
        reminderEditId   = btn.dataset.reminderTake;
        reminderEditTime = nowHHMM();
        render();
      });
    });

    // Reminder: tap logged time to edit
    el.querySelectorAll('[data-reminder-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mid = btn.dataset.reminderEdit;
        reminderEditId   = mid;
        reminderEditTime = (Data.getDay(currentDate).med_reminders ?? {})[mid] ?? nowHHMM();
        render();
      });
    });

    // Reminder: time-input change
    el.querySelectorAll('.meds-reminder-time-input').forEach(inp => {
      inp.addEventListener('input', e => { reminderEditTime = e.target.value; });
    });

    // Reminder: confirm (save)
    el.querySelectorAll('[data-reminder-confirm]').forEach(btn => {
      btn.addEventListener('click', () => saveReminder(btn.dataset.reminderConfirm));
    });

    // Reminder: cancel edit
    el.querySelectorAll('[data-reminder-cancel-edit]').forEach(btn => {
      btn.addEventListener('click', () => { reminderEditId = null; render(); });
    });

    // Reminder: undo
    el.querySelectorAll('[data-reminder-undo]').forEach(btn => {
      btn.addEventListener('click', () => undoReminder(btn.dataset.reminderUndo));
    });
  }

  // ── Slot actions ───────────────────────────────────────────────────────────

  function logSlot(slot, time) {
    const t        = time || nowHHMM();
    const day      = Data.getDay(currentDate);
    const snapshot = getActiveMeds()
      .filter(m => (m.slots ?? []).includes(slot))
      .map(m => m.id);
    if (!day.med_slots) day.med_slots = defaultSlots();
    day.med_slots[slot] = { time: t, meds: snapshot, skipped: [], extras: [] };
    pendingLogSlot = null;
    scheduleSave();
    render();
  }

  function openSlotEdit(slot) {
    const day      = Data.getDay(currentDate);
    const slotData = (day.med_slots ?? defaultSlots())[slot] ?? { time: null, skipped: [], extras: [] };
    editSlot       = slot;
    editTime       = slotData.time ?? nowHHMM();
    editSkipped    = [...(slotData.skipped ?? [])];
    editMeds       = slotData.meds
      ? [...slotData.meds]
      : getActiveMeds().filter(m => (m.slots ?? []).includes(slot)).map(m => m.id);
    editExtras     = [...(slotData.extras  ?? [])];
    editExtraMedId   = '';
    editExtraDose    = '';
    confirmingDelete = false;
    pendingLogSlot   = null;   // close pending form if open
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
    day.med_slots[editSlot] = {
      time:    editTime,
      meds:    [...editMeds],
      skipped: [...editSkipped],
      extras:  [...editExtras],
    };
    editSlot = null;
    scheduleSave();
    render();
  }

  function deleteSlotLog() {
    if (!editSlot) return;
    const day = Data.getDay(currentDate);
    if (!day.med_slots) day.med_slots = defaultSlots();
    day.med_slots[editSlot] = { time: null, skipped: [], extras: [] };
    editSlot         = null;
    confirmingDelete = false;
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

  function saveReminder(medId) {
    if (!reminderEditTime) return;
    const day = Data.getDay(currentDate);
    if (!day.med_reminders) day.med_reminders = {};
    day.med_reminders[medId] = reminderEditTime;
    reminderEditId = null;
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

  /** Look up any med by ID — including archived ones */
  function getMedById(id) {
    return Object.values(Data.getData().medications ?? {}).find(m => m.id === id);
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

  /** Convert "HH:MM" (24h) → "h:MMam/pm" for display */
  function fmt12h(hhmm) {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return hhmm;
    const ampm = h >= 12 ? 'pm' : 'am';
    const h12  = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
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
