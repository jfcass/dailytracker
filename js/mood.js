/**
 * mood.js — Mood & Energy tracker + Daily Note
 *
 * Mood and energy are 1–5 ratings saved to data.days[date].mood.
 * Daily note is free text saved to data.days[date].note.
 */
const Mood = (() => {

  let currentDate = null;
  let noteTimer   = null;

  const MOOD_LABELS   = ['', 'Very Low', 'Low', 'Neutral', 'Good', 'Excellent'];
  const ENERGY_LABELS = ['', 'Exhausted', 'Low', 'Moderate', 'Good', 'High'];
  const STRESS_LABELS = ['', 'Very Low', 'Low', 'Moderate', 'High', 'Very High'];
  const FOCUS_LABELS  = ['', 'Very Low', 'Low', 'Moderate', 'Good', 'High'];

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Notes streak helpers ─────────────────────────────────────────────────
  function shiftDate(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00'); // noon avoids DST edge cases
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function formatStreakLabel(n) {
    if (n < 365) return String(n);
    const years = Math.floor(n / 365);
    const rem   = n % 365;
    return rem === 0 ? `${years}y` : `${years}y ${rem}d`;
  }

  function calcNotesStreak() {
    const allDays  = Data.getData().days ?? {};
    const today    = Data.today();
    const todayHas = !!(allDays[today]?.note ?? '').trim();
    let date = todayHas ? today : shiftDate(today, -1);
    let n    = 0;
    for (let i = 0; i < 3650; i++) {
      const hasEntry = !!(allDays[date]?.note ?? '').trim();
      if (hasEntry) { n++; date = shiftDate(date, -1); }
      else          { break; }
    }
    return n;
  }

  function updateNotesStreakBadge() {
    const el = document.getElementById('notes-streak');
    if (!el) return;
    const streak = calcNotesStreak();
    if (streak === 0) {
      el.hidden      = true;
      el.className   = 'habit-streak';
      el.textContent = '';
    } else if (streak === 1) {
      el.hidden      = false;
      el.className   = 'habit-streak habit-streak--one';
      el.textContent = '1';
    } else {
      el.hidden      = false;
      el.className   = 'habit-streak';
      el.textContent = '🔥 ' + formatStreakLabel(streak);
    }
  }

  // ── Data helpers ──────────────────────────────────────────────────────────────

  function getMoodData() {
    const m = Data.getData().days?.[currentDate]?.mood;
    return (m && typeof m === 'object') ? m : {};
  }

  function getNote() {
    return Data.getData().days?.[currentDate]?.note ?? '';
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  function render() {
    const { mood = null, energy = null, stress = null, focus = null } = getMoodData();

    // Toggle active class on each button
    [
      ['mood',   mood],
      ['energy', energy],
      ['stress', stress],
      ['focus',  focus],
    ].forEach(([field, val]) => {
      document.querySelectorAll(`.mood-btn[data-field="${field}"]`).forEach(btn => {
        btn.classList.toggle('mood-btn--active', +btn.dataset.val === val);
      });
    });

    // Value labels
    const labelMap = {
      'mood-value-label':   [MOOD_LABELS,   mood],
      'energy-value-label': [ENERGY_LABELS, energy],
      'stress-value-label': [STRESS_LABELS, stress],
      'focus-value-label':  [FOCUS_LABELS,  focus],
    };
    Object.entries(labelMap).forEach(([id, [labels, val]]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val ? labels[val] : '';
    });

    // Section badge — shows current readings at a glance
    const badge = document.getElementById('mood-badge');
    if (badge) {
      const parts = [];
      if (mood)   parts.push(MOOD_LABELS[mood]);
      if (energy) parts.push(ENERGY_LABELS[energy]);
      if (stress) parts.push(STRESS_LABELS[stress] + ' stress');
      if (focus)  parts.push(FOCUS_LABELS[focus] + ' focus');
      badge.textContent = parts.join(' · ');
    }

    // Daily note — skip update while the user is actively typing
    const noteEl = document.getElementById('daily-note');
    if (noteEl && noteEl !== document.activeElement) {
      noteEl.value = getNote();
      _autoResizeNote(noteEl);
    }

    renderTags();
    updateNotesStreakBadge();
  }

  // ── Save ──────────────────────────────────────────────────────────────────────

  function showStatus(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    setTimeout(() => { if (el) el.textContent = ''; }, 2000);
  }

  async function saveMood() {
    try {
      await Data.save();
      showStatus('mood-save-status', 'Saved');
    } catch {
      showStatus('mood-save-status', 'Save failed');
    }
  }

  async function saveNote() {
    try {
      await Data.save();
      showStatus('note-save-status', 'Saved');
    } catch {
      showStatus('note-save-status', 'Save failed');
    }
  }

  // ── Interactions ──────────────────────────────────────────────────────────────

  function setRating(field, val) {
    const day = Data.getDay(currentDate);
    if (!day.mood || typeof day.mood !== 'object') {
      day.mood = { mood: null, energy: null, stress: null, focus: null };
    }
    // Tap the active value again to clear it
    day.mood[field] = day.mood[field] === val ? null : val;
    render();
    saveMood();
  }

  function _autoResizeNote(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }

  function onNoteInput() {
    const noteEl = document.getElementById('daily-note');
    if (noteEl) _autoResizeNote(noteEl);
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      const el = document.getElementById('daily-note');
      if (!el) return;
      Data.getDay(currentDate).note = el.value;
      saveNote();
      updateNotesStreakBadge();
    }, 600);
  }

  // ── Tags ──────────────────────────────────────────────────────────────────────

  function getTags() {
    return Data.getDay(currentDate).tags ?? [];
  }

  function toggleTag(tag) {
    const day  = Data.getDay(currentDate);
    if (!day.tags) day.tags = [];
    const idx  = day.tags.indexOf(tag);
    if (idx === -1) { day.tags.push(tag); }
    else            { day.tags.splice(idx, 1); }
    renderTags();
    saveNote();
  }

  function addNoteTagInline() {
    const inp  = document.getElementById('note-tag-add-input');
    if (!inp) return;
    const name = inp.value.trim();
    if (!name) return;
    const settings = Data.getSettings();
    if (!settings.note_tags) settings.note_tags = [];
    if (!settings.note_tags.includes(name)) {
      settings.note_tags.push(name);
      if (typeof Settings !== 'undefined') Settings.render();
    }
    toggleTag(name); // also selects it for today
    Data.save();
  }

  function renderTags() {
    const wrap = document.getElementById('note-tags-wrap');
    if (!wrap) return;
    const allTags  = Data.getSettings().note_tags ?? [];
    const selected = getTags();

    const pills = allTags.map(tag => {
      const active = selected.includes(tag) ? ' note-tag--active' : '';
      return `<button class="note-tag${active}" type="button"
                      onclick="Mood._toggleTag(${JSON.stringify(escHtml(tag))})">${escHtml(tag)}</button>`;
    }).join('');

    wrap.innerHTML = `
      <div class="note-tag-pills">${pills}</div>
      <div class="note-tag-add-row">
        <input class="note-tag-add-input" id="note-tag-add-input" type="text"
               placeholder="Add tag…" maxlength="30" aria-label="Add new tag"
               onkeydown="if(event.key==='Enter'){event.preventDefault();Mood._addNoteTagInline()}">
        <button class="note-tag-add-btn" type="button" onclick="Mood._addNoteTagInline()">+ Tag</button>
      </div>`;
  }

  // ── Public ────────────────────────────────────────────────────────────────────

  function setDate(date) {
    currentDate = date;
    render();
  }

  function init() {
    document.querySelectorAll('.mood-btn[data-field]').forEach(btn => {
      btn.addEventListener('click', () => setRating(btn.dataset.field, +btn.dataset.val));
    });

    document.getElementById('daily-note')?.addEventListener('input', onNoteInput);

    currentDate = Data.today();
    render();
  }

  return { init, setDate, _toggleTag: toggleTag, _addNoteTagInline: addNoteTagInline, _renderTags: renderTags };

})();
