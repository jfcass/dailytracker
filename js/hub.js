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
      sections: ['section-mood'],          // sleep stats live in the Health tile carousel
    },
    health: {
      label: 'Health',
      // Ordered by frequency of use: meds → digestion → symptoms → treatments
      sections: ['section-meds', 'section-bowel', 'section-symptoms', 'tab-treatments'],
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
   * Returns the next actionable pending item, or null if nothing due.
   * Result: { text, type, slot?, medId? }
   *   type = 'slot' | 'reminder' | 'habits'
   *
   * Items are sorted by inferred expected time (from yesterday's log),
   * interleaving scheduled slots and reminder meds chronologically.
   * An item is "due" when currentTime >= expectedTime − 30 min.
   */
  function getNextPendingItem() {
    const today    = Data.today();
    const dayToday = Data.getDay(today);

    // Yesterday's date string
    const d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    const yesterday = d.toISOString().slice(0, 10);
    const dayYest   = Data.getDay(yesterday) ?? {};

    const allMeds  = Object.values(Data.getData().medications ?? {}).filter(m => m.active);
    const medSlots = dayToday.med_slots    ?? {};
    const medRems  = dayToday.med_reminders ?? {};

    const now         = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    // Parse "HH:MM" → minutes since midnight (returns null if invalid)
    function parseMins(hhmm) {
      if (!hhmm) return null;
      const [h, m] = hhmm.split(':').map(Number);
      return isNaN(h) || isNaN(m) ? null : h * 60 + m;
    }

    const SLOT_DEFAULTS = { am: 8 * 60, afternoon: 12 * 60, pm: 20 * 60 };
    const SLOT_LABELS   = { am: 'AM',   afternoon: 'Afternoon', pm: 'PM'  };

    // Build candidate list: all pending items with their expected time
    const candidates = [];

    // Scheduled slots
    for (const slot of ['am', 'afternoon', 'pm']) {
      const slotMeds = allMeds.filter(m => !m.as_needed && !m.med_reminder && (m.slots ?? []).includes(slot));
      if (!slotMeds.length) continue;
      if (medSlots[slot]?.time) continue;   // already logged

      const expectedMins = parseMins(dayYest?.med_slots?.[slot]?.time) ?? SLOT_DEFAULTS[slot];
      candidates.push({
        expectedMins,
        text: `${SLOT_LABELS[slot]} meds due`,
        type: 'slot',
        slot,
      });
    }

    // Reminder meds
    allMeds.filter(m => m.med_reminder && !medRems[m.id]).forEach(m => {
      const expectedMins = parseMins(dayYest?.med_reminders?.[m.id]) ?? 9 * 60; // 9am default
      candidates.push({
        expectedMins,
        text: `${m.name} reminder`,
        type: 'reminder',
        medId: m.id,
      });
    });

    // Sort by expected time
    candidates.sort((a, b) => a.expectedMins - b.expectedMins);

    // Return the first item that is due (within 30 min window or overdue)
    for (const item of candidates) {
      if (currentMins >= item.expectedMins - 30) return item;
    }

    // Habits fallback — only after 6pm
    if (now.getHours() >= 18) {
      const habits  = Data.getSettings().habits ?? [];
      const dayHabs = dayToday.habits ?? {};
      const undone  = habits.filter(h => !dayHabs[h]);
      if (undone.length > 0) {
        return {
          text: `${undone.length} habit${undone.length > 1 ? 's' : ''} left`,
          type: 'habits',
        };
      }
    }

    return null;
  }

  // ── User display initial cache ────────────────────────────────────

  const _LS_INITIAL_KEY = 'ht_display_initial';

  /** Synchronously return cached user initial, or '?' if not yet loaded. */
  function _getCachedInitial() {
    return localStorage.getItem(_LS_INITIAL_KEY) ?? '?';
  }

  /**
   * Async: fetch the user's display initial from Drive /about and cache it.
   * Silently no-ops if already cached or if no token is available.
   */
  async function _loadUserInitial() {
    if (localStorage.getItem(_LS_INITIAL_KEY)) return;
    try {
      const token = Auth.getToken() ?? await Auth.requestToken(true);
      if (!token) return;
      const res = await fetch(
        'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)',
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return;
      const data = await res.json();
      const name = data?.user?.displayName ?? data?.user?.emailAddress ?? '';
      if (name) localStorage.setItem(_LS_INITIAL_KEY, name[0].toUpperCase());
    } catch { /* network errors are silently ignored */ }
  }

  // ── WMO weather code → emoji + short condition name ─────────────
  const WMO_EMOJI = {
    0:'☀️', 1:'🌤️', 2:'⛅', 3:'☁️',
    45:'🌫️', 48:'🌫️',
    51:'🌦️', 53:'🌦️', 55:'🌧️',
    61:'🌧️', 63:'🌧️', 65:'🌧️',
    71:'🌨️', 73:'🌨️', 75:'❄️', 77:'🌨️',
    80:'🌦️', 81:'🌧️', 82:'⛈️',
    85:'🌨️', 86:'❄️',
    95:'⛈️', 96:'⛈️', 99:'⛈️',
  };

  const WMO_COND = {
    0:'Sunny', 1:'Mostly Clear', 2:'Partly Cloudy', 3:'Overcast',
    45:'Foggy', 48:'Freezing Fog',
    51:'Drizzle', 53:'Drizzle', 55:'Heavy Drizzle',
    61:'Light Rain', 63:'Rain', 65:'Heavy Rain',
    71:'Light Snow', 73:'Snow', 75:'Heavy Snow', 77:'Snow Grains',
    80:'Showers', 81:'Heavy Showers', 82:'Violent Showers',
    85:'Snow Showers', 86:'Heavy Snow Showers',
    95:'Thunderstorm', 96:'Thunderstorm', 99:'Thunderstorm',
  };

  const POLLEN_LABELS = ['None','Very Low','Low','Medium','High','Very High'];
  const POLLEN_SHORT  = ['None','V. Low','Low','Medium','High','V. High'];

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

  // ── Date menu popover ────────────────────────────────────────────
  function _showDateMenu(anchor) {
    // Remove any existing date menu
    document.querySelector('.hub-date-menu')?.remove();

    const menu = document.createElement('div');
    menu.className = 'hub-date-menu';

    const isToday = viewDate() === Data.today();

    // Only show "Today" button when viewing a past date
    const todayBtn = isToday ? '' : `
      <button class="hub-date-menu__item" data-action="today" type="button">
        <span class="hub-date-menu__icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="4"/>
          </svg>
        </span>
        Today
      </button>`;

    menu.innerHTML = `${todayBtn}
      <button class="hub-date-menu__item" data-action="pick" type="button">
        <span class="hub-date-menu__icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </span>
        Pick date…
      </button>`;

    // Position below the anchor
    const rect = anchor.getBoundingClientRect();
    menu.style.top  = rect.bottom + 6 + 'px';
    menu.style.right = (window.innerWidth - rect.right) + 'px';

    document.body.appendChild(menu);

    // Animate in
    requestAnimationFrame(() => menu.classList.add('hub-date-menu--open'));

    // Handle clicks
    menu.addEventListener('click', e => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      _closeDateMenu();

      if (action === 'today') {
        if (typeof DateNav !== 'undefined') DateNav.setDate(Data.today());
      } else if (action === 'pick') {
        const picker = document.getElementById('app-date-picker');
        if (!picker) return;
        picker.value = viewDate();
        try { picker.showPicker(); } catch { picker.click(); }
      }
    });

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', _closeDateMenu, { once: true });
    }, 10);
  }

  function _closeDateMenu() {
    const menu = document.querySelector('.hub-date-menu');
    if (menu) {
      menu.classList.remove('hub-date-menu--open');
      setTimeout(() => menu.remove(), 120);
    }
  }

  /**
   * Renders the full-width hub header (date/greeting row + 3 weather cards)
   * into #hub-header. Called from renderHome().
   *
   * The date row is swipeable: left = next day, right = prev day.
   * The avatar button opens Settings.
   */
  function renderHeader() {
    const el = document.getElementById('hub-header');
    if (!el) return;

    // ── Date & greeting ───────────────────────────────────────────
    const date     = viewDate();
    const d        = new Date(date + 'T12:00:00'); // noon avoids DST edge
    const dayName  = d.toLocaleDateString('en-US', { weekday: 'long' });
    const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const hour    = new Date().getHours();
    const period  = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    const initial = _getCachedInitial();

    // ── Weather cards (3-column horizontal layout) ────────────────
    const weather = Data.getData().days?.[date]?.weather ?? null;
    let wxHTML = '';

    if (weather) {
      const cards = [];

      // Card 1 — temperature + condition
      if (weather.temp_max_f != null) {
        const emoji    = WMO_EMOJI[weather.code] ?? '🌡️';
        const condName = WMO_COND[weather.code]  ?? 'Weather';
        const hiF      = Math.round(weather.temp_max_f);
        cards.push(`
          <div class="hub-wx-card">
            <span class="hub-wx-ico">${emoji}</span>
            <div class="hub-wx-text">
              <span class="hub-wx-val">${hiF}°F</span>
              <span class="hub-wx-lbl">${condName}</span>
            </div>
          </div>`);
      }

      // Card 2 — AQI
      const aqiCat = weather.aqi_category ?? null;
      const aqiNum = weather.aqi_us       ?? null;
      if (aqiCat || aqiNum != null) {
        // Determine AQI circle emoji based on numeric value
        let aqiEmoji = '—';
        let aqiColor = '';
        if (aqiNum != null) {
          if (aqiNum <= 50) {
            aqiEmoji = '🟢';
            aqiColor = 'hub-wx-val--green';
          } else if (aqiNum <= 100) {
            aqiEmoji = '🟡';
            aqiColor = 'hub-wx-val--amber';
          } else if (aqiNum <= 150) {
            aqiEmoji = '🟠';
            aqiColor = 'hub-wx-val--amber';
          } else if (aqiNum <= 200) {
            aqiEmoji = '🔴';
            aqiColor = 'hub-wx-val--red';
          } else {
            aqiEmoji = '🟣';
            aqiColor = 'hub-wx-val--red';
          }
        }
        // Short display: just the category keyword (Good / Moderate / etc.)
        const aqiShort = aqiCat ? aqiCat.split(/\s/)[0] : `AQI ${aqiNum}`;
        const aqiSub   = aqiNum != null ? `AQI ${aqiNum}` : 'Air Quality';
        cards.push(`
          <div class="hub-wx-card">
            <span class="hub-wx-ico">${aqiEmoji}</span>
            <div class="hub-wx-text">
              <span class="hub-wx-val ${aqiColor}">${aqiShort}</span>
              <span class="hub-wx-lbl">${aqiSub}</span>
            </div>
          </div>`);
      }

      // Card 3 — Pollen
      const pollenMax = Math.max(
        weather.pollen_tree  ?? 0,
        weather.pollen_grass ?? 0,
        weather.pollen_weed  ?? 0
      );
      if (weather.pollen_tree != null || weather.pollen_grass != null) {
        const pollenShort = POLLEN_SHORT[pollenMax] ?? '—';
        const pollenColor = pollenMax <= 2 ? 'hub-wx-val--green' :
                            pollenMax <= 3 ? 'hub-wx-val--amber' : 'hub-wx-val--red';
        cards.push(`
          <div class="hub-wx-card">
            <span class="hub-wx-ico">🌿</span>
            <div class="hub-wx-text">
              <span class="hub-wx-val ${pollenColor}">${pollenShort}</span>
              <span class="hub-wx-lbl">Pollen</span>
            </div>
          </div>`);
      }

      if (cards.length) wxHTML = `<div class="hub-wx-cards">${cards.join('')}</div>`;
    }

    // ── Calendar icon SVG ─────────────────────────────────────────
    const calSVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="16" y1="2" x2="16" y2="6"></line>
      <line x1="8" y1="2" x2="8" y2="6"></line>
      <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>`;

    // ── Render ────────────────────────────────────────────────────
    el.innerHTML = `
      <div class="hub-date-row">
        <div class="hub-greeting-left">
          <div class="hub-greeting-date">${dayName}, ${monthDay}</div>
          <div class="hub-greeting-msg">Good ${period}, ${initial}.</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
          <button class="hub-cal-btn" type="button" aria-label="Pick date">${calSVG}</button>
          <div class="hub-avatar" role="button" tabindex="0" aria-label="Settings">${initial}</div>
        </div>
      </div>
      ${wxHTML}`;

    // Avatar → Settings
    el.querySelector('.hub-avatar')?.addEventListener('click', () => {
      if (typeof App !== 'undefined') App.switchTab('settings');
    });

    // Calendar button → shows date menu (Today + Pick date)
    el.querySelector('.hub-cal-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      _showDateMenu(e.currentTarget);
    });

    // Swipe navigation is handled app-wide by initSwipe() in app.js
  }

  /** Renders the 2×2 tile grid into #hub-home. */
  function renderHome() {
    const home = document.getElementById('hub-home');
    if (!home) return;
    home.innerHTML = '';

    // Render header first (uses cached initial if available)
    renderHeader();

    // Async: if initial not yet loaded, fetch it and re-render header once available
    if (!localStorage.getItem(_LS_INITIAL_KEY)) {
      _loadUserInitial().then(() => {
        if (localStorage.getItem(_LS_INITIAL_KEY)) renderHeader();
      });
    }

    // Reminder banner (above grid, inside hub-container)
    const container = document.getElementById('hub-container');
    const existingBanner = container.querySelector('.hub-reminder');
    if (existingBanner) existingBanner.remove();

    const pending = getNextPendingItem();
    if (pending) {
      const banner = document.createElement('div');
      banner.className = 'hub-reminder';
      const isLoggable = pending.type === 'slot' || pending.type === 'reminder';
      banner.innerHTML = `
        <div class="hub-reminder__dot"></div>
        <div class="hub-reminder__text">${pending.text}</div>
        ${isLoggable ? `<button class="hub-reminder__check" aria-label="Mark done" type="button">✓</button>` : ''}`;

      // Tap text → navigate to Medications (or Routine for habits)
      banner.querySelector('.hub-reminder__text')?.addEventListener('click', () => {
        if (pending.type === 'habits') {
          openSection('section-habits');
        } else {
          openSection('section-meds');
        }
      });
      banner.querySelector('.hub-reminder__dot')?.addEventListener('click', () => {
        if (pending.type === 'habits') {
          openSection('section-habits');
        } else {
          openSection('section-meds');
        }
      });

      // Tap ✓ → log immediately, re-render hub
      if (isLoggable) {
        banner.querySelector('.hub-reminder__check')?.addEventListener('click', e => {
          e.stopPropagation();
          if (pending.type === 'slot') {
            Medications.logSlot(pending.slot);
          } else if (pending.type === 'reminder') {
            Medications.logReminder(pending.medId);
          }
          renderHome();   // advance to next pending item (or hide banner)
        });
      }

      container.insertBefore(banner, home);
    }

    // Tiles: top-left, top-right, bottom-left, bottom-right
    home.appendChild(buildRoutineTile());
    home.appendChild(buildWellbeingTile());
    home.appendChild(buildHealthTile());
    home.appendChild(buildReflectionsTile());
  }

  // ── Navigation ────────────────────────────────────────────────────

  let _activeBucketKey = null;   // which bucket is currently open in accordion view

  /**
   * Returns the bucketKey that contains sectionId, or null.
   */
  function _bucketForSection(sectionId) {
    for (const [key, b] of Object.entries(BUCKETS)) {
      if (b.sections.includes(sectionId)) return key;
    }
    return null;
  }

  /**
   * DOM cleanup: removes back bar, stats bar, un-hides all sections,
   * resets CSS order, clears state. Safe to call even when no bucket is open.
   */
  function _cleanupBucketView() {
    const accEl = document.getElementById('accordion-wrapper');
    if (accEl) {
      accEl.querySelector('.hub-bucket-backbar')?.remove();
      accEl.querySelector('.hub-bucket-statsbar')?.remove();
      accEl.querySelector('.hub-tx-row')?.remove();
      accEl.querySelectorAll('.hub-bucket-hidden').forEach(el => el.classList.remove('hub-bucket-hidden'));
      // Reset CSS order so sections return to their natural DOM order
      accEl.querySelectorAll('.tracker-section').forEach(el => el.style.removeProperty('order'));
    }
    _activeBucketKey = null;
  }

  /**
   * Shows the bucket as an accordion view.
   * Hides hub-container, shows accordion-wrapper filtered to this bucket's sections.
   * Sections are expanded so the user sees content immediately.
   */
  function showBucket(bucketKey) {
    const bucket = BUCKETS[bucketKey];
    if (!bucket) return;

    _activeBucketKey = bucketKey;

    // Push history so swipe-back triggers switchTab('today') → applyLayout() → cleanup
    history.pushState({ ht: 'hub-bucket', bucket: bucketKey }, '');

    const hubEl = document.getElementById('hub-container');
    const accEl = document.getElementById('accordion-wrapper');
    if (!hubEl || !accEl) return;

    hubEl.hidden = true;
    accEl.hidden = false;

    // Build ordered list of section IDs (exclude tab-* IDs)
    const orderedSectionIds = bucket.sections.filter(id => id.startsWith('section-'));
    const sectionIdSet      = new Set(orderedSectionIds);

    // Hide sections not in bucket; show + expand sections in bucket
    accEl.querySelectorAll('.tracker-section').forEach(sec => {
      if (sectionIdSet.has(sec.id)) {
        sec.classList.remove('hub-bucket-hidden', 'tracker-section--collapsed');
      } else {
        sec.classList.add('hub-bucket-hidden');
      }
    });

    // Apply CSS flex order so sections appear in BUCKETS array order
    // regardless of their DOM position (start from 10 so back bar / stats
    // bar at default order 0 always appear first).
    orderedSectionIds.forEach((id, idx) => {
      const el = document.getElementById(id);
      if (el) el.style.order = String(idx + 10);
    });

    // Inject prominent back bar at top of accordion-wrapper
    const backBar = document.createElement('div');
    backBar.className = 'hub-bucket-backbar';
    backBar.innerHTML = `
      <button class="hub-bucket-back-btn" type="button">
        <span class="hub-bucket-back-chevron">&#8249;</span>
        <span class="hub-bucket-back-lbl">Today</span>
      </button>
      <span class="hub-bucket-title">${bucket.label}</span>`;
    backBar.querySelector('.hub-bucket-back-btn').addEventListener('click', closeBucket);
    accEl.insertBefore(backBar, accEl.firstChild);

    // For the Health bucket, show a sleep/steps/calories stats summary
    // at the top so the user can see those figures without drilling deeper.
    if (bucketKey === 'health') {
      const stats = getTodayStats();
      const statsBar = document.createElement('div');
      statsBar.className = 'hub-bucket-statsbar';
      statsBar.innerHTML = stats.map(s => `
        <div class="hub-bucket-stat">
          <span class="hub-bucket-stat__ico">${s.ico}</span>
          <span class="hub-bucket-stat__val">${s.val ?? '—'}</span>
          <span class="hub-bucket-stat__lbl">${s.lbl}</span>
        </div>`).join('');
      backBar.insertAdjacentElement('afterend', statsBar);
    }

    // Render Treatments and add a nav row if this bucket includes tab-treatments
    if (bucket.sections.includes('tab-treatments')) {
      if (typeof Treatments !== 'undefined') Treatments.render();
      const txRow = document.createElement('div');
      txRow.className = 'hub-tx-row hub-section-row';
      txRow.style.order = '99'; // always last in the flex column
      txRow.innerHTML = `
        <span class="hub-section-row__name">Treatments</span>
        <span class="hub-section-row__arrow">&#8250;</span>`;
      txRow.addEventListener('click', () => App.switchTab('treatments'));
      accEl.appendChild(txRow);
    }

    // Scroll to top of accordion view
    accEl.scrollTop = 0;
  }

  /**
   * Closes the bucket accordion view and returns to hub home.
   * Also goes back in history to keep the stack consistent.
   */
  function closeBucket() {
    _cleanupBucketView();

    const hubEl = document.getElementById('hub-container');
    const accEl = document.getElementById('accordion-wrapper');
    if (hubEl) hubEl.hidden = false;
    if (accEl) accEl.hidden = true;
    renderHome();

    // Pop the history state we pushed in showBucket()
    history.back();
  }

  /**
   * Opens the accordion bucket view for the bucket containing sectionId,
   * then scrolls to and expands that specific section.
   */
  function openSection(sectionId) {
    const bucketKey = _bucketForSection(sectionId);
    if (!bucketKey) return;

    showBucket(bucketKey);

    // Scroll to the specific section after DOM settles
    const el = document.getElementById(sectionId);
    if (el) {
      el.classList.remove('tracker-section--collapsed');
      requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }

  // ── Public interface ──────────────────────────────────────────────

  /**
   * Shows/hides hub vs accordion based on current layout setting.
   * Call this whenever the layout setting changes or Today tab is shown.
   */
  /**
   * Removes the hub-hidden class from app chrome elements.
   * Called when navigating away from the Today tab so the standard
   * header and date bar are visible on other tabs.
   */
  function restoreChrome() {
    document.querySelector('.app-header')?.classList.remove('hub-hidden');
    document.querySelector('.app-date-bar')?.classList.remove('hub-hidden');
    document.getElementById('conditions-bar')?.classList.remove('hub-hidden');
  }

  function applyLayout() {
    const layout   = Data.getSettings().today_layout ?? 'accordion';
    const hubEl    = document.getElementById('hub-container');
    const accEl    = document.getElementById('accordion-wrapper');
    if (!hubEl || !accEl) return;

    // Always close any open bucket view first (back-swipe, date change, layout toggle, etc.)
    _cleanupBucketView();

    if (layout === 'hub') {
      hubEl.hidden = false;
      accEl.hidden = true;
      // Hub header takes over the full top — hide native chrome
      document.querySelector('.app-header')?.classList.add('hub-hidden');
      document.querySelector('.app-date-bar')?.classList.add('hub-hidden');
      document.getElementById('conditions-bar')?.classList.add('hub-hidden');
      renderHome();
    } else {
      hubEl.hidden = true;
      accEl.hidden = false;
      restoreChrome();
    }
  }

  /**
   * Full hub render: apply layout and refresh tile content.
   * Called by App.switchTab('today') and after date changes.
   */
  function render() {
    applyLayout();
  }

  return { render, applyLayout, openSection, closeBucket, restoreChrome };

})();
