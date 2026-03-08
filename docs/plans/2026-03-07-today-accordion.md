# Today Tab Accordion Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an opt-in "accordion mode" setting that collapses all other Today-tab sections when one is opened.

**Architecture:** Single boolean `settings.today_accordion` stored in Drive JSON. `toggleSection()` in `app.js` checks the setting when opening a section and collapses all others. Toggle UI lives in the Account card in Settings.

**Tech Stack:** Vanilla JS, no build step. `Data.getSettings()` for Drive-backed settings. `localStorage` (`ht_collapsed` key) + in-memory `collapsedSections` Set for Today tab state.

**Design doc:** `docs/plans/2026-03-07-today-accordion-design.md`

---

### Task 1: Modify `toggleSection()` in `app.js`

**Files:**
- Modify: `js/app.js:37-46`

`toggleSection(id)` currently looks like this (lines 37–46):

```js
function toggleSection(id) {
  if (collapsedSections.has(id)) {
    collapsedSections.delete(id);
  } else {
    collapsedSections.add(id);
  }
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsedSections]));
  const sec = document.getElementById(id);
  if (sec) sec.classList.toggle('tracker-section--collapsed', collapsedSections.has(id));
}
```

Replace the entire function with:

```js
function toggleSection(id) {
  if (collapsedSections.has(id)) {
    // Closing a section — straightforward
    collapsedSections.delete(id);
  } else {
    // Opening a section
    collapsedSections.add(id);  // wait — this is the OLD path (adding = collapsing)
  }
  // ...
}
```

Wait — re-read the logic. `collapsedSections` is a Set of **collapsed** section IDs.
- `collapsedSections.has(id)` → section is currently collapsed → clicking opens it → **delete** from set
- `!collapsedSections.has(id)` → section is currently open → clicking closes it → **add** to set

So "opening" = deleting from the set. The accordion logic fires when we **delete** `id` (opening it).

Replace the full function body:

```js
function toggleSection(id) {
  if (collapsedSections.has(id)) {
    // Opening this section
    collapsedSections.delete(id);
    // Accordion mode: collapse all other currently-open sections
    if (Data.getSettings().today_accordion) {
      document.querySelectorAll('.tracker-section[id]').forEach(sec => {
        if (sec.id !== id) collapsedSections.add(sec.id);
      });
    }
  } else {
    // Closing this section
    collapsedSections.add(id);
  }
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsedSections]));
  if (Data.getSettings().today_accordion) {
    // Re-apply all collapsed states when accordion fires
    applyCollapsedState();
  } else {
    const sec = document.getElementById(id);
    if (sec) sec.classList.toggle('tracker-section--collapsed', collapsedSections.has(id));
  }
}
```

**Step 1: Apply the edit**

In `js/app.js`, find the existing `toggleSection` function (lines 37–46) and replace it with the code above.

**Step 2: Manual smoke test (accordion OFF — default)**

Open the app. Verify sections still open/close independently with no change in default behaviour. Open Habits, then open Mood — both should remain open.

**Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat: accordion mode in toggleSection() — collapses others when setting on"
```

---

### Task 2: Add accordion toggle row to Settings → Account card

**Files:**
- Modify: `js/settings.js` — inside `buildAccountCard()` at approximately line 686 (after `pinRow` is appended, before `signOutRow` is appended)

The Account card body currently appends:
1. `pinRow` (PIN Lock)
2. `signOutRow` (Google Account / Sign Out)

Insert a new `accordionRow` between them. Add this block after `body.appendChild(pinRow);` and before `body.appendChild(signOutRow);`:

```js
// Accordion sections toggle
const accordionRow = document.createElement('div');
accordionRow.className = 'stg-action-row';
const accordionOn = !!(Data.getSettings().today_accordion);
accordionRow.innerHTML = `
  <div class="stg-action-info">
    <div class="stg-action-title">Accordion sections</div>
    <div class="stg-action-desc">One section open at a time</div>
  </div>
  <div class="stg-toggle-group" role="group" aria-label="Accordion mode">
    <button class="stg-toggle-btn${accordionOn ? ' stg-toggle-btn--active' : ''}"
            data-val="on" type="button">On</button>
    <button class="stg-toggle-btn${!accordionOn ? ' stg-toggle-btn--active' : ''}"
            data-val="off" type="button">Off</button>
  </div>
`;
accordionRow.querySelectorAll('.stg-toggle-btn').forEach(btn =>
  btn.addEventListener('click', () => {
    Data.getSettings().today_accordion = (btn.dataset.val === 'on');
    render();
    scheduleSave();
  })
);
body.appendChild(accordionRow);
```

**Step 1: Apply the edit**

In `js/settings.js` inside `buildAccountCard()`, insert the code above between `body.appendChild(pinRow);` and `body.appendChild(signOutRow);`.

**Step 2: Manual smoke test**

Open Settings → Account card (expand it). Verify the new "Accordion sections" row appears with On/Off buttons. "Off" should be active (highlighted) by default.

Toggle to **On**. Go to Today tab. Collapse all sections, then open one — all others should remain collapsed. Open a second one — the first should auto-collapse.

Toggle back to **Off** in Settings. Verify multi-open works again.

**Step 3: Commit**

```bash
git add js/settings.js
git commit -m "feat: add accordion mode toggle to Settings → Account card"
```

---

### Task 3: Version bump + push

**Files:**
- Modify: `js/config.js:1`

Change:
```js
const APP_VERSION = '2026.03.07n';
```
to:
```js
const APP_VERSION = '2026.03.07o';
```

**Step 1: Apply the edit**

**Step 2: Commit and push**

```bash
git add js/config.js
git commit -m "2026.03.07o — today tab accordion mode"
git push
```
