# Icon Visual Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Carry the app icon's teal→gold gradient palette and Figtree typography throughout the app using the "A+" approach (gradient on identity + completion moments).

**Architecture:** CSS token swap (green→teal), new `--gradient-brand` token applied to 6 targeted elements, SVG logo replacement, font swap. No layout changes, no JS changes.

**Tech Stack:** Vanilla CSS custom properties, Google Fonts, SVG linearGradient

**Design doc:** `docs/plans/2026-02-25-icon-visual-refresh-design.md`

---

## Task 1: Update typography (Inter → Figtree)

**Files:**
- Modify: `index.html` line 14
- Modify: `css/styles.css` line 97–98

**Step 1: Update Google Fonts link in `index.html`**

Replace the existing Inter font link (line 14):
```html
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet">
```

**Step 2: Update font-family in `css/styles.css`**

At line 97, replace:
```css
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
               "Helvetica Neue", Arial, sans-serif;
```
With:
```css
  font-family: "Figtree", -apple-system, BlinkMacSystemFont, "Segoe UI",
               "Helvetica Neue", Arial, sans-serif;
```

**Step 3: Verify**

Open app in browser. Text should render in Figtree — slightly rounder letterforms than Inter, noticeable on headings and numbers. Check DevTools computed font to confirm.

**Step 4: Commit**
```bash
git add index.html css/styles.css
git commit -m "style: replace Inter with Figtree font"
```

---

## Task 2: Update light-mode color tokens

**Files:**
- Modify: `css/styles.css` lines 7–37 (`:root` block)

**Step 1: Replace accent tokens and add gradient**

In the `:root` block, find and replace these lines:

Old:
```css
  /* Accent — green */
  --clr-accent:     #3d9142;
  --clr-accent-h:   #317336;     /* hover / pressed */
  --clr-accent-dim: #e6f4e7;

  /* PIN key */
  --clr-key-bg:     #eef2ee;
  --clr-key-bg-h:   #dce8dc;
```

New:
```css
  /* Accent — teal (from app icon) */
  --clr-accent:        #1ABEA5;
  --clr-accent-h:      #17a691;   /* hover / pressed */
  --clr-accent-dim:    #e0f7f4;
  --gradient-brand:    linear-gradient(135deg, #1ABEA5 0%, #F4A800 100%);

  /* PIN key */
  --clr-key-bg:     #e5f5f3;
  --clr-key-bg-h:   #c8ece8;
```

**Step 2: Verify**

Reload app. All previously-green elements (section icons, borders, save-status, focus rings) should now be teal. No green should remain.

**Step 3: Commit**
```bash
git add css/styles.css
git commit -m "style: update light-mode accent tokens to teal palette"
```

---

## Task 3: Update dark-mode color tokens (both blocks)

**Files:**
- Modify: `css/styles.css` lines 39–62 (`@media prefers-color-scheme: dark` block)
- Modify: `css/styles.css` lines 65–86 (`[data-theme="dark"]` block)

**Step 1: Update the `@media` dark block**

Find the `@media (prefers-color-scheme: dark)` block. Replace these lines:
```css
    --clr-accent:     #52b356;
    --clr-accent-h:   #66bb6a;
    --clr-accent-dim: #1a2e1b;

    --clr-key-bg:     #202820;
    --clr-key-bg-h:   #2a362a;
```
With:
```css
    --clr-accent:        #22D4B8;
    --clr-accent-h:      #1fbfa9;
    --clr-accent-dim:    #0d2e2a;
    --gradient-brand:    linear-gradient(135deg, #1ABEA5 0%, #F4A800 100%);

    --clr-key-bg:     #0f2826;
    --clr-key-bg-h:   #163d39;
```

**Step 2: Update the `[data-theme="dark"]` block**

Apply the exact same replacement in the `[data-theme="dark"]` block (lines 65–86).

**Step 3: Verify**

Switch device/browser to dark mode or use DevTools to force dark mode. Teal should be brighter/lighter (`#22D4B8`) for legibility on dark surfaces. PIN keys should have a teal-tinted dark background.

**Step 4: Commit**
```bash
git add css/styles.css
git commit -m "style: update dark-mode accent tokens to teal palette"
```

---

## Task 4: Apply gradient to habit checkmarks

**Files:**
- Modify: `css/styles.css` lines 713–717 (`.habit-row--checked .habit-check`)

**Step 1: Update the checked state**

Find:
```css
.habit-row--checked .habit-check {
  background:   var(--clr-accent);
  border-color: var(--clr-accent);
  color:        #fff;
  animation:    habit-pop 0.35s ease both;
}
```

Replace with:
```css
.habit-row--checked .habit-check {
  background:   var(--gradient-brand);
  border-color: transparent;
  color:        #fff;
  animation:    habit-pop 0.35s ease both;
}
```

**Step 2: Verify**

Open Today tab. Check off a habit. The circle should animate in with the teal→gold gradient. Uncheck and recheck to confirm the animation replays.

**Step 3: Commit**
```bash
git add css/styles.css
git commit -m "style: gradient on habit checkmarks"
```

---

## Task 5: Apply gradient to progress bar fills

**Files:**
- Modify: `css/styles.css` line 596 (`.progress-bar__fill`)
- Modify: `css/styles.css` line 2490 (`.book-card-progress-fill`) — reading progress bar
- Modify: `css/styles.css` line 2640 (`.book-sel-progress-fill`) — book session progress bar
- Modify: `css/styles.css` line 3757 (habits report bar)

**Step 1: Update `.progress-bar__fill`**

Find:
```css
.progress-bar__fill {
  height:        100%;
  background:    var(--clr-accent);
```
Change `background: var(--clr-accent)` to `background: var(--gradient-brand)`.

**Step 2: Update book progress fills**

Find `.book-card-progress-fill` and `.book-sel-progress-fill` (search for `book-card-progress-fill` and `book-sel-progress-fill`). Change `background: var(--clr-accent)` to `background: var(--gradient-brand)` in each.

**Step 3: Update reports habit bar**

Find the rule near line 3757 that has `background: var(--clr-accent)` inside a `transition: width` context. Change to `background: var(--gradient-brand)`.

**Step 4: Verify**

On Today tab, habits section header should show the small gradient progress bar. Check off some habits and confirm it fills with the teal→gold gradient.

**Step 5: Commit**
```bash
git add css/styles.css
git commit -m "style: gradient on progress bar fills"
```

---

## Task 6: Apply gradient to filled PIN dots

**Files:**
- Modify: `css/styles.css` lines 312–314 (`.pin-dot--filled`)

**Step 1: Update filled dot**

Find:
```css
.pin-dot--filled {
  background: var(--clr-accent);
  transform: scale(1.15);
}
```

Replace `background: var(--clr-accent)` with `background: var(--gradient-brand)`.

**Step 2: Verify**

Sign out and back in to reach PIN entry screen. Enter digits — each dot should fill with the teal→gold gradient.

**Step 3: Commit**
```bash
git add css/styles.css
git commit -m "style: gradient on PIN dots"
```

---

## Task 7: Replace spinner with gradient conic spinner

**Files:**
- Modify: `css/styles.css` lines 247–258 (`.spinner`)

**Step 1: Replace spinner styles**

Find:
```css
.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--clr-border);
  border-top-color: var(--clr-accent);
  border-radius: 50%;
  animation: spin 0.85s linear infinite;
}
```

Replace with:
```css
.spinner {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: conic-gradient(from 0deg, #1ABEA5 0%, #F4A800 70%, transparent 70%);
  -webkit-mask: radial-gradient(farthest-side, transparent 84%, white 85%);
  mask: radial-gradient(farthest-side, transparent 84%, white 85%);
  animation: spin 0.85s linear infinite;
}
```

**Step 2: Verify**

Trigger the loading screen (refresh the app after auth). The spinner should be a gradient arc (teal→gold) that rotates. If the mask renders incorrectly (full circle instead of ring), adjust the percentage: try `82%` / `83%` instead.

**Step 3: Commit**
```bash
git add css/styles.css
git commit -m "style: gradient conic spinner"
```

---

## Task 8: Apply gradient indicator to active nav tab

**Files:**
- Modify: `css/styles.css` lines 3576–3578 (`.bottom-nav-btn--active`)

**Step 1: Add gradient top-bar to active tab**

Find:
```css
.bottom-nav-btn--active {
  color: var(--clr-accent);
}
```

Replace with:
```css
.bottom-nav-btn--active {
  color: var(--clr-accent);
  position: relative;
}

.bottom-nav-btn--active::before {
  content: '';
  position: absolute;
  top: 0;
  left: 25%;
  right: 25%;
  height: 2.5px;
  background: var(--gradient-brand);
  border-radius: 0 0 3px 3px;
}
```

**Step 2: Verify**

Tap between tabs. The active tab should show a small teal→gold bar at the top of the nav button, plus the teal icon/label color. The indicator should move instantly between tabs.

**Step 3: Commit**
```bash
git add css/styles.css
git commit -m "style: gradient indicator on active nav tab"
```

---

## Task 9: Replace auth screen logo with gradient checkmark SVG

**Files:**
- Modify: `index.html` lines 31–38 (`.app-logo` SVG in `#screen-auth`)

**Step 1: Replace the SVG**

Find the `.app-logo` block in `#screen-auth` (currently a heartbeat/pulse polyline). Replace the entire SVG with:

```html
<div class="app-logo" aria-hidden="true">
  <svg viewBox="0 0 24 24" fill="none" width="56" height="56"
       stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <defs>
      <linearGradient id="logo-grad-auth" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#1ABEA5"/>
        <stop offset="100%" stop-color="#F4A800"/>
      </linearGradient>
    </defs>
    <polyline stroke="url(#logo-grad-auth)" points="20 6 9 17 4 12"/>
  </svg>
</div>
```

**Step 2: Update `.app-logo` CSS**

The current `.app-logo` sets `color: var(--clr-accent)` which applied via `currentColor`. The new SVG uses `stroke="url(#logo-grad-auth)"` directly — so `color` on the container is no longer needed, but keep it for any future SVG fallbacks.

**Step 3: Verify**

Auth screen should show a bold gradient checkmark (teal at bottom-left, gold at top-right) — mirroring the app icon. The gradient angle should feel like it matches the icon.

**Step 4: Commit**
```bash
git add index.html
git commit -m "style: gradient checkmark logo on auth screen"
```

---

## Task 10: Replace header logo with gradient checkmark SVG

**Files:**
- Modify: `index.html` — `.app-header__logo` SVG block (search for `app-header__logo`)

**Step 1: Find the header logo**

Search `index.html` for `app-header__logo`. It contains a small SVG (likely the same heartbeat icon, 20–24px). Replace it with:

```html
<div class="app-header__logo" aria-hidden="true">
  <svg viewBox="0 0 24 24" fill="none" width="22" height="22"
       stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <defs>
      <linearGradient id="logo-grad-header" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#1ABEA5"/>
        <stop offset="100%" stop-color="#F4A800"/>
      </linearGradient>
    </defs>
    <polyline stroke="url(#logo-grad-header)" points="20 6 9 17 4 12"/>
  </svg>
</div>
```

Note: The gradient ID must be unique (`logo-grad-header` vs `logo-grad-auth`) to avoid SVG ID collision when both screens are in the DOM simultaneously.

**Step 2: Verify**

In the main app view, the header should show a small gradient checkmark next to "Daily Tracker". Compare it visually to the auth screen — both should feel consistent.

**Step 3: Commit**
```bash
git add index.html
git commit -m "style: gradient checkmark logo in app header"
```

---

## Task 11: Final review pass

**Step 1: Full visual QA checklist**

Check each item in both light and dark mode:

- [ ] Font: text renders in Figtree (rounded, slightly warmer than Inter)
- [ ] Accent color: all flat teal (no green remains anywhere)
- [ ] Auth screen: gradient checkmark logo
- [ ] PIN screen: PIN dots fill with gradient, PIN keys have teal-tinted background
- [ ] Header: gradient checkmark logo
- [ ] Today tab: habits checkmarks gradient when checked
- [ ] Today tab: habits progress bar fills with gradient
- [ ] Nav bar: active tab has gradient top indicator
- [ ] Loading screen: gradient arc spinner
- [ ] Dark mode: accent teal is `#22D4B8` (brighter), gradient unchanged

**Step 2: Check for any remaining green**

Search for any hardcoded green hex values that weren't covered:
```bash
grep -n "#3d9142\|#317336\|#52b356\|#66bb6a\|#e6f4e7\|#1a2e1b\|#202820\|#2a362a\|#eef2ee\|#dce8dc" css/styles.css
```
Should return no matches.

**Step 3: Final commit**
```bash
git add -A
git commit -m "style: complete icon visual refresh (teal+gold palette, Figtree, gradients)"
```
