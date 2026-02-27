/**
 * gratitudes.js — Daily Gratitudes section
 *
 * Renders into the static #section-gratitudes shell in index.html.
 * Reads/writes Data.getDay(date).gratitudes  →  ["text", "text", …]
 *
 * Auto-grow: starts with one input; appends a new bullet
 * whenever the last one has content.
 */
const Gratitudes = (() => {

  let currentDate = null;
  let saveTimer   = null;

  // ── Public ────────────────────────────────────────────────────────────────

  function init() {
    currentDate = DateNav.getDate();
    render();
  }

  function setDate(date) {
    currentDate = date;
    render();
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function getEntries() {
    return Data.getDay(currentDate).gratitudes ?? [];
  }

  function render() {
    const list = document.getElementById('grat-list');
    if (!list) return;

    const entries = [...getEntries()];
    // Always show at least one input; append blank slot if last has content
    if (entries.length === 0 || entries[entries.length - 1] !== '') {
      entries.push('');
    }

    list.innerHTML = entries.map((val, idx) => `
      <div class="grat-item">
        <span class="grat-bullet" aria-hidden="true">•</span>
        <textarea
          class="grat-input"
          rows="1"
          placeholder="I'm grateful for…"
          data-idx="${idx}"
          oninput="Gratitudes._onInput(this)"
          onkeydown="Gratitudes._onKeydown(event, ${idx})"
        >${escHtml(val)}</textarea>
      </div>
    `).join('');

    // Auto-size any pre-filled rows
    document.querySelectorAll('#grat-list .grat-input').forEach(_autoResize);

    updateSaveStatus('');
  }

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function updateSaveStatus(msg) {
    const el = document.getElementById('grat-save-status');
    if (el) el.textContent = msg;
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  function _autoResize(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }

  function _onInput(inputEl) {
    _autoResize(inputEl);
    const idx     = parseInt(inputEl.dataset.idx, 10);
    const value   = inputEl.value;
    const entries = [...getEntries()];

    // Grow array if needed
    while (entries.length <= idx) entries.push('');
    entries[idx] = value;

    // Auto-append new blank slot when last input has content
    if (idx === entries.length - 1 && value.trim() !== '') {
      entries.push('');
    }

    save(entries);
  }

  function _onKeydown(event, idx) {
    // Enter key: focus next input (or the newly appended one)
    if (event.key === 'Enter') {
      event.preventDefault();
      const inputs = document.querySelectorAll('#grat-list .grat-input');
      const next   = inputs[idx + 1];
      if (next) next.focus();
    }
  }

  function save(entries) {
    // Strip trailing empty strings, keep at least []
    const cleaned = entries.filter((v, i) => v.trim() !== '' || i < entries.length - 1)
                           .filter(v => v.trim() !== '');
    Data.getDay(currentDate).gratitudes = cleaned;

    updateSaveStatus('Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await Data.save();
      updateSaveStatus('Saved');
      setTimeout(() => updateSaveStatus(''), 1500);

      // Preserve which input has focus before re-render destroys the DOM
      const active   = document.activeElement;
      const inGrat   = active && active.closest('#grat-list');
      const focusIdx = inGrat ? parseInt(active.dataset.idx, 10) : -1;

      // Re-render to sync displayed inputs with cleaned array + fresh trailing blank
      render();

      // Restore focus to the same row after re-render
      if (focusIdx >= 0) {
        const inputs = document.querySelectorAll('#grat-list .grat-input');
        const target = inputs[focusIdx] ?? inputs[inputs.length - 1];
        if (target) {
          target.focus();
          const len = target.value.length;
          target.setSelectionRange(len, len);
        }
      }
    }, 800);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return { init, setDate, _onInput, _onKeydown };
})();
