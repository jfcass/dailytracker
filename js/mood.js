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
    const { mood = null, energy = null } = getMoodData();

    // Toggle active class on each button
    document.querySelectorAll('.mood-btn[data-field="mood"]').forEach(btn => {
      btn.classList.toggle('mood-btn--active', +btn.dataset.val === mood);
    });
    document.querySelectorAll('.mood-btn[data-field="energy"]').forEach(btn => {
      btn.classList.toggle('mood-btn--active', +btn.dataset.val === energy);
    });

    // Value labels
    const ml = document.getElementById('mood-value-label');
    if (ml) ml.textContent = mood ? MOOD_LABELS[mood] : '';

    const el = document.getElementById('energy-value-label');
    if (el) el.textContent = energy ? ENERGY_LABELS[energy] : '';

    // Section badge — shows current readings at a glance
    const badge = document.getElementById('mood-badge');
    if (badge) {
      const parts = [];
      if (mood)   parts.push(MOOD_LABELS[mood]);
      if (energy) parts.push(ENERGY_LABELS[energy]);
      badge.textContent = parts.join(' · ');
    }

    // Daily note — skip update while the user is actively typing
    const noteEl = document.getElementById('daily-note');
    if (noteEl && noteEl !== document.activeElement) {
      noteEl.value = getNote();
      _autoResizeNote(noteEl);
    }

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
      day.mood = { mood: null, energy: null };
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

  return { init, setDate };

})();
