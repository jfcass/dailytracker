/**
 * hub.js — Hub View layout for the Today tab.
 *
 * Renders a 2×2 tile grid (Routine, Wellbeing, Health, Reflections).
 * Each tile has a carousel or summary + a uniform Log button.
 * Tapping a tile navigates into a bucket detail panel; tapping a section
 * overlays it full-screen using the .hub-section-active CSS class.
 *
 * Layout is toggled via Data.getSettings().today_layout ('accordion'|'hub').
 * Called from App.switchTab() and Settings layout toggle.
 */
const Hub = (() => {

  // ── Bucket definitions ────────────────────────────────────────────
  const BUCKETS = {
    routine: {
      label: 'Routine',
      sections: ['section-habits', 'section-moderation'],
    },
    wellbeing: {
      label: 'Wellbeing',
      sections: ['section-mood', 'section-sleep'],   // adjust IDs if different
    },
    health: {
      label: 'Health',
      sections: ['section-symptoms', 'section-meds', 'section-bowel', 'tab-treatments'],
    },
    reflections: {
      label: 'Reflections',
      sections: ['section-gratitudes', 'section-note'],
    },
  };

  // ── Data helpers ──────────────────────────────────────────────────

  /** Count consecutive days going back from today where predicate returns true.
   *  If today's entry doesn't satisfy the predicate, it's skipped rather than
   *  treated as a break — you haven't broken the streak, you just haven't
   *  done today yet. */
  function countStreak(predicate) {
    const allDays  = Data.getData().days;
    const sorted   = Object.keys(allDays).sort().reverse(); // newest first
    const todayStr = Data.today();
    let streak = 0;
    for (const d of sorted) {
      if (d > todayStr) continue;           // skip future dates
      if (d === todayStr && !predicate(allDays[d])) continue; // today not done yet — skip, don't break
      if (predicate(allDays[d])) streak++;
      else break;
    }
    return streak;
  }

  /**
   * Returns array of {name, days} for habits with streak > 0,
   * sorted by streak descending, shuffled at start position by caller.
   */
  function getHabitStreaks() {
    const habits = Data.getSettings().habits ?? [];
    return habits
      .map(name => ({
        name,
        days: countStreak(day => day?.habits?.[name] === true),
      }))
      .filter(h => h.days > 0)
      .sort((a, b) => b.days - a.days);
  }

  /** Count consecutive days with at least one gratitude entry. */
  function getGratitudeStreak() {
    return countStreak(day => Array.isArray(day?.gratitudes) && day.gratitudes.length > 0);
  }

  /** Returns the currently viewed date (falls back to today). */
  function viewDate() {
    return (typeof DateNav !== 'undefined') ? DateNav.getDate() : Data.today();
  }

  /** Viewed date's wellbeing summary for the Wellbeing tile. */
  function getTodayWellbeing() {
    const day = Data.getDay(viewDate());
    return {
      mood:   day?.mood?.mood   ?? null,   // 1–5
      energy: day?.mood?.energy ?? null,   // 1–5
      sleep:  day?.sleep?.hours ?? null,   // number
    };
  }

  /** Viewed date's health stats for the Health carousel. */
  function getTodayStats() {
    const day = Data.getDay(viewDate());
    return [
      {
        ico: '💤',
        val: day?.sleep?.hours != null ? `${day.sleep.hours}` : null,
        lbl: 'hrs sleep',
      },
      {
        ico: '👣',
        val: day?.steps != null ? day.steps.toLocaleString() : null,
        lbl: 'steps today',
      },
      {
        ico: '🔥',
        val: day?.calories != null ? day.calories.toLocaleString() : null,
        lbl: 'calories',
      },
    ];
  }

  /**
   * Returns reminder text or null if nothing to remind.
   * Checks: medications due today not yet taken; habits not yet done (evening only).
   */
  function getReminderText() {
    const items = [];

    // Pending medications
    const day = Data.getDay(Data.today());
    const meds = Data.getData().medications ?? {};
    const taken = day.medications_taken ?? [];
    const activeMeds = Object.values(meds).filter(m => m.active && !m.as_needed);
    const pendingMeds = activeMeds.filter(m =>
      !taken.some(t => t.medication_id === m.id && t.taken)
    );
    if (pendingMeds.length === 1) items.push(`${pendingMeds[0].name} due`);
    else if (pendingMeds.length > 1) items.push(`${pendingMeds.length} meds due`);

    // Incomplete habits (only remind if it's past 6pm)
    const hour = new Date().getHours();
    if (hour >= 18) {
      const habits   = Data.getSettings().habits ?? [];
      const dayHabs  = day.habits ?? {};
      const undone   = habits.filter(h => !dayHabs[h]);
      if (undone.length > 0) items.push(`${undone.length} habit${undone.length > 1 ? 's' : ''} left`);
    }

    return items.length > 0 ? items.join(' · ') : null;
  }

  // ── Mood/rating label helpers ─────────────────────────────────────

  const MOOD_LABELS  = ['', 'Very Low', 'Low', 'Neutral', 'Good', 'Excellent'];
  const MOOD_EMOJIS  = ['', '😞', '😔', '😐', '😊', '😄'];

  function moodLabel(val) { return MOOD_LABELS[val] ?? '—'; }
  function moodEmoji(val) { return MOOD_EMOJIS[val] ?? '—'; }

  const ENERGY_LABELS = ['', 'Exhausted', 'Low', 'Moderate', 'Good', 'High'];
  function energyLabel(val) { return ENERGY_LABELS[val] ?? '—'; }

  // ── Carousel builder ──────────────────────────────────────────────

  /**
   * Builds a carousel within the given stage/dots elements.
   * items: array of {html: string} — each item's innerHTML for a .hub-carousel__slide.
   * intervalMs: auto-advance interval.
   * Returns { go(idx) } for external control.
   */
  function makeCarousel(stage, dotsEl, items, intervalMs = 5000) {
    if (!items.length) return { go: () => {} };

    // Pick a random start so the same item never leads every time
    let cur = Math.floor(Math.random() * items.length);

    items.forEach((item, i) => {
      const slide = document.createElement('div');
      slide.className = 'hub-carousel__slide' + (i !== cur ? ' is-gone' : '');
      slide.innerHTML = item.html;
      stage.appendChild(slide);
    });

    items.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = 'hub-dot' + (i === cur ? ' is-on' : '');
      dot.addEventListener('click', () => go(i));
      dotsEl.appendChild(dot);
    });

    function go(next) {
      if (next === cur || !items.length) return;
      const slides = stage.querySelectorAll('.hub-carousel__slide');
      const dots   = dotsEl.querySelectorAll('.hub-dot');
      slides[cur].classList.add('is-gone');
      dots[cur].classList.remove('is-on');
      cur = next;
      slides[cur].classList.remove('is-gone');
      dots[cur].classList.add('is-on');
    }

    let timer = setInterval(() => go((cur + 1) % items.length), intervalMs);

    // Swipe on the stage
    let sx = null;
    stage.addEventListener('pointerdown', e => { sx = e.clientX; });
    stage.addEventListener('pointerup',   e => {
      if (sx === null) return;
      const dx = e.clientX - sx;
      if (Math.abs(dx) > 30) {
        clearInterval(timer);
        go(dx < 0
          ? (cur + 1) % items.length
          : (cur - 1 + items.length) % items.length);
        timer = setInterval(() => go((cur + 1) % items.length), intervalMs);
      }
      sx = null;
    });

    return { go };
  }

  // ── Swipeable log button builder ──────────────────────────────────

  /**
   * Wires up a swipeable log button.
   * btn: the .hub-log-swipe element.
   * chevL/chevR: the .hub-chev elements.
   * lblEl: the .hub-log-lbl span.
   * opts: string[] of label options.
   * onTap: called when user taps the button body (not chevrons) — receives current opt index.
   */
  function makeSwipeBtn(btn, chevL, chevR, lblEl, opts, onTap) {
    let idx = 0;

    function cycle(dir) {
      const cls = dir > 0 ? 'is-out-l' : 'is-out-r';
      lblEl.classList.add(cls);
      setTimeout(() => {
        idx = (idx + dir + opts.length) % opts.length;
        lblEl.textContent = opts[idx];
        lblEl.classList.remove(cls);
        lblEl.classList.add('is-in');
        requestAnimationFrame(() => requestAnimationFrame(() => lblEl.classList.remove('is-in')));
      }, 170);
    }

    chevL.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); cycle(-1); });
    chevR.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); cycle(+1); });

    let startX = null, moved = false;
    btn.addEventListener('pointerdown', e => {
      if (e.target.classList.contains('hub-chev')) return;
      startX = e.clientX; moved = false;
      btn.setPointerCapture(e.pointerId);
    });
    btn.addEventListener('pointermove', e => {
      if (startX !== null && Math.abs(e.clientX - startX) > 8) moved = true;
    });
    btn.addEventListener('pointerup', e => {
      if (startX === null || e.target.classList.contains('hub-chev')) { startX = null; return; }
      const dx = e.clientX - startX;
      if (moved && Math.abs(dx) >= 34) {
        cycle(dx < 0 ? +1 : -1);
      } else if (!moved) {
        if (onTap) onTap(idx);
      }
      startX = null; moved = false;
    });
  }

  // ── Shared tile/button creators ───────────────────────────────────

  /** Shared tile shell creator. */
  function createTileShell(name) {
    const tile = document.createElement('div');
    tile.className = 'hub-tile';
    tile.innerHTML = `
      <div class="hub-tile__bar"></div>
      <div class="hub-tile__inner">
        <div class="hub-tile__name">${name}</div>
      </div>`;
    return tile;
  }

  /** Creates the DOM for a swipeable log button. */
  function createSwipeBtn(initialLabel) {
    const btn = document.createElement('div');
    btn.className = 'hub-log-swipe';
    btn.innerHTML = `
      <div class="hub-chev" role="button" aria-label="Previous">&#8249;</div>
      <div class="hub-log-track">
        <div class="hub-log-lbl">${initialLabel}</div>
      </div>
      <div class="hub-chev" role="button" aria-label="Next">&#8250;</div>`;
    const chevL = btn.querySelector('.hub-chev:first-child');
    const chevR = btn.querySelector('.hub-chev:last-child');
    const lblEl = btn.querySelector('.hub-log-lbl');
    return { btn, chevL, chevR, lblEl };
  }

  // ── Individual tile builders ──────────────────────────────────────

  function buildRoutineTile() {
    const tile = createTileShell('Routine');
    const inner = tile.querySelector('.hub-tile__inner');

    const streaks = getHabitStreaks();
    const stage   = document.createElement('div'); stage.className = 'hub-carousel';
    const dots    = document.createElement('div'); dots.className   = 'hub-dots';

    if (streaks.length === 0) {
      const slide = document.createElement('div'); slide.className = 'hub-carousel__slide';
      slide.innerHTML = `<div class="hub-c-none">Start your<br>next streak</div>`;
      stage.appendChild(slide);
    } else {
      makeCarousel(stage, dots, streaks.map(s => ({
        html: `
          <div class="hub-c-lbl">${s.name}</div>
          <div class="hub-c-row">
            <span class="hub-c-num">${s.days}</span>
            <span class="hub-c-unit">day streak</span>
            <span class="hub-c-fire">🔥</span>
          </div>`,
      })), 5000);
    }

    // Simple Log button
    const logBtn = document.createElement('div');
    logBtn.className = 'hub-log-simple';
    logBtn.innerHTML = `<span class="hub-log-simple__lbl">Log</span>`;
    logBtn.addEventListener('click', e => {
      e.stopPropagation();
      showBucket('routine');
    });

    inner.appendChild(stage);
    inner.appendChild(dots);
    inner.appendChild(logBtn);

    tile.addEventListener('click', () => showBucket('routine'));
    return tile;
  }

  function buildWellbeingTile() {
    const tile  = createTileShell('Wellbeing');
    const inner = tile.querySelector('.hub-tile__inner');

    const wb = getTodayWellbeing();

    const rating = document.createElement('div'); rating.className = 'hub-rating';
    if (wb.mood) {
      rating.innerHTML = `
        <div class="hub-rating__lbl">Mood</div>
        <div class="hub-rating__val">
          <span class="hub-rating__em">${moodEmoji(wb.mood)}</span>
          <span class="hub-rating__word">${moodLabel(wb.mood)}</span>
        </div>
        <div class="hub-rating__sub">
          ${wb.energy ? `Energy &middot; ${energyLabel(wb.energy)}` : ''}
          ${wb.sleep  ? ` &nbsp;&middot;&nbsp; Sleep ${wb.sleep}h` : ''}
        </div>`;
    } else {
      rating.innerHTML = `<div class="hub-c-none">Rate your<br>wellbeing today</div>`;
    }

    const logBtn = document.createElement('div');
    logBtn.className = 'hub-log-simple';
    logBtn.innerHTML = `<span class="hub-log-simple__lbl">Log</span>`;
    logBtn.addEventListener('click', e => {
      e.stopPropagation();
      showBucket('wellbeing');
    });

    inner.appendChild(rating);
    inner.appendChild(logBtn);
    tile.addEventListener('click', () => showBucket('wellbeing'));
    return tile;
  }

  function buildHealthTile() {
    const tile  = createTileShell('Health');
    const inner = tile.querySelector('.hub-tile__inner');

    const stats = getTodayStats();
    const stage = document.createElement('div'); stage.className = 'hub-carousel';
    const dots  = document.createElement('div'); dots.className  = 'hub-dots';

    makeCarousel(stage, dots, stats.map(s => ({
      html: `
        <div class="hub-s-ico">${s.ico}</div>
        <div class="hub-s-val">${s.val ?? '—'}</div>
        <div class="hub-s-lbl">${s.lbl}</div>`,
    })), 4500);

    // Swipeable log button
    const swipeOpts = ['Log Symptom', 'Log Medication', 'Log Digestion', 'Log Treatment'];
    const { btn, chevL, chevR, lblEl } = createSwipeBtn(swipeOpts[0]);
    makeSwipeBtn(btn, chevL, chevR, lblEl, swipeOpts, idx => {
      // Map option index to section ID
      const targets = ['section-symptoms', 'section-meds', 'section-bowel', 'tab-treatments'];
      openSection(targets[idx]);
    });

    inner.appendChild(stage);
    inner.appendChild(dots);
    inner.appendChild(btn);
    tile.addEventListener('click', () => showBucket('health'));
    return tile;
  }

  function buildReflectionsTile() {
    const tile  = createTileShell('Reflections');
    const inner = tile.querySelector('.hub-tile__inner');

    const streak = getGratitudeStreak();
    const streakEl = document.createElement('div'); streakEl.className = 'hub-streak';
    if (streak > 0) {
      streakEl.innerHTML = `
        <div>
          <div style="display:flex;align-items:baseline;gap:4px">
            <span class="hub-streak__num">${streak}</span>
            <span class="hub-streak__fire">🔥</span>
          </div>
          <div class="hub-streak__lbl">day gratitude<br>streak</div>
        </div>`;
    } else {
      streakEl.innerHTML = `<div class="hub-c-none">Start your<br>next streak</div>`;
    }

    const swipeOpts = ['Log Gratitude', 'Add Note'];
    const { btn, chevL, chevR, lblEl } = createSwipeBtn(swipeOpts[0]);
    makeSwipeBtn(btn, chevL, chevR, lblEl, swipeOpts, idx => {
      const targets = ['section-gratitudes', 'section-note'];
      openSection(targets[idx]);
    });

    inner.appendChild(streakEl);
    inner.appendChild(btn);
    tile.addEventListener('click', () => showBucket('reflections'));
    return tile;
  }

  /** Renders the 2×2 tile grid into #hub-home. */
  function renderHome() {
    const home = document.getElementById('hub-home');
    if (!home) return;
    home.innerHTML = '';

    // Reminder banner (above grid, inside hub-container)
    const container = document.getElementById('hub-container');
    const existingBanner = container.querySelector('.hub-reminder');
    if (existingBanner) existingBanner.remove();

    const reminderText = getReminderText();
    if (reminderText) {
      const banner = document.createElement('div');
      banner.className = 'hub-reminder';
      banner.innerHTML = `
        <div class="hub-reminder__dot"></div>
        <div class="hub-reminder__text">${reminderText}</div>`;
      container.insertBefore(banner, home);
    }

    // Tiles: top-left, top-right, bottom-left, bottom-right
    home.appendChild(buildRoutineTile());
    home.appendChild(buildWellbeingTile());
    home.appendChild(buildHealthTile());
    home.appendChild(buildReflectionsTile());
  }

  // ── Navigation ────────────────────────────────────────────────────

  let _openSectionEl    = null;  // currently overlaid section element
  let _openSectionBack  = null;  // back button injected into it

  /**
   * Shows the bucket detail panel for the given bucketKey.
   * Renders a list of sections in that bucket with status summaries.
   */
  function showBucket(bucketKey) {
    const bucket = BUCKETS[bucketKey];
    if (!bucket) return;

    const panel = document.getElementById('hub-bucket-panel');
    if (!panel) return;

    // Push history so the back gesture returns here instead of to a previous tab
    history.pushState({ ht: 'hub-bucket', bucket: bucketKey }, '');

    panel.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'hub-panel-header';
    header.innerHTML = `
      <button class="hub-back-btn" type="button">&#8249; Today</button>
      <span class="hub-panel-title">${bucket.label}</span>`;
    header.querySelector('.hub-back-btn').addEventListener('click', closeBucket);
    panel.appendChild(header);

    // Section rows
    bucket.sections.forEach(sectionId => {
      const sec = document.getElementById(sectionId);
      // For tab-treatments, the element is #tab-treatments, not a tracker-section
      const nameEl = sec?.querySelector('.section-title, h2, .section-header h2');
      const name = nameEl?.textContent?.trim().replace(/[▾▸]/g, '').trim()
        || sectionId.replace('section-', '').replace('tab-', '')
           .replace(/-/g, ' ')
           .replace(/\b\w/g, c => c.toUpperCase());

      const row = document.createElement('div');
      row.className = 'hub-section-row';
      row.innerHTML = `
        <span class="hub-section-row__name">${name}</span>
        <span class="hub-section-row__arrow">&#8250;</span>`;
      row.addEventListener('click', () => openSection(sectionId));
      panel.appendChild(row);
    });

    panel.classList.add('is-open');
  }

  function closeBucket() {
    const panel = document.getElementById('hub-bucket-panel');
    if (panel) {
      panel.classList.remove('is-open');
      // Wait for CSS transition then clear
      setTimeout(() => { panel.innerHTML = ''; }, 260);
    }
  }

  /**
   * Opens a section full-screen by adding .hub-section-active.
   * For #tab-treatments, renders the Treatments tab into a temporary overlay instead.
   */
  function openSection(sectionId) {
    // Close any already-open section first
    if (_openSectionEl) closeSection();

    const el = document.getElementById(sectionId);
    if (!el) return;

    // The section lives inside #accordion-wrapper which may be hidden (display:none)
    // when Hub layout is active. A position:fixed child of a display:none ancestor is
    // never rendered — we must unhide the wrapper before applying the overlay class.
    const accEl = document.getElementById('accordion-wrapper');
    if (accEl) accEl.hidden = false;

    // Expand the section if it's collapsed (accordion might have it collapsed)
    el.classList.remove('tracker-section--collapsed');

    // Render Treatments if this is the treatments tab
    if (sectionId === 'tab-treatments' && typeof Treatments !== 'undefined') {
      Treatments.render();
    }

    // Inject back button at top of section
    const back = document.createElement('div');
    back.className = 'hub-section-back';
    back.innerHTML = `&#8249; Back`;
    back.addEventListener('click', closeSection);
    el.insertBefore(back, el.firstChild);

    // Push history so the back gesture returns here instead of to a previous tab
    history.pushState({ ht: 'hub-section', sectionId }, '');

    // Apply overlay class
    el.classList.add('hub-section-active');

    _openSectionEl   = el;
    _openSectionBack = back;

    // Scroll section to top
    el.scrollTop = 0;
  }

  function closeSection() {
    if (!_openSectionEl) return;
    _openSectionEl.classList.remove('hub-section-active');
    if (_openSectionBack && _openSectionBack.parentNode === _openSectionEl) {
      _openSectionEl.removeChild(_openSectionBack);
    }
    _openSectionEl   = null;
    _openSectionBack = null;

    // Re-hide accordion-wrapper if we're still in hub layout
    if ((Data.getSettings().today_layout ?? 'accordion') === 'hub') {
      const accEl = document.getElementById('accordion-wrapper');
      if (accEl) accEl.hidden = true;
    }
  }

  // ── Public interface ──────────────────────────────────────────────

  /**
   * Shows/hides hub vs accordion based on current layout setting.
   * Call this whenever the layout setting changes or Today tab is shown.
   */
  function applyLayout() {
    const layout = Data.getSettings().today_layout ?? 'accordion';
    const hubEl  = document.getElementById('hub-container');
    const accEl  = document.getElementById('accordion-wrapper');
    if (!hubEl || !accEl) return;

    if (layout === 'hub') {
      hubEl.hidden = false;
      accEl.hidden = true;
      renderHome();
    } else {
      hubEl.hidden = true;
      accEl.hidden = false;
    }
  }

  /**
   * Full hub render: apply layout and refresh tile content.
   * Called by App.switchTab('today') and after date changes.
   */
  function render() {
    applyLayout();
  }

  return { render, applyLayout, openSection, closeSection, closeBucket };

})();
