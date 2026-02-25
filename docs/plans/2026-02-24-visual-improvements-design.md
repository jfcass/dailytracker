# Visual Improvements Design
**Date:** 2026-02-24
**Status:** Approved

## Overview

A set of visual improvements covering mobile font fixes, polish, and two new UI features (progress ring + mood badge redesign). No new data schema changes required.

---

## Section 1 — Fixes

### Viewport
- Remove `maximum-scale=1.0, user-scalable=no` from the viewport meta tag in `index.html`
- Keep: `width=device-width, initial-scale=1.0`

### Base font size
- Set `html { font-size: 17px }` globally
- Override to `font-size: 16px` at `@media (min-width: 600px)`
- This makes all `rem` values scale up correctly on mobile without changing desktop feel

### Small text floor
- All selectors with `font-size` below `0.85rem` get bumped to `0.85rem`
- Affected: `.auth-note` (0.77→0.85), `.error-msg` (0.82→0.85), `.save-status` (0.72→0.85), `.habit-streak--one` (0.72→0.85), `.section-progress__text` (0.78→0.85), `.mod-badge` (0.76→0.85)

### Touch targets
- `min-height: 44px` on: `.btn-google`, `.date-nav__btn`, `.habit-row`, `.mod-display`, `.pin-key`
- `min-width: 44px` on `.date-nav__btn`

---

## Section 2 — Polish

### Font: Inter via Google Fonts
- Add to `index.html` `<head>` (before styles.css):
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  ```
- Update `font-family` in `html, body` to: `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

### Warmer green accent
- Light mode: `--clr-accent: #3d9142` (was `#3a8f40`), `--clr-accent-h: #317336`
- Dark mode: `--clr-accent: #52b356` (was `#4caf50`), `--clr-accent-h: #66bb6a`

### Auth card header gradient
- Inside `.center-card`, wrap the logo + title + subtitle in a `<div class="center-card__hero">` (HTML change)
- CSS: subtle top-to-bottom gradient from `var(--clr-accent-dim)` to `var(--clr-surface)`, full-width, negative margin to bleed to card edges, `border-radius` matched to card top

### PIN key press depth
- Add to `.pin-key:active`: `box-shadow: inset 0 2px 5px rgba(0,0,0,.18)`
- Existing `transform: scale(0.88)` is kept

### Habit checkbox bounce
- New CSS keyframe `@keyframes habit-pop`:
  `0% scale(1) → 30% scale(1.3) → 60% scale(0.9) → 80% scale(1.1) → 100% scale(1)`
- Apply via `.habit-row--checked .habit-check` on transition: `animation: habit-pop 0.35s ease`
- Use `animation-fill-mode: both` to avoid flicker on uncheck

---

## Section 3 — Bigger Ideas

### Progress ring (SVG donut)
- **Placement:** New `<div id="today-ring-bar">` inserted in `index.html` inside `#tab-today`, directly after `.app-date-bar` and before `#section-habits`
- **HTML:** A compact horizontal banner card (not full-height card), containing:
  - An inline SVG donut ring (80×80px), two `<circle>` elements: track + progress arc
  - Text overlay: count (e.g. `3/5`) and label "habits"
- **CSS:** `.today-ring-bar` — surface card, horizontal flex, `padding: 12px 16px`, `border-radius: 14px`
- **JS (`habits.js`):** `updateRingBar(done, total)` function called whenever habit state changes
  - Calculates `stroke-dashoffset` on the progress circle from percentage
  - Animates via CSS `transition: stroke-dashoffset 0.4s ease`
  - Hides the ring bar when there are no habits configured

### Mood/severity badge redesign
- **Mood buttons (selected state):** When a mood/energy button is selected (`.mood-btn--selected`), it gets: `background: var(--mood-clr)`, `color: #fff`, `border-radius: 20px` (pill), `font-weight: 700`
- **Unselected state:** Ghost style — `background: transparent`, `border: 1.5px solid var(--clr-border)`, `color: var(--clr-text-2)`
- **Severity display** (symptoms section): Where severity is displayed as a number, wrap in `<span class="severity-badge" data-sev="N">N</span>` and style with background color per severity level (1=green → 5=red), white text, pill shape

---

## Files Changed

| File | Changes |
|------|---------|
| `index.html` | Viewport fix, Google Fonts links, center-card hero wrapper, today-ring-bar HTML |
| `css/styles.css` | Font, accent colors, touch targets, small text floor, card gradient, PIN shadow, habit bounce, ring bar, mood badge redesign |
| `js/habits.js` | `updateRingBar()` function, call on every habit toggle and on render |
| `js/mood.js` | Selected state class toggle updates for badge style (if not already done) |

---

## Out of Scope
- Date week-strip navigation (deferred)
- Any changes to data schema or Drive sync
