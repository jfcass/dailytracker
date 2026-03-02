# UX Tweaks: Collapse Defaults + Calm App Link — Design

**Date:** 2026-03-01

**Goal:** Three targeted UX improvements — collapse Health Log sections by default, make Settings cards collapsible (also collapsed by default), and add an "Open Calm" deep-link button on the Meditation habit row.

---

## 1 · Health Log — Collapse by Default

**File:** `js/health-log.js`

The collapse mechanism is already fully implemented. `collapsedSections` is a `Set` initialised as `new Set()` (all expanded). Change the initialisation to include all four section keys so every load starts with all sections collapsed:

```js
let collapsedSections = new Set(['bp', 'dig', 'meds', 'issues']);
```

No other changes needed. Toggle behaviour, CSS, and chevrons all already work.

---

## 2 · Settings — Collapsible Cards, Hidden by Default

**File:** `js/settings.js`

**State:** Add a module-level `Set` tracking which cards are expanded. Initialised with **no** keys (all collapsed by default). Resets to all-collapsed on each tab load.

```js
let expandedCards = new Set();   // empty = all collapsed
```

**`makeCard()` upgrade:** Accept a `key` string as second argument. Make the entire header a toggle button. Clicking it adds/removes the key from `expandedCards` and calls `render()`. Collapsed cards show only the header; expanded cards show the full card body.

Card keys: `'habits'`, `'substances'`, `'prn'`, `'tx'`, `'categories'`, `'display'`, `'account'`, `'fitbit'`

**Chevron:** Use the same `▾` / `▸` pattern as Health Log (rotate or swap based on expanded state).

**`buildXxxCard()` callers:** Each of the 8 `buildXxxCard()` functions calls `makeCard()`. Each will need to pass its key and only append body content when the card is expanded.

**`focusPrnMeds()` / `focusTxMeds()`:** These scroll-to helpers (called from Treatments tab when no meds are configured) should also **expand** the target card before scrolling, so the user sees the content.

---

## 3 · Meditation Habit — Open Calm Button

**File:** `js/habits.js`

**Detection:** In the `habits.forEach` loop inside `render()`, add a third named-habit branch:

```js
} else if (name.toLowerCase() === 'meditation') {
  list.appendChild(makeMeditationRow(name, day.habits[name] === true));
}
```

**`makeMeditationRow()`:** Identical to the standard `makeRow()` but with an extra inline "🧘 Open Calm" button appended to the row. The button calls:

```js
window.open('calm://', '_self');
```

`calm://` is Calm's documented iOS/Android URL scheme. If the app is installed, it opens immediately. If not, the call silently fails (no error, no redirect).

The button should be styled like the habit-row's secondary action area — small, muted, doesn't interfere with the habit toggle click target.

**Name matching note:** Matches case-insensitively on `"meditation"`. If the habit is renamed, the special row stops rendering and it falls back to the plain `makeRow()`. This is consistent with how "reading" and "gym" are handled.

---

## Scope Summary

| Item | File | Lines changed (est.) |
|------|------|----------------------|
| Health Log collapse default | `health-log.js` | 1 |
| Settings collapsible cards | `settings.js` | ~60 (makeCard upgrade + 8 callers) |
| Meditation → Calm button | `habits.js` | ~25 |
