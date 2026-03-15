/**
 * bowel.js — Digestion / Bowel Movement Tracker section
 *
 * Renders into the static #section-bowel shell in index.html.
 * Reads/writes Data.getDay(date).bowel  →  [{ id, time, quality, notes }, …]
 *
 * Quality scale (Bristol Stool Scale, 7 types):
 *   1 = Hard   2 = Lumpy   3 = Cracked   4 = Normal   5 = Soft   6 = Mushy   7 = Watery
 */
const Bowel = (() => {

  let currentDate = null;
  let editingId   = null;   // entry id, or 'new' for the add form
  let saveTimer   = null;

  let fTime    = '';
  let fQuality = 0;
  let fNotes   = '';

  const QUALITY_LABELS = ['', 'Hard', 'Lumpy', 'Cracked', 'Normal', 'Soft', 'Mushy', 'Watery'];
  const QUALITY_COLORS = ['', '#7B3F10', '#9B6030', '#C09040', '#1ABEA5', '#8BC34A', '#E89020', '#E05030'];

  // ── Public ───────────────────────────────────────────────────────────────

  function init() {
    currentDate = DateNav.getDate();
    render();
  }

  function setDate(date) {
    editingId = null;
    fTime = fNotes = '';
    fQuality = 0;
    currentDate = date;
    render();
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function render() {
    const container = document.getElementById('bowel-list');
    if (!container) return;

    const entries = getEntries();
    container.innerHTML = '';

    entries.forEach(e => {
      const row = document.createElement('div');
      row.className = 'bwl-row';
      if (editingId === e.id) {
        row.classList.add('bwl-row--editing');
        buildForm(row, e);
      } else {
        buildDisplay(row, e);
      }
      container.appendChild(row);
    });

    // New-entry form (editingId === 'new')
    if (editingId === 'new') {
      const formRow = document.createElement('div');
      formRow.className = 'bwl-row bwl-row--editing';
      buildForm(formRow, null);
      container.appendChild(formRow);
    }

    // Add button (only when no form is open)
    if (!editingId) {
      const addBtn = document.createElement('button');
      addBtn.className = 'bwl-add-btn';
      addBtn.type = 'button';
      addBtn.textContent = '+ Log';
      addBtn.addEventListener('click', startAdd);
      container.appendChild(addBtn);
    }
  }

  // ── Display mode ──────────────────────────────────────────────────────────

  function buildDisplay(wrap, entry) {
    const label = Number.isInteger(entry.quality)
      ? (QUALITY_LABELS[entry.quality] ?? '')
      : `${QUALITY_LABELS[Math.floor(entry.quality)] ?? ''} – ${QUALITY_LABELS[Math.ceil(entry.quality)] ?? ''}`;
    const color = QUALITY_COLORS[Math.ceil(entry.quality)] ?? 'var(--clr-accent)';

    wrap.innerHTML = `
      <div class="bwl-display">
        <span class="bwl-quality-chip" style="--q-clr: ${color}">${escHtml(label)}</span>
        <div class="bwl-meta">
          ${entry.time  ? `<span class="bwl-time">${escHtml(fmt12h(entry.time))}</span>` : ''}
          ${entry.notes ? `<span class="bwl-note">${escHtml(entry.notes)}</span>` : ''}
        </div>
        <div class="bwl-row-actions">
          <button class="bwl-edit-btn" type="button">Edit</button>
          <button class="bwl-del-btn"  type="button">Delete</button>
        </div>
      </div>
    `;

    wrap.querySelector('.bwl-edit-btn').addEventListener('click', () => startEdit(entry.id));
    wrap.querySelector('.bwl-del-btn').addEventListener('click',  () => deleteEntry(entry.id));
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  function buildForm(wrap, existingEntry) {
    const allQualityBtns = QUALITY_LABELS.slice(1).map((label, i) => {
      const val    = i + 1;
      const color  = QUALITY_COLORS[val];
      const isHalf = fQuality > 0 && !Number.isInteger(fQuality);
      const active = fQuality === val ? 'bwl-quality-btn--active'
        : (isHalf && (val === Math.floor(fQuality) || val === Math.ceil(fQuality)) ? 'bwl-quality-btn--half' : '');
      return `<button class="bwl-quality-btn ${active}" type="button"
                      data-quality="${val}" style="--q-clr: ${color}">
                ${escHtml(label)}
              </button>`;
    }).reverse();                          // display order: 7 → 1 (loose → firm)
    const qualityRow1 = allQualityBtns.slice(0, 4).join(''); // 7 Watery … 4 Normal
    const qualityRow2 = allQualityBtns.slice(4).join('');    // 3 Cracked … 1 Hard

    wrap.innerHTML = `
      <div class="bwl-form">
        <div class="bwl-form-quality-row">${qualityRow1}</div>
        <div class="bwl-form-quality-row">${qualityRow2}</div>
        <div class="bwl-form-fields">
          <input class="bwl-time-input" type="time"
                 value="${escHtml(fTime)}" aria-label="Time (optional)">
          <input class="bwl-notes-input" type="text"
                 value="${escHtml(fNotes)}" maxlength="200"
                 placeholder="Notes (optional)" aria-label="Notes">
        </div>
        <div class="bwl-form-actions">
          <button class="bwl-cancel-btn" type="button">Cancel</button>
          <button class="bwl-save-btn"   type="button">Save</button>
        </div>
      </div>
    `;

    wrap.querySelectorAll('.bwl-quality-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tapped = parseFloat(btn.dataset.quality);
        if (fQuality === tapped) {
          // Tap same whole button → clear
          fQuality = 0;
        } else if (Number.isInteger(fQuality) && fQuality > 0 && Math.abs(tapped - fQuality) === 1) {
          // Tap adjacent to a whole selection → half-point between them
          fQuality = (tapped + fQuality) / 2;
        } else {
          // No selection, non-adjacent, or currently half → set new whole
          fQuality = tapped;
        }
        wrap.querySelectorAll('.bwl-quality-btn').forEach(b => {
          const bVal = parseFloat(b.dataset.quality);
          const isHalf = fQuality > 0 && !Number.isInteger(fQuality);
          b.classList.toggle('bwl-quality-btn--active', bVal === fQuality);
          b.classList.toggle('bwl-quality-btn--half',
            isHalf && (bVal === Math.floor(fQuality) || bVal === Math.ceil(fQuality)));
        });
      });
    });

    wrap.querySelector('.bwl-time-input').addEventListener('input', e => { fTime  = e.target.value; });
    wrap.querySelector('.bwl-notes-input').addEventListener('input', e => { fNotes = e.target.value; });
    wrap.querySelector('.bwl-cancel-btn').addEventListener('click', cancelEdit);
    wrap.querySelector('.bwl-save-btn').addEventListener('click',   saveEntry);
  }

  // ── Edit state transitions ────────────────────────────────────────────────

  function startAdd() {
    editingId = 'new';
    const now = new Date();
    fTime = now.toTimeString().slice(0, 5);   // "HH:MM"
    fNotes = '';
    fQuality = 0;
    render();
  }

  function startEdit(id) {
    const e = getEntries().find(x => x.id === id);
    if (!e) return;
    editingId = id;
    fTime    = e.time    ?? '';
    fQuality = e.quality ?? 0;
    fNotes   = e.notes   ?? '';
    render();
  }

  function cancelEdit() {
    editingId = null;
    fTime = fNotes = '';
    fQuality = 0;
    render();
  }

  function saveEntry() {
    if (!fQuality) return;   // quality is required
    const entries = getEntries();

    if (editingId && editingId !== 'new') {
      const e = entries.find(x => x.id === editingId);
      if (e) {
        e.quality = fQuality;
        e.time    = fTime.trim()  || null;
        e.notes   = fNotes.trim() || '';
      }
    } else {
      entries.push({
        id:      crypto.randomUUID(),
        quality: fQuality,
        time:    fTime.trim()  || null,
        notes:   fNotes.trim() || '',
      });
    }

    editingId = null;
    fTime = fNotes = '';
    fQuality = 0;
    scheduleSave();
    render();
  }

  function deleteEntry(id) {
    const day = Data.getDay(currentDate);
    if (!day.bowel) day.bowel = [];
    day.bowel = day.bowel.filter(e => e.id !== id);
    scheduleSave();
    render();
  }

  // ── Data helper ───────────────────────────────────────────────────────────

  function getEntries() {
    const day = Data.getDay(currentDate);
    if (!day.bowel) day.bowel = [];
    return day.bowel;
  }

  // ── Debounced save ────────────────────────────────────────────────────────

  function scheduleSave() {
    setSaveStatus('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await Data.save();
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus(''), 2200);
      } catch (err) {
        console.error('Bowel save failed:', err);
        setSaveStatus('error');
      }
    }, 1200);
  }

  function setSaveStatus(s) {
    const el = document.getElementById('bowel-save-status');
    if (!el) return;
    el.dataset.status = s;
    const labels = { saving: 'Saving…', saved: 'Saved', error: 'Save failed', '': '' };
    el.textContent = labels[s] ?? '';
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

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

  // ── Public API ────────────────────────────────────────────────────────────

  return { init, render, setDate };
})();
