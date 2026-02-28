# Visual Refresh — Icon Palette Carry-Through
**Date:** 2026-02-25
**Scope:** Full visual refresh — colors, gradient, typography

---

## Goal

Carry the app icon's visual language (teal→gold gradient, clean rounded aesthetic) throughout the app. Approach: **A+** — gradient on identity moments and completion moments, flat teal everywhere else.

---

## Color Tokens

### New / changed tokens (`css/styles.css`)

| Token | Light | Dark | Replaces |
|---|---|---|---|
| `--clr-accent` | `#1ABEA5` | `#22D4B8` | `#3d9142` / `#52b356` |
| `--clr-accent-h` | `#17a691` | `#1fbfa9` | `#317336` / `#66bb6a` |
| `--clr-accent-dim` | `#e0f7f4` | `#0d2e2a` | `#e6f4e7` / `#1a2e1b` |
| `--gradient-brand` | `linear-gradient(135deg, #1ABEA5 0%, #F4A800 100%)` | same | — |

The gradient is identical in light and dark mode — it's vivid enough to hold up on both surfaces.

---

## Typography

- **Replace:** `Inter` (generic)
- **With:** `Figtree` (rounded geometric sans, warm terminals, Google Fonts)
- **Weights:** 400, 500, 600, 700
- **Changes:** `<link>` in `index.html`, `font-family` in `styles.css`

---

## Gradient Application — "A+" Approach

### Identity moments (brand presence)
1. **Auth screen app logo** — replace heartbeat SVG with bold checkmark SVG using SVG `<linearGradient>` stroke
2. **Header app logo** — same checkmark, smaller (24px)
3. **Loading spinner** — replace `border-top-color: accent` with conic-gradient approach
4. **Active tab indicator** — nav tab active state uses `--gradient-brand`

### Completion moments (earned through interaction)
5. **Habit checkmarks (checked state)** — gradient background on `.habit-btn--checked`
6. **Progress bar fills** — `.progress-bar__fill { background: var(--gradient-brand) }`
7. **Filled PIN dots** — `.pin-dot--filled { background: var(--gradient-brand) }`
8. **Primary action buttons** — `.btn-primary` uses gradient background

### Stays flat teal (structural)
- Section header icons
- Focus rings (`outline: 2px solid var(--clr-accent)`)
- Borders and dividers
- Text-color accents (`color: var(--clr-accent)`)
- `--clr-key-bg` tints (PIN keypad keys)

---

## Files Changed

| File | Changes |
|---|---|
| `index.html` | Google Fonts link → Figtree; auth logo SVG → gradient checkmark; header logo SVG |
| `css/styles.css` | Color tokens; `--gradient-brand`; font-family; spinner; progress bar; PIN dot; tab indicator |
| `js/habits.js` | Verify `.habit-btn--checked` uses CSS class (no inline style to override) |

---

## Out of Scope

- Layout / spacing changes
- Dark mode restructure (tokens update in-place)
- Any new UI components
- Phase 6/7 features
