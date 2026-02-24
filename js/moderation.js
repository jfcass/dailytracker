/**
 * moderation.js — Moderation Tracker section
 *
 * Renders into the static #section-moderation shell in index.html.
 * Reads/writes Data.getDay(date).moderation
 *   key: substance id  →  { quantity, unit, note }  |  null
 * Substance list comes from Data.getSettings().moderation_substances
 *   [{ id, name, default_unit }, …]
 */
const Moderation = (() => {

  let currentDate = null;
  let editingId   = null;   // substance.id of row currently showing the form
  let saveTimer   = null;

  // form field state (kept in sync while the form is open)
  let fQty  = 1;
  let fUnit = '';
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
      const entry = Data.getDay(currentDate).moderation[sub.id] ?? null;
      list.appendChild(makeRow(sub, entry));
    });
  }

  // ── Row builder ───────────────────────────────────────────────────────────

  function makeRow(sub, entry) {
    const wrap = document.createElement('div');
    wrap.className = 'mod-row';

    if (editingId === sub.id) {
      wrap.classList.add('mod-row--editing');
      buildForm(wrap, sub, entry);
    } else {
      buildDisplay(wrap, sub, entry);
    }
    return wrap;
  }

  // ── Display mode ──────────────────────────────────────────────────────────

  function buildDisplay(wrap, sub, entry) {
    const noteHtml = entry?.note
      ? `<p class="mod-note">${escHtml(entry.note)}</p>`
      : '';

    const rightHtml = entry
      ? `<div class="mod-logged">
           <span class="mod-quantity">${escHtml(fmtQty(entry.quantity))} ${escHtml(entry.unit)}</span>
           <button class="mod-edit-btn" type="button" aria-label="Edit ${escHtml(sub.name)}">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                  width="14" height="14" aria-hidden="true">
               <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
               <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
             </svg>
           </button>
         </div>`
      : `<button class="mod-log-btn" type="button" aria-label="Log ${escHtml(sub.name)}">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                width="14" height="14" aria-hidden="true">
             <line x1="12" y1="5" x2="12" y2="19"/>
             <line x1="5"  y1="12" x2="19" y2="12"/>
           </svg>
           Log
         </button>`;

    wrap.innerHTML = `
      <div class="mod-display">
        <div class="mod-sub-info">
          <span class="mod-badge" data-sub-id="${escHtml(sub.id)}" aria-hidden="true">
            ${escHtml(sub.name.charAt(0).toUpperCase())}
          </span>
          <span class="mod-sub-name">${escHtml(sub.name)}</span>
        </div>
        ${rightHtml}
      </div>
      ${noteHtml}
    `;

    if (entry) {
      wrap.querySelector('.mod-edit-btn').addEventListener('click', () => startEdit(sub, entry));
    } else {
      wrap.querySelector('.mod-log-btn').addEventListener('click', () => startEdit(sub, null));
    }
  }

  // ── Edit form ─────────────────────────────────────────────────────────────

  function buildForm(wrap, sub, existingEntry) {
    const clearHtml = existingEntry
      ? `<button class="mod-clear-btn" type="button" aria-label="Clear ${escHtml(sub.name)} entry">Clear</button>`
      : '';

    wrap.innerHTML = `
      <div class="mod-form">
        <div class="mod-form-header">
          <span class="mod-badge" data-sub-id="${escHtml(sub.id)}" aria-hidden="true">
            ${escHtml(sub.name.charAt(0).toUpperCase())}
          </span>
          <span class="mod-sub-name">${escHtml(sub.name)}</span>
          ${clearHtml}
        </div>

        <div class="mod-form-qty-row">
          <button class="mod-stepper" type="button" data-op="dec" aria-label="Decrease quantity">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round"
                 width="16" height="16" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>

          <input id="mod-qty-input" class="mod-qty-input" type="number"
                 value="${fQty}" min="0.5" step="0.5" inputmode="decimal"
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

    // Steppers
    wrap.querySelectorAll('.mod-stepper').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = wrap.querySelector('#mod-qty-input');
        let v = parseFloat(inp.value) || 0;
        v = btn.dataset.op === 'inc' ? v + 1 : Math.max(0.5, v - 1);
        v = Math.round(v * 2) / 2;   // snap to nearest 0.5
        inp.value = v;
        fQty = v;
      });
    });

    wrap.querySelector('#mod-qty-input').addEventListener('input', e => {
      fQty = parseFloat(e.target.value) || 0;
    });
    wrap.querySelector('#mod-unit-input').addEventListener('input', e => {
      fUnit = e.target.value;
    });
    wrap.querySelector('#mod-note-input').addEventListener('input', e => {
      fNote = e.target.value;
    });

    wrap.querySelector('.mod-cancel-btn').addEventListener('click', cancelEdit);
    wrap.querySelector('.mod-save-btn').addEventListener('click', () => saveEntry(sub));
    wrap.querySelector('.mod-clear-btn')?.addEventListener('click', () => clearEntry(sub));

    // Scroll and focus the qty input (with brief delay for DOM to settle)
    requestAnimationFrame(() => {
      const inp = wrap.querySelector('#mod-qty-input');
      if (inp) {
        inp.focus();
        inp.select();
        wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  // ── Edit state transitions ────────────────────────────────────────────────

  function startEdit(sub, existingEntry) {
    // Pre-fill form state from existing entry or defaults
    fQty  = existingEntry ? existingEntry.quantity : 1;
    fUnit = existingEntry ? existingEntry.unit : (sub.default_unit ?? '');
    fNote = existingEntry?.note ?? '';

    editingId = sub.id;
    render();
  }

  function cancelEdit() {
    editingId = null;
    render();
  }

  function saveEntry(sub) {
    // Read current values straight from DOM (in case user typed without triggering input events)
    const qtyEl  = document.getElementById('mod-qty-input');
    const unitEl = document.getElementById('mod-unit-input');
    const noteEl = document.getElementById('mod-note-input');

    const qty  = parseFloat(qtyEl?.value ?? fQty);
    const unit = (unitEl?.value ?? fUnit).trim() || sub.default_unit;
    const note = (noteEl?.value ?? fNote).trim();

    if (!qty || qty <= 0) {
      qtyEl?.classList.add('input--error');
      return;
    }

    Data.getDay(currentDate).moderation[sub.id] = {
      quantity: Math.round(qty * 2) / 2,   // normalize to 0.5 precision
      unit:     unit,
      note:     note,
    };

    editingId = null;
    render();
    scheduleSave();
  }

  function clearEntry(sub) {
    Data.getDay(currentDate).moderation[sub.id] = null;
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

  function fmtDateLabel(dateStr) {
    const today = Data.today();
    if (dateStr === today)                  return 'Today';
    if (dateStr === shiftDate(today, -1))   return 'Yesterday';
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
