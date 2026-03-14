# Bucket Date Navigation — Scope & Requirements

**Date:** 2026-03-08
**Feature:** Add date navigation (swipe left/right) to the four Hub bucket detail views

## Context
- The Hub layout (Today tab) displays four 2×2 tiles: **Routine**, **Wellbeing**, **Health**, **Reflections**
- Clicking a tile opens a detail view showing that bucket's sections
- Currently, detail views are date-agnostic (always show today's data)

## Four Buckets to Update
1. **Routine** — sections: habits, moderation
2. **Wellbeing** — sections: mood + sleep stats
3. **Health** — sections: meds, bowel, symptoms, treatments
4. **Reflections** — sections: gratitudes, note

## Requirements

### Header Design
- Replace "Good afternoon, J" greeting with the bucket name (e.g., "Health", "Routine")
- Display the date (same font size/prominence as main Today screen)
- Format: "Today" | "Yesterday" | "Mon, Mar 3"

### Navigation
- **Gesture:** Horizontal swipe/scroll left/right on mobile
- **Left swipe** → move to next/future date (up to today)
- **Right swipe** → move to previous/older date
- **Boundaries:** Stop at earliest date with data; stop at today (no future dates)
- **Visual feedback:** Optional "Today" jump button when viewing past dates

### Data & State
- Each bucket view has its own date state
- Swapping buckets should NOT reset date (preserve user's date context per bucket)
- When returning to Today tab and re-entering a bucket, restore the last viewed date for that bucket
- All section rendering must respect the currently viewed date via DateNav.getDate()

### Mobile-Only
- Swipe gesture for mobile only
- Desktop can use existing Date Nav buttons or similar controls (future consideration)

## Implementation Notes
- Reuse existing `DateNav.js` date-shifting logic
- Per-bucket date state stored in localStorage (key: `ht_bucket_date_{bucket_id}`)
- Existing section modules (Habits, Mood, Symptoms, etc.) already read from DateNav.getDate()
- Bucket detail view markup already exists in hub.js render output

## Files to Modify
- `js/hub.js` — Add per-bucket date header + swipe listener + date state management
- `js/datenav.js` — Potentially refactor to support multiple date contexts (or create bucket-specific date handler)
- `css/styles.css` — Style date header in bucket detail views, swipe feedback (optional)
- `index.html` — May need additional markup for bucket-specific date display

---
## Success Criteria
✓ User can swipe left/right in any bucket detail view to navigate dates
✓ Date displays correctly at top of each bucket view
✓ Bucket name replaces greeting
✓ Date state persists per-bucket when switching buckets
✓ No future dates allowed
✓ Mobile-only (swipe gesture)
