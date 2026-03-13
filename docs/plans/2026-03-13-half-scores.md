# Half-Score Double Press Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add half-score support (e.g., 3.5) via double-press to mood/energy/stress/focus rating buttons and bowel quality buttons.

**Architecture:** Three-state cycle per button (unset → whole → half → unset). Half state stored as float in existing JSON number fields — no schema changes. Visual feedback via `--half` CSS class with a "½" badge pseudo-element.

**Tech Stack:** Vanilla JS, CSS custom properties, no build step. Push to GitHub Pages to test.

**Design doc:** `docs/plans/2026-03-13-half-scores-design.md`

---

## Task 1: Fix CLAUDE.md bowel schema

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Find and update the bowel entry in the schema section**

Locate the bowel entry (currently shows `type: "normal | soft | hard | liquid"`) and replace with the correct field:

```markdown
      "bowel": [
        { "id": "<uuid>", "time": "08:30", "quality": 3, "notes": "" }
      ],
```

Replace the Schema Field Notes section entry if present. Add or update to read:

```
### `days[date].bowel[].quality`
Bristol Stool Scale integer 1–7:
1=Hard · 2=Lumpy · 3=Cracked · 4=Normal · 5=Soft · 6=Mushy · 7=Watery
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: fix CLAUDE.md bowel schema (quality 1-7 int, not type string)"
```

---

## Task 2: Add CSS for half-score button state

**Files:**
- Modify: `css/styles.css`

**Step 1: Add `mood-btn--half` style after `.mood-btn--active` block (around line 4481)**

```css
.mood-btn--half {
  background:   color-mix(in srgb, var(--clr-accent) 25%, transparent);
  border-color: var(--clr-accent);
  color:        var(--clr-accent);
  position:     relative;
}

.mood-btn--half::after {
  content:         '½';
  position:        absolute;
  top:             -5px;
  right:           -5px;
  font-size:       0.55rem;
  font-weight:     800;
  background:      var(--clr-accent);
  color:           #fff;
  border-radius:   50%;
  width:           14px;
  height:          14px;
  display:         flex;
  align-items:     center;
  justify-content: center;
  line-height:     1;
  pointer-events:  none;
}
```

**Step 2: Add `bwl-quality-btn--half` style after `.bwl-quality-btn--active` block (around line 4624)**

```css
.bwl-quality-btn--half {
  background: color-mix(in srgb, var(--q-clr) 20%, transparent);
  color:      var(--q-clr);
  position:   relative;
}

.bwl-quality-btn--half::after {
  content:         '½';
  position:        absolute;
  top:             -5px;
  right:           -5px;
  font-size:       0.55rem;
  font-weight:     800;
  background:      var(--q-clr);
  color:           #fff;
  border-radius:   50%;
  width:           13px;
  height:          13px;
  display:         flex;
  align-items:     center;
  justify-content: center;
  line-height:     1;
  pointer-events:  none;
}
```

**Step 3: Commit**

```bash
git add css/styles.css
git commit -m "style: add --half button state for mood and bowel quality buttons"
```

---

## Task 3: Update mood.js — setRating logic

**Files:**
- Modify: `js/mood.js` (around line 192)

**Step 1: Replace the `setRating` function body**

Current code (lines ~192–201):
```js
function setRating(field, val) {
  const day = Data.getDay(currentDate);
  if (!day.mood || typeof day.mood !== 'object') {
    day.mood = { mood: null, energy: null, stress: null, focus: null };
  }
  // Tap the active value again to clear it
  day.mood[field] = day.mood[field] === val ? null : val;
  render();
  saveMood();
}
```

Replace with:
```js
function setRating(field, val) {
  const day = Data.getDay(currentDate);
  if (!day.mood || typeof day.mood !== 'object') {
    day.mood = { mood: null, energy: null, stress: null, focus: null };
  }
  const current = day.mood[field];
  if (current === val - 0.5) {
    day.mood[field] = null;          // half → unset
  } else if (current === val) {
    day.mood[field] = val - 0.5;    // whole → half
  } else {
    day.mood[field] = val;           // anything else → whole
  }
  render();
  saveMood();
}
```

**Step 2: Verify the change looks correct** — three-way cycle: unset→whole→half→unset.

**Step 3: Commit**

```bash
git add js/mood.js
git commit -m "feat(mood): add half-score via double-press for rating buttons"
```

---

## Task 4: Update mood.js — render function

**Files:**
- Modify: `js/mood.js` (around lines 119–144)

**Step 1: Update the button active-class toggle block**

Current (lines ~123–126):
```js
document.querySelectorAll(`.mood-btn[data-field="${field}"]`).forEach(btn => {
  btn.classList.toggle('mood-btn--active', +btn.dataset.val === val);
});
```

Replace with:
```js
document.querySelectorAll(`.mood-btn[data-field="${field}"]`).forEach(btn => {
  const btnVal = +btn.dataset.val;
  btn.classList.toggle('mood-btn--active', btnVal === val);
  btn.classList.toggle('mood-btn--half',   btnVal - 0.5 === val);
});
```

**Step 2: Update the value label display to handle half-scores**

Current (inside the `Object.entries(labelMap)` loop, around line 136):
```js
el.textContent  = val ? labels[val] : '';
```

Replace with:
```js
el.textContent  = val != null ? (Number.isInteger(val) ? (labels[val] ?? '') : String(val)) : '';
```

**Step 3: Commit**

```bash
git add js/mood.js
git commit -m "feat(mood): render half-score button state and numeric value label"
```

---

## Task 5: Update bowel.js — quality button click handler

**Files:**
- Modify: `js/bowel.js` (around lines 135–142)

**Step 1: Replace the quality button click handler**

Current:
```js
wrap.querySelectorAll('.bwl-quality-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    fQuality = parseInt(btn.dataset.quality, 10);
    wrap.querySelectorAll('.bwl-quality-btn').forEach(b =>
      b.classList.toggle('bwl-quality-btn--active', b.dataset.quality === String(fQuality))
    );
  });
});
```

Replace with:
```js
wrap.querySelectorAll('.bwl-quality-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tapped = parseFloat(btn.dataset.quality);
    if (fQuality === tapped - 0.5) {
      fQuality = 0;               // half → unset
    } else if (fQuality === tapped) {
      fQuality = tapped - 0.5;   // whole → half
    } else {
      fQuality = tapped;          // → whole
    }
    wrap.querySelectorAll('.bwl-quality-btn').forEach(b => {
      const bVal = parseFloat(b.dataset.quality);
      b.classList.toggle('bwl-quality-btn--active', bVal === fQuality);
      b.classList.toggle('bwl-quality-btn--half',   bVal - 0.5 === fQuality);
    });
  });
});
```

**Step 2: Update the display chip in the entry list render (around line 81)**

Current:
```js
const label = QUALITY_LABELS[entry.quality] ?? '';
```

Replace with:
```js
const label = Number.isInteger(entry.quality)
  ? (QUALITY_LABELS[entry.quality] ?? '')
  : `Type ${entry.quality}`;
```

**Step 3: Commit**

```bash
git add js/bowel.js
git commit -m "feat(bowel): add half-score via double-press for quality buttons"
```

---

## Task 6: Fix health-log.js — defensive half-score display

**Files:**
- Modify: `js/health-log.js` (around lines 525, 532–533)

**Step 1: Find the two places that look up bowel quality labels**

Line ~525 (summary chip for latest entry):
```js
const qLabel = BWL_LABELS[lastEntry.quality] ?? '';
```

Lines ~532–533 (per-entry render):
```js
const color = BWL_COLORS[e.quality] ?? '#6b7280';
const label = BWL_LABELS[e.quality] ?? '';
```

**Step 2: Update both to handle half-quality values**

Line ~525:
```js
const qLabel = Number.isInteger(lastEntry.quality)
  ? (BWL_LABELS[lastEntry.quality] ?? '')
  : `Type ${lastEntry.quality}`;
```

Lines ~532–533:
```js
const color = BWL_COLORS[Math.round(e.quality)] ?? '#6b7280';
const label = Number.isInteger(e.quality)
  ? (BWL_LABELS[e.quality] ?? '')
  : `Type ${e.quality}`;
```

**Step 3: Commit**

```bash
git add js/health-log.js
git commit -m "fix(health-log): handle half-quality values in bowel display"
```

---

## Task 7: Push and verify

**Step 1: Push to GitHub Pages**

```bash
git push
```

**Step 2: Open `https://jfcass.github.io/dailytracker` and test mood ratings**

- Tap any mood/energy/stress/focus button → should light up solid (whole score)
- Tap same button again → should show dim teal with "½" badge, value label shows numeric (e.g., "3.5")
- Tap same button a third time → should clear entirely
- Tap a different button → should jump straight to whole score on new button, clear old

**Step 3: Test bowel quality buttons**

- Open a bowel entry form
- Tap any quality button → solid active state
- Tap same button again → dim with "½" badge
- Tap again → clears
- Save a half-quality entry → display chip should show "Type 3.5" (or similar)

**Step 4: Check Health Log tab**

- Navigate to Health Log, find a day with a bowel entry that has a half quality
- Verify label shows "Type 3.5" rather than blank or crashing

**Step 5: Update CLAUDE.md "Current Work" section**
