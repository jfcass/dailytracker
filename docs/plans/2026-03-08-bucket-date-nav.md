# Bucket Date Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add horizontal swipe date navigation to Hub bucket detail views (Health, Routine, Wellbeing, Reflections), allowing users to view past/future data for each bucket independently.

**Architecture:** New `BucketDateNav` module manages per-bucket date state and localStorage persistence, separate from the existing `DateNav` (which handles Today view). Hub orchestrates swipe gesture detection and calls BucketDateNav to navigate dates. Section modules remain unchanged—they already read from `DateNav.getDate()`, which Hub routes appropriately based on context.

**Tech Stack:** Vanilla JavaScript (Web Crypto API not needed), localStorage for persistence, CSS for header styling, touch events for swipe gesture.

---

## Task 1: Create BucketDateNav Module

**Files:**
- Create: `js/bucket-datenav.js`

**Step 1: Write BucketDateNav module with core API**

```javascript
/**
 * bucket-datenav.js — Per-bucket date navigation
 *
 * Manages independent date state for each bucket (Health, Routine, Wellbeing, Reflections).
 * Persists date to localStorage so user's date context is restored when returning to a bucket.
 */
const BucketDateNav = (() => {

  let currentBucketId = null;
  let currentDate = null;
  let onChange = null;  // (dateStr) => void

  // ── Public ────────────────────────────────────────────────────────────────

  function init(bucketId, onChangeCb) {
    currentBucketId = bucketId;
    onChange = onChangeCb;

    // Read persisted date from localStorage, fall back to today
    const key = `ht_bucket_date_${bucketId}`;
    const stored = localStorage.getItem(key);
    currentDate = stored && isValidDate(stored) ? stored : Data.today();

    // Don't fire onChange on init—caller will render based on currentDate
  }

  function getDate() {
    return currentDate;
  }

  function getDateLabel() {
    if (!currentDate) return '';
    const today = Data.today();
    if (currentDate === today) return 'Today';
    if (currentDate === shiftDate(today, -1)) return 'Yesterday';
    return new Date(currentDate + 'T12:00:00').toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  }

  function isToday() {
    return currentDate === Data.today();
  }

  function navigate(delta) {
    const candidate = shiftDate(currentDate, delta);
    const today = Data.today();

    // Don't allow future dates
    if (candidate > today) return;

    // TODO: In Task 5, add earliest-data boundary check
    // For now, allow navigation to any past date

    setDate(candidate);
  }

  function setDate(dateStr) {
    if (!isValidDate(dateStr)) return;
    currentDate = dateStr;
    persistDate();
    if (onChange) onChange(currentDate);
  }

  function goToday() {
    setDate(Data.today());
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  function persistDate() {
    if (currentBucketId) {
      localStorage.setItem(`ht_bucket_date_${currentBucketId}`, currentDate);
    }
  }

  function isValidDate(dateStr) {
    return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(Date.parse(dateStr));
  }

  function shiftDate(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return { init, getDate, getDateLabel, isToday, navigate, setDate, goToday };
})();
```

**Step 2: Verify module syntax**

Run: `npm run build` or open DevTools console and check for syntax errors
Expected: No errors; module loads without issues

**Step 3: Commit**

```bash
git add js/bucket-datenav.js
git commit -m "feat: create BucketDateNav module for per-bucket date state"
```

---

## Task 2: Load BucketDateNav in HTML

**Files:**
- Modify: `index.html` (add script tag for BucketDateNav)

**Step 1: Add BucketDateNav script before hub.js**

In `index.html`, find the section with `<script src="js/..."></script>` tags (around line 500-520).
Add this line before `<script src="js/hub.js"></script>`:

```html
<script src="js/bucket-datenav.js"></script>
```

**Step 2: Verify it loads**

Open app in browser, open DevTools console.
Expected: No "BucketDateNav is not defined" errors

**Step 3: Commit**

```bash
git add index.html
git commit -m "feat: load BucketDateNav module in index.html"
```

---

## Task 3: Modify Hub to Render Bucket Detail Header

**Files:**
- Modify: `js/hub.js` (add bucket detail header rendering)

**Step 1: Find the bucket detail rendering function in hub.js**

Search for `renderBucketDetail` or the code that opens the bucket overlay/panel.
This is likely in the click handler that opens a bucket when user clicks a bucket button.

**Step 2: Add header markup generation**

Add this helper function to hub.js (inside the Hub IIFE, near other helper functions):

```javascript
/**
 * Create bucket detail header showing bucket name and current date
 */
function createBucketDetailHeader(bucketId) {
  const bucket = BUCKETS[bucketId];
  if (!bucket) return null;

  const header = document.createElement('div');
  header.className = 'bucket-detail-header';
  header.id = `bucket-detail-header-${bucketId}`;
  header.innerHTML = `
    <h2 class="bucket-detail-name">${bucket.label}</h2>
    <div class="bucket-detail-date">
      <span class="bucket-detail-date-label">Today</span>
    </div>
  `;

  return header;
}

/**
 * Update bucket detail header date display
 */
function updateBucketDetailHeaderDate() {
  const dateLabel = BucketDateNav.getDateLabel();
  const el = document.querySelector('.bucket-detail-date-label');
  if (el) el.textContent = dateLabel;
}
```

**Step 3: Call header creation when opening bucket**

Find the code in hub.js that creates the bucket detail overlay (search for `hub-bucket-panel` or similar).
Before rendering sections, call:

```javascript
const header = createBucketDetailHeader(bucketId);
if (header) {
  bucketPanel.prepend(header);  // or insert at appropriate location
}
```

**Step 4: Verify header appears**

Open app, navigate to Today view, click a bucket button.
Expected: Bucket name (e.g., "Health") and date label ("Today") appear at top of detail view

**Step 5: Commit**

```bash
git add js/hub.js
git commit -m "feat: add bucket detail header with bucket name and date label"
```

---

## Task 4: Initialize BucketDateNav on Bucket Open

**Files:**
- Modify: `js/hub.js` (call BucketDateNav.init when opening bucket)

**Step 1: Find bucket open handler in hub.js**

Search for the code that handles bucket button clicks and opens the detail view.
This is likely in an event listener or click handler.

**Step 2: Initialize BucketDateNav**

After creating the header (from Task 3), add:

```javascript
// Initialize BucketDateNav for this bucket
BucketDateNav.init(bucketId, (newDate) => {
  // When date changes, update header and re-render sections
  updateBucketDetailHeaderDate();
  renderBucketSections(bucketId);
});

// Render header with current date from BucketDateNav
updateBucketDetailHeaderDate();
```

**Step 3: Create/verify renderBucketSections function**

This function should render the sections for the given bucket at the current date.
It likely already exists in hub.js; search for it.
If it doesn't exist, create:

```javascript
function renderBucketSections(bucketId) {
  const bucket = BUCKETS[bucketId];
  if (!bucket) return;

  // The existing section rendering code in hub.js
  // Each section (habits, mood, symptoms, etc.) reads DateNav.getDate()
  // They will automatically use BucketDateNav.getDate() because we've set it
  // No explicit changes needed here—sections are already date-aware
}
```

**Step 4: Test**

Open app, click a bucket button.
Expected: Header shows the bucket's persisted date (or today if first time)
Expected: Sections display data for that date

**Step 5: Commit**

```bash
git add js/hub.js
git commit -m "feat: initialize BucketDateNav on bucket open"
```

---

## Task 5: Add Swipe Gesture Listener

**Files:**
- Modify: `js/hub.js` (add touch event listeners for swipe)

**Step 1: Create swipe handler function**

Add this to hub.js (inside Hub IIFE):

```javascript
/**
 * Attach swipe gesture listener to bucket detail container
 */
function attachBucketSwipeListener(container, bucketId) {
  let touchStartX = null;
  let touchStartY = null;
  const SWIPE_THRESHOLD = 50; // px
  const VERTICAL_THRESHOLD = 30; // px—ignore if vertical movement > this

  container.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return; // ignore multi-touch
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  container.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;

    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    // Ignore if primarily vertical movement (vertical scroll)
    if (Math.abs(deltaY) > VERTICAL_THRESHOLD && Math.abs(deltaY) > Math.abs(deltaX)) {
      touchStartX = null;
      return;
    }

    // Check if swipe is significant
    if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
      if (deltaX > 0) {
        // Right swipe → previous date
        BucketDateNav.navigate(-1);
      } else {
        // Left swipe → next date
        BucketDateNav.navigate(+1);
      }
    }

    touchStartX = null;
  }, { passive: true });
}
```

**Step 2: Call swipe listener attachment when opening bucket**

In the bucket open handler (from Task 4), after BucketDateNav.init, add:

```javascript
attachBucketSwipeListener(bucketDetailContainer, bucketId);
```

(Replace `bucketDetailContainer` with the actual DOM element reference in your code.)

**Step 3: Test swipe gesture**

Open app on mobile (or use DevTools device emulation).
Navigate to a bucket detail view.
Swipe left/right on the detail view.
Expected: Date changes (in header)
Expected: Sections re-render with data from new date

**Step 4: Commit**

```bash
git add js/hub.js
git commit -m "feat: add swipe gesture listener to bucket detail view"
```

---

## Task 6: Add CSS Styles for Bucket Detail Header

**Files:**
- Modify: `css/styles.css` (add bucket detail header styles)

**Step 1: Add bucket detail header CSS**

Add to `css/styles.css`:

```css
/* Bucket Detail Header */
.bucket-detail-header {
  padding: 1rem;
  background-color: var(--clr-surface);
  border-bottom: 1px solid var(--clr-border);
  margin-bottom: 1rem;
}

.bucket-detail-name {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--clr-text);
  margin: 0 0 0.5rem 0;
}

.bucket-detail-date {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.bucket-detail-date-label {
  font-size: 0.95rem;
  color: var(--clr-text-2);
  font-weight: 500;
}

.bucket-detail-date-label.today {
  color: var(--clr-accent);
}
```

**Step 2: Verify styles apply**

Open app, navigate to bucket detail view.
Expected: Header is styled consistently with the rest of the app
Expected: Bucket name is prominent, date is secondary

**Step 3: Commit**

```bash
git add css/styles.css
git commit -m "feat: style bucket detail header"
```

---

## Task 7: Update Bucket Detail Header Date Label Class

**Files:**
- Modify: `js/hub.js` (update header date label styling on date change)

**Step 1: Enhance updateBucketDetailHeaderDate function**

Replace the function from Task 3 with:

```javascript
function updateBucketDetailHeaderDate() {
  const dateLabel = BucketDateNav.getDateLabel();
  const el = document.querySelector('.bucket-detail-date-label');
  if (el) {
    el.textContent = dateLabel;
    // Add 'today' class for styling if currently at today
    el.classList.toggle('today', BucketDateNav.isToday());
  }
}
```

**Step 2: Test**

Navigate to a bucket, view today's date, then swipe to yesterday.
Expected: Date label changes
Expected: 'today' class removed (styling changes if CSS uses it)
Expected: Swipe back to today, 'today' class reappears

**Step 3: Commit**

```bash
git add js/hub.js
git commit -m "feat: update bucket detail header styling on date changes"
```

---

## Task 8: Verify Section Modules Read BucketDateNav Date

**Files:**
- Check: `js/habits.js`, `js/mood.js`, `js/symptoms.js`, `js/medications.js`, `js/bowel.js`, `js/gratitudes.js`

**Step 1: Verify section modules use DateNav.getDate()**

In each section module, verify that rendering calls `DateNav.getDate()` when fetching data.

Search for:
```javascript
DateNav.getDate()
Data.getDay(DateNav.getDate())
```

Expected: All section modules read dates via `DateNav.getDate()`

**Step 2: If sections DON'T use DateNav.getDate()**

They should. If a section hardcodes `Data.today()`, update it to:
```javascript
const viewDate = (typeof DateNav !== 'undefined') ? DateNav.getDate() : Data.today();
const day = Data.getDay(viewDate);
```

**Step 3: No commits needed**

This step verifies existing code—no changes unless sections were hardcoding dates.

---

## Task 9: Test Per-Bucket Date Persistence

**Files:**
- Test manually (no code changes)

**Step 1: Manual test—per-bucket date independence**

1. Open app
2. Click Health bucket
3. Swipe back to Mar 5
4. Close/exit bucket detail view
5. Click Routine bucket
6. Verify Routine shows today (not Mar 5)
7. Swipe back to Mar 3
8. Click Health bucket again
9. Verify Health still shows Mar 5 ✓

Expected: Each bucket maintains independent date state

**Step 2: Manual test—date persistence across app restart**

1. Open app, navigate to Health bucket, swipe to Mar 5
2. Refresh the page (Cmd+R or F5)
3. Verify Health bucket still shows Mar 5 ✓

Expected: localStorage persists the date across sessions

**Step 3: No commits needed**

This is manual verification.

---

## Task 10: Test Boundary Conditions

**Files:**
- Test manually (no code changes)

**Step 1: Test today boundary**

1. Open bucket, swipe left (forward) repeatedly
2. Verify it stops at today—cannot swipe beyond ✓
3. Verify "today" class appears on date label ✓

Expected: Cannot navigate to future dates

**Step 2: Test earliest date boundary**

1. Open bucket, swipe right (backward) repeatedly
2. Verify it stops at the earliest logged date ✓

Expected: Cannot navigate before first data entry

**Step 3: No commits needed**

This is manual verification. If behavior is wrong, file issues for fixing.

---

## Task 11: Test Vertical Scroll Doesn't Trigger Swipe

**Files:**
- Test manually (no code changes)

**Step 1: Vertical scroll test**

1. Open bucket detail view
2. Perform vertical scroll (up/down)
3. Verify vertical scroll works normally ✓
4. Verify date doesn't change ✓

Expected: Vertical scrolling doesn't accidentally trigger swipe navigation

---

## Task 12: Final Integration Test—Full User Flow

**Files:**
- Test manually (no code changes)

**Step 1: Complete user flow**

1. Open Daily Tracker app
2. Verify Today hub grid shows (Routine, Wellbeing, Health, Reflections)
3. Click Health tile
4. Verify Health detail view opens with header showing "Health" + "Today"
5. Swipe left → date changes to "Yesterday", sections re-render
6. Swipe right → date changes back to "Today"
7. Swipe left several times → navigate to a past date (e.g., Mar 5)
8. Click Routine tile (or back button, then click Routine)
9. Verify Routine shows "Today" (not Mar 5)
10. Swipe left in Routine to Mar 2
11. Click Health again
12. Verify Health still shows Mar 5 ✓
13. Exit app, reload
14. Click Health
15. Verify Health still shows Mar 5 ✓

Expected: All steps work; app feels responsive and intuitive

**Step 2: Commit summary**

```bash
git log --oneline | head -12
```

Expected: See commits from Tasks 1–7, each describing an atomic change

---

## Rollback / Recovery

If something breaks:

1. **BucketDateNav errors?** Check `js/bucket-datenav.js` for syntax errors
2. **Header not appearing?** Verify `createBucketDetailHeader` is called in bucket open handler
3. **Swipe not working?** Check that `attachBucketSwipeListener` is called; verify touch events fire in DevTools
4. **Sections not updating?** Verify section modules read `DateNav.getDate()` and re-render on date change callback
5. **Date not persisting?** Check localStorage in DevTools → Application → Local Storage

If critical issues arise, run:
```bash
git log --oneline
git reset --hard <commit-hash>  # rollback to last known good state
```

---

## Plan Summary

| Task | Action | Est. Time |
|------|--------|-----------|
| 1 | Create BucketDateNav module | 5 min |
| 2 | Load BucketDateNav in HTML | 2 min |
| 3 | Add bucket detail header | 5 min |
| 4 | Initialize BucketDateNav on bucket open | 5 min |
| 5 | Add swipe gesture listener | 10 min |
| 6 | Add CSS styles | 5 min |
| 7 | Update header styling on date change | 3 min |
| 8 | Verify sections read BucketDateNav | 5 min |
| 9 | Test per-bucket date persistence | 5 min |
| 10 | Test boundary conditions | 5 min |
| 11 | Test vertical scroll | 3 min |
| 12 | Full integration test | 10 min |
| **Total** | **Implementation** | **~63 min** |

---

## Next: Execution

Plan is complete and saved to `docs/plans/2026-03-08-bucket-date-nav.md`.

**Two execution options:**

**Option 1: Subagent-Driven (this session)**
- I dispatch a fresh subagent per task (or per batch of tasks)
- Review code after each task
- Fastest iteration, immediate feedback

**Option 2: Parallel Session (separate)**
- You open a new session (ideally in a worktree for isolation)
- Use `superpowers:executing-plans` to run tasks step-by-step
- Best if you have limited credits this session

**Which approach would you prefer?**
