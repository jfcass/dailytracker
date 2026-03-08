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
  const SLOT_ICONS  = { am: '🌅', afternoon: '☀️', pm: '🌙' };
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

  // Zone 1 picker state
  let pickingSlot     = null;   // 'am' | 'afternoon' | 'pm' | null — inline time picker open
  let pickingReminder = null;   // med.id | null — inline time picker open for a reminder med

  // Zone 2 / Zone 4 UI state
  let prnPanelOpen    = false;  // Zone 2 panel expanded
  let loggedListOpen  = false;  // Zone 4 list expanded

  // ── Public API ─────────────────────────────────────────────────────────────

  function init() {
    currentDate = DateNav.getDate();
    render();
    startTick();
  }

  function setDate(date) {
    currentDate      = date;
    editSlot         = null;
    pickingSlot      = null;
    pickingReminder  = null;
    prnFormOpen      = false;
    prnPanelOpen     = false;
    prnEditDoseId    = null;
    reminderEditId   = null;
    loggedListOpen   = false;
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

    const allMeds      = getActiveMeds();
    const prnMeds      = allMeds.filter(m => m.as_needed);
    const reminderMeds = allMeds.filter(m => m.med_reminder);
    const dayData      = Data.getDay(currentDate);
    const medSlots     = dayData.med_slots     ?? defaultSlots();
    const medRems      = dayData.med_reminders ?? {};
    const prnDoses     = dayData.prn_doses     ?? [];

    if (!allMeds.length) {
      el.innerHTML = `<p class="meds-empty">No medications configured.
        <button class="meds-config-link" onclick="MedsManage.open('today')">Set up medications →</button>
      </p>`;
      wireEvents(el);
      return;
    }

    let html = '';

    // ── Zone 1: Today's Doses ──
    const hasDoses = SLOT_ORDER.some(s => allMeds.some(m => (m.slots ?? []).includes(s)))
                  || reminderMeds.length > 0;
    if (hasDoses) {
      html += `<div class="meds-zone">
                 <div class="meds-zone-label">Today's Doses</div>
                 <div class="meds-dose-grid">${renderTodaysDoses(allMeds, medSlots, medRems)}</div>
               </div>`;
    }

    // ── Zone 2: PRN trigger + new-dose log form ──
    // Note: PRN edit form (existing dose) renders inline within Zone 4.
    if (prnMeds.length) {
      let zone2 = renderPrnTrigger(prnMeds, prnDoses);
      if (prnFormOpen) zone2 += renderPrnLogForm(prnMeds, buildRecentDoses(prnDoses));
      html += `<div class="meds-zone">${zone2}</div>`;
    }

    // ── Zone 3: Active Dosing Windows ──
    const windowMeds = prnMeds.filter(m => m.min_interval_hours || m.max_daily_doses);
    if (windowMeds.length) {
      const winHtml = renderDosingWindows(windowMeds, prnDoses);
      if (winHtml) html += `<div class="meds-zone">${winHtml}</div>`;
    }

    // ── Zone 4: Meds Logged Today ──
    html += `<div class="meds-zone">${renderLoggedToday(allMeds, medSlots, medRems, prnDoses)}</div>`;

    el.innerHTML = html;
    wireEvents(el);
    updateBadge(allMeds, medSlots, medRems, prnDoses);
  }

  // ── Zone 1: Today's Doses grid ────────────────────────────────────────────

  function renderTodaysDoses(allMeds, medSlots, medRems) {
    const SLOT_SHORT = { am: 'AM', afternoon: 'Afternoon', pm: 'PM' };
    const items = [];

    // Scheduled slots (only if unlogged and have meds)
    SLOT_ORDER.forEach(slot => {
      const meds = allMeds.filter(m => (m.slots ?? []).includes(slot));
      if (!meds.length) return;
      const slotData = medSlots[slot] ?? { time: null };
      if (slotData.time) return;  // already logged — not shown
      items.push({ kind: 'slot', slot, label: SLOT_SHORT[slot] + ' Meds', count: `${meds.length} med${meds.length !== 1 ? 's' : ''}` });
    });

    // Reminder meds (only if not yet logged today)
    allMeds.filter(m => m.med_reminder).forEach(m => {
      if (medRems[m.id]) return;  // already logged
      items.push({ kind: 'reminder', id: m.id, emoji: m.emoji ?? '', label: m.name, count: m.recommended_dose || '' });
    });

    if (!items.length) {
      return `<div class="meds-all-done"><span class="meds-all-done-check">✓</span> All doses logged for today</div>`;
    }

    return items.map(item => {
      const icon      = item.kind === 'slot' ? (SLOT_ICONS[item.slot] ?? '💊') : (item.emoji || '💊');
      const isPicking = item.kind === 'slot' ? pickingSlot === item.slot : pickingReminder === item.id;

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

  // ── Zone 2: PRN trigger + collapsible panel ───────────────────────────────

  function renderPrnTrigger(prnMeds, prnDoses) {
    // Quick-pick: up to 5 most-recently-used PRN meds in last 7 days
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentIds = [...prnDoses]
      .filter(d => new Date(d.iso_timestamp).getTime() > sevenDaysAgo)
      .sort((a, b) => new Date(b.iso_timestamp) - new Date(a.iso_timestamp))
      .map(d => d.medication_id)
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .slice(0, 5);

    const quickPick = recentIds.map(id => prnMeds.find(m => m.id === id)).filter(Boolean);
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

  // ── Zone 3: Active Dosing Windows ─────────────────────────────────────────

  function renderDosingWindows(windowMeds, prnDoses) {
    const now       = Date.now();
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

      const today      = Data.today();
      const todayStart = new Date(today + 'T00:00:00').getTime();
      const dosesToday = prnDoses.filter(d =>
        d.medication_id === m.id && new Date(d.iso_timestamp).getTime() >= todayStart
      ).length;

      const maxReached      = m.max_daily_doses && dosesToday >= m.max_daily_doses;
      const intervalElapsed = !intervalMs || elapsedMs >= intervalMs;
      const progress        = intervalMs ? Math.min(elapsedMs / intervalMs, 1) : 1;

      const elapsedH  = Math.floor(elapsedMs / 3_600_000);
      const elapsedM  = Math.floor((elapsedMs % 3_600_000) / 60_000);
      const takenAgo  = elapsedH > 0 ? `${elapsedH}h ${elapsedM}m ago` : `${elapsedM}m ago`;

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
        nextText  = `next dose in ${remH}h ${String(remM).padStart(2, '0')}m`;
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
            <div class="meds-window-bar ${barClass}" style="width:${Math.round(progress * 100)}%"></div>
          </div>
          <div class="meds-window-next ${nextClass}">Taken ${takenAgo} · ${nextText}</div>
        </div>`;
    }).filter(Boolean).join('');

    if (!cards) return '';
    return `<div class="meds-windows-label">Active Dosing Windows</div>${cards}`;
  }

  // ── Zone 4: Meds Logged Today ─────────────────────────────────────────────

  function renderLoggedToday(allMeds, medSlots, medRems, prnDoses) {
    const SLOT_SHORT = { am: 'AM', afternoon: 'AFT', pm: 'PM' };
    const entries = [];

    // Slot meds
    SLOT_ORDER.forEach(slot => {
      const slotData = medSlots[slot];
      if (!slotData?.time) return;
      const medIds = slotData.meds ?? allMeds.filter(m => (m.slots ?? []).includes(slot)).map(m => m.id);
      const skipped = slotData.skipped ?? [];
      const extras  = slotData.extras  ?? [];
      medIds.filter(id => !skipped.includes(id)).forEach(id => {
        const med = getMedById(id) ?? { id, name: id };
        entries.push({ time: slotData.time, name: med.name, dose: (med.slot_doses ?? {})[slot] ?? '', kind: 'slot', slot, id });
      });
      extras.forEach(ex => {
        const med = getMedById(ex.medication_id) ?? { name: ex.medication_id };
        entries.push({ time: slotData.time, name: med.name, dose: ex.dose, kind: 'slot', slot, id: ex.medication_id });
      });
    });

    // Reminder meds
    Object.entries(medRems).forEach(([medId, remTime]) => {
      if (!remTime) return;
      const med = getMedById(medId) ?? { name: medId };
      if (reminderEditId === medId) {
        entries.push({ time: remTime, name: med.name, dose: '', kind: 'reminder-editing', id: medId });
        return;
      }
      entries.push({ time: remTime, name: med.name, dose: '', kind: 'reminder', id: medId });
    });

    // PRN doses (today only)
    const today      = Data.today();
    const todayStart = new Date(today + 'T00:00:00').getTime();
    prnDoses
      .filter(d => new Date(d.iso_timestamp).getTime() >= todayStart)
      .forEach(d => {
        const med     = getMedById(d.medication_id) ?? { name: d.medication_id };
        const rawTime = d.iso_timestamp.slice(11, 16);
        entries.push({ time: rawTime, name: med.name, dose: d.dose ?? '', kind: 'prn', id: d.id });
      });

    // Sort by time ASC, then name ASC
    entries.sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name));

    const total = entries.length;

    // Auto-expand when an edit form is open so user can see it
    const forceOpen = !!(editSlot || prnEditDoseId);
    const isOpen    = loggedListOpen || forceOpen;

    const triggerBtn = `
      <button class="meds-logged-trigger" id="meds-logged-trigger">
        <span class="meds-logged-headline">${total ? `${total} Med${total !== 1 ? 's' : ''} Logged Today` : 'No Meds Logged Yet'}</span>
        <span class="meds-logged-chevron ${isOpen ? 'meds-logged-chevron--open' : ''}">▾</span>
      </button>`;

    if (!total || !isOpen) return triggerBtn;

    // Pre-build inline edit forms
    const slotEditHtml = editSlot ? (() => {
      const slotMeds = allMeds.filter(m => (m.slots ?? []).includes(editSlot));
      const slotData = medSlots[editSlot] ?? { time: null, skipped: [], extras: [] };
      return `<div class="meds-log-inline-edit">${renderSlotEditForm(editSlot, slotMeds, slotData)}</div>`;
    })() : '';

    const prnEditHtml = prnEditDoseId ? (() => {
      const d = buildRecentDoses(prnDoses).find(x => x.id === prnEditDoseId)
             ?? prnDoses.find(x => x.id === prnEditDoseId);
      return d ? `<div class="meds-log-inline-edit">${renderPrnEditCard(d)}</div>` : '';
    })() : '';

    // Group by time
    const groups = {};
    entries.forEach(e => { (groups[e.time] = groups[e.time] ?? []).push(e); });

    const listHtml = Object.entries(groups).map(([time, grpEntries]) => {
      const rows = grpEntries.map(e => {
        if (e.kind === 'reminder-editing') {
          return `<div class="meds-log-entry meds-log-entry--editing">
            <span class="meds-log-name">${escHtml(e.name)}</span>
            <span class="meds-log-badge meds-log-badge--rem">REM</span>
            <button class="meds-log-edit" data-reminder-cancel-edit="${escHtml(e.id)}">Close</button>
          </div>
          <div class="meds-log-inline-edit">
            <div class="prn-log-form">
              <div class="prn-log-form__row">
                <span class="prn-log-form__label">Time</span>
                <input class="prn-log-form__select" type="time" class="meds-reminder-time-input"
                       id="meds-reminder-time-input" value="${escHtml(reminderEditTime)}" style="max-width:120px">
              </div>
              <div class="prn-log-form__actions">
                <button class="prn-cancel-btn" style="color:var(--clr-error);border-color:var(--clr-error)"
                        data-reminder-delete="${escHtml(e.id)}">Delete</button>
                <span style="flex:1"></span>
                <button class="prn-cancel-btn" data-reminder-cancel-edit="${escHtml(e.id)}">Cancel</button>
                <button class="prn-log-btn"    data-reminder-confirm="${escHtml(e.id)}">Save</button>
              </div>
            </div>
          </div>`;
        }
        const badgeClass = e.kind === 'prn' ? 'meds-log-badge--prn' : e.kind === 'reminder' ? 'meds-log-badge--rem' : '';
        const badgeText  = e.kind === 'prn' ? 'PRN' : e.kind === 'reminder' ? 'REM' : SLOT_SHORT[e.slot] ?? '';
        const editAttr   = e.kind === 'slot' ? `data-edit-logged-slot="${escHtml(e.slot)}"` :
                           e.kind === 'prn'  ? `data-edit-logged-prn="${escHtml(e.id)}"` :
                                               `data-edit-logged-rem="${escHtml(e.id)}"`;
        const isEditing  = (e.kind === 'slot' && editSlot === e.slot) ||
                           (e.kind === 'prn'  && prnEditDoseId === e.id);
        const editLabel  = isEditing ? 'Close' : 'Edit';

        // Inject PRN edit form directly after the specific PRN dose row
        const inlinePrnEdit = (e.kind === 'prn' && prnEditDoseId === e.id) ? prnEditHtml : '';

        return `<div class="meds-log-entry${isEditing ? ' meds-log-entry--editing' : ''}">
          <span class="meds-log-name">${escHtml(e.name)}</span>
          ${e.dose ? `<span class="meds-log-dose">${escHtml(e.dose)}</span>` : ''}
          <span class="meds-log-badge ${badgeClass}">${badgeText}</span>
          <button class="meds-log-edit" ${editAttr}>${editLabel}</button>
        </div>${inlinePrnEdit}`;
      }).join('');

      // Inject slot edit form after the last entry in the group for the editing slot
      const slotInGroup = grpEntries.find(e => e.kind === 'slot' && editSlot === e.slot);
      const inlineSlotEdit = slotInGroup ? slotEditHtml : '';

      return `<div class="meds-log-group-time">${fmt12h(time)}</div>${rows}${inlineSlotEdit}`;
    }).join('');

    return `${triggerBtn}
      <div class="meds-logged-list">${listHtml}</div>`;
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

  // ── Event wiring ───────────────────────────────────────────────────────────

  function wireEvents(el) {
    // ── Zone 1: open inline time picker ──
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

    // ── Slot edit form ──
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
      el.querySelector('#meds-edit-cancel')?.addEventListener('click', () => {
        editSlot         = null;
        confirmingDelete = false;
        render();
      });
      el.querySelector('#meds-edit-save')?.addEventListener('click', saveSlotEdit);
      el.querySelector('#meds-delete-btn')?.addEventListener('click', () => { confirmingDelete = true; render(); });
      el.querySelector('#meds-delete-no')?.addEventListener('click', () => { confirmingDelete = false; render(); });
      el.querySelector('#meds-delete-yes')?.addEventListener('click', deleteSlotLog);
    }

    // ── Zone 2: PRN panel toggle ──
    el.querySelector('#meds-prn-trigger')?.addEventListener('click', () => {
      prnPanelOpen = !prnPanelOpen;
      render();
    });

    // Zone 2: PRN quick-pick chip
    el.querySelectorAll('[data-prn-quick]').forEach(btn => {
      btn.addEventListener('click', () => { openPrnForm(btn.dataset.prnQuick); prnPanelOpen = false; });
    });

    // Zone 2: PRN other-med log
    el.querySelector('#meds-prn-other-log')?.addEventListener('click', () => {
      const id = el.querySelector('#meds-prn-other-select')?.value;
      if (id) { openPrnForm(id); prnPanelOpen = false; }
    });

    // Zone 2: PRN other-med select (old pattern kept for compat)
    el.querySelector('#meds-prn-other-select')?.addEventListener('change', e => {
      if (e.target.value) { openPrnForm(e.target.value); prnPanelOpen = false; e.target.value = ''; }
    });

    // Zone 2: PRN dose cards — tap to edit
    el.querySelectorAll('[data-prn-edit-dose]').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('[data-prn-del-dose]')) return;
        openPrnEdit(card.dataset.prnEditDose);
      });
    });

    // Zone 2: PRN dose card delete
    el.querySelectorAll('[data-prn-del-dose]').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); deletePrnDose(btn.dataset.prnDelDose); });
    });

    // Zone 4: PRN edit form (renders inline in Zone 4)
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

    // Zone 2: PRN log form
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

    // ── Zone 4: logged today toggle ──
    el.querySelector('#meds-logged-trigger')?.addEventListener('click', () => {
      loggedListOpen = !loggedListOpen;
      render();
    });

    // Zone 4: edit buttons (toggle: close if already editing that entry)
    el.querySelectorAll('[data-edit-logged-slot]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (editSlot === btn.dataset.editLoggedSlot) {
          editSlot = null; confirmingDelete = false; render();
        } else {
          openSlotEdit(btn.dataset.editLoggedSlot);
        }
      });
    });
    el.querySelectorAll('[data-edit-logged-prn]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (prnEditDoseId === btn.dataset.editLoggedPrn) {
          prnEditDoseId = null; render();
        } else {
          openPrnEdit(btn.dataset.editLoggedPrn);
        }
      });
    });
    el.querySelectorAll('[data-edit-logged-rem]').forEach(btn => {
      btn.addEventListener('click', () => openReminderEdit(btn.dataset.editLoggedRem));
    });

    // Reminder inline edit (Zone 4)
    el.querySelector('#meds-reminder-time-input')?.addEventListener('input', e => { reminderEditTime = e.target.value; });
    el.querySelectorAll('[data-reminder-confirm]').forEach(btn => {
      btn.addEventListener('click', () => saveReminder(btn.dataset.reminderConfirm));
    });
    el.querySelectorAll('[data-reminder-cancel-edit]').forEach(btn => {
      btn.addEventListener('click', () => { reminderEditId = null; render(); });
    });
    el.querySelectorAll('[data-reminder-delete]').forEach(btn => {
      btn.addEventListener('click', () => deleteReminder(btn.dataset.reminderDelete));
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
    pickingSlot     = null;
    pickingReminder = null;
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

  function deleteReminder(medId) {
    const day = Data.getDay(currentDate);
    if (day.med_reminders) delete day.med_reminders[medId];
    reminderEditId = null;
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

  function buildRecentDoses(prnDoses) {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const yest   = Data.getDay(shiftDate(currentDate, -1)).prn_doses ?? [];
    return [...yest, ...prnDoses]
      .filter(d => new Date(d.iso_timestamp).getTime() > cutoff)
      .sort((a, b) => new Date(b.iso_timestamp) - new Date(a.iso_timestamp));
  }

  function logReminder(medId, time) {
    reminderEditTime = time || nowHHMM();
    reminderEditId   = null;
    saveReminder(medId);
  }

  function openReminderEdit(medId) {
    reminderEditId   = medId;
    reminderEditTime = (Data.getDay(currentDate).med_reminders ?? {})[medId] ?? nowHHMM();
    render();
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

  return { init, render, setDate, logSlot, logReminder };
})();
