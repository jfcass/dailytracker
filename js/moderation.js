/**
 * moderation.js — Moderation Tracker section
 *
 * Renders into the static #section-moderation shell in index.html.
 * Reads/writes Data.getDay(date).moderation
 *   key: substance id  →  [{ id, quantity, unit, time, note }]  |  null
 * Substance list comes from Data.getSettings().moderation_substances
 *   [{ id, name, default_unit }, …]
 */
const Moderation = (() => {

  let currentDate = null;
  // editingId: null | { subId: string, entryId: string|null }
  //   entryId null   = adding a new entry
  //   entryId string = editing an existing entry by its id
  let editingId   = null;
  let saveTimer   = null;

  // form field state (kept in sync while the form is open)
  let fQty  = 1;
  let fUnit = '';
  let fTime = '';   // HH:MM or '' if user skips
  let fNote = '';

  // ── Public ───────────────────────────────────────────────────────────────

  function init() {
    currentDate = DateNav.getDate();
    render();
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function render() {
    const substances = Data.getSettings().moderation_substances ?? [];

    const list = document.getElementById('mod-list');
    list.innerHTML = '';

    if (substances.length === 0) {
      const el = document.createElement('p');
      el.className   = 'section-empty';
      el.textContent = 'No substances configured.';
      list.appendChild(el);
      return;
    }

    substances.forEach(sub => {
      const entries = Data.getDay(currentDate).moderation[sub.id] ?? null;
      list.appendChild(makeRow(sub, entries));
    });
  }

  // ── Row builder ───────────────────────────────────────────────────────────

  function makeRow(sub, entries) {
    const wrap = document.createElement('div');
    wrap.className = 'mod-row';

    if (editingId?.subId === sub.id) {
      wrap.classList.add('mod-row--editing');
      const editingEntry = editingId?.entryId
        ? (entries ?? []).find(e => e.id === editingId.entryId) ?? null
        : null;
      buildForm(wrap, sub, editingEntry);
    } else {
      buildDisplay(wrap, sub, entries);
    }
    return wrap;
  }

  // ── Display mode ──────────────────────────────────────────────────────────

  function buildDisplay(wrap, sub, entries) {
    const hasEntries = entries && entries.length > 0;

    if (!hasEntries) {
      wrap.innerHTML = `
        <div class="mod-display">
          <div class="mod-sub-info">
            <span class="mod-badge" data-sub-id="${escHtml(sub.id)}" aria-hidden="true">
              ${subEmoji(sub)}
            </span>
            <span class="mod-sub-name">${escHtml(sub.name)}</span>
          </div>
          <button class="mod-log-btn" type="button" aria-label="Log ${escHtml(sub.name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                 width="14" height="14" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5"  y1="12" x2="19" y2="12"/>
            </svg>
            Log
          </button>
        </div>`;
      wrap.querySelector('.mod-log-btn').addEventListener('click', () => startEdit(sub, null));
      return;
    }

    const total    = entries.reduce((s, e) => s + (e.quantity ?? 0), 0);
    const unitStr  = entries[0]?.unit ?? sub.default_unit ?? '';
    const lastTime = entries.map(e => e.time).filter(Boolean)
                            .reduce((best, t) => t > best ? t : best, '');

    const summaryHtml = entries.length === 1
      ? `<span class="mod-quantity">${escHtml(fmtQty(entries[0].quantity))} ${escHtml(entries[0].unit)}</span>${lastTime ? `<span class="mod-entry-time"> · ${escHtml(fmt12h(lastTime))}</span>` : ''}`
      : `<span class="mod-quantity">${escHtml(fmtQty(total))} ${escHtml(unitStr)} total</span>`;

    wrap.innerHTML = `
      <div class="mod-display">
        <div class="mod-sub-info">
          <span class="mod-badge" data-sub-id="${escHtml(sub.id)}" aria-hidden="true">
            ${subEmoji(sub)}
          </span>
          <span class="mod-sub-name">${escHtml(sub.name)}</span>
        </div>
        <div class="mod-logged">
          ${summaryHtml}
          <button class="mod-add-btn" type="button" aria-label="Add ${escHtml(sub.name)} entry">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                 width="14" height="14" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5"  y1="12" x2="19" y2="12"/>
            </svg>
            Add
          </button>
        </div>
      </div>
      <div class="mod-entry-list">
        ${entries.map(e => `
          <div class="mod-entry-row" data-entry-id="${escHtml(e.id)}">
            <span class="mod-entry-qty">${escHtml(fmtQty(e.quantity))} ${escHtml(e.unit)}</span>
            ${e.time ? `<span class="mod-entry-time">${escHtml(fmt12h(e.time))}</span>` : ''}
            ${e.note ? `<span class="mod-entry-note">${escHtml(e.note)}</span>` : ''}
            <button class="mod-edit-btn" type="button" data-entry-id="${escHtml(e.id)}"
                    aria-label="Edit entry">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                   width="13" height="13" aria-hidden="true">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="mod-del-btn" type="button" data-entry-id="${escHtml(e.id)}"
                    aria-label="Remove entry">×</button>
          </div>`).join('')}
      </div>`;

    wrap.querySelector('.mod-add-btn').addEventListener('click', () => startEdit(sub, null));
    wrap.querySelectorAll('.mod-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const entry = entries.find(e => e.id === btn.dataset.entryId);
        if (entry) startEdit(sub, entry);
      });
    });
    wrap.querySelectorAll('.mod-del-btn').forEach(btn => {
      btn.addEventListener('click', () => removeEntry(sub, btn.dataset.entryId));
    });
  }

  // ── Edit form ─────────────────────────────────────────────────────────────

  function buildForm(wrap, sub, existingEntry) {
    const isEdit     = !!existingEntry;
    const removeHtml = isEdit
      ? `<button class="mod-clear-btn" type="button" aria-label="Remove entry">Remove</button>`
      : '';

    wrap.innerHTML = `
      <div class="mod-form">
        <div class="mod-form-header">
          <span class="mod-badge" data-sub-id="${escHtml(sub.id)}" aria-hidden="true">
            ${subEmoji(sub)}
          </span>
          <span class="mod-sub-name">${escHtml(sub.name)}</span>
          ${removeHtml}
        </div>

        <div class="mod-form-time-row">
          <label class="mod-time-label">Time</label>
          <input id="mod-time-input" class="mod-time-input" type="time"
                 value="${escHtml(fTime)}"
                 aria-label="Time (optional)">
        </div>

        <div class="mod-form-qty-row">
          <button class="mod-stepper" type="button" data-op="dec" aria-label="Decrease quantity">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round"
                 width="16" height="16" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>

          <input id="mod-qty-input" class="mod-qty-input" type="text"
                 value="${fQty}" inputmode="decimal"
                 aria-label="Quantity">

          <button class="mod-stepper" type="button" data-op="inc" aria-label="Increase quantity">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round"
                 width="16" height="16" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5"  y1="12" x2="19" y2="12"/>
            </svg>
          </button>

          <input id="mod-unit-input" class="mod-unit-input" type="text"
                 value="${escHtml(fUnit)}" maxlength="20"
                 aria-label="Unit (e.g. drinks, glasses)">
        </div>

        <input id="mod-note-input" class="mod-note-input" type="text"
               value="${escHtml(fNote)}" maxlength="200"
               placeholder="Note (optional)"
               aria-label="Note">

        <div class="mod-form-actions">
          <button class="mod-cancel-btn" type="button">Cancel</button>
          <button class="mod-save-btn"   type="button">Save</button>
        </div>
      </div>
    `;

    wrap.querySelectorAll('.mod-stepper').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = wrap.querySelector('#mod-qty-input');
        let v = parseFloat(inp.value) || 0;
        v = btn.dataset.op === 'inc' ? v + 1 : Math.max(0.5, v - 1);
        v = Math.round(v * 2) / 2;
        inp.value = v;
        fQty = v;
      });
    });

    wrap.querySelector('#mod-time-input').addEventListener('input', e => { fTime = e.target.value; });
    wrap.querySelector('#mod-qty-input').addEventListener('input',  e => { fQty  = parseFloat(e.target.value) || 0; });
    wrap.querySelector('#mod-unit-input').addEventListener('input', e => { fUnit = e.target.value; });
    wrap.querySelector('#mod-note-input').addEventListener('input', e => { fNote = e.target.value; });

    wrap.querySelector('.mod-cancel-btn').addEventListener('click', cancelEdit);
    wrap.querySelector('.mod-save-btn').addEventListener('click', () => saveEntry(sub));
    wrap.querySelector('.mod-clear-btn')?.addEventListener('click', () => {
      if (existingEntry) removeEntry(sub, existingEntry.id);
    });

    requestAnimationFrame(() => {
      wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  // ── Edit state transitions ────────────────────────────────────────────────

  function startEdit(sub, existingEntry) {
    fQty  = existingEntry ? existingEntry.quantity  : 1;
    fUnit = existingEntry ? existingEntry.unit       : (sub.default_unit ?? '');
    fTime = existingEntry ? (existingEntry.time ?? '') : nowHHMM();
    fNote = existingEntry?.note ?? '';

    editingId = { subId: sub.id, entryId: existingEntry?.id ?? null };
    render();
  }

  function cancelEdit() {
    editingId = null;
    render();
  }

  function saveEntry(sub) {
    const qtyEl  = document.getElementById('mod-qty-input');
    const unitEl = document.getElementById('mod-unit-input');
    const timeEl = document.getElementById('mod-time-input');
    const noteEl = document.getElementById('mod-note-input');

    const qty  = parseFloat(qtyEl?.value ?? fQty);
    const unit = (unitEl?.value ?? fUnit).trim() || sub.default_unit;
    const time = (timeEl?.value ?? fTime).trim() || null;
    const note = (noteEl?.value ?? fNote).trim();

    if (!qty || qty <= 0) {
      qtyEl?.classList.add('input--error');
      return;
    }

    const mod = Data.getDay(currentDate).moderation;

    if (editingId?.entryId) {
      const arr = mod[sub.id] ?? [];
      const idx = arr.findIndex(e => e.id === editingId.entryId);
      if (idx !== -1) {
        arr[idx] = {
          ...arr[idx],
          quantity: Math.round(qty * 2) / 2,
          unit,
          time,
          note,
        };
        mod[sub.id] = arr;
      }
    } else {
      const arr = Array.isArray(mod[sub.id]) ? mod[sub.id] : [];
      arr.push({
        id:       crypto.randomUUID(),
        quantity: Math.round(qty * 2) / 2,
        unit,
        time,
        note,
      });
      mod[sub.id] = arr;
    }

    editingId = null;
    render();
    scheduleSave();
  }

  function removeEntry(sub, entryId) {
    const mod = Data.getDay(currentDate).moderation;
    const arr = mod[sub.id];
    if (!Array.isArray(arr)) return;

    mod[sub.id] = arr.filter(e => e.id !== entryId);
    if (mod[sub.id].length === 0) mod[sub.id] = null;

    editingId = null;
    render();
    scheduleSave();
  }

  // ── Date sync (called by DateNav) ────────────────────────────────────────

  function setDate(date) {
    editingId   = null;
    currentDate = date;
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
        console.error('Moderation save failed:', err);
        setSaveStatus('error');
      }
    }, 1200);
  }

  function setSaveStatus(s) {
    const el = document.getElementById('mod-save-status');
    if (!el) return;
    el.dataset.status = s;
    const labels = { pending: 'Unsaved', saving: 'Saving…', saved: 'Saved', error: 'Save failed', '': '' };
    el.textContent = labels[s] ?? '';
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Display quantity without trailing ".0" */
  function fmtQty(n) {
    return n % 1 === 0 ? String(n) : String(n);
  }

  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  }

  function fmt12h(hhmm) {
    if (!hhmm) return '';
    const [hStr, mStr] = hhmm.split(':');
    const h = parseInt(hStr, 10);
    const period = h < 12 ? 'AM' : 'PM';
    const h12 = h % 12 || 12;
    return `${h12}:${mStr} ${period}`;
  }

  function subEmoji(sub) {
    const byId = {
      alcohol:  '🍷',
      cannabis: '🌿',
      caffeine: '☕',
      coffee:   '☕',
      tobacco:  '🚬',
      nicotine: '🚬',
      sugar:    '🍬',
    };
    if (byId[sub.id]) return byId[sub.id];
    const n = sub.name.toLowerCase();
    if (n.includes('alcohol') || n.includes('drink') || n.includes('wine') || n.includes('beer')) return '🍷';
    if (n.includes('cannabis') || n.includes('weed') || n.includes('marijuana'))                  return '🌿';
    if (n.includes('coffee') || n.includes('caffeine') || n.includes('tea'))                      return '☕';
    if (n.includes('tobacco') || n.includes('cigarette') || n.includes('nicotine'))               return '🚬';
    if (n.includes('sugar') || n.includes('sweet'))                                               return '🍬';
    return sub.name.charAt(0).toUpperCase();
  }

  /** Current time as 'HH:MM' string. */
  function nowHHMM() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return { init, render, setDate };
})();
