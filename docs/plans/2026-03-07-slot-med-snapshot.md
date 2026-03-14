# Slot Med Snapshot Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a medication slot (AM/Afternoon/PM) is logged, snapshot the exact med IDs in that slot so historical records are never affected by later changes to the medication list.

**Architecture:** Add a `meds: string[]` field to the slot record at log time — an array of medication IDs that were assigned to that slot when the user tapped "Log". The edit form uses this snapshot (resolved to med objects via a new `getMedById()` helper that searches all meds including archived ones) instead of the live active-meds list. The snapshot is preserved when saving edits. Old records without `meds` fall back gracefully to the current live list (existing behaviour, unchanged for old data).

**Tech Stack:** Vanilla JS IIFE module — changes are confined to `js/medications.js`.

---

## Background

### Current (broken) data shape for a logged slot

```json
"med_slots": {
  "am": {
    "time": "08:30",
    "skipped": [],
    "extras": []
  }
}
```

`skipped` contains IDs of meds the user un-checked. The edit-form checkboxes are generated from `allSlotMeds` — the **live** list of meds that currently have `slots: ['am']`. Adding a new AM med later makes it appear checked on every historical AM-logged day.

### Fixed data shape

```json
"am": {
  "time": "08:30",
  "meds": ["uuid-1", "uuid-2"],
  "skipped": [],
  "extras": []
}
```

`meds` is written once at log time and never changed. The edit form reads it instead of the live list.

### Key functions in `js/medications.js`

| Function | Location | Role |
|---|---|---|
| `logSlot(slot, time)` | ~line 572 | Called when user confirms a slot log |
| `openSlotEdit(slot)` | ~line 582 | Loads state before opening the edit form |
| `renderSlotEditForm(slot, allSlotMeds, slotData)` | ~line 169 | Renders checkboxes from `allSlotMeds` ← THE BUG |
| `saveSlotEdit()` | ~line 605 | Writes the edited slot back to the day |
| `getActiveMeds()` | ~line 713 | Returns only active (non-archived) meds |

---

## Task 1 — Snapshot med IDs at log time

**Files:**
- Modify: `js/medications.js`

### Step 1 — Update `logSlot()` to include the snapshot

Find `logSlot()` (~line 572). The current body:

```js
function logSlot(slot, time) {
  const t   = time || nowHHMM();
  const day = Data.getDay(currentDate);
  if (!day.med_slots) day.med_slots = defaultSlots();
  day.med_slots[slot] = { time: t, skipped: [], extras: [] };
  pendingLogSlot = null;
  scheduleSave();
  render();
}
```

Replace with:

```js
function logSlot(slot, time) {
  const t       = time || nowHHMM();
  const day     = Data.getDay(currentDate);
  const snapshot = getActiveMeds()
    .filter(m => (m.slots ?? []).includes(slot))
    .map(m => m.id);
  if (!day.med_slots) day.med_slots = defaultSlots();
  day.med_slots[slot] = { time: t, meds: snapshot, skipped: [], extras: [] };
  pendingLogSlot = null;
  scheduleSave();
  render();
}
```

### Step 2 — Manual verify (console)

Open the app, log an AM slot, then in the console:

```js
const today = Data.today();
console.log(Data.getDay(today).med_slots.am);
// Should show: { time: "HH:MM", meds: ["uuid-1", ...], skipped: [], extras: [] }
```

Confirm `meds` array is present and contains the IDs of your current AM meds. ✓

### Step 3 — Commit

```bash
git add js/medications.js
git commit -m "feat(meds): snapshot med IDs in slot record at log time"
```

---

## Task 2 — Use snapshot in edit form and preserve it on save

**Files:**
- Modify: `js/medications.js`

This task touches four things in the same file:
1. Add a `getMedById()` helper
2. Add `let editMeds = []` to module state
3. `openSlotEdit()` — load snapshot into `editMeds`
4. `renderSlotEditForm()` — resolve checkboxes from `editMeds`, not `allSlotMeds`
5. `saveSlotEdit()` — preserve `meds` snapshot when saving edits

### Step 1 — Add `getMedById()` helper

This helper is needed because snapshot IDs may include archived meds. `getActiveMeds()` only returns active ones. Add `getMedById()` directly after `getActiveMeds()`:

```js
/** Look up any med by ID — including archived ones */
function getMedById(id) {
  return Object.values(Data.getData().medications ?? {}).find(m => m.id === id);
}
```

### Step 2 — Add `editMeds` to module state

Find the existing state block (~line 27–53):

```js
// Slot edit state
let editSlot      = null;
let editTime      = '';
let editSkipped   = [];
let editExtras    = [];
let editExtraMedId = '';
let editExtraDose  = '';
```

Add `let editMeds = [];` on a new line after `editSkipped`:

```js
let editSlot      = null;
let editTime      = '';
let editSkipped   = [];
let editMeds      = [];   // snapshot of med IDs that were in the slot at log time
let editExtras    = [];
let editExtraMedId = '';
let editExtraDose  = '';
```

### Step 3 — Load snapshot in `openSlotEdit()`

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
  pendingLogSlot = null;
  render();
}
```

Replace with (adds one line loading `editMeds` from the snapshot, falling back to the live list for old records):

```js
function openSlotEdit(slot) {
  const day      = Data.getDay(currentDate);
  const slotData = (day.med_slots ?? defaultSlots())[slot] ?? { time: null, skipped: [], extras: [] };
  editSlot       = slot;
  editTime       = slotData.time ?? nowHHMM();
  editSkipped    = [...(slotData.skipped ?? [])];
  editMeds       = slotData.meds
    ? [...slotData.meds]
    : getActiveMeds().filter(m => (m.slots ?? []).includes(slot)).map(m => m.id);
  editExtras     = [...(slotData.extras  ?? [])];
  editExtraMedId = '';
  editExtraDose  = '';
  pendingLogSlot = null;
  render();
}
```

### Step 4 — Use snapshot in `renderSlotEditForm()`

Find `renderSlotEditForm()` (~line 169). The current first two lines inside the function body:

```js
function renderSlotEditForm(slot, allSlotMeds, slotData) {
  const meds    = allSlotMeds;
  const skipped = editSkipped;
```

Replace `const meds = allSlotMeds;` so it resolves from the snapshot instead:

```js
function renderSlotEditForm(slot, allSlotMeds, slotData) {
  const meds    = editMeds.map(id => getMedById(id)).filter(Boolean);
  const skipped = editSkipped;
```

Everything else in `renderSlotEditForm()` stays the same — the checkboxes, dose display, extras rows, and "Add another" dropdown are all unchanged. The `allSlotMeds` parameter is now unused by the checkboxes but is still passed in; that's fine.

### Step 5 — Preserve snapshot in `saveSlotEdit()`

Find `saveSlotEdit()` (~line 605). Current body:

```js
function saveSlotEdit() {
  if (!editSlot || !editTime) return;
  const day = Data.getDay(currentDate);
  if (!day.med_slots) day.med_slots = defaultSlots();
  day.med_slots[editSlot] = { time: editTime, skipped: [...editSkipped], extras: [...editExtras] };
  editSlot = null;
  scheduleSave();
  render();
}
```

Replace the `day.med_slots[editSlot] = ...` line to also write `meds` back:

```js
function saveSlotEdit() {
  if (!editSlot || !editTime) return;
  const day = Data.getDay(currentDate);
  if (!day.med_slots) day.med_slots = defaultSlots();
  day.med_slots[editSlot] = {
    time:    editTime,
    meds:    [...editMeds],
    skipped: [...editSkipped],
    extras:  [...editExtras],
  };
  editSlot = null;
  scheduleSave();
  render();
}
```

### Step 6 — Manual verify

Log an AM slot, then tap on it to open the edit form:
- The checkboxes should show only the meds that were in AM **at the time of logging** — not any meds added afterward
- Add a new med to the AM slot in Settings, return to today, do NOT re-log
- The historical record's edit form should still show the original meds only ✓

Also verify: open the edit form for an old AM-logged day (before this fix, without a `meds` snapshot). It should fall back to the current live list (no crash, no missing checkboxes). ✓

### Step 7 — Commit

```bash
git add js/medications.js
git commit -m "fix(meds): use med snapshot in slot edit form, prevent new meds appearing on old days"
```

---

## Task 3 — Version bump

**Files:**
- Modify: `js/config.js`

### Step 1 — Bump version

Change `APP_VERSION` from `'2026.03.07h'` to `'2026.03.07i'`.

### Step 2 — Commit and push

```bash
git add js/config.js
git commit -m "chore: bump version to 2026.03.07i"
git push
```

---

## Files Changed Summary

| File | Change |
|---|---|
| `js/medications.js` | `logSlot()`: add `meds` snapshot; add `getMedById()` helper; add `editMeds` state; `openSlotEdit()`: load snapshot; `renderSlotEditForm()`: resolve from snapshot; `saveSlotEdit()`: persist snapshot |
| `js/config.js` | Version bump |

## Migration note

Old slot records without a `meds` field continue to work: `openSlotEdit()` falls back to the current live list (the old behaviour). No data migration needed.
