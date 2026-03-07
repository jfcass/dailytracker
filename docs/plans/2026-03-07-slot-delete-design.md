# Slot Delete (Unlog) Design

**Date:** 2026-03-07
**Status:** Approved

## Problem

Once a medication slot (AM / Afternoon / PM) is logged, there is no way to clear it back to the unlogged state. The user wants to delete an old log so they can re-record it — particularly to get the benefit of the new `meds` snapshot (which captures the exact med list at log time).

## Solution

Add a **Delete** button inside the slot edit form. Tapping it triggers an inline confirmation before clearing the slot record entirely.

---

## UI Behaviour

### Edit form action bar — normal state
```
[ Delete ]  ·  [ Cancel ]  [ Save ]
```

- `Delete` is left-aligned, styled as a destructive secondary button (red-tinted)
- `Cancel` and `Save` remain right-aligned as today

### Edit form action bar — confirming state
```
[ Confirm delete? ]  [ Yes ]  [ No ]
```

- The entire action row is replaced by the confirmation prompt
- `Yes` executes the delete; `No` returns to the normal action bar (edit session stays open)

---

## Data Change

```js
// Before (logged)
day.med_slots.am = { time: "08:30", meds: ["uuid-1", "uuid-2"], skipped: [], extras: [] }

// After delete
day.med_slots.am = { time: null, skipped: [], extras: [] }
```

The slot is reset to the same shape as a never-logged slot. The `meds` snapshot (if present) is also cleared.

---

## Code Changes — `js/medications.js` only

### New state variable

```js
let confirmingDelete = false;
```

Added to the existing slot-edit state block alongside `editSlot`, `editTime`, etc.

### Updated `renderSlotEditForm()`

The action row at the bottom switches on `confirmingDelete`:

```js
// Normal
`<button id="meds-delete-btn"  class="meds-edit-delete-btn">Delete</button>
 <button id="meds-edit-cancel" class="meds-edit-cancel-btn">Cancel</button>
 <button id="meds-edit-save"   class="meds-edit-save-btn">Save</button>`

// Confirming
`<span class="meds-delete-confirm-label">Confirm delete?</span>
 <button id="meds-delete-yes" class="meds-edit-delete-btn">Yes</button>
 <button id="meds-delete-no"  class="meds-edit-cancel-btn">No</button>`
```

### New function `deleteSlotLog()`

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

### `wireEvents()` additions

- `#meds-delete-btn` click → `confirmingDelete = true; render();`
- `#meds-delete-no` click → `confirmingDelete = false; render();`
- `#meds-delete-yes` click → `deleteSlotLog()`
- Existing `#meds-edit-cancel` handler also resets `confirmingDelete = false`

### `openSlotEdit()` change

Reset `confirmingDelete = false` at entry so re-opening the edit form never starts in confirming state.

---

## CSS — `css/styles.css`

Add `.meds-edit-delete-btn` — red-tinted destructive style:

```css
.meds-edit-delete-btn {
  background: transparent;
  color: var(--clr-error);
  border: 1px solid var(--clr-error);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 0.85rem;
  cursor: pointer;
  margin-right: auto;   /* push Save/Cancel to the right */
}
.meds-edit-delete-btn:active {
  background: color-mix(in srgb, var(--clr-error) 12%, transparent);
}
```

Add `.meds-delete-confirm-label` for the "Confirm delete?" text inline with Yes/No buttons.

---

## Scope

- **Files changed:** `js/medications.js`, `css/styles.css`, `js/config.js` (version bump)
- **No data migration:** deleting a slot produces the same shape as a pre-existing never-logged slot
- **No impact on PRN doses:** those have per-dose delete already
- **Compatible with slot-med-snapshot plan:** that plan adds `meds` to slot records; delete simply clears the whole record regardless
