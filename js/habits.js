/**
 * habits.js — Habit Tracker section
 *
 * Renders into the static #section-habits shell in index.html.
 * Reads/writes Data.getDay(date).habits  (key: habit name, value: boolean)
 * Habit list comes from Data.getSettings().habits  (array of strings)
 */
const Habits = (() => {

  let currentDate   = null;
  let saveTimer     = null;
  let bookPanelOpen = false;  // true when Reading inline panel is expanded
  let gymPanelOpen  = false;  // true when Gym inline panel is expanded

  const GYM_GROUPS = ['Chest', 'Back', 'Arms', 'Legs', 'Cardio'];

  // ── Public entry points ──────────────────────────────────────────────────

  /** Called once from App.showMain() after data is loaded. */
  function init() {
    currentDate = DateNav.getDate();
    render();
  }

  /** Full re-render of the section (called after toggle or date change). */
  function render() {
    const habits  = Data.getSettings().habits ?? [];
    const day     = Data.getDay(currentDate);
    const done    = habits.filter(h => day.habits[h] === true).length;
    const total   = habits.length;
    const isToday = currentDate === Data.today();

    // ── Progress ──────────────────────────────────────────────────────────
    document.getElementById('habit-progress-text').textContent = `${done} / ${total}`;
    document.getElementById('habit-progress-fill').style.width =
      total > 0 ? `${Math.round((done / total) * 100)}%` : '0%';


    // ── Habit list ────────────────────────────────────────────────────────
    const list = document.getElementById('habit-list');
    list.innerHTML = '';

    if (habits.length === 0) {
      const empty = document.createElement('p');
      empty.className   = 'section-empty';
      empty.textContent = 'No habits configured.';
      list.appendChild(empty);
      return;
    }

    habits.forEach(name => {
      if (name.toLowerCase() === 'reading') {
        const wrapper = document.createElement('div');
        wrapper.className = 'habit-reading-wrapper';
        wrapper.appendChild(makeReadingRow(name, day.habits[name] === true));
        const panel = document.createElement('div');
        panel.id        = 'book-habits-inline';
        panel.className = 'book-habits-inline';
        panel.hidden    = !bookPanelOpen;
        wrapper.appendChild(panel);
        list.appendChild(wrapper);
        if (bookPanelOpen && typeof Books !== 'undefined') {
          Books.renderInlineHabits();
        }
      } else if (name.toLowerCase() === 'gym') {
        const wrapper = document.createElement('div');
        wrapper.className = 'habit-reading-wrapper';
        wrapper.appendChild(makeGymRow(name, day.habits[name] === true));
        const panel = document.createElement('div');
        panel.id        = 'gym-habits-inline';
        panel.className = 'gym-habits-inline';
        panel.hidden    = !gymPanelOpen;
        if (gymPanelOpen) panel.innerHTML = buildGymPanel(name, day);
        wrapper.appendChild(panel);
        list.appendChild(wrapper);
      } else if (name.toLowerCase() === 'meditation') {
        list.appendChild(makeMeditationRow(name, day.habits[name] === true));
      } else {
        list.appendChild(makeRow(name, day.habits[name] === true));
      }
    });
  }

  // ── Row builder ──────────────────────────────────────────────────────────

  function makeRow(name, checked) {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'habit-row' + (checked ? ' habit-row--checked' : '');
    btn.setAttribute('role', 'listitem');
    btn.setAttribute('aria-pressed', String(checked));
    btn.setAttribute('aria-label', `${name}${checked ? ', done' : ''}`);

    const streak = calcStreak(name);
    let badge    = '';
    if      (streak >= 2) badge = `<span class="habit-streak">🔥 ${streak}</span>`;
    else if (streak === 1) badge = `<span class="habit-streak habit-streak--one">1</span>`;

    const periodBadge = (function() {
      const cfg = getHabitConfig(name);
      if (cfg.frequency === 'daily') return '';
      const { start, end, shortLabel } = getPeriodBounds(cfg, currentDate);
      const done  = countPeriodCompletions(name, start, end);
      const total = cfg.freq_count;
      const cls   = done >= total ? 'period-badge period-badge--done' : 'period-badge';
      return `<span class="${cls}">${done}/${total} ${shortLabel}</span>`;
    })();

    btn.innerHTML = `
      <div class="habit-check" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"
             width="13" height="13">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <span class="habit-name">${escHtml(name)}</span>
      ${badge}
      ${periodBadge}
    `;

    btn.addEventListener('click', () => toggle(name));
    return btn;
  }

  // ── Meditation row (shows "Open Calm" deep-link button) ──────────────────
  function makeMeditationRow(name, checked) {
    const streak = calcStreak(name);
    let badge = '';
    if      (streak >= 2) badge = `<span class="habit-streak">🔥 ${streak}</span>`;
    else if (streak === 1) badge = `<span class="habit-streak habit-streak--one">1</span>`;

    const periodBadge = (function() {
      const cfg = getHabitConfig(name);
      if (cfg.frequency === 'daily') return '';
      const { start, end, shortLabel } = getPeriodBounds(cfg, currentDate);
      const done  = countPeriodCompletions(name, start, end);
      const total = cfg.freq_count;
      const cls   = done >= total ? 'period-badge period-badge--done' : 'period-badge';
      return `<span class="${cls}">${done}/${total} ${shortLabel}</span>`;
    })();

    const div = document.createElement('div');
    div.className = 'habit-row habit-row--reading' + (checked ? ' habit-row--checked' : '');
    div.setAttribute('role', 'listitem');

    div.innerHTML = `
      <button class="habit-check-btn" type="button"
              aria-pressed="${checked}"
              aria-label="${checked ? 'Mark Meditation undone' : 'Mark Meditation done'}">
        <div class="habit-check" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"
               width="13" height="13">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
      </button>
      <span class="habit-name">${escHtml(name)}</span>
      ${badge}
      ${periodBadge}
      <a class="habit-calm-btn" href="calm://" aria-label="Open Calm app" title="Open Calm">🧘</a>
    `;

    div.querySelector('.habit-check-btn').addEventListener('click', () => toggle(name));
    return div;
  }

  // ── Reading row (expandable) ─────────────────────────────────────────────

  function makeReadingRow(name, checked) {
    const streak = calcStreak(name);
    let badge = '';
    if      (streak >= 2) badge = `<span class="habit-streak">🔥 ${streak}</span>`;
    else if (streak === 1) badge = `<span class="habit-streak habit-streak--one">1</span>`;

    const periodBadge = (function() {
      const cfg = getHabitConfig(name);
      if (cfg.frequency === 'daily') return '';
      const { start, end, shortLabel } = getPeriodBounds(cfg, currentDate);
      const done  = countPeriodCompletions(name, start, end);
      const total = cfg.freq_count;
      const cls   = done >= total ? 'period-badge period-badge--done' : 'period-badge';
      return `<span class="${cls}">${done}/${total} ${shortLabel}</span>`;
    })();

    const div = document.createElement('div');
    div.className = 'habit-row habit-row--reading'
      + (checked       ? ' habit-row--checked' : '')
      + (bookPanelOpen ? ' habit-row--open'    : '');
    div.setAttribute('role', 'listitem');

    div.innerHTML = `
      <button class="habit-check-btn" type="button"
              aria-pressed="${checked}"
              aria-label="${checked ? 'Mark Reading undone' : 'Mark Reading done'}">
        <div class="habit-check" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"
               width="13" height="13">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
      </button>
      <button class="habit-expand-btn" type="button" aria-expanded="${bookPanelOpen}">
        <span class="habit-name">${escHtml(name)}</span>
        ${badge}
        ${periodBadge}
        <svg class="habit-chevron${bookPanelOpen ? ' habit-chevron--open' : ''}"
             viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
             width="14" height="14" aria-hidden="true">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
    `;

    div.querySelector('.habit-check-btn').addEventListener('click', () => toggle(name));
    div.querySelector('.habit-expand-btn').addEventListener('click', () => {
      bookPanelOpen = !bookPanelOpen;
      render();
    });
    return div;
  }

  // ── Gym row (expandable) ─────────────────────────────────────────────────

  function makeGymRow(name, checked) {
    const streak = calcStreak(name);
    let badge = '';
    if      (streak >= 2) badge = `<span class="habit-streak">🔥 ${streak}</span>`;
    else if (streak === 1) badge = `<span class="habit-streak habit-streak--one">1</span>`;

    const periodBadge = (function() {
      const cfg = getHabitConfig(name);
      if (cfg.frequency === 'daily') return '';
      const { start, end, shortLabel } = getPeriodBounds(cfg, currentDate);
      const done  = countPeriodCompletions(name, start, end);
      const total = cfg.freq_count;
      const cls   = done >= total ? 'period-badge period-badge--done' : 'period-badge';
      return `<span class="${cls}">${done}/${total} ${shortLabel}</span>`;
    })();

    const div = document.createElement('div');
    div.className = 'habit-row habit-row--reading'
      + (checked      ? ' habit-row--checked' : '')
      + (gymPanelOpen ? ' habit-row--open'    : '');
    div.setAttribute('role', 'listitem');

    div.innerHTML = `
      <button class="habit-check-btn" type="button"
              aria-pressed="${checked}"
              aria-label="${checked ? 'Mark Gym undone' : 'Mark Gym done'}">
        <div class="habit-check" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"
               width="13" height="13">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
      </button>
      <button class="habit-expand-btn" type="button" aria-expanded="${gymPanelOpen}">
        <span class="habit-name">${escHtml(name)}</span>
        ${badge}
        ${periodBadge}
        <svg class="habit-chevron${gymPanelOpen ? ' habit-chevron--open' : ''}"
             viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
             width="14" height="14" aria-hidden="true">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
    `;

    div.querySelector('.habit-check-btn').addEventListener('click', () => toggle(name));
    div.querySelector('.habit-expand-btn').addEventListener('click', () => {
      gymPanelOpen = !gymPanelOpen;
      render();
    });
    return div;
  }

  function buildGymPanel(habitName, day) {
    const selected = day.gym?.muscle_groups ?? [];
    let html = '<div class="gym-panel">';
    GYM_GROUPS.forEach(group => {
      const active = selected.includes(group);
      html += `<button class="gym-muscle-btn${active ? ' gym-muscle-btn--active' : ''}"
                       onclick="Habits._toggleMuscle('${escHtml(habitName)}', '${group}')"
                       aria-pressed="${active}">${group}</button>`;
    });
    html += '</div>';
    return html;
  }

  // ── Muscle group toggle ───────────────────────────────────────────────────

  function toggleMuscleGroup(habitName, group) {
    const day = Data.getDay(currentDate);
    if (!day.gym) day.gym = { muscle_groups: [] };
    const idx = day.gym.muscle_groups.indexOf(group);
    if (idx >= 0) {
      day.gym.muscle_groups.splice(idx, 1);
    } else {
      day.gym.muscle_groups.push(group);
      // Auto-check the Gym habit when any group is selected
      day.habits[habitName] = true;
    }
    render();
    scheduleSave();
  }

  // ── Toggle ───────────────────────────────────────────────────────────────

  function toggle(name) {
    const day = Data.getDay(currentDate);
    day.habits[name] = !(day.habits[name] === true);
    render();
    scheduleSave();
  }

  // ── External: mark a habit done (called by Books when session logged) ────

  function markHabitDone(name) {
    const day = Data.getDay(currentDate);
    if (day.habits[name] !== true) {
      day.habits[name] = true;
      render();
      scheduleSave();
    }
  }

  // ── Date sync (called by DateNav) ────────────────────────────────────────

  function setDate(date) {
    currentDate = date;
    render();
  }

  // ── Streak calculation ────────────────────────────────────────────────────

  /**
   * Count consecutive completed days ending at (and including) today.
   * If today's habit is already checked, it counts.
   * If today is unchecked, the streak starts from yesterday.
   */
  function calcStreak(name) {
    const allDays = Data.getData().days;
    const today   = Data.today();
    const todayOn = allDays[today]?.habits?.[name] === true;
    let date      = todayOn ? today : shiftDate(today, -1);
    let n         = 0;

    for (let i = 0; i < 365; i++) {
      if (allDays[date]?.habits?.[name] === true) {
        n++;
        date = shiftDate(date, -1);
      } else {
        break;
      }
    }
    return n;
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
        console.error('Habits save failed:', err);
        setSaveStatus('error');
      }
    }, 1200);
  }

  function setSaveStatus(s) {
    const el = document.getElementById('habit-save-status');
    if (!el) return;
    el.dataset.status = s;
    const labels = { pending: 'Unsaved', saving: 'Saving…', saved: 'Saved', error: 'Save failed', '': '' };
    el.textContent = labels[s] ?? '';
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Returns the HabitConfig for a habit, falling back to daily defaults. */
  function getHabitConfig(name) {
    const configs = Data.getSettings().habit_configs ?? {};
    return {
      frequency:        'daily',
      freq_count:       1,
      freq_period_days: 7,
      reminder:         false,
      ...(configs[name] ?? {}),
    };
  }

  /**
   * Returns { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD', shortLabel: string }
   * for the period containing refDate (defaults to today).
   * daily → shortLabel 'today'; weekly → 'wk'; monthly → 'mo'; quarterly → 'qtr'; custom → '${N}d'
   */
  function getPeriodBounds(cfg, refDate) {
    const ref = refDate ?? Data.today();
    const d   = new Date(ref + 'T12:00:00');

    if (cfg.frequency === 'daily') {
      return { start: ref, end: ref, shortLabel: 'today' };
    }

    if (cfg.frequency === 'weekly') {
      const dow  = d.getDay();
      const diff = (dow === 0 ? -6 : 1 - dow);
      const mon  = new Date(d); mon.setDate(d.getDate() + diff);
      const sun  = new Date(mon); sun.setDate(mon.getDate() + 6);
      return {
        start:      mon.toISOString().slice(0, 10),
        end:        sun.toISOString().slice(0, 10),
        shortLabel: 'wk',
      };
    }

    if (cfg.frequency === 'monthly') {
      const y = d.getFullYear(), m = d.getMonth();
      const last = new Date(y, m + 1, 0);
      return {
        start:      `${y}-${String(m + 1).padStart(2, '0')}-01`,
        end:        last.toISOString().slice(0, 10),
        shortLabel: 'mo',
      };
    }

    if (cfg.frequency === 'quarterly') {
      const y  = d.getFullYear();
      const qm = Math.floor(d.getMonth() / 3) * 3;
      const last = new Date(y, qm + 3, 0);
      return {
        start:      `${y}-${String(qm + 1).padStart(2, '0')}-01`,
        end:        last.toISOString().slice(0, 10),
        shortLabel: 'qtr',
      };
    }

    // custom: rolling window of freq_period_days days
    const n   = cfg.freq_period_days ?? 7;
    const s   = new Date(d); s.setDate(d.getDate() - (n - 1));
    return {
      start:      s.toISOString().slice(0, 10),
      end:        ref,
      shortLabel: `${n}d`,
    };
  }

  /** Count days in [start, end] (inclusive) where the habit was done. */
  function countPeriodCompletions(name, start, end) {
    const allDays = Data.getData().days;
    return Object.entries(allDays)
      .filter(([date, day]) =>
        date >= start && date <= end && day?.habits?.[name] === true
      ).length;
  }

  /** Returns true if the habit's period goal is not yet met (habit is still "due" this period). */
  function isHabitDue(name) {
    const cfg = getHabitConfig(name);
    if (cfg.frequency === 'daily') {
      return Data.getDay(Data.today())?.habits?.[name] !== true;
    }
    const { start, end } = getPeriodBounds(cfg, Data.today());
    const done = countPeriodCompletions(name, start, end);
    return done < cfg.freq_count;
  }

  function fmtDateLabel(dateStr) {
    const today = Data.today();
    if (dateStr === today)                  return 'Today';
    if (dateStr === shiftDate(today, -1))   return 'Yesterday';
    return new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  }

  /** Shift a YYYY-MM-DD date string by `days` (positive or negative). */
  function shiftDate(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00');  // noon avoids DST edge cases
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function escHtml(s) {
    return s.replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function _toggleMuscle(habitName, group) { toggleMuscleGroup(habitName, group); }

  return { init, render, setDate, markHabitDone, _toggleMuscle };
})();
