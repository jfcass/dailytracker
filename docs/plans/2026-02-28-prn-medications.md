# PRN Medications Tracker — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an as-needed medication tracker to the Today tab that shows cooldown status and daily dose counts, with a Settings card for managing the med list.

**Architecture:** New `prn_doses[]` array on each day object stores timestamped dose events (replaces the one-per-day `medications_taken` model). `medications.js` is rebuilt from scratch as a PRN-focused module. Settings gets a new card for add/edit/archive of meds.

**Tech Stack:** Vanilla JS, CSS custom properties, no framework, data persisted to Google Drive via `Data.save()`.

**Design doc:** `docs/plans/2026-02-28-prn-medications-design.md`

---

## Orientation — read before starting

### Key patterns used throughout the codebase

**Section shell (index.html):** Every Today-tab section is a `<section class="tracker-section">` with a `.section-header` (clickable, calls `App.toggleSection(id)`) and a content div populated by JS.

**Module pattern:** Every JS module is an IIFE returning a public API: `const Foo = (() => { ... return { init, render, setDate }; })();`

**Date nav:** `DateNav.getDate()` returns current date string `"YYYY-MM-DD"`. Modules receive date changes via a callback registered in `app.js`.

**Save pattern:** Call `Data.save()` async after mutations; debounce 1200ms. Show status in a `.save-status` div using `data-status` attribute values: `pending | saving | saved | error`.

**Settings cards:** `buildXxxCard()` functions in `settings.js` use `makeCard(headerHtml)` → returns a `.stg-card` div, then append list rows and an add-row. Each list row is `.stg-item-row` with `.stg-item-name`, `.stg-item-meta`, and `.stg-icon-btn` buttons.

**escHtml:** Every module has its own copy of `escHtml(s)` — copy from an existing module verbatim.

### Files to touch
- `js/data.js` — add `prn_doses` to day defaults + medication field defaults
- `js/medications.js` — full rewrite as PRN tracker
- `index.html` — add `#section-prn-meds` shell after `#section-symptoms`
- `js/app.js` — wire `Medications.init()` + date callback
- `js/settings.js` — add `buildPrnMedsCard()` and call it in `render()`
- `css/styles.css` — all new CSS for PRN section

---

## Task 1: Data schema — add `prn_doses` and new medication fields

**Files:**
- Modify: `js/data.js`

### Step 1: Add `prn_doses` to day defaults

In `getDay()`, the object literal currently ends with `note: ''`. Add one field:

```js
// BEFORE (line ~291):
        note:              '',
      };

// AFTER:
        note:              '',
        prn_doses:         [],
      };
```

### Step 2: Ensure medication definition defaults include new fields

`data.medications` is already initialized as `{}` (line 27) — individual med objects are created by `medications.js` so no change needed here. The fields `doses`, `min_interval_hours`, `max_daily_doses` will be written by the new medications.js add-form.

### Step 3: Verify in browser console

Open app → DevTools Console → run:
```js
JSON.stringify(Data.getDay('2099-01-01').prn_doses)
// Expected: "[]"
```

### Step 4: Commit
```bash
git add js/data.js
git commit -m "feat(prn): add prn_doses[] to day schema"
```

---

## Task 2: Section shell in index.html

**Files:**
- Modify: `index.html` — insert after the closing `</section>` of `#section-symptoms` (around line 386)

### Step 1: Add the section shell

Insert this block after `</section>` of `#section-symptoms`:

```html
      <!-- ── Section: As-Needed Medications ─────────────────────────── -->
      <section id="section-prn-meds" class="tracker-section" aria-label="As-Needed Meds">

        <div class="section-header" onclick="App.toggleSection('section-prn-meds')">
          <h2 class="section-title">
            <!-- Pill / capsule icon -->
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                 width="16" height="16" aria-hidden="true">
              <path d="M10.5 20H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2v3"/>
              <circle cx="18" cy="18" r="4"/>
              <path d="M15.27 20.73 20.73 15.27"/>
            </svg>
            As-Needed Meds
            <svg class="section-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                 width="14" height="14" aria-hidden="true">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </h2>
        </div>

        <!-- Dose cards + log form — populated by medications.js -->
        <div id="prn-list"></div>

        <!-- Inline save status -->
        <div id="prn-save-status" class="save-status" aria-live="polite"></div>

      </section>
```

### Step 2: Verify shell renders

Open app → Today tab → confirm "As-Needed Meds" section header appears and is collapsible (even though the body is empty).

### Step 3: Commit
```bash
git add index.html
git commit -m "feat(prn): add As-Needed Meds section shell to Today tab"
```

---

## Task 3: CSS — PRN section styles

**Files:**
- Modify: `css/styles.css` — append at end of file

### Step 1: Add all PRN CSS

Append to the end of `css/styles.css`:

```css
/* ═══════════════════════════════════════════════════════════════════════
   PRN (As-Needed) Medications
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Dose card ─────────────────────────────────────────────────────── */

.prn-card {
  display:         flex;
  align-items:     center;
  gap:             10px;
  padding:         10px 14px;
  border-radius:   8px;
  background:      var(--clr-surface-2);
  margin-bottom:   6px;
  transition:      background 0.2s;
}

.prn-card--cooling {
  background: rgba(255, 160, 0, 0.12);
}

.prn-card__info {
  flex:        1;
  min-width:   0;
}

.prn-card__name {
  font-size:   0.93rem;
  font-weight: 600;
  color:       var(--clr-text);
  white-space: nowrap;
  overflow:    hidden;
  text-overflow: ellipsis;
}

.prn-card__meta {
  font-size:  0.78rem;
  color:      var(--clr-text-2);
  margin-top: 2px;
}

.prn-card__right {
  display:     flex;
  align-items: center;
  gap:         8px;
  flex-shrink: 0;
}

.prn-card__countdown {
  font-size:   0.82rem;
  font-weight: 600;
  color:       #f59e0b;
  white-space: nowrap;
}

.prn-card__count {
  font-size:  0.78rem;
  color:      var(--clr-text-2);
  white-space: nowrap;
}

.prn-card__del {
  background:  none;
  border:      none;
  cursor:      pointer;
  color:       var(--clr-text-2);
  padding:     2px 4px;
  border-radius: 4px;
  line-height: 1;
  opacity:     0.6;
  transition:  opacity 0.15s;
}
.prn-card__del:hover { opacity: 1; color: var(--clr-error); }

/* ── Log form ──────────────────────────────────────────────────────── */

.prn-log-form {
  background:    var(--clr-surface-2);
  border-radius: 10px;
  padding:       12px 14px;
  margin-bottom: 8px;
}

.prn-log-form__row {
  display:     flex;
  align-items: center;
  gap:         8px;
  margin-bottom: 8px;
  flex-wrap:   wrap;
}

.prn-log-form__label {
  font-size:   0.8rem;
  color:       var(--clr-text-2);
  min-width:   36px;
}

.prn-log-form__select {
  flex:            1;
  min-width:       120px;
  background:      var(--clr-surface);
  border:          1px solid var(--clr-border);
  border-radius:   6px;
  color:           var(--clr-text);
  padding:         5px 8px;
  font-size:       0.88rem;
  font-family:     inherit;
}

.prn-dose-chips {
  display:   flex;
  flex-wrap: wrap;
  gap:       6px;
}

.prn-dose-chip {
  padding:       4px 10px;
  border-radius: 20px;
  border:        1.5px solid var(--clr-border);
  background:    var(--clr-surface);
  color:         var(--clr-text-2);
  font-size:     0.82rem;
  cursor:        pointer;
  transition:    border-color 0.15s, color 0.15s, background 0.15s;
}
.prn-dose-chip--active {
  border-color: var(--clr-accent);
  color:        var(--clr-accent);
  background:   var(--clr-accent-dim);
}

.prn-log-form__note {
  width:       100%;
  background:  var(--clr-surface);
  border:      1px solid var(--clr-border);
  border-radius: 6px;
  color:       var(--clr-text);
  padding:     5px 8px;
  font-size:   0.88rem;
  font-family: inherit;
  resize:      none;
  box-sizing:  border-box;
}
.prn-log-form__note:focus { outline: none; border-color: var(--clr-accent); }

.prn-log-form__warning {
  font-size:   0.78rem;
  color:       #f59e0b;
  margin-bottom: 6px;
}

.prn-log-form__actions {
  display:     flex;
  justify-content: flex-end;
  gap:         8px;
}

.prn-log-btn {
  padding:       6px 16px;
  border-radius: 6px;
  border:        none;
  background:    var(--clr-accent);
  color:         #fff;
  font-size:     0.88rem;
  font-weight:   600;
  cursor:        pointer;
  font-family:   inherit;
}
.prn-log-btn:disabled { opacity: 0.4; cursor: default; }

.prn-cancel-btn {
  padding:       6px 12px;
  border-radius: 6px;
  border:        1px solid var(--clr-border);
  background:    transparent;
  color:         var(--clr-text-2);
  font-size:     0.88rem;
  cursor:        pointer;
  font-family:   inherit;
}

/* ── Add dose button ───────────────────────────────────────────────── */

.prn-add-btn {
  display:       flex;
  align-items:   center;
  gap:           6px;
  width:         100%;
  padding:       9px 12px;
  border-radius: 8px;
  border:        1.5px dashed var(--clr-border);
  background:    transparent;
  color:         var(--clr-text-2);
  font-size:     0.88rem;
  cursor:        pointer;
  font-family:   inherit;
  margin-top:    4px;
  transition:    border-color 0.15s, color 0.15s;
}
.prn-add-btn:hover { border-color: var(--clr-accent); color: var(--clr-accent); }

/* ── Settings — PRN med list ───────────────────────────────────────── */

.prn-stg-meta {
  display:   flex;
  flex-wrap: wrap;
  gap:       4px;
  margin-top: 3px;
}

.prn-stg-tag {
  font-size:     0.75rem;
  padding:       2px 7px;
  border-radius: 10px;
  background:    var(--clr-surface-2);
  color:         var(--clr-text-2);
}

/* Add/edit form in settings */
.prn-stg-form {
  background:    var(--clr-surface-2);
  border-radius: 8px;
  padding:       12px;
  margin-top:    8px;
}

.prn-stg-form__field {
  margin-bottom: 10px;
}

.prn-stg-form__label {
  display:     block;
  font-size:   0.78rem;
  color:       var(--clr-text-2);
  margin-bottom: 4px;
}

.prn-stg-form__input {
  width:         100%;
  background:    var(--clr-surface);
  border:        1px solid var(--clr-border);
  border-radius: 6px;
  color:         var(--clr-text);
  padding:       6px 8px;
  font-size:     0.88rem;
  font-family:   inherit;
  box-sizing:    border-box;
}
.prn-stg-form__input:focus { outline: none; border-color: var(--clr-accent); }
.prn-stg-form__input--short { width: 80px; }
.prn-stg-form__input--error { border-color: var(--clr-error); }

/* Dose tag chip input area */
.prn-dose-tags {
  display:       flex;
  flex-wrap:     wrap;
  gap:           6px;
  align-items:   center;
  padding:       6px 8px;
  background:    var(--clr-surface);
  border:        1px solid var(--clr-border);
  border-radius: 6px;
  cursor:        text;
  min-height:    36px;
}
.prn-dose-tags:focus-within { border-color: var(--clr-accent); }

.prn-dose-tag {
  display:       inline-flex;
  align-items:   center;
  gap:           4px;
  padding:       2px 8px;
  border-radius: 12px;
  background:    var(--clr-accent-dim);
  color:         var(--clr-accent);
  font-size:     0.8rem;
}
.prn-dose-tag__del {
  background: none;
  border:     none;
  cursor:     pointer;
  color:      var(--clr-accent);
  padding:    0;
  font-size:  1rem;
  line-height: 1;
  opacity:    0.7;
}
.prn-dose-tag__del:hover { opacity: 1; }

.prn-dose-tag-input {
  border:     none;
  outline:    none;
  background: transparent;
  color:      var(--clr-text);
  font-size:  0.88rem;
  font-family: inherit;
  min-width:  80px;
  flex:       1;
}

.prn-stg-form__row {
  display:     flex;
  gap:         8px;
  align-items: center;
}

.prn-stg-form__unit {
  font-size: 0.82rem;
  color:     var(--clr-text-2);
}

.prn-stg-form__actions {
  display:         flex;
  justify-content: flex-end;
  gap:             8px;
  margin-top:      10px;
}
```

### Step 2: Verify styles load

Open app in browser — no console errors. The styles don't visibly affect anything yet.

### Step 3: Commit
```bash
git add css/styles.css
git commit -m "feat(prn): add PRN medications CSS"
```

---

## Task 4: Rebuild medications.js

**Files:**
- Rewrite: `js/medications.js`

This is the core module. Replace the entire file with the implementation below.

### Step 1: Write the new medications.js

```js
/**
 * medications.js — PRN (As-Needed) Medication Tracker
 *
 * Today tab section: shows dose cards for meds taken in the last 24h,
 * with cooldown countdown and daily dose count.
 *
 * Renders into #prn-list (built by render()).
 * A setInterval (30s) keeps countdowns live.
 *
 * Data written:
 *   Data.getDay(date).prn_doses — array of
 *     { id, medication_id, iso_timestamp, dose, notes }
 *
 * Med definitions:
 *   Data.getData().medications[id] — { id, name, doses[], min_interval_hours,
 *                                       max_daily_doses, as_needed, active, notes }
 */
const Medications = (() => {

  // ── State ──────────────────────────────────────────────────────────────────

  let currentDate = null;
  let showForm    = false;   // is the log-dose form open?
  let fMedId      = '';      // selected med in log form
  let fDose       = '';      // selected dose chip
  let fNote       = '';      // note text
  let tickTimer   = null;

  // ── Public API ─────────────────────────────────────────────────────────────

  function init() {
    currentDate = DateNav.getDate();
    render();
    startTick();
  }

  function setDate(date) {
    currentDate = date;
    showForm    = false;
    fMedId      = '';
    fDose       = '';
    fNote       = '';
    render();
  }

  // ── Tick — refresh countdowns every 30s ────────────────────────────────────

  function startTick() {
    clearInterval(tickTimer);
    tickTimer = setInterval(render, 30_000);
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  function render() {
    const list = document.getElementById('prn-list');
    if (!list) return;

    const activeMeds = getActiveMeds();

    // Collect all prn_doses from today + yesterday that are within 24h
    const now       = Date.now();
    const cutoff    = now - 24 * 60 * 60 * 1000;
    const todayDoses    = (Data.getDay(currentDate).prn_doses ?? []);
    const yesterdayDoses = (Data.getDay(shiftDate(currentDate, -1)).prn_doses ?? []);
    const recentDoses = [...yesterdayDoses, ...todayDoses]
      .filter(d => new Date(d.iso_timestamp).getTime() > cutoff)
      .sort((a, b) => new Date(b.iso_timestamp) - new Date(a.iso_timestamp));

    list.innerHTML = '';

    // Render one card per recent dose (most recent first)
    recentDoses.forEach(dose => {
      const med = activeMeds.find(m => m.id === dose.medication_id)
                  ?? Object.values(Data.getData().medications ?? {}).find(m => m.id === dose.medication_id);
      if (!med) return;
      list.appendChild(makeDoseCard(dose, med, recentDoses));
    });

    // Log form or Add button
    if (showForm) {
      list.appendChild(buildLogForm(activeMeds, recentDoses));
    } else {
      const btn = document.createElement('button');
      btn.className   = 'prn-add-btn';
      btn.type        = 'button';
      btn.innerHTML   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
        width="14" height="14" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/></svg> Log dose`;
      btn.addEventListener('click', openForm);
      list.appendChild(btn);
    }
  }

  // ── Dose card ──────────────────────────────────────────────────────────────

  function makeDoseCard(dose, med, allRecentDoses) {
    const ts        = new Date(dose.iso_timestamp);
    const timeStr   = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isoDate   = dose.iso_timestamp.slice(0, 10);
    const isToday   = isoDate === currentDate;
    const dayLabel  = isToday ? '' : 'yesterday · ';

    // Cooldown remaining for this med (based on most recent dose of this med)
    const lastDose    = allRecentDoses.find(d => d.medication_id === med.id);
    const isThisLast  = lastDose?.id === dose.id;
    const remaining   = isThisLast ? cooldownRemaining(med, allRecentDoses) : 0;
    const cooling     = remaining > 0;

    // Daily dose count (doses in last 24h for this med)
    const dosesIn24h  = allRecentDoses.filter(d => d.medication_id === med.id).length;
    const maxDoses    = med.max_daily_doses ?? null;
    const countLabel  = maxDoses ? `${dosesIn24h} of ${maxDoses}` : null;

    const card = document.createElement('div');
    card.className = 'prn-card' + (cooling ? ' prn-card--cooling' : '');

    card.innerHTML = `
      <div class="prn-card__info">
        <div class="prn-card__name">${escHtml(med.name)} ${escHtml(dose.dose)}</div>
        <div class="prn-card__meta">${dayLabel}${timeStr}${dose.notes ? ' · ' + escHtml(dose.notes) : ''}</div>
      </div>
      <div class="prn-card__right">
        ${cooling && isThisLast
          ? `<span class="prn-card__countdown">⏱ ${fmtMs(remaining)}</span>`
          : ''}
        ${countLabel ? `<span class="prn-card__count">${escHtml(countLabel)}</span>` : ''}
        <button class="prn-card__del" type="button" aria-label="Remove dose">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `;

    card.querySelector('.prn-card__del').addEventListener('click', () => deleteDose(dose));
    return card;
  }

  // ── Log form ───────────────────────────────────────────────────────────────

  function buildLogForm(activeMeds, recentDoses) {
    const wrap = document.createElement('div');
    wrap.className = 'prn-log-form';

    // Pre-select first med if none chosen yet
    if (!fMedId && activeMeds.length > 0) fMedId = activeMeds[0].id;
    const med = activeMeds.find(m => m.id === fMedId);

    // Build med select options
    const medOptions = activeMeds.map(m =>
      `<option value="${escHtml(m.id)}" ${m.id === fMedId ? 'selected' : ''}>${escHtml(m.name)}</option>`
    ).join('');

    // Warnings
    const remaining = med ? cooldownRemaining(med, recentDoses) : 0;
    const dosesIn24h = med ? recentDoses.filter(d => d.medication_id === med.id).length : 0;
    const maxWarning = med?.max_daily_doses && dosesIn24h >= med.max_daily_doses
      ? `<div class="prn-log-form__warning">⚠ Max daily doses reached (${dosesIn24h} of ${med.max_daily_doses})</div>`
      : '';
    const coolWarn = remaining > 0
      ? `<div class="prn-log-form__warning">⏱ Next dose recommended after ${fmtMs(remaining)}</div>`
      : '';

    // Dose chips from med definition
    const doses = med?.doses ?? [];
    const doseChips = doses.map(d =>
      `<button class="prn-dose-chip${d === fDose ? ' prn-dose-chip--active' : ''}"
               type="button" data-dose="${escHtml(d)}">${escHtml(d)}</button>`
    ).join('');

    wrap.innerHTML = `
      <div class="prn-log-form__row">
        <span class="prn-log-form__label">Med</span>
        <select class="prn-log-form__select" id="prn-form-med">${medOptions}</select>
      </div>
      ${doses.length > 0 ? `
      <div class="prn-log-form__row">
        <span class="prn-log-form__label">Dose</span>
        <div class="prn-dose-chips" id="prn-dose-chips">${doseChips}</div>
      </div>` : ''}
      ${coolWarn}${maxWarning}
      <div class="prn-log-form__row">
        <span class="prn-log-form__label">Note</span>
        <input class="prn-log-form__note" type="text" id="prn-form-note"
               value="${escHtml(fNote)}" placeholder="Optional" maxlength="200">
      </div>
      <div class="prn-log-form__actions">
        <button class="prn-cancel-btn" type="button">Cancel</button>
        <button class="prn-log-btn" type="button" id="prn-log-submit">Log</button>
      </div>
    `;

    wrap.querySelector('#prn-form-med').addEventListener('change', e => {
      fMedId = e.target.value;
      fDose  = '';
      render();
    });

    wrap.querySelectorAll('.prn-dose-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        fDose = btn.dataset.dose === fDose ? '' : btn.dataset.dose;
        render();
      });
    });

    wrap.querySelector('#prn-form-note').addEventListener('input', e => {
      fNote = e.target.value;
    });

    wrap.querySelector('.prn-cancel-btn').addEventListener('click', () => {
      showForm = false;
      render();
    });

    wrap.querySelector('#prn-log-submit').addEventListener('click', submitLog);

    return wrap;
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  function openForm() {
    showForm = true;
    fDose    = '';
    fNote    = '';
    render();
  }

  function submitLog() {
    if (!fMedId) return;

    const now = new Date();
    // Pad iso_timestamp to local time (no UTC conversion)
    const iso = now.getFullYear()
      + '-' + String(now.getMonth() + 1).padStart(2, '0')
      + '-' + String(now.getDate()).padStart(2, '0')
      + 'T' + String(now.getHours()).padStart(2, '0')
      + ':' + String(now.getMinutes()).padStart(2, '0')
      + ':' + String(now.getSeconds()).padStart(2, '0');

    const dose = {
      id:             crypto.randomUUID(),
      medication_id:  fMedId,
      iso_timestamp:  iso,
      dose:           fDose,
      notes:          fNote.trim(),
    };

    const day = Data.getDay(currentDate);
    if (!Array.isArray(day.prn_doses)) day.prn_doses = [];
    day.prn_doses.push(dose);

    showForm = false;
    fDose    = '';
    fNote    = '';
    render();
    scheduleSave();
  }

  function deleteDose(dose) {
    // Find which day this dose belongs to
    const today = Data.getDay(currentDate);
    const yest  = Data.getDay(shiftDate(currentDate, -1));

    [today, yest].forEach(day => {
      if (!Array.isArray(day.prn_doses)) return;
      day.prn_doses = day.prn_doses.filter(d => d.id !== dose.id);
    });

    render();
    scheduleSave();
  }

  // ── Cooldown helpers ───────────────────────────────────────────────────────

  /** Returns ms remaining in cooldown for a med (0 = ready). */
  function cooldownRemaining(med, recentDoses) {
    if (!med.min_interval_hours) return 0;
    const last = recentDoses.find(d => d.medication_id === med.id);
    if (!last) return 0;
    const readyAt = new Date(last.iso_timestamp).getTime() + med.min_interval_hours * 3600_000;
    return Math.max(0, readyAt - Date.now());
  }

  /** Format milliseconds as "Xh Ym" or "Ym". */
  function fmtMs(ms) {
    const totalMin = Math.ceil(ms / 60_000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0)           return `${h}h`;
    return `${m}m`;
  }

  // ── Data helpers ───────────────────────────────────────────────────────────

  function getActiveMeds() {
    const all = Data.getData().medications ?? {};
    return Object.values(all).filter(m => m.active && m.as_needed);
  }

  function shiftDate(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  let saveTimer = null;
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
        console.error('PRN save error:', err);
        setSaveStatus('error');
      }
    }, 1200);
  }

  function setSaveStatus(s) {
    const el = document.getElementById('prn-save-status');
    if (!el) return;
    el.dataset.status = s;
    el.textContent = { pending: 'Unsaved', saving: 'Saving…', saved: 'Saved',
                       error: 'Save failed', '': '' }[s] ?? '';
  }

  // ── escHtml ────────────────────────────────────────────────────────────────

  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  }

  return { init, render, setDate };
})();
```

### Step 2: Commit
```bash
git add js/medications.js
git commit -m "feat(prn): rebuild medications.js as PRN tracker"
```

---

## Task 5: Wire up in app.js

**Files:**
- Modify: `js/app.js`

### Step 1: Add `Medications.init()` to the init sequence

Find the block where other modules are initialized (around line 115–125). Add `Medications.init();` after `Symptoms.init();`:

```js
    Symptoms.init();
    Medications.init();    // ← add this line
    Bowel.init();
```

### Step 2: Add date callback

In the `DateNav.init(date => { ... })` callback, add the Medications date update alongside the others. Find where other modules call `setDate`:

```js
    DateNav.init(date => {
      // … existing setDate calls …
      Medications.setDate(date);    // ← add this line
    });
```

### Step 3: Verify in browser

- Open app → Today tab → "As-Needed Meds" section appears
- No JS console errors
- "Log dose" button visible (section is empty, no meds configured yet)

### Step 4: Commit
```bash
git add js/app.js
git commit -m "feat(prn): wire Medications.init and setDate in app.js"
```

---

## Task 6: Settings card — manage PRN med list

**Files:**
- Modify: `js/settings.js`

### Step 1: Add state variables for the add/edit form

At the top of the settings IIFE, near other state variables, add:

```js
  // PRN med form state
  let prnForm        = null;   // null | 'add' | med-id (editing)
  let prnFName       = '';
  let prnFInterval   = '';
  let prnFMaxDoses   = '';
  let prnFDoses      = [];     // string[]
  let prnFDoseInput  = '';
```

### Step 2: Call buildPrnMedsCard in render()

Find `render()` in settings.js. After the line that calls `buildSubstancesCard()` (or wherever is logical), add:

```js
    wrap.appendChild(buildPrnMedsCard());
```

### Step 3: Implement buildPrnMedsCard

Add the following function to settings.js (after `buildSubstancesCard`):

```js
  // ── PRN Medications Card ──────────────────────────────────────────────────

  function buildPrnMedsCard() {
    const card = makeCard(`
      <span class="stg-card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true">
          <path d="M10.5 20H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2v3"/>
          <circle cx="18" cy="18" r="4"/>
          <path d="M15.27 20.73 20.73 15.27"/>
        </svg>
        As-Needed Medications
      </span>
    `);

    const meds = Object.values(Data.getData().medications ?? {}).filter(m => m.as_needed);
    const list = document.createElement('div');
    list.className = 'stg-list';

    if (meds.length === 0 && prnForm !== 'add') {
      const empty = document.createElement('p');
      empty.className   = 'stg-empty';
      empty.textContent = 'No as-needed medications configured.';
      list.appendChild(empty);
    }

    meds.forEach(med => {
      const isEditing = prnForm === med.id;

      const row = document.createElement('div');
      row.className = 'stg-item-row';

      const metaTags = [
        med.min_interval_hours ? `Every ${med.min_interval_hours}h` : null,
        med.max_daily_doses    ? `Max ${med.max_daily_doses}/day` : null,
        ...(med.doses ?? []),
      ].filter(Boolean);

      row.innerHTML = `
        <div class="stg-item-info">
          <span class="stg-item-name">${escHtml(med.name)}</span>
          <div class="prn-stg-meta">
            ${metaTags.map(t => `<span class="prn-stg-tag">${escHtml(t)}</span>`).join('')}
          </div>
        </div>
        <div style="display:flex;gap:4px">
          <button class="stg-icon-btn prn-edit-btn" type="button" data-id="${escHtml(med.id)}"
                  aria-label="Edit ${escHtml(med.name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="stg-icon-btn stg-icon-btn--danger prn-archive-btn" type="button"
                  data-id="${escHtml(med.id)}" aria-label="Archive ${escHtml(med.name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
            </svg>
          </button>
        </div>
      `;

      row.querySelector('.prn-edit-btn').addEventListener('click', () => startPrnEdit(med));
      row.querySelector('.prn-archive-btn').addEventListener('click', () => archivePrnMed(med.id));
      list.appendChild(row);

      // Inline edit form
      if (isEditing) list.appendChild(buildPrnForm('edit', med));
    });

    // Add form
    if (prnForm === 'add') list.appendChild(buildPrnForm('add'));

    card.appendChild(list);

    // Add button
    if (prnForm !== 'add') {
      const addRow = document.createElement('div');
      addRow.className = 'stg-add-row';
      const addBtn = document.createElement('button');
      addBtn.className   = 'stg-add-btn';
      addBtn.type        = 'button';
      addBtn.textContent = '+ Add medication';
      addBtn.addEventListener('click', () => {
        prnForm       = 'add';
        prnFName      = '';
        prnFInterval  = '';
        prnFMaxDoses  = '';
        prnFDoses     = [];
        prnFDoseInput = '';
        render();
      });
      addRow.appendChild(addBtn);
      card.appendChild(addRow);
    }

    return card;
  }

  function buildPrnForm(mode, med = null) {
    const wrap = document.createElement('div');
    wrap.className = 'prn-stg-form';

    const tagsHtml = prnFDoses.map(d =>
      `<span class="prn-dose-tag">${escHtml(d)}<button class="prn-dose-tag__del" type="button" data-dose="${escHtml(d)}" aria-label="Remove ${escHtml(d)}">×</button></span>`
    ).join('');

    wrap.innerHTML = `
      <div class="prn-stg-form__field">
        <label class="prn-stg-form__label" for="prn-f-name">Name</label>
        <input id="prn-f-name" class="prn-stg-form__input" type="text"
               value="${escHtml(prnFName)}" maxlength="80" placeholder="e.g. Ibuprofen">
      </div>
      <div class="prn-stg-form__field">
        <label class="prn-stg-form__label">Min interval</label>
        <div class="prn-stg-form__row">
          <input id="prn-f-interval" class="prn-stg-form__input prn-stg-form__input--short"
                 type="number" min="0.5" max="72" step="0.5"
                 value="${escHtml(prnFInterval)}" placeholder="8">
          <span class="prn-stg-form__unit">hours</span>
        </div>
      </div>
      <div class="prn-stg-form__field">
        <label class="prn-stg-form__label">Max in 24 hours</label>
        <div class="prn-stg-form__row">
          <input id="prn-f-max" class="prn-stg-form__input prn-stg-form__input--short"
                 type="number" min="1" max="20" step="1"
                 value="${escHtml(prnFMaxDoses)}" placeholder="3">
          <span class="prn-stg-form__unit">doses</span>
        </div>
      </div>
      <div class="prn-stg-form__field">
        <label class="prn-stg-form__label">Available doses <span style="font-size:0.72rem">(type + Enter)</span></label>
        <div class="prn-dose-tags" id="prn-dose-tags">
          ${tagsHtml}
          <input class="prn-dose-tag-input" id="prn-dose-tag-input" type="text"
                 value="${escHtml(prnFDoseInput)}" placeholder="e.g. 400mg" maxlength="20">
        </div>
      </div>
      <div class="prn-stg-form__actions">
        <button class="stg-add-btn" style="background:transparent;border:1px solid var(--clr-border);color:var(--clr-text-2)" type="button" id="prn-f-cancel">Cancel</button>
        <button class="stg-add-btn" type="button" id="prn-f-save">${mode === 'add' ? 'Add' : 'Save'}</button>
      </div>
    `;

    wrap.querySelector('#prn-f-name').addEventListener('input', e => { prnFName = e.target.value; });
    wrap.querySelector('#prn-f-interval').addEventListener('input', e => { prnFInterval = e.target.value; });
    wrap.querySelector('#prn-f-max').addEventListener('input', e => { prnFMaxDoses = e.target.value; });

    const tagInput = wrap.querySelector('#prn-dose-tag-input');
    tagInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = tagInput.value.trim().replace(/,$/, '');
        if (val && !prnFDoses.includes(val)) {
          prnFDoses = [...prnFDoses, val];
          prnFDoseInput = '';
        }
        render();
      } else if (e.key === 'Backspace' && tagInput.value === '' && prnFDoses.length > 0) {
        prnFDoses = prnFDoses.slice(0, -1);
        render();
      }
    });
    tagInput.addEventListener('input', e => { prnFDoseInput = e.target.value; });

    wrap.querySelectorAll('.prn-dose-tag__del').forEach(btn => {
      btn.addEventListener('click', () => {
        prnFDoses = prnFDoses.filter(d => d !== btn.dataset.dose);
        render();
      });
    });

    wrap.querySelector('#prn-f-cancel').addEventListener('click', () => {
      prnForm = null;
      render();
    });

    wrap.querySelector('#prn-f-save').addEventListener('click', () => {
      savePrnForm(mode, med?.id);
    });

    return wrap;
  }

  function startPrnEdit(med) {
    prnForm      = med.id;
    prnFName     = med.name ?? '';
    prnFInterval = med.min_interval_hours != null ? String(med.min_interval_hours) : '';
    prnFMaxDoses = med.max_daily_doses    != null ? String(med.max_daily_doses)    : '';
    prnFDoses    = [...(med.doses ?? [])];
    prnFDoseInput = '';
    render();
  }

  function savePrnForm(mode, editId) {
    const name = prnFName.trim();
    if (!name) {
      const el = document.getElementById('prn-f-name');
      if (el) el.classList.add('prn-stg-form__input--error');
      return;
    }
    const interval = parseFloat(prnFInterval) || null;
    const maxDoses = parseInt(prnFMaxDoses, 10) || null;

    if (mode === 'add') {
      const id = crypto.randomUUID();
      Data.getData().medications[id] = {
        id,
        name,
        doses:               [...prnFDoses],
        min_interval_hours:  interval,
        max_daily_doses:     maxDoses,
        as_needed:           true,
        active:              true,
        notes:               '',
      };
    } else {
      const med = Data.getData().medications[editId];
      if (med) {
        med.name               = name;
        med.doses              = [...prnFDoses];
        med.min_interval_hours = interval;
        med.max_daily_doses    = maxDoses;
      }
    }
    prnForm = null;
    render();
    scheduleSave();
    if (typeof Medications !== 'undefined') Medications.render();
  }

  function archivePrnMed(id) {
    const med = Data.getData().medications[id];
    if (med) { med.active = false; }
    prnForm = null;
    render();
    scheduleSave();
    if (typeof Medications !== 'undefined') Medications.render();
  }
```

### Step 4: Verify in browser

- Open app → Settings tab → "As-Needed Medications" card appears
- Add "Ibuprofen" with interval 8h, max 3, doses 200mg / 400mg / 600mg
- Verify it appears in the list with tags
- Open Today tab → "Log dose" → med appears in dropdown, dose chips appear
- Log a dose → card appears with countdown and dose count

### Step 5: Commit
```bash
git add js/settings.js
git commit -m "feat(prn): add As-Needed Medications management card to Settings"
```

---

## Task 7: Final integration check + push

### Step 1: Full smoke test

Work through this checklist in the browser:

- [ ] Settings → add a med (name, interval, max, doses) → appears in list with tags
- [ ] Settings → edit a med → changes saved
- [ ] Settings → archive a med → disappears from Log dose dropdown
- [ ] Today tab → "Log dose" button visible when no recent doses
- [ ] Log a dose → card appears, cooldown countdown shows, dose count shows
- [ ] Log same med again within interval → soft warning shown, can still log
- [ ] Log same med again at max → max warning shown, can still log
- [ ] Delete dose card → card disappears
- [ ] Wait / advance clock → countdown updates every 30s
- [ ] Navigate to yesterday → no cards (doses logged today aren't in yesterday's 24h window)
- [ ] Reload page → data persists from Drive

### Step 2: Push
```bash
git push
```
