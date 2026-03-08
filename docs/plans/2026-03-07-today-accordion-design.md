# Today Tab Accordion Mode — Design Doc

**Date:** 2026-03-07
**Status:** Approved

---

## Overview

Add an opt-in "accordion mode" for the Today tab that enforces one section open at a time. When enabled, opening any collapsed section automatically collapses all other currently-open sections. The feature is toggled in Settings → Account card and stored in the Drive JSON.

---

## Setting

**Key:** `settings.today_accordion`
**Type:** boolean
**Default:** `false` (existing multi-open behaviour unchanged)
**Storage:** Drive JSON alongside other settings fields

---

## UX Behaviour

| Mode | Opening a section | Closing a section |
|------|------------------|-------------------|
| Off (default) | Section opens, others unchanged | Section closes |
| On | Section opens, all others collapse | Section closes |

- Tapping an already-open section always closes it (no change).
- The Medications section on the Today tab is a full-screen modal (not a collapsible section), so it is unaffected.
- `localStorage` state (`ht_collapsed`) continues to be the source of truth for which sections are open/closed; the accordion logic just manipulates that state before persisting.

---

## Settings UI

Location: **Settings → Account card** (between PIN Lock and Google Account rows).

Row layout (matches existing `stg-action-row` pattern):
```
┌─────────────────────────────────────────┐
│ Accordion sections          [ On | Off ] │
│ One section open at a time              │
└─────────────────────────────────────────┘
```

Uses the existing `stg-toggle-group` / `stg-toggle-btn` / `stg-toggle-btn--active` pattern with two buttons: **On** and **Off**. No new CSS required.

---

## Implementation Surface

### `js/settings.js` — `buildAccountCard()`

Add an accordion row after the PIN row and before the sign-out row:

```js
const accordionRow = document.createElement('div');
accordionRow.className = 'stg-action-row';
const isOn = !!(Data.getSettings().today_accordion);
accordionRow.innerHTML = `
  <div class="stg-action-info">
    <div class="stg-action-title">Accordion sections</div>
    <div class="stg-action-desc">One section open at a time</div>
  </div>
  <div class="stg-toggle-group" role="group" aria-label="Accordion mode">
    <button class="stg-toggle-btn${isOn  ? ' stg-toggle-btn--active' : ''}"
            data-val="on"  type="button">On</button>
    <button class="stg-toggle-btn${!isOn ? ' stg-toggle-btn--active' : ''}"
            data-val="off" type="button">Off</button>
  </div>
`;
accordionRow.querySelectorAll('.stg-toggle-btn').forEach(btn =>
  btn.addEventListener('click', () => {
    Data.getSettings().today_accordion = (btn.dataset.val === 'on');
    render(); scheduleSave();
  })
);
body.appendChild(accordionRow); // insert before signOutRow
```

### `js/app.js` — `toggleSection(id)`

The existing function adds/removes `id` from `collapsedSections` and writes to localStorage. When toggling a section **open** (removing from the collapsed set) and accordion mode is on, first collapse all other currently-open sections:

```js
function toggleSection(id) {
  if (collapsedSections.has(id)) {
    // Opening this section
    collapsedSections.delete(id);

    // Accordion mode: collapse every other open section
    if (Data.getSettings().today_accordion) {
      document.querySelectorAll('.tracker-section').forEach(sec => {
        if (sec.id && sec.id !== id) collapsedSections.add(sec.id);
      });
    }
  } else {
    collapsedSections.add(id);
  }
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsedSections]));
  // existing DOM update follows...
}
```

---

## Schema Change

`settings.today_accordion` is a new optional boolean field. Absent = `false` (off). No migration needed — `Data.getSettings().today_accordion ?? false` handles missing values gracefully.

---

## Files Changed

| File | Change |
|------|--------|
| `js/settings.js` | Add accordion toggle row to `buildAccountCard()` |
| `js/app.js` | Modify `toggleSection()` to enforce accordion when setting is on |
| `js/config.js` | Version bump |

No CSS changes required.

---

## Out of Scope

- Settings cards accordion — left as-is (multi-open).
- Meds-manage groups accordion — left as-is (multi-open).
- Health Log subsections — left as-is.
