# Slot Delete Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Delete button inside the slot edit form that clears a logged AM/Afternoon/PM slot back to its unlogged state, with an inline confirmation step.

**Architecture:** All changes are confined to `js/medications.js` (state + render + handlers) and `css/styles.css` (delete button styles). A new boolean `confirmingDelete` drives which variant of the edit form action bar is rendered. A new `deleteSlotLog()` function resets the slot record. No new data migration is needed — the reset record shape is identical to a never-logged slot.

**Tech Stack:** Vanilla JS IIFE module — no framework, no build step.

---

## Background

### How slot edit works today

1. User taps a logged slot row (`renderSlotLogged`) → `openSlotEdit(slot)` is called
2. `renderSlotEditForm()` renders a form with time, checkboxes, extras, and two action buttons
3. Action bar (lines ~219–221 in `js/medications.js`):
   ```html
   <div class="meds-slot-edit-actions">
     <button class="meds-edit-cancel-btn" id="meds-edit-cancel">Cancel</button>
     <button class="meds-edit-save-btn"   id="meds-edit-save">Save</button>
   </div>
   ```
4. Save writes back to `day.med_slots[slot]`; Cancel clears `editSlot` and re-renders

### What "delete" means

Reset the slot record to its unlogged default:
```js
day.med_slots[slot] = { time: null, skipped: [], extras: [] }
```
`slotData.time` being null causes the UI to fall back to `renderSlotButton(slot)` (the "Log AM" button), which is correct.

### Key locations in `js/medications.js`

| Symbol | Approx. line | Notes |
|---|---|---|
| State block | ~27–32 | `editSlot`, `editTime`, `editSkipped`, etc. |
| `renderSlotEditForm()` | ~169 | Renders the edit form; action bar is the last `<div>` before closing `</div>` |
| `openSlotEdit()` | ~582 | Initialises edit state; call `render()` at end |
| `wireEvents()` slot edit block | ~459–479 | `if (editSlot) { ... }` block with all edit handlers |
| `saveSlotEdit()` | ~605 | Writes edit back to day data |

---

## Task 1 — Add `confirmingDelete` state and `deleteSlotLog()` function

**Files:**
- Modify: `js/medications.js`

### Step 1 — Add `confirmingDelete` to the state block

Find the state block (~line 27):

```js
// Slot edit state
let editSlot      = null;
let editTime      = '';
let editSkipped   = [];     // med IDs skipped in edit
let editExtras    = [];     // { medication_id, dose } added in edit
let editExtraMedId = '';
let editExtraDose  = '';
```

Add `let confirmingDelete = false;` after `editExtraDose`:

```js
// Slot edit state
let editSlot         = null;
let editTime         = '';
let editSkipped      = [];     // med IDs skipped in edit
let editExtras       = [];     // { medication_id, dose } added in edit
let editExtraMedId   = '';
let editExtraDose    = '';
let confirmingDelete = false;  // true while Delete confirmation is showing
```

### Step 2 — Reset `confirmingDelete` in `openSlotEdit()`

Find `openSlotEdit()` (~line 582). The current body:

```js
function openSlotEdit(slot) {
  const day      = Data.getDay(currentDate);
  const slotData = (day.med_slots ?? defaultSlots())[slot] ?? { time: null, skipped: [], extras: [] };
  editSlot       = slot;
  editTime       = slotData.time ?? nowHHMM();
  editSkipped    = [...(slotData.skipped ?? [])];
  editExtras     = [...(slotData.extras  ?? [])];
  editExtraMedId = '';
  editExtraDose  = '';
  pendingLogSlot = null;   // close pending form if open
  render();
}
```

Add `confirmingDelete = false;` after `editExtraDose = '';`:

```js
function openSlotEdit(slot) {
  const day      = Data.getDay(currentDate);
  const slotData = (day.med_slots ?? defaultSlots())[slot] ?? { time: null, skipped: [], extras: [] };
  editSlot         = slot;
  editTime         = slotData.time ?? nowHHMM();
  editSkipped      = [...(slotData.skipped ?? [])];
  editExtras       = [...(slotData.extras  ?? [])];
  editExtraMedId   = '';
  editExtraDose    = '';
  confirmingDelete = false;
  pendingLogSlot   = null;
  render();
}
```

### Step 3 — Add `deleteSlotLog()` function

Add this function directly after `saveSlotEdit()`:

```js
function deleteSlotLog() {
  if (!editSlot) return;
  const day = Data.getDay(currentDate);
  if (!day.med_slots) day.med_slots = defaultSlots();
  day.med_slots[editSlot] = { time: null, skipped: [], extras: [] };
  editSlot         = null;
  confirmingDelete = false;
  scheduleSave();
  render();
}
```

### Step 4 — Manual verify (console)

Open the app in the browser. Log an AM slot if not already logged. Open devtools console and confirm:

```js
Data.getDay(Data.today()).med_slots.am
// Should show: { time: "HH:MM", ... }  (still logged — no change yet)
```

Nothing should be broken at this point; `confirmingDelete` is wired to nothing yet.

### Step 5 — Commit

```bash
git add js/medications.js
git commit -m "feat(meds): add deleteSlotLog() and confirmingDelete state"
```

---

## Task 2 — Update `renderSlotEditForm()` to show Delete / confirmation bar

**Files:**
- Modify: `js/medications.js`

### Step 1 — Replace the action bar in `renderSlotEditForm()`

Find the action bar at the bottom of `renderSlotEditForm()` (~line 219):

```js
      <div class="meds-slot-edit-actions">
        <button class="meds-edit-cancel-btn" id="meds-edit-cancel">Cancel</button>
        <button class="meds-edit-save-btn"   id="meds-edit-save">Save</button>
      </div>
```

Replace with a conditional that renders two variants:

```js
      <div class="meds-slot-edit-actions">
        ${confirmingDelete ? `
          <span class="meds-delete-confirm-label">Confirm delete?</span>
          <button class="meds-edit-cancel-btn"  id="meds-delete-no">No</button>
          <button class="meds-edit-delete-btn"  id="meds-delete-yes">Yes</button>
        ` : `
          <button class="meds-edit-delete-btn"  id="meds-delete-btn">Delete</button>
          <button class="meds-edit-cancel-btn"  id="meds-edit-cancel">Cancel</button>
          <button class="meds-edit-save-btn"    id="meds-edit-save">Save</button>
        `}
      </div>
```

### Step 2 — Manual verify (visual only)

Reload the app. Tap a logged slot row to open the edit form. Confirm you now see **Delete**, **Cancel**, **Save** buttons. The Delete button will be unstyled for now (CSS comes in Task 3). Clicking Delete should do nothing yet (handler wired in Task 3).

### Step 3 — Commit

```bash
git add js/medications.js
git commit -m "feat(meds): render Delete/confirmation bar in slot edit form"
```

---

## Task 3 — Wire Delete event handlers in `wireEvents()`

**Files:**
- Modify: `js/medications.js`

### Step 1 — Add handlers to the `if (editSlot)` block in `wireEvents()`

Find the existing cancel handler (~line 477):

```js
      el.querySelector('#meds-edit-cancel')?.addEventListener('click', () => { editSlot = null; render(); });
      el.querySelector('#meds-edit-save')?.addEventListener('click', saveSlotEdit);
```

Replace with (adds delete handlers + resets `confirmingDelete` in cancel):

```js
      el.querySelector('#meds-edit-cancel')?.addEventListener('click', () => {
        editSlot = null;
        confirmingDelete = false;
        render();
      });
      el.querySelector('#meds-edit-save')?.addEventListener('click', saveSlotEdit);

      // Delete with inline confirmation
      el.querySelector('#meds-delete-btn')?.addEventListener('click', () => {
        confirmingDelete = true;
        render();
      });
      el.querySelector('#meds-delete-no')?.addEventListener('click', () => {
        confirmingDelete = false;
        render();
      });
      el.querySelector('#meds-delete-yes')?.addEventListener('click', deleteSlotLog);
```

### Step 2 — Manual verify (functional)

1. Log an AM slot (or use an already-logged day)
2. Tap the logged row to open the edit form — see **Delete**, **Cancel**, **Save**
3. Tap **Delete** → action bar changes to **"Confirm delete?"**, **No**, **Yes**
4. Tap **No** → action bar returns to **Delete**, **Cancel**, **Save** ✓
5. Tap **Delete** again → confirmation shows
6. Tap **Yes** → edit form closes; slot reverts to the **"Log AM"** button state ✓
7. Verify in console:
   ```js
   Data.getDay(Data.today()).med_slots.am
   // Should show: { time: null, skipped: [], extras: [] }
   ```

### Step 3 — Commit

```bash
git add js/medications.js
git commit -m "feat(meds): wire Delete confirmation handlers in slot edit form"
```

---

## Task 4 — Add CSS for Delete button and confirmation label

**Files:**
- Modify: `css/styles.css`

### Step 1 — Add styles after `.meds-edit-save-btn`

Find `.meds-edit-save-btn` (~line 7902) and locate the end of its rule block. Add these new rules immediately after:

```css
.meds-edit-delete-btn {
  background:    transparent;
  color:         var(--clr-error);
  border:        1px solid var(--clr-error);
  border-radius: 8px;
  font-size:     0.88rem;
  padding:       7px 16px;
  cursor:        pointer;
  margin-right:  auto;   /* pushes Cancel + Save to the right */
}
.meds-edit-delete-btn:active {
  background: color-mix(in srgb, var(--clr-error) 12%, transparent);
}
.meds-delete-confirm-label {
  font-size:   0.88rem;
  color:       var(--clr-error);
  margin-right: auto;
  align-self:  center;
}
```

### Step 2 — Manual verify (visual)

Reload the app. Open a logged slot's edit form:
- **Delete** button should appear red-outlined, left-aligned
- **Cancel** and **Save** should remain right-aligned
- Tap **Delete** → "Confirm delete?" text appears red, left-aligned; **No** and **Yes** on the right

### Step 3 — Commit

```bash
git add css/styles.css
git commit -m "feat(meds): style Delete button and confirmation label"
```

---

## Task 5 — Version bump

**Files:**
- Modify: `js/config.js`

### Step 1 — Bump version

Change `APP_VERSION` from `'2026.03.07h'` to `'2026.03.07j'`.

(Note: `i` is reserved for the slot-med-snapshot plan; this feature ships after that.)

### Step 2 — Commit and push

```bash
git add js/config.js
git commit -m "chore: bump version to 2026.03.07j"
git push
```

---

## Files Changed Summary

| File | Change |
|---|---|
| `js/medications.js` | Add `confirmingDelete` state; update `openSlotEdit()` to reset it; add `deleteSlotLog()`; update `renderSlotEditForm()` action bar; wire three new event handlers in `wireEvents()` |
| `css/styles.css` | Add `.meds-edit-delete-btn` and `.meds-delete-confirm-label` styles |
| `js/config.js` | Version bump to `2026.03.07j` |

## Ordering note

If the slot-med-snapshot plan (`2026-03-07-slot-med-snapshot.md`) is executed first (bumping version to `2026.03.07i`), change the version target in Task 5 from `2026.03.07j` to `2026.03.07j` — the letter doesn't matter as long as it increments past whatever `i` lands at.
