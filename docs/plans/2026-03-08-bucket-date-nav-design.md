# Bucket Date Navigation — Design Document

**Date:** 2026-03-08
**Status:** Approved
**Feature:** Add horizontal swipe date navigation to the four Hub bucket detail views (Health, Routine, Wellbeing, Reflections)

---

## Overview

The Daily Tracker's Hub layout displays a 2×2 grid of four buckets. Clicking a bucket opens a detail view showing that bucket's sections. Currently, detail views always show today's data.

This design adds date navigation to bucket detail views via:
- **Header:** Shows bucket name + current date (Today | Yesterday | Mon, Mar 3)
- **Gesture:** Horizontal swipe left/right to navigate between dates
- **State:** Per-bucket date persistence (localStorage)
- **Scope:** Mobile only (swipe gesture)

---

## Architecture

### Module Structure

```
js/datenav.js (existing)
└─ DateNav module — manages Today tab date navigation

js/bucket-datenav.js (new)
└─ BucketDateNav module — manages per-bucket date contexts

js/hub.js (modified)
├─ Orchestrates when to use DateNav vs BucketDateNav
├─ Renders bucket detail view header with date/bucket name
├─ Attaches swipe gesture listener to bucket detail container
└─ Calls BucketDateNav when navigating within a bucket

Existing section modules (habits.js, mood.js, symptoms.js, etc.)
└─ Already read DateNav.getDate() → will work with BucketDateNav too
   (we route the active date provider to them via callbacks)
```

### Design Rationale: Why BucketDateNav?

**Option A (Extend DateNav):** Would require DateNav to manage multiple contexts, making it complex and mixing concerns.

**Option B (BucketDateNav):** Clean separation — DateNav owns Today view navigation, BucketDateNav owns bucket-specific dates. Hub orchestrates which is active.

**Option C (Inline in Hub):** Simpler initially, but logic becomes scattered and harder to test.

→ **Chosen: Option B** — maintains clean architecture, reuses date-shifting logic via a new dedicated module.

---

## BucketDateNav Module API

```javascript
const BucketDateNav = (() => {

  /**
   * Initialize BucketDateNav for a specific bucket.
   * Reads persisted date from localStorage, falls back to today.
   *
   * @param {string} bucketId - 'health' | 'routine' | 'wellbeing' | 'reflections'
   * @param {function} onDateChange - Callback: (dateStr) => void
   */
  function init(bucketId, onDateChange)

  /**
   * Get the currently viewed date for this bucket (YYYY-MM-DD)
   */
  function getDate()

  /**
   * Get formatted label for the current date
   * @returns 'Today' | 'Yesterday' | 'Mon, Mar 3' etc.
   */
  function getDateLabel()

  /**
   * Check if current date is today
   */
  function isToday()

  /**
   * Navigate relative to current date
   * @param {number} delta - -1 (previous day), +1 (next day)
   */
  function navigate(delta)

  /**
   * Jump to a specific date
   * @param {string} dateStr - YYYY-MM-DD format
   */
  function setDate(dateStr)

  /**
   * Jump back to today
   */
  function goToday()

  return { init, getDate, getDateLabel, isToday, navigate, setDate, goToday }
})();
```

---

## Data Flow

### Entering a Bucket Detail View

```
User clicks bucket button in Hub grid
  ↓
hub.js: renderBucketDetail(bucketId)
  ├─ BucketDateNav.init(bucketId, (newDate) => {
  │    // Callback when date changes
  │    // Re-render bucket sections with new date
  │    renderBucketSections(bucketId, newDate)
  │  })
  ├─ Render bucket detail header: [bucket name] + [date label]
  ├─ Render bucket sections (they read BucketDateNav.getDate())
  └─ Attach swipe gesture listener
```

### User Swipes

```
User swipes left/right on bucket detail container
  ↓
Swipe listener calculates horizontal delta
  ↓
If |delta| > 50px (threshold):
  ├─ Left swipe (delta < 0) → BucketDateNav.navigate(+1)  // future
  └─ Right swipe (delta > 0) → BucketDateNav.navigate(-1) // past
  ↓
BucketDateNav.navigate():
  ├─ Validate: don't go past today, don't go before earliest data
  ├─ Update internal currentDate
  ├─ Persist to localStorage: ht_bucket_date_{bucketId}
  ├─ Call onDateChange callback
  └─ Hub re-renders sections with new date
```

### Exiting a Bucket Detail View

```
User closes bucket detail view or navigates away
  ↓
hub.js: cleanup BucketDateNav
  ├─ Date already persisted in localStorage
  └─ (No explicit cleanup needed; next time bucket opens, re-init reads from localStorage)
```

### Returning to the Same Bucket

```
User returns to a bucket they previously viewed
  ↓
hub.js: BucketDateNav.init(bucketId, ...)
  ├─ Reads localStorage key: ht_bucket_date_{bucketId}
  ├─ Falls back to today if key doesn't exist
  └─ Restores user's previous date context
```

---

## State Persistence

### localStorage Schema

```javascript
{
  "ht_bucket_date_health":      "2026-03-05",  // Last viewed date in Health bucket
  "ht_bucket_date_routine":     "2026-03-08",  // Today
  "ht_bucket_date_wellbeing":   "2026-03-04",
  "ht_bucket_date_reflections": "2026-03-07"
}
```

### Persistence Rules

- **On init:** Read from localStorage (or use today as fallback)
- **On navigate/setDate:** Immediately persist to localStorage
- **On app restart:** Each bucket restores its last viewed date
- **On logout:** No cleanup needed (Drive-based app, user-specific data anyway)

---

## UI: Bucket Detail Header

### Visual Layout

```
┌─────────────────────────────┐
│  Health                     │  ← Bucket name (large, similar to main page)
│  Today                      │  ← Date label (secondary size)
├─────────────────────────────┤
│  [Section 1]                │
│  [Section 2]                │
│  [Section 3]                │
└─────────────────────────────┘
```

### Component

```html
<div class="bucket-detail-header">
  <h2 class="bucket-name">Health</h2>
  <div class="bucket-date">
    <span class="bucket-date-label">Today</span>
    <!-- Optional: "Go to today" button when viewing past dates -->
    <button class="btn-bucket-today" hidden>Return to Today</button>
  </div>
</div>
```

### Styling

- Reuse color/typography from main DateNav header
- Bucket name: same size as "Good afternoon, J" greeting
- Date label: secondary text color
- Optional: Add subtle animation when date changes (fade/slide)

---

## Swipe Gesture Implementation

### Touch Handling

```javascript
// On bucket detail container
let touchStartX = null;

container.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
});

container.addEventListener('touchend', (e) => {
  const touchEndX = e.changedTouches[0].clientX;
  const delta = touchEndX - touchStartX;
  const threshold = 50; // px

  if (Math.abs(delta) > threshold) {
    if (delta > 0) {
      // Right swipe → previous date
      BucketDateNav.navigate(-1);
    } else {
      // Left swipe → next date
      BucketDateNav.navigate(+1);
    }
  }
});
```

### Gesture Constraints

- Only fire if swipe is primarily horizontal (not vertical scroll)
- Ignore if swipe crosses a boundary (today's date or earliest data)
- Debounce: ignore subsequent touches within 200ms of last navigate
- Optional: Prevent default scroll/swipe if user is swiping with intent

---

## Edge Cases & Boundaries

### Date Boundaries

1. **Today:** Cannot navigate to future dates
   - `navigate(+1)` does nothing if already at today
   - Optional: Show disabled state on "next" button / swipe hint

2. **Earliest Data:**
   - First time bucket is opened: find earliest date with data in any section
   - Store as min boundary
   - `navigate(-1)` does nothing if at earliest date
   - Optional: Show hint "No data before this date"

3. **No Data Yet:**
   - User hasn't logged anything in a bucket → show "No data" message
   - Still allow date navigation (they might add past entries later)

### Data Addition for Past Dates

- User logs an entry for Mar 3 (while viewing today)
- Later, user navigates to Mar 3 in bucket detail view
- The newly-added entry appears ✓ (sections re-render on date change)

### Switching Between Buckets

- User views Health bucket on Mar 5
- Navigates to Routine bucket (which remembers it was last on Mar 8)
- Routine still shows Mar 8 ✓ (per-bucket state preserved)
- Goes back to Health → still shows Mar 5 ✓

### Switching to/from Today View

- User in Health bucket detail (Mar 5) → clicks outside/back button → returns to Today grid
- Main DateNav is now active (Today's date)
- Health bucket's Mar 5 date is saved in localStorage
- User re-enters Health bucket → restores Mar 5 ✓

---

## Files to Modify/Create

### New Files
- `js/bucket-datenav.js` — BucketDateNav module

### Modified Files
- `js/hub.js` — Render bucket detail header, swipe listener, BucketDateNav init
- `css/styles.css` — Style bucket detail header + optional swipe feedback
- `index.html` — Possibly add bucket-detail-header markup (or render dynamically in hub.js)

### Unmodified (Already Compatible)
- `js/datenav.js` — No changes (DateNav stays focused on Today view)
- `js/habits.js`, `js/mood.js`, `js/symptoms.js`, etc. — Already call DateNav.getDate(); will work with BucketDateNav once hub.js routes it

---

## Testing Strategy

### Unit Tests (BucketDateNav)
- ✓ navigate() respects boundaries
- ✓ localStorage persistence
- ✓ Date label formatting
- ✓ Fallback to today on init

### Integration Tests (Hub + BucketDateNav)
- ✓ Opening bucket initializes BucketDateNav
- ✓ Swipe gesture calls navigate()
- ✓ Date change updates section renders
- ✓ Closing bucket persists state
- ✓ Reopening bucket restores date

### Manual Testing
- ✓ Swipe left/right in each bucket
- ✓ Switch between buckets, verify per-bucket dates
- ✓ Navigate to Today, back to past, forward to today
- ✓ Reload app, verify dates restored

---

## Future Extensions

- **Desktop:** Add prev/next buttons similar to main DateNav (not in scope)
- **Week View:** Show a week carousel (not in scope)
- **Date Picker:** Calendar modal for quick date jumps (not in scope)

---

## Success Criteria

- ✓ User can swipe left/right in bucket detail view to navigate dates
- ✓ Date displays correctly (Today | Yesterday | formatted date)
- ✓ Bucket name shows instead of greeting
- ✓ Per-bucket date state persists across bucket switches
- ✓ No future dates allowed
- ✓ Mobile swipe gesture only
- ✓ Existing sections (Habits, Mood, etc.) render correct data for viewed date
