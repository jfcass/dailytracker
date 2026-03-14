# Hub Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Hub View" layout for the Today tab — a 2×2 tile grid with four buckets (Routine, Wellbeing, Health, Reflections) that replaces the accordion stack, selectable in Settings.

**Architecture:** A new `js/hub.js` module renders the hub home screen and manages bucket/section panel navigation using CSS transforms for slide transitions. Existing section modules (habits.js, mood.js, etc.) are untouched — when a section is opened from the hub, it receives an `.hub-section-active` CSS class that overlays it full-screen. The layout choice (`today_layout: 'accordion' | 'hub'`) is stored in Drive JSON settings.

**Tech Stack:** Vanilla JS (IIFE module pattern), CSS custom properties, Google Fonts (Outfit), pointer events for swipe detection. No new dependencies.

---

## Key Facts (read before starting)

- **Date helper:** `Data.today()` → `'YYYY-MM-DD'`; `Data.getDay(dateStr)` → today's mutable day object
- **Settings:** `Data.getSettings()` → live settings object; mutate then call `scheduleSave()`
- **Module pattern:** every JS file is an IIFE: `const Hub = (() => { ... return { ... }; })();`
- **Section elements:** `<section id="section-habits" class="tracker-section">` — modules find them by ID
- **Tab switching:** `App.switchTab(name)` shows `.tab-view` by `id="tab-${name}"`, calls `.render()` for named tabs
- **Treatments nav:** `if (name === 'treatments') Treatments.render();` in switchTab — keep Treatments module intact, just remove the nav button
- **Data for hub:** `days[date].gratitudes` (array), `.note` (string), `.sleep.hours`, `.steps`, `.calories`, `.mood.mood`, `.mood.energy`
- **Streak calc:** iterate `Object.keys(Data.getData().days).sort().reverse()`, check field per day, break on first miss
- **scheduleSave:** imported globally from data.js — just call `scheduleSave()` after mutating settings

---

## Task 1: Add `today_layout` to schema + Settings toggle

**Files:**
- Modify: `js/data.js` — add field to SCHEMA_DEFAULTS.settings
- Modify: `js/settings.js` — add layout toggle row in buildAccountCard()

### Step 1: Add `today_layout` to SCHEMA_DEFAULTS

In `js/data.js`, find `today_accordion: false,` and add the new field directly after it:

```js
    today_accordion: false,
    today_layout:    'accordion',   // 'accordion' | 'hub'
```

### Step 2: Add layout toggle row to buildAccountCard()

In `js/settings.js`, find `buildAccountCard()`. Locate the block that builds the `accordionRow` (the "Accordion sections" On/Off toggle). Add the layout toggle row **before** it — this puts Layout first, Accordion second:

```js
  // ── Layout row ──────────────────────────────────────────────
  const layoutRow = document.createElement('div');
  layoutRow.className = 'stg-action-row';
  const currentLayout = Data.getSettings().today_layout ?? 'accordion';
  layoutRow.innerHTML = `
    <div class="stg-action-info">
      <div class="stg-action-title">Today layout</div>
      <div class="stg-action-desc">How sections appear on the Today tab</div>
    </div>
    <div class="stg-toggle-group" role="group" aria-label="Today layout">
      <button class="stg-toggle-btn${currentLayout === 'accordion' ? ' stg-toggle-btn--active' : ''}"
              data-value="accordion" type="button">Stack</button>
      <button class="stg-toggle-btn${currentLayout === 'hub' ? ' stg-toggle-btn--active' : ''}"
              data-value="hub" type="button">Hub</button>
    </div>
  `;
  layoutRow.querySelectorAll('.stg-toggle-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      Data.getSettings().today_layout = btn.dataset.value;
      render();
      scheduleSave();
      // Re-render the Today tab immediately if it's visible
      if (typeof Hub !== 'undefined') Hub.applyLayout();
    })
  );
  body.appendChild(layoutRow);
  // ── (existing accordion row follows) ──────────────────────
```

### Step 3: Verify manually

Open Settings → Account. Expand the card. Confirm "Today layout" row appears with Stack / Hub buttons. Tap Hub → tap back to Stack. Confirm the setting persists after a page reload (check Drive sync or localStorage).

### Step 4: Commit

```bash
git add js/data.js js/settings.js
git commit -m "feat: add today_layout setting (accordion|hub)"
```

---

## Task 2: Remove Treatments from bottom nav

**Files:**
- Modify: `index.html` — remove Treatments nav button
- Modify: `js/app.js` — guard the Treatments.render() call

> **Note:** The `#tab-treatments` div and `Treatments` module stay intact. The content is still accessible via Today → Health → Treatments in the hub. We're only removing the bottom nav entry point.

### Step 1: Remove Treatments nav button

In `index.html`, find the bottom-nav section. Delete the entire `<button>` block for Treatments:

```html
<!-- DELETE THIS ENTIRE BUTTON -->
<button class="bottom-nav-btn" data-tab="treatments"
        type="button" onclick="App.switchTab('treatments')">
  ...icon SVG...
  Treatments
</button>
```

### Step 2: Guard Treatments.render() in app.js

In `js/app.js`, find `if (name === 'treatments') Treatments.render();` and remove that line. The Treatments module will be called directly by the hub when the user navigates into it. Also check for any other references to `'treatments'` in switchTab and remove/update them.

### Step 3: Verify manually

Reload app. Bottom nav should show 4 buttons: Today, Library, Reports, Health Log. No Treatments button. App should not throw errors.

### Step 4: Commit

```bash
git add index.html js/app.js
git commit -m "feat: remove Treatments from bottom nav (moved into Health bucket)"
```

---

## Task 3: Hub CSS + Outfit font

**Files:**
- Modify: `index.html` — add Outfit Google Font link
- Modify: `css/styles.css` — add all hub-specific styles at the end of the file

### Step 1: Add Outfit font to index.html

In `index.html`, find the existing Google Fonts `<link>` for Figtree. Add Outfit alongside it:

```html
<link href="https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,300..900;1,300..900&family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
```

(Combine into one Google Fonts URL to avoid an extra network request.)

### Step 2: Add hub CSS to styles.css

Append the following block to the **end** of `css/styles.css`. All hub classes are prefixed `hub-` to avoid collisions:

```css
/* ═══════════════════════════════════════════════════════
   HUB LAYOUT
   2×2 bucket tile grid for the Today tab.
   Font: Outfit (loaded alongside Figtree).
   Complementary palette: sage green + warm amber.
   ═══════════════════════════════════════════════════════ */

/* ── Hub tokens (extend existing custom-property set) ── */
:root {
  --hub-green:      #5eb88a;
  --hub-green-dim:  rgba(94,184,138,0.13);
  --hub-green-bd:   rgba(94,184,138,0.28);
  --hub-amber:      #d4965a;
  --hub-amber-dim:  rgba(212,150,90,0.12);
  --hub-amber-bd:   rgba(212,150,90,0.26);
  --hub-font:       'Outfit', sans-serif;
  --hub-radius:     22px;
  --hub-tile-min-h: 186px;
  --hub-btn-h:      48px;
  --hub-slide-dur:  0.24s;
}

/* ── Outer wrapper ── */
#hub-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  position: relative;
  overflow: hidden;
  font-family: var(--hub-font);
}

/* ── Hub home (tile grid) ── */
#hub-home {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 6px 14px 14px;
  overflow-y: auto;
  flex: 1;
}

/* ── Reminder banner ── */
.hub-reminder {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 6px 14px 0;
  padding: 9px 13px;
  background: var(--hub-amber-dim);
  border: 1px solid var(--hub-amber-bd);
  border-left: 3px solid var(--hub-amber);
  border-radius: 12px;
  font-family: var(--hub-font);
}

.hub-reminder__dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--hub-amber);
  flex-shrink: 0;
  animation: hub-blink 2.4s ease-in-out infinite;
}

@keyframes hub-blink {
  0%,100% { opacity:1; transform:scale(1); }
  50%     { opacity:.4; transform:scale(.75); }
}

.hub-reminder__text {
  font-size: 12px; font-weight: 500;
  color: var(--hub-amber);
  line-height: 1.4;
}

/* ── Tile card ── */
.hub-tile {
  background: var(--clr-surface);
  border: 1px solid var(--clr-border);
  border-radius: var(--hub-radius);
  overflow: hidden;
  min-height: var(--hub-tile-min-h);
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: transform 0.13s;
  font-family: var(--hub-font);
  -webkit-tap-highlight-color: transparent;
}

.hub-tile:active { transform: scale(0.965); }

.hub-tile__bar {
  height: 3px; flex-shrink: 0;
  background: linear-gradient(90deg, var(--hub-green) 0%, #82d4a8 50%, var(--hub-green) 100%);
}

.hub-tile__inner {
  padding: 11px 13px 13px;
  display: flex; flex-direction: column;
  flex: 1; gap: 7px;
}

/* ── Tile header (name) ── */
.hub-tile__name {
  font-size: 14px; font-weight: 800;
  letter-spacing: -0.2px;
  color: var(--clr-text);
  line-height: 1;
  font-family: var(--hub-font);
}

/* ── Carousel (Routine streaks + Health stats) ── */
.hub-carousel {
  flex: 1;
  position: relative;
  overflow: hidden;
  min-height: 60px;
}

.hub-carousel__slide {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  justify-content: center;
  transition: opacity 0.38s ease, transform 0.38s ease;
}

.hub-carousel__slide.is-gone {
  opacity: 0;
  transform: translateY(7px);
  pointer-events: none;
}

/* streak content */
.hub-c-lbl  { font-size: 11.5px; font-weight: 500; color: var(--clr-text-2); margin-bottom: 1px; }
.hub-c-row  { display: flex; align-items: baseline; gap: 4px; }
.hub-c-num  { font-size: 32px; font-weight: 800; letter-spacing: -1.5px; color: var(--hub-amber); line-height: 1; }
.hub-c-unit { font-size: 11px; color: var(--clr-text-2); font-weight: 400; opacity: 0.6; }
.hub-c-fire { font-size: 15px; }
.hub-c-none { font-size: 11.5px; font-weight: 500; color: var(--clr-text-2); opacity: 0.6; line-height: 1.4; }

/* stat content (Health carousel) — same sizes */
.hub-s-ico  { font-size: 15px; line-height: 1; margin-bottom: 1px; }
.hub-s-val  { font-size: 32px; font-weight: 800; letter-spacing: -1.5px; color: var(--hub-amber); line-height: 1; }
.hub-s-lbl  { font-size: 11px; color: var(--clr-text-2); font-weight: 400; opacity: 0.6; margin-top: 1px; }

/* ── Carousel dots ── */
.hub-dots {
  display: flex; gap: 5px;
  margin-top: 2px;
}

.hub-dot {
  width: 4px; height: 4px;
  border-radius: 50%;
  background: var(--clr-border);
  transition: background 0.3s, transform 0.3s;
  cursor: pointer;
}

.hub-dot.is-on {
  background: var(--hub-amber);
  transform: scale(1.35);
}

/* ── Wellbeing rating display ── */
.hub-rating {
  flex: 1;
  display: flex; flex-direction: column;
  justify-content: center; gap: 1px;
}

.hub-rating__lbl  { font-size: 11.5px; font-weight: 500; color: var(--clr-text-2); margin-bottom: 1px; }
.hub-rating__val  { display: flex; align-items: baseline; gap: 5px; }
.hub-rating__em   { font-size: 20px; line-height: 1; }
.hub-rating__word { font-size: 28px; font-weight: 800; color: var(--hub-green); letter-spacing: -1px; line-height: 1; }
.hub-rating__sub  { font-size: 11px; color: var(--clr-text-2); font-weight: 400; opacity: 0.6; margin-top: 1px; }

/* ── Reflections streak ── */
.hub-streak {
  flex: 1;
  display: flex; align-items: center; gap: 6px;
}

.hub-streak__num  { font-size: 32px; font-weight: 800; letter-spacing: -1.5px; color: var(--hub-amber); line-height: 1; }
.hub-streak__fire { font-size: 17px; }
.hub-streak__lbl  { font-size: 11px; color: var(--clr-text-2); font-weight: 400; opacity: 0.6; line-height: 1.35; }

/* ── Log buttons — both types share same height ── */
.hub-log-simple,
.hub-log-swipe {
  height: var(--hub-btn-h);
  flex-shrink: 0;
  background: var(--hub-green-dim);
  border: 1px solid var(--hub-green-bd);
  border-radius: 11px;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s;
  font-family: var(--hub-font);
}

/* Simple log (Routine, Wellbeing) */
.hub-log-simple {
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.hub-log-simple:active { background: rgba(94,184,138,0.24); }

.hub-log-simple__lbl {
  font-size: 13px; font-weight: 600;
  color: var(--hub-green); line-height: 1;
}

/* Swipeable log (Health, Reflections) */
.hub-log-swipe {
  display: flex; align-items: center;
  padding: 0 4px;
  cursor: pointer;
  user-select: none;
  touch-action: pan-y;
  position: relative;
}
.hub-log-swipe:active { background: rgba(94,184,138,0.22); }

.hub-chev {
  font-size: 13px; font-weight: 800;
  color: rgba(94,184,138,0.48);
  min-width: 32px; height: 100%;
  display: flex; align-items: center; justify-content: center;
  border-radius: 8px;
  flex-shrink: 0;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}
.hub-chev:hover { color: var(--hub-green); background: var(--hub-green-dim); }

.hub-log-track {
  flex: 1;
  overflow: hidden;
  position: relative;
  height: 100%;
  display: flex; align-items: center;
}

.hub-log-lbl {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 12.5px; font-weight: 600;
  color: var(--hub-green);
  text-align: center; line-height: 1.25;
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.hub-log-lbl.is-out-l  { opacity:0; transform:translateX(-14px); }
.hub-log-lbl.is-out-r  { opacity:0; transform:translateX( 14px); }
.hub-log-lbl.is-in     { opacity:0; transform:translateY(  5px); }

/* ── Bucket panel (slides in from right over hub-home) ── */
#hub-bucket-panel {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: var(--clr-bg);
  transform: translateX(100%);
  transition: transform var(--hub-slide-dur) ease;
  overflow-y: auto;
  z-index: 10;
  font-family: var(--hub-font);
}

#hub-bucket-panel.is-open {
  transform: translateX(0);
}

.hub-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--clr-border);
  position: sticky;
  top: 0;
  background: var(--clr-bg);
  z-index: 1;
}

.hub-back-btn {
  font-family: var(--hub-font);
  font-size: 14px; font-weight: 600;
  color: var(--hub-green);
  background: none; border: none;
  cursor: pointer; padding: 4px 0;
  display: flex; align-items: center; gap: 4px;
}

.hub-panel-title {
  font-family: var(--hub-font);
  font-size: 16px; font-weight: 800;
  color: var(--clr-text);
  letter-spacing: -0.3px;
}

/* Section rows inside bucket panel */
.hub-section-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--clr-border);
  cursor: pointer;
  transition: background 0.12s;
}
.hub-section-row:active { background: var(--clr-surface-2); }

.hub-section-row__name {
  font-family: var(--hub-font);
  font-size: 15px; font-weight: 600;
  color: var(--clr-text);
}

.hub-section-row__status {
  font-size: 12px; font-weight: 500;
  color: var(--clr-text-2);
  margin-left: auto;
  margin-right: 8px;
}

.hub-section-row__arrow {
  font-size: 14px;
  color: var(--clr-text-2);
  opacity: 0.5;
}

/* ── Section overlay (full-screen from hub) ── */
.tracker-section.hub-section-active {
  position: fixed !important;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 200;
  overflow-y: auto;
  border-radius: 0 !important;
  border: none !important;
  background: var(--clr-bg);
  padding-bottom: env(safe-area-inset-bottom, 0);
}

/* Back button injected at top of active section */
.hub-section-back {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 16px 8px;
  font-family: var(--hub-font);
  font-size: 14px; font-weight: 600;
  color: var(--hub-green);
  cursor: pointer;
  border-bottom: 1px solid var(--clr-border);
  background: var(--clr-bg);
  position: sticky;
  top: 0; z-index: 1;
}
```

### Step 3: Verify visually

Open the app. The CSS should not break any existing UI (all new classes are prefixed `hub-`). You can temporarily add `class="hub-tile"` to an element in DevTools to confirm the tile styles render.

### Step 4: Commit

```bash
git add index.html css/styles.css
git commit -m "feat: add hub layout CSS + Outfit font"
```

---

## Task 4: Hub HTML skeleton in index.html

**Files:**
- Modify: `index.html` — wrap accordion sections, add hub container

> **Important:** We're adding two wrappers inside `#tab-today`:
> 1. `#hub-container` — the new hub UI (hidden by default)
> 2. `#accordion-wrapper` — wraps all existing `.tracker-section` elements
>
> The section IDs (`section-habits`, `section-mood`, etc.) do not change, so all existing module code continues to work.

### Step 1: Add hub container right after the date bar

In `index.html`, find the `<div class="app-date-bar">` block inside `#tab-today`. Directly **after** the closing `</div>` of the date bar, insert:

```html
<!-- ── HUB LAYOUT (shown when today_layout === 'hub') ── -->
<div id="hub-container" hidden>
  <div id="hub-home"><!-- populated by Hub.renderHome() --></div>
  <div id="hub-bucket-panel"><!-- populated by Hub.showBucket() --></div>
</div>
```

### Step 2: Wrap the accordion sections

Find the first `<section id="section-habits"` tag inside `#tab-today` (right after the conditions bar and date bar). Wrap ALL `.tracker-section` elements in a single div:

```html
<!-- ── ACCORDION LAYOUT (shown when today_layout === 'accordion') ── -->
<div id="accordion-wrapper">
  <section id="section-habits" ...>...</section>
  <section id="section-moderation" ...>...</section>
  <section id="section-mood" ...>...</section>
  <section id="section-bowel" ...>...</section>
  <section id="section-symptoms" ...>...</section>
  <section id="section-meds" ...>...</section>
  <section id="section-gratitudes" ...>...</section>
  <section id="section-note" ...>...</section>
</div>
```

(All existing section HTML is unchanged — just wrapped.)

### Step 3: Verify DOM structure

In DevTools, confirm `#hub-container` is inside `#tab-today`, followed by `#accordion-wrapper` containing all tracker sections. Reload app — all sections should work normally (accordion wrapper is transparent to existing code).

### Step 4: Commit

```bash
git add index.html
git commit -m "feat: add hub HTML skeleton + accordion wrapper in index.html"
```

---

## Task 5: js/hub.js — Data helpers

**Files:**
- Create: `js/hub.js`

This task creates the module skeleton and all data-fetching helpers. No UI yet.

### Step 1: Create js/hub.js with module shell and data helpers

```js
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

  /** Count consecutive days going back from today where predicate returns true. */
  function countStreak(predicate) {
    const allDays = Data.getData().days;
    const sorted  = Object.keys(allDays).sort().reverse(); // newest first
    const todayStr = Data.today();
    let streak = 0;
    for (const d of sorted) {
      if (d > todayStr) continue;           // skip future dates
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

  /** Today's wellbeing summary for the Wellbeing tile. */
  function getTodayWellbeing() {
    const day = Data.getDay(Data.today());
    return {
      mood:   day?.mood?.mood   ?? null,   // 1–5
      energy: day?.mood?.energy ?? null,   // 1–5
      sleep:  day?.sleep?.hours ?? null,   // number
    };
  }

  /** Today's health stats for the Health carousel. */
  function getTodayStats() {
    const day = Data.getDay(Data.today());
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

  // ── (Tile rendering and navigation in next tasks) ─────────────────

  // Public API (to be expanded in Tasks 6 & 7)
  return {
    applyLayout,   // defined in Task 7
    render,        // defined in Task 7
  };

})();
```

> **Note:** `applyLayout` and `render` are referenced in the `return` but not yet defined — that's intentional. They'll be added in Tasks 6 and 7. This file won't be loaded in index.html until Task 7.

### Step 2: Commit

```bash
git add js/hub.js
git commit -m "feat: hub.js skeleton with data helpers (streaks, stats, reminders)"
```

---

## Task 6: js/hub.js — Tile rendering, carousel, swipe button

**Files:**
- Modify: `js/hub.js` — add tile builders, carousel, swipe button, renderHome()

Add all the following functions **inside the Hub IIFE**, before the `return` statement.

### Step 1: Generic carousel builder

```js
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
```

### Step 2: Swipeable log button builder

```js
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
```

### Step 3: Individual tile builders

```js
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
          ${wb.energy ? `Energy · ${energyLabel(wb.energy)}` : ''}
          ${wb.sleep  ? ` &nbsp;·&nbsp; Sleep ${wb.sleep}h` : ''}
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
      <div class="hub-chev" role="button" aria-label="Previous">‹</div>
      <div class="hub-log-track">
        <div class="hub-log-lbl">${initialLabel}</div>
      </div>
      <div class="hub-chev" role="button" aria-label="Next">›</div>`;
    const chevL = btn.querySelector('.hub-chev:first-child');
    const chevR = btn.querySelector('.hub-chev:last-child');
    const lblEl = btn.querySelector('.hub-log-lbl');
    return { btn, chevL, chevR, lblEl };
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
```

### Step 4: Commit

```bash
git add js/hub.js
git commit -m "feat: hub tile rendering — carousel, swipe button, tile builders"
```

---

## Task 7: js/hub.js — Navigation + app.js wiring + index.html script tag

**Files:**
- Modify: `js/hub.js` — add navigation functions + public `render` and `applyLayout`
- Modify: `js/app.js` — call `Hub.render()` when switching to Today tab
- Modify: `index.html` — add `<script src="js/hub.js">` tag

### Step 1: Add navigation to js/hub.js (inside IIFE, before return)

```js
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

    panel.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'hub-panel-header';
    header.innerHTML = `
      <button class="hub-back-btn" type="button">‹ Today</button>
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
        <span class="hub-section-row__arrow">›</span>`;
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

    // Expand the section if it's collapsed (accordion might have it collapsed)
    el.classList.remove('tracker-section--collapsed');

    // Inject back button at top of section
    const back = document.createElement('div');
    back.className = 'hub-section-back';
    back.innerHTML = `‹ Back`;
    back.addEventListener('click', closeSection);
    el.insertBefore(back, el.firstChild);

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
```

Now update the module's `return` statement to expose the public functions:

```js
  return { render, applyLayout, openSection };
```

### Step 2: Wire into app.js

In `js/app.js`, find the `switchTab()` function. Add a Hub render call for the 'today' tab, alongside the other tab renders:

```js
  // In switchTab(), after the existing if-blocks for reports/library/settings/health-log:
  if (name === 'today' && typeof Hub !== 'undefined') Hub.render();
```

Also, find wherever `App.showMain()` or equivalent initialisation calls the first render of the today tab (likely after PIN verification). Add:

```js
  // After all other init calls in showMain() or equivalent:
  if (typeof Hub !== 'undefined') Hub.render();
```

### Step 3: Add hub.js script tag to index.html

In `index.html`, find the list of `<script src="js/...">` tags. Add hub.js **after** all the section module scripts (habits.js, mood.js, etc.) but **before** app.js (which orchestrates everything):

```html
<script src="js/hub.js"></script>
```

### Step 4: Manual smoke test

1. Reload app, log in
2. Go to Settings → Account → set layout to "Hub"
3. Switch to Today tab — should show 2×2 tile grid
4. Tap "Routine" tile → bucket panel slides in showing Habits + Moderation rows
5. Tap "Habits" row → Habits section overlays full screen with "‹ Back" header
6. Tap back → section returns to background
7. Tap "‹ Today" → bucket panel slides out
8. Tap `‹` chevron on Health Log button → label cycles to next option
9. Set layout back to Accordion → Today tab shows accordion stack normally
10. Confirm layout choice persists after page reload

### Step 5: Commit

```bash
git add js/hub.js js/app.js index.html
git commit -m "feat: hub navigation (bucket panel, section overlay, layout wiring)"
```

---

## Manual Testing Checklist

After all tasks are complete:

- [ ] Hub View and Accordion Stack toggle correctly in Settings → Account
- [ ] Layout choice survives page reload (stored in Drive JSON)
- [ ] All 4 tiles render with correct content
- [ ] Routine carousel rotates every 5s, swipeable, random start
- [ ] Health stats carousel rotates every 4.5s, swipeable, random start
- [ ] Wellbeing tile shows mood/energy/sleep if logged, "Rate your wellbeing" if not
- [ ] Reflections shows gratitude streak number (or "Start your next streak")
- [ ] Swipe threshold (34px) distinguishes tap from swipe reliably on desktop and mobile
- [ ] Chevron `‹ ›` clicks cycle label without triggering navigation
- [ ] Tapping tile body (not log button) opens bucket panel
- [ ] Tapping log button body (not chevron) opens correct section
- [ ] Bucket panel slides in/out with CSS transition
- [ ] Section overlay shows section content with "‹ Back" button
- [ ] Existing accordion functionality is completely unaffected when layout = 'accordion'
- [ ] Treatments nav button is gone from bottom nav
- [ ] App does not throw any JS errors in console
