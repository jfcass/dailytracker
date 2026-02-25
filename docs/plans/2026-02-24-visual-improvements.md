# Visual Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply all approved visual improvements: mobile font fix, Inter font, warmer green, touch targets, auth gradient, PIN depth, habit bounce, progress ring, and mood pill badges.

**Architecture:** Pure CSS/HTML/JS changes. No build step. Verify each task by opening `http://localhost:8080` in a browser (run `npx serve .` from the project root). The app requires Google auth to reach the main screen — for visual-only changes, the auth/PIN screens can be verified without login.

**Tech Stack:** Vanilla HTML5, CSS custom properties, SVG, vanilla JS (IIFE modules).

**Design doc:** `docs/plans/2026-02-24-visual-improvements-design.md`

---

## Task 1: Fix Viewport + Base Font Size

**Files:**
- Modify: `index.html:5`
- Modify: `css/styles.css:95-107`

**Step 1: Fix the viewport tag**

In `index.html` line 5, replace:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
```
With:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```
(Remove `maximum-scale` and `user-scalable` — these blocked accessibility zoom and don't help prevent the small-text problem.)

**Step 2: Bump base font size for mobile**

In `css/styles.css`, the `html, body` rule currently starts at line 95:
```css
html, body {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
               "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
  ...
}
```

Change `font-size: 16px` to `font-size: 17px`.

Then find the existing `@media (min-width: 600px)` block (around line 502–506) and add the desktop font override inside it:
```css
@media (min-width: 600px) {
  .app-main {
    padding: 20px 24px;
  }
  html {
    font-size: 16px;
  }
}
```

**Step 3: Verify**

Open `http://localhost:8080` in a real mobile browser or DevTools device mode. The auth screen text should be noticeably larger. On a desktop browser at full width, text should feel the same as before.

**Step 4: Commit**
```bash
git add index.html css/styles.css
git commit -m "fix: increase mobile font size and remove user-scalable viewport restriction"
```

---

## Task 2: Small Text Floor

**Files:**
- Modify: `css/styles.css` (multiple selectors)

These selectors have `font-size` below `0.85rem`. Bump each to `0.85rem`. Find them by line number (use your editor search for the selector name to confirm):

| Selector | Current | Line | Change to |
|---|---|---|---|
| `.auth-note` | `0.77rem` | 219 | `0.85rem` |
| `.error-msg` | `0.82rem` | 226 | `0.85rem` |
| `.btn-ghost` | `0.82rem` | 382 | `0.85rem` |
| `.section-progress__text` | `0.78rem` | 559 | `0.85rem` |
| `.habit-streak` | `0.78rem` | 715 | `0.85rem` |
| `.habit-streak--one` | `0.72rem` | 723 | `0.82rem` (slightly smaller than main streak is intentional) |
| `.save-status` | `0.72rem` | 732 | `0.82rem` (feedback text, can stay subtle) |
| `.mod-badge` | `0.76rem` | 791 | `0.85rem` |
| `.mod-log-btn` | `0.82rem` | 865 | `0.85rem` |
| `.mod-note` | `0.78rem` | 886 | `0.85rem` |
| `.mod-clear-btn` | `0.78rem` | 907 | `0.85rem` |
| `.mood-row__label` | `0.82rem` | 3947 | `0.85rem` |
| `.mood-btn` | `0.82rem` | 3967 | `0.85rem` |
| `.mood-row__value` | `0.78rem` | 3986 | `0.85rem` |

**Step 1: Apply all changes listed above** (one Edit call per selector)

**Step 2: Verify**

Reload the app. All labels and secondary text should be legible without squinting. The habit section's streak badges, save status, and moderation badges should all be readable.

**Step 3: Commit**
```bash
git add css/styles.css
git commit -m "fix: enforce 0.85rem minimum text size across UI"
```

---

## Task 3: Touch Target Sizes

**Files:**
- Modify: `css/styles.css`

**Step 1: Add min-height/min-width to interactive elements**

Find and update these selectors:

`.btn-google` (around line 180) — add `min-height: 44px;`

`.date-nav__btn` (around line 602) — add `min-width: 44px; min-height: 44px;`

`.pin-key` (around line 337) — already uses `aspect-ratio: 1` with a grid, so add `min-height: 44px;`

`.mood-btn` (around line 3960) — change from fixed `width: 36px; height: 36px` to `min-width: 36px; min-height: 44px;` (keep width but make taller tap target)

**Step 2: Verify**

On mobile DevTools, use the "Accessibility" tab or measure tap targets. All interactive elements should show ≥44px height.

**Step 3: Commit**
```bash
git add css/styles.css
git commit -m "fix: ensure 44px minimum touch targets on mobile"
```

---

## Task 4: Inter Font

**Files:**
- Modify: `index.html` (head section, before `<link rel="stylesheet" href="css/styles.css">`)
- Modify: `css/styles.css:97-98`

**Step 1: Add Google Fonts link tags to `index.html`**

Insert these three lines immediately before the `<link rel="stylesheet" href="css/styles.css">` line:
```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

**Step 2: Update `font-family` in `css/styles.css`**

Find the `html, body` rule (around line 95). Change the `font-family` line from:
```css
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
               "Helvetica Neue", Arial, sans-serif;
```
To:
```css
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
               "Helvetica Neue", Arial, sans-serif;
```

**Step 3: Verify**

Open the app with internet access. In DevTools → Elements, inspect `<body>` and confirm the computed font-family is "Inter". The text should look slightly crisper and more geometric than before.

**Step 4: Commit**
```bash
git add index.html css/styles.css
git commit -m "style: add Inter font via Google Fonts CDN"
```

---

## Task 5: Warmer Green Accent

**Files:**
- Modify: `css/styles.css` (`:root` block around line 7, and dark mode block around line 39)

**Step 1: Update light mode accent**

In the `:root` block (line ~19–20), change:
```css
  --clr-accent:     #3a8f40;
  --clr-accent-h:   #2d7233;
```
To:
```css
  --clr-accent:     #3d9142;
  --clr-accent-h:   #317336;
```

**Step 2: Update dark mode accent**

In the `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` block (around line 49–50), change:
```css
    --clr-accent:     #4caf50;
    --clr-accent-h:   #66bb6a;
```
To:
```css
    --clr-accent:     #52b356;
    --clr-accent-h:   #66bb6a;
```

Also update the explicit dark override block `[data-theme="dark"]` with the same values.

**Step 3: Verify**

The app's green (buttons, checkmarks, progress bars, ring) should look slightly warmer/more natural, less clinical.

**Step 4: Commit**
```bash
git add css/styles.css
git commit -m "style: warm up green accent color"
```

---

## Task 6: Auth Card Hero Gradient + PIN Key Depth

**Files:**
- Modify: `css/styles.css`

### Part A — Auth card gradient

**Step 1: Update `.center-card` in `css/styles.css`** (around line 141)

Find the `.center-card` rule. Add a gradient to the `background` property:
```css
.center-card {
  width: 100%;
  max-width: 360px;
  background: linear-gradient(
    to bottom,
    var(--clr-accent-dim) 0%,
    var(--clr-surface) 180px
  );
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  padding: 40px 32px 36px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
}
```
(Replace `background: var(--clr-surface);` with the gradient above.)

### Part B — PIN key press depth

**Step 2: Update `.pin-key:active`** (around line 361)

Find:
```css
.pin-key:active {
  transform: scale(0.88);
  background: var(--clr-key-bg-h);
}
```
Change to:
```css
.pin-key:active {
  transform: scale(0.88);
  background: var(--clr-key-bg-h);
  box-shadow: inset 0 2px 5px rgba(0, 0, 0, .18);
}
```

**Step 3: Verify**

Auth screen should have a subtle green-tinted top fading into white (or dark surface). PIN keys should feel slightly "pressed in" with a shadow when tapped.

**Step 4: Commit**
```bash
git add css/styles.css
git commit -m "style: add auth card gradient and PIN key press depth"
```

---

## Task 7: Habit Checkbox Bounce Animation

**Files:**
- Modify: `css/styles.css`

**Step 1: Add the keyframe**

Find the existing `@keyframes pin-shake` block (around line 313). Insert a new keyframe **before** it:
```css
/* Bounce pop on habit check */
@keyframes habit-pop {
  0%   { transform: scale(1); }
  30%  { transform: scale(1.28); }
  60%  { transform: scale(0.9); }
  80%  { transform: scale(1.1); }
  100% { transform: scale(1); }
}
```

**Step 2: Apply to the checked state**

Find the `.habit-row--checked .habit-check` rule (around line 692):
```css
.habit-row--checked .habit-check {
  background:   var(--clr-accent);
  border-color: var(--clr-accent);
  color:        #fff;
  transform:    scale(1.08);
}
```
Replace with:
```css
.habit-row--checked .habit-check {
  background:   var(--clr-accent);
  border-color: var(--clr-accent);
  color:        #fff;
  animation:    habit-pop 0.35s ease both;
}
```

**Step 3: Verify**

Go to the main app. Check a habit — the circle should bounce (scale up, overshoot, settle). Uncheck it — it should return to empty state immediately (animation only plays on the checked class being added via re-render, which is correct since `habits.js` calls `render()` which rebuilds the DOM).

**Step 4: Commit**
```bash
git add css/styles.css
git commit -m "style: add bounce animation to habit checkbox on completion"
```

---

## Task 8: Progress Ring — HTML

**Files:**
- Modify: `index.html`

**Step 1: Insert ring bar HTML**

In `index.html`, find the `#tab-today` div. It starts like this:
```html
<div id="tab-today" class="tab-view tab-view--active app-main">

  <!-- ── Shared date navigator (controls all sections) ────────────── -->
  <div class="app-date-bar">
```

Insert the following **after** the closing `</div>` of `.app-date-bar` and **before** `<section id="section-habits"`:

```html
      <!-- ── Today progress ring (habits summary) ──────────────────────── -->
      <div id="today-ring-bar" class="today-ring-bar" hidden>
        <svg class="ring-svg" viewBox="0 0 80 80" width="72" height="72"
             aria-hidden="true">
          <!-- Track (full grey circle) -->
          <circle class="ring-track" cx="40" cy="40" r="30"/>
          <!-- Progress arc -->
          <circle class="ring-progress" id="ring-progress-arc" cx="40" cy="40" r="30"/>
        </svg>
        <div class="ring-text">
          <span id="ring-count" class="ring-count">0/0</span>
          <span class="ring-label">habits today</span>
        </div>
      </div>
```

**Step 2: Verify HTML is valid**

Open the app in the browser. No JS errors in the console. The ring bar won't be visible yet (it's `hidden`).

**Step 3: Commit**
```bash
git add index.html
git commit -m "feat: add today progress ring HTML structure"
```

---

## Task 9: Progress Ring — CSS

**Files:**
- Modify: `css/styles.css` (append near end of file, before the final media queries)

**Step 1: Add ring bar styles**

The SVG circle with `r="30"` has circumference = `2 * π * 30 ≈ 188.5`. Append the following to `css/styles.css`:

```css
/* ═══════════════════════════════════════════════════════════════════════════
   Today progress ring  (#today-ring-bar)
═══════════════════════════════════════════════════════════════════════════ */
.today-ring-bar {
  display:        flex;
  align-items:    center;
  gap:            16px;
  background:     var(--clr-surface);
  border:         1px solid var(--clr-border);
  border-radius:  14px;
  padding:        14px 20px;
}

.ring-svg {
  flex-shrink: 0;
  /* Rotate so progress starts from top (12 o'clock) */
  transform: rotate(-90deg);
}

.ring-track {
  fill:         none;
  stroke:       var(--clr-border);
  stroke-width: 6;
}

.ring-progress {
  fill:              none;
  stroke:            var(--clr-accent);
  stroke-width:      6;
  stroke-linecap:    round;
  stroke-dasharray:  188.5;
  stroke-dashoffset: 188.5;  /* starts at 0% */
  transition:        stroke-dashoffset 0.4s ease;
}

.ring-text {
  display:        flex;
  flex-direction: column;
  gap:            2px;
}

.ring-count {
  font-size:   1.5rem;
  font-weight: 700;
  color:       var(--clr-text);
  line-height: 1;
}

.ring-label {
  font-size:  0.85rem;
  color:      var(--clr-text-2);
}
```

**Step 2: Verify visual**

Temporarily remove the `hidden` attribute from `#today-ring-bar` in `index.html`, reload, and confirm the ring bar appears as a card with a grey track circle. Add it back after confirming. (The JS in Task 10 will manage visibility.)

**Step 3: Commit**
```bash
git add css/styles.css
git commit -m "feat: add today progress ring CSS"
```

---

## Task 10: Progress Ring — JS

**Files:**
- Modify: `js/habits.js`

**Step 1: Add `updateRingBar` function**

In `js/habits.js`, find the `render()` function. It currently ends the progress section around line 36:
```js
    document.getElementById('habit-progress-fill').style.width =
      total > 0 ? `${Math.round((done / total) * 100)}%` : '0%';
```

After that line (still inside `render()`), add a call:
```js
    updateRingBar(done, total);
```

**Step 2: Add the `updateRingBar` helper function**

Add this function inside the `Habits` IIFE, after the `render()` function (before `makeRow`):

```js
  // ── Progress ring ─────────────────────────────────────────────────────────

  function updateRingBar(done, total) {
    const bar = document.getElementById('today-ring-bar');
    if (!bar) return;

    if (total === 0) {
      bar.hidden = true;
      return;
    }

    bar.hidden = false;

    const countEl = document.getElementById('ring-count');
    if (countEl) countEl.textContent = `${done}/${total}`;

    const arc = document.getElementById('ring-progress-arc');
    if (!arc) return;

    const circumference = 188.5;
    const pct = total > 0 ? done / total : 0;
    arc.style.strokeDashoffset = circumference * (1 - pct);
  }
```

**Step 3: Verify**

Log into the app and go to the Today view. If you have habits configured, the ring bar should appear below the date bar showing `X/Y habits today`. Check/uncheck habits — the ring arc should animate smoothly. If you have 0 habits configured, the ring bar should be hidden.

**Step 4: Commit**
```bash
git add js/habits.js
git commit -m "feat: wire progress ring to habit completion state"
```

---

## Task 11: Mood Button Pill Badge Redesign

**Files:**
- Modify: `css/styles.css`

**Step 1: Update `.mood-btn` base style**

Find `.mood-btn` (around line 3960). It's currently a fixed 36×36 circle. Change it to a pill that expands horizontally when selected. Replace the rule:

```css
.mood-btn {
  width:            36px;
  height:           36px;
  border-radius:    50%;
  border:           2px solid var(--mood-clr);
  background:       transparent;
  color:            var(--mood-clr);
  font-size:        0.85rem;
  font-weight:      700;
  cursor:           pointer;
  flex-shrink:      0;
  display:          flex;
  align-items:      center;
  justify-content:  center;
  transition:       background var(--transition), color var(--transition),
                    border-radius var(--transition), padding var(--transition);
  -webkit-tap-highlight-color: transparent;
}
```

(Key changes: add `transition` for `border-radius` and `padding`, keep everything else as-is.)

**Step 2: Update `.mood-btn--active`** (around line 3978)

Replace:
```css
.mood-btn--active {
  background: var(--mood-clr);
  color:      #fff;
}
```
With:
```css
.mood-btn--active {
  background:    var(--mood-clr);
  color:         #fff;
  border-radius: 18px;
  padding:       0 10px;
  width:         auto;
}
```

**Step 3: Verify**

In the Mood & Energy section, tap a mood value. The selected button should smoothly transition from a circle to a wider pill shape filled with its colour. Other buttons remain ghost circles.

**Step 4: Commit**
```bash
git add css/styles.css
git commit -m "style: mood buttons animate to pill shape when selected"
```

---

## Final: Review All Changes Together

**Step 1: Full visual review**

Open the app on an actual mobile phone (or DevTools mobile emulation at 390px width). Walk through each screen:

- [ ] **Auth screen:** Inter font, larger text, gradient behind logo+title, Google button taller
- [ ] **PIN screen:** Keys feel tactile/pressed when tapped
- [ ] **Today view — date bar:** unchanged
- [ ] **Today view — ring bar:** shows X/Y habits, arc animates on check
- [ ] **Habit section:** checkbox bounces on check, streak badges readable
- [ ] **Mood section:** buttons pill-out when selected
- [ ] **Text everywhere:** nothing looks tiny or illegible

**Step 2: Check dark mode**

Toggle dark mode on the device. The gradient on the auth card should still work (uses `--clr-accent-dim` which is defined in both themes). Green accent should look slightly richer than before.

**Step 3: Final commit (if any last tweaks were made)**
```bash
git add -A
git commit -m "style: visual polish review tweaks"
```
