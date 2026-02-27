/**
 * bowel.js — Digestion / Bowel Movement Tracker section
 *
 * Renders into the static #section-bowel shell in index.html.
 * Reads/writes Data.getDay(date).bowel  →  [{ id, time, quality, notes }, …]
 *
 * Quality scale (Bristol-inspired):
 *   1 = Hard   2 = Firm   3 = Normal   4 = Soft   5 = Watery
 */
const Bowel = (() => {

  let currentDate = null;
  let editingId   = null;   // entry id, or 'new' for the add form
  let saveTimer   = null;

  let fTime    = '';
  let fQuality = 0;
  let fNotes   = '';

  const QUALITY_LABELS = ['', 'Hard', 'Firm', 'Normal', 'Soft', 'Watery'];
  const QUALITY_COLORS = ['', '#8B6240', '#C09040', '#1ABEA5', '#E89020', '#E05030'];

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
    const label = QUALITY_LABELS[entry.quality] ?? '';
    const color = QUALITY_COLORS[entry.quality] ?? 'var(--clr-accent)';

    wrap.innerHTML = `
      <div class="bwl-display">
        <span class="bwl-quality-chip" style="--q-clr: ${color}">${escHtml(label)}</span>
        <div class="bwl-meta">
          ${entry.time  ? `<span class="bwl-time">${escHtml(entry.time)}</span>` : ''}
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
    const qualityBtns = QUALITY_LABELS.slice(1).map((label, i) => {
      const val    = i + 1;
      const color  = QUALITY_COLORS[val];
      const active = fQuality === val ? 'bwl-quality-btn--active' : '';
      return `<button class="bwl-quality-btn ${active}" type="button"
                      data-quality="${val}" style="--q-clr: ${color}">
                ${escHtml(label)}
              </button>`;
    }).reverse().join('');

    wrap.innerHTML = `
      <div class="bwl-form">
        <div class="bwl-form-quality-row">${qualityBtns}</div>
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
        fQuality = parseInt(btn.dataset.quality, 10);
        wrap.querySelectorAll('.bwl-quality-btn').forEach(b =>
          b.classList.toggle('bwl-quality-btn--active', b.dataset.quality === String(fQuality))
        );
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

  // ── Public API ────────────────────────────────────────────────────────────

  return { init, render, setDate };
})();
