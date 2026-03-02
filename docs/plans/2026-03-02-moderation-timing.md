# Moderation Timing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-pour timestamped entries to the moderation section so caffeine/alcohol timing can be used in future sleep correlations.

**Architecture:** Migrate `moderation[subId]` from a single flat object to an array of entry objects, each with its own `id`, `quantity`, `unit`, `time` (HH:MM or null), and `note`. The form defaults `time` to the current clock time on new entries. Reports reads are updated via two helper functions. Migration is lossless and idempotent.

**Tech Stack:** Vanilla JS ES5-style IIFEs, no framework, no build step, Google Drive JSON persistence, Chart.js 4.x for reports.

---

### Task 1: data.js — Add migration

**Files:**
- Modify: `js/data.js` (around line 203, inside `migrateData()`)

**Step 1: Add `migrateModeration()` function**

Insert this function immediately before `migrateData()` (around line 188):

```js
function migrateModeration(d) {
  Object.values(d.days ?? {}).forEach(day => {
    const mod = day.moderation ?? {};
    Object.keys(mod).forEach(subId => {
      const entry = mod[subId];
      // null = nothing logged; Array = already migrated — skip both
      if (!entry || Array.isArray(entry)) return;
      mod[subId] = [{
        id:       crypto.randomUUID(),
        quantity: entry.quantity,
        unit:     entry.unit,
        time:     null,
        note:     entry.note ?? '',
      }];
    });
  });
  return d;
}
```

**Step 2: Call it from `migrateData()`**

`migrateData()` currently ends with `return d;` at line ~211. Add the call before that return:

```js
function migrateData(d) {
  // ... existing Long Walk rename and Coffee substance add ...

  migrateModeration(d);   // ← ADD THIS LINE
  return d;
}
```

**Step 3: Verify in browser console**

Open the app. In DevTools console run:
```js
const day = Data.getData().days;
const firstDate = Object.keys(day)[0];
console.log(day[firstDate]?.moderation);
```
Expected: each substance value is either `null` or an **array** like `[{ id: "...", quantity: 2, unit: "cups", time: null, note: "" }]`. If the drive file had old-format entries, they should now be arrays.

**Step 4: Commit**
```bash
git add js/data.js
git commit -m "feat: migrate moderation entries to per-pour array format"
```

---

### Task 2: reports.js — Add helpers and update two read sites

**Files:**
- Modify: `js/reports.js` (lines ~590–635)

**Step 1: Add two helper functions**

Find the `// ── Moderation section ──` comment (around line 588). Insert these two helpers immediately above it:

```js
/** Sum quantity across a moderation entries array. Returns 0 for null/empty. */
function modTotal(entries) {
  if (!entries || !entries.length) return 0;
  return entries.reduce((sum, e) => sum + (e.quantity ?? 0), 0);
}

/** Return the latest HH:MM time string across entries, or null if none set. */
function modLastTime(entries) {
  if (!entries || !entries.length) return null;
  const times = entries.map(e => e.time).filter(Boolean);
  if (!times.length) return null;
  return times.reduce((latest, t) => t > latest ? t : latest);
}
```

**Step 2: Update `buildModerationSection` (line ~601–602)**

Find:
```js
        const entry = daysData[date]?.moderation?.[sub.id];
        if (entry) { daysLogged++; totalQty += (entry.quantity ?? 0); }
```

Replace with:
```js
        const entries = daysData[date]?.moderation?.[sub.id];
        const qty = modTotal(entries);
        if (qty > 0) { daysLogged++; totalQty += qty; }
```

**Step 3: Update `renderModerationChart` (line ~632–633)**

Find:
```js
        const entry = daysData[date]?.moderation?.[sub.id];
        if (entry) bucket.subs[sub.id] = (bucket.subs[sub.id] ?? 0) + (entry.quantity ?? 0);
```

Replace with:
```js
        const qty = modTotal(daysData[date]?.moderation?.[sub.id]);
        if (qty > 0) bucket.subs[sub.id] = (bucket.subs[sub.id] ?? 0) + qty;
```

**Step 4: Verify in browser**

Open the Reports tab. The Moderation section should render correctly — substance totals and the weekly bar chart should show the same numbers as before (data hasn't changed shape yet, migration from Task 1 wraps old data in arrays that `modTotal` handles correctly).

**Step 5: Commit**
```bash
git add js/reports.js
git commit -m "feat: update reports moderation reads to handle entry arrays"
```

---

### Task 3: moderation.js — Full refactor

**Files:**
- Modify: `js/moderation.js` (full file, ~339 lines)

This is the largest task. Work through it section by section.

**Step 1: Update module-level state**

Find the state block at the top of the IIFE (lines ~13–19):
```js
  let editingId   = null;   // substance.id of row currently showing the form
  // ...
  let fQty  = 1;
  let fUnit = '';
  let fNote = '';
```

Replace with:
```js
  // editingId: null | { subId: string, entryId: string|null }
  //   entryId null  = adding a new entry
  //   entryId string = editing an existing entry by its id
  let editingId   = null;

  let fQty  = 1;
  let fUnit = '';
  let fTime = '';   // HH:MM or '' if user skips
  let fNote = '';
```

**Step 2: Update `render()` — change the entry lookup**

Find in `render()` (line ~45):
```js
      const entry = Data.getDay(currentDate).moderation[sub.id] ?? null;
      list.appendChild(makeRow(sub, entry));
```

Replace with:
```js
      const entries = Data.getDay(currentDate).moderation[sub.id] ?? null;
      list.appendChild(makeRow(sub, entries));
```

**Step 3: Update `makeRow()` — fix the editing check**

Find (line ~56):
```js
    if (editingId === sub.id) {
```

Replace with:
```js
    if (editingId?.subId === sub.id) {
```

Also update the call to `buildForm` — it receives `entries` now, not a single `entry`. The function needs to know which entry is being edited (or null for new). Change:
```js
      buildForm(wrap, sub, entry);
```
to:
```js
      const editingEntry = editingId?.entryId
        ? (entries ?? []).find(e => e.id === editingId.entryId) ?? null
        : null;
      buildForm(wrap, sub, editingEntry);
```

And the else branch passes `entries` instead of `entry`:
```js
    } else {
      buildDisplay(wrap, sub, entries);
    }
```

**Step 4: Replace `buildDisplay()` entirely**

Replace the entire `buildDisplay` function with:

```js
  function buildDisplay(wrap, sub, entries) {
    const hasEntries = entries && entries.length > 0;

    if (!hasEntries) {
      // ── Nothing logged yet ──────────────────────────────────────
      wrap.innerHTML = `
        <div class="mod-display">
          <div class="mod-sub-info">
            <span class="mod-badge" data-sub-id="${escHtml(sub.id)}" aria-hidden="true">
              ${subEmoji(sub)}
            </span>
            <span class="mod-sub-name">${escHtml(sub.name)}</span>
          </div>
          <button class="mod-log-btn" type="button" aria-label="Log ${escHtml(sub.name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                 width="14" height="14" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5"  y1="12" x2="19" y2="12"/>
            </svg>
            Log
          </button>
        </div>`;
      wrap.querySelector('.mod-log-btn').addEventListener('click', () => startEdit(sub, null));
      return;
    }

    // ── Has entries ─────────────────────────────────────────────
    const total    = entries.reduce((s, e) => s + (e.quantity ?? 0), 0);
    const unitStr  = entries[0]?.unit ?? sub.default_unit ?? '';
    const lastTime = entries.map(e => e.time).filter(Boolean)
                            .reduce((best, t) => t > best ? t : best, '');

    const summaryHtml = entries.length === 1
      ? `<span class="mod-quantity">${escHtml(fmtQty(entries[0].quantity))} ${escHtml(entries[0].unit)}</span>${lastTime ? `<span class="mod-entry-time"> · ${escHtml(lastTime)}</span>` : ''}`
      : `<span class="mod-quantity">${escHtml(fmtQty(total))} ${escHtml(unitStr)} total</span>`;

    wrap.innerHTML = `
      <div class="mod-display">
        <div class="mod-sub-info">
          <span class="mod-badge" data-sub-id="${escHtml(sub.id)}" aria-hidden="true">
            ${subEmoji(sub)}
          </span>
          <span class="mod-sub-name">${escHtml(sub.name)}</span>
        </div>
        <div class="mod-logged">
          ${summaryHtml}
          <button class="mod-add-btn" type="button" aria-label="Add ${escHtml(sub.name)} entry">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                 width="14" height="14" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5"  y1="12" x2="19" y2="12"/>
            </svg>
            Add
          </button>
        </div>
      </div>
      <div class="mod-entry-list">
        ${entries.map(e => `
          <div class="mod-entry-row" data-entry-id="${escHtml(e.id)}">
            <span class="mod-entry-qty">${escHtml(fmtQty(e.quantity))} ${escHtml(e.unit)}</span>
            ${e.time ? `<span class="mod-entry-time">${escHtml(e.time)}</span>` : ''}
            ${e.note ? `<span class="mod-entry-note">${escHtml(e.note)}</span>` : ''}
            <button class="mod-edit-btn" type="button" data-entry-id="${escHtml(e.id)}"
                    aria-label="Edit entry">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                   width="13" height="13" aria-hidden="true">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="mod-del-btn" type="button" data-entry-id="${escHtml(e.id)}"
                    aria-label="Remove entry">×</button>
          </div>`).join('')}
      </div>`;

    wrap.querySelector('.mod-add-btn').addEventListener('click', () => startEdit(sub, null));
    wrap.querySelectorAll('.mod-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const entry = entries.find(e => e.id === btn.dataset.entryId);
        if (entry) startEdit(sub, entry);
      });
    });
    wrap.querySelectorAll('.mod-del-btn').forEach(btn => {
      btn.addEventListener('click', () => removeEntry(sub, btn.dataset.entryId));
    });
  }
```

**Step 5: Replace `buildForm()` — add time field**

Replace the entire `buildForm` function with:

```js
  function buildForm(wrap, sub, existingEntry) {
    // existingEntry: the specific entry object being edited, or null for a new entry
    const isEdit     = !!existingEntry;
    const removeHtml = isEdit
      ? `<button class="mod-clear-btn" type="button" aria-label="Remove entry">Remove</button>`
      : '';

    wrap.innerHTML = `
      <div class="mod-form">
        <div class="mod-form-header">
          <span class="mod-badge" data-sub-id="${escHtml(sub.id)}" aria-hidden="true">
            ${subEmoji(sub)}
          </span>
          <span class="mod-sub-name">${escHtml(sub.name)}</span>
          ${removeHtml}
        </div>

        <div class="mod-form-time-row">
          <label class="mod-time-label">Time</label>
          <input id="mod-time-input" class="mod-time-input" type="time"
                 value="${escHtml(fTime)}"
                 aria-label="Time (optional)">
        </div>

        <div class="mod-form-qty-row">
          <button class="mod-stepper" type="button" data-op="dec" aria-label="Decrease quantity">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round"
                 width="16" height="16" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>

          <input id="mod-qty-input" class="mod-qty-input" type="text"
                 value="${fQty}" inputmode="decimal"
                 aria-label="Quantity">

          <button class="mod-stepper" type="button" data-op="inc" aria-label="Increase quantity">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round"
                 width="16" height="16" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5"  y1="12" x2="19" y2="12"/>
            </svg>
          </button>

          <input id="mod-unit-input" class="mod-unit-input" type="text"
                 value="${escHtml(fUnit)}" maxlength="20"
                 aria-label="Unit (e.g. drinks, glasses)">
        </div>

        <input id="mod-note-input" class="mod-note-input" type="text"
               value="${escHtml(fNote)}" maxlength="200"
               placeholder="Note (optional)"
               aria-label="Note">

        <div class="mod-form-actions">
          <button class="mod-cancel-btn" type="button">Cancel</button>
          <button class="mod-save-btn"   type="button">Save</button>
        </div>
      </div>
    `;

    // Steppers
    wrap.querySelectorAll('.mod-stepper').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = wrap.querySelector('#mod-qty-input');
        let v = parseFloat(inp.value) || 0;
        v = btn.dataset.op === 'inc' ? v + 1 : Math.max(0.5, v - 1);
        v = Math.round(v * 2) / 2;
        inp.value = v;
        fQty = v;
      });
    });

    wrap.querySelector('#mod-time-input').addEventListener('input', e => { fTime = e.target.value; });
    wrap.querySelector('#mod-qty-input').addEventListener('input',  e => { fQty  = parseFloat(e.target.value) || 0; });
    wrap.querySelector('#mod-unit-input').addEventListener('input', e => { fUnit = e.target.value; });
    wrap.querySelector('#mod-note-input').addEventListener('input', e => { fNote = e.target.value; });

    wrap.querySelector('.mod-cancel-btn').addEventListener('click', cancelEdit);
    wrap.querySelector('.mod-save-btn').addEventListener('click', () => saveEntry(sub));
    wrap.querySelector('.mod-clear-btn')?.addEventListener('click', () => {
      if (existingEntry) removeEntry(sub, existingEntry.id);
    });

    requestAnimationFrame(() => {
      wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
```

**Step 6: Update `startEdit()`**

Replace with:

```js
  function startEdit(sub, existingEntry) {
    // existingEntry: a specific entry object to edit, or null for a new entry
    fQty  = existingEntry ? existingEntry.quantity  : 1;
    fUnit = existingEntry ? existingEntry.unit       : (sub.default_unit ?? '');
    fTime = existingEntry ? (existingEntry.time ?? '') : nowHHMM();
    fNote = existingEntry?.note ?? '';

    editingId = { subId: sub.id, entryId: existingEntry?.id ?? null };
    render();
  }
```

**Step 7: Add `nowHHMM()` helper**

Add this near the other helpers at the bottom of the IIFE, before the `return` statement:

```js
  /** Current time as 'HH:MM' string. */
  function nowHHMM() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
```

**Step 8: Replace `saveEntry()`**

Replace the entire `saveEntry` function with:

```js
  function saveEntry(sub) {
    const qtyEl  = document.getElementById('mod-qty-input');
    const unitEl = document.getElementById('mod-unit-input');
    const timeEl = document.getElementById('mod-time-input');
    const noteEl = document.getElementById('mod-note-input');

    const qty  = parseFloat(qtyEl?.value ?? fQty);
    const unit = (unitEl?.value ?? fUnit).trim() || sub.default_unit;
    const time = (timeEl?.value ?? fTime).trim() || null;
    const note = (noteEl?.value ?? fNote).trim();

    if (!qty || qty <= 0) {
      qtyEl?.classList.add('input--error');
      return;
    }

    const mod = Data.getDay(currentDate).moderation;

    if (editingId?.entryId) {
      // Update existing entry in-place
      const arr = mod[sub.id] ?? [];
      const idx = arr.findIndex(e => e.id === editingId.entryId);
      if (idx !== -1) {
        arr[idx] = {
          ...arr[idx],
          quantity: Math.round(qty * 2) / 2,
          unit,
          time,
          note,
        };
        mod[sub.id] = arr;
      }
    } else {
      // Append new entry
      const arr = Array.isArray(mod[sub.id]) ? mod[sub.id] : [];
      arr.push({
        id:       crypto.randomUUID(),
        quantity: Math.round(qty * 2) / 2,
        unit,
        time,
        note,
      });
      mod[sub.id] = arr;
    }

    editingId = null;
    render();
    scheduleSave();
  }
```

**Step 9: Replace `clearEntry()` with `removeEntry()`**

The old `clearEntry(sub)` cleared the whole day's entry for a substance. Replace it with `removeEntry(sub, entryId)` which removes a single entry by id:

```js
  function removeEntry(sub, entryId) {
    const mod = Data.getDay(currentDate).moderation;
    const arr = mod[sub.id];
    if (!Array.isArray(arr)) return;

    mod[sub.id] = arr.filter(e => e.id !== entryId);
    if (mod[sub.id].length === 0) mod[sub.id] = null;   // revert to null when empty

    editingId = null;
    render();
    scheduleSave();
  }
```

Delete the old `clearEntry` function entirely.

**Step 10: Manual verification in browser**

Test the following flows:

1. **First log of the day:**
   - Open Today tab, tap "Log" on Coffee
   - Form opens with time = current time, qty = 1
   - Save → shows "1 cup · HH:MM" with ✎ and + Add buttons

2. **Add a second pour:**
   - Tap "+ Add"
   - Form opens with time = current time again
   - Change qty to 1, save → shows "2 cups total" with two entry rows

3. **Edit an entry:**
   - Tap ✎ on first entry → form pre-fills with that entry's data
   - Change the time, save → entry updates in place

4. **Remove an entry:**
   - Tap × on one entry → entry disappears
   - Remove last entry → substance reverts to "+ Log" state (null)

5. **Reports tab:**
   - Open Reports, check Moderation section still shows correct totals and chart

**Step 11: Commit**
```bash
git add js/moderation.js
git commit -m "feat: multi-entry moderation logging with per-pour timestamps"
```

---

### Task 4: Docs and version bump

**Files:**
- Modify: `CLAUDE.md`
- Modify: `js/config.js`

**Step 1: Update moderation schema in CLAUDE.md**

Find the moderation block in the JSON schema (the `"moderation"` key under `days[date]`):
```json
      "moderation": {
        "alcohol":  { "quantity": 2, "unit": "drinks",   "note": "wine with dinner" },
        "cannabis": null
      },
```

Replace with:
```json
      "moderation": {
        "alcohol": [
          { "id": "<uuid>", "quantity": 2, "unit": "drinks", "time": "19:00", "note": "wine with dinner" },
          { "id": "<uuid>", "quantity": 1, "unit": "drink",  "time": "21:30", "note": "" }
        ],
        "cannabis": null
      },
```

Also update the Schema Field Notes section. Find the `### days[date].moderation` note and update it to reflect:
- Value is an array of entries (or null if nothing logged)
- Each entry: `{ id, quantity, unit, time (HH:MM|null), note }`
- `time` defaults to current clock time when logging, editable

**Step 2: Bump APP_VERSION in config.js**

In `js/config.js` line 1, update the version to today's date:
```js
const APP_VERSION = '2026.03.02';
```

**Step 3: Commit**
```bash
git add CLAUDE.md js/config.js
git commit -m "docs: update moderation schema docs and bump version"
```

---

## CSS Notes (non-blocking)

The new elements use class names that don't exist yet in `styles.css`:
- `.mod-entry-list` — container for per-entry rows
- `.mod-entry-row` — individual entry row (flex, gap, align-center)
- `.mod-entry-qty` — quantity + unit text
- `.mod-entry-time` — muted time chip
- `.mod-entry-note` — muted note text
- `.mod-del-btn` — small × delete button (similar to existing close buttons)
- `.mod-add-btn` — same style as existing `.mod-log-btn`
- `.mod-form-time-row` — flex row for the time label + input
- `.mod-time-label` — small label ("Time")
- `.mod-time-input` — time input field

Style these to match the existing design system. Reference the existing `.mod-form-qty-row`, `.mod-note`, and `.mod-logged` styles as templates. The green accent is `var(--clr-accent)`, muted text is `var(--clr-text-2)`.

Add a Task 5 for CSS if needed, or fold into Task 3 Step 10 verification.
