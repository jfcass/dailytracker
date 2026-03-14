# Treatments Redesign — Design Doc

**Date:** 2026-03-12
**Context:** The Treatments tab was a generic list/detail/form module with no "today" awareness. It needed to behave like the rest of the app — reflecting what's happening today when accessed from the Today tab, and making it easy to log a session as it unfolds (start → during → after). The user logs ketamine infusions for depression; BP increase during treatment is expected and normal behavior.

---

## Views

### 1. Today View (new default entry point)

Shown when the Treatments tab opens. Displays today's treatments in temporal context.

**Empty state:**
- "No treatment logged today" message
- "Log Treatment" button → opens Add form

**With treatments (most recent first):**
Each card shows:
- Start time (12h format)
- Intention snippet (truncated)
- At Rest BP if logged (e.g. "120/80 · 72 bpm")
- "In Progress" badge if no end time set yet
- Auto-calculated duration (e.g. "45 min") if end time is set
- Tap → Detail view

**Always at bottom:**
- "View all treatments →" link → switches to existing List view

---

### 2. Add Form (modified)

Fields:
- Date (defaults to today)
- Start time
- Intention (free text)
- Medication + dose
- Notes
- **Optional At Rest BP section:** Systolic, Diastolic, Pulse (bpm)

**Removed:** End time field (moved to Detail view as a post-logging edit)

**On save:** If any BP fields are filled, a linked BP reading is created simultaneously with `context: 'At Rest'` and `treatment_id` pointing to the new treatment. If empty, no BP reading is created.

---

### 3. Detail View (modified)

**Header:** Date, start time, auto-calculated duration (if end time set), "In Progress" badge (if no end time).

**Editable rows (collapsible, inline forms):**
- **End Time** — "Add end time" row if unset; shows logged time with edit option if set. Adding end time triggers duration recalculation.
- **At Rest BP** — collapsible row; shows "Add reading" if unset, or values (systolic/diastolic/pulse) with edit/delete if set
- **Mid-Treatment BP** — same pattern
- **Post-Treatment BP** — same pattern

**BP Delta Summary** (shown only when all three phases are logged):
- Neutral display of readings across phases: "At Rest: 120/80 · Mid: 135/88 · Post: 128/82"
- No color-coding or directional indicators — BP increase is expected/normal for this treatment context

**Existing fields:** Intention, medication, dose, notes — unchanged

---

### 4. List View (unchanged)

Accessible via "View all treatments →" from Today view. Shows all treatments across all dates sorted by date/time descending. Unchanged from current behavior.

---

## Hub Integration

The Health bucket row currently shows a plain "Treatments" label. Update to show a brief status for today:

- Nothing logged today: "Treatments" (unchanged)
- Logged, in progress: "1 today · In Progress"
- Logged, complete: "1 today · 45 min" (duration)
- Multiple today: "2 today · In Progress" or "2 today"

Tap behavior unchanged: switches to Treatments tab (which now opens Today view).

---

## Data Schema

No schema changes required. Existing fields support all new behavior:

- `treatments[id].end_time` — already nullable; just not shown in Add form
- `blood_pressure[].context` — already has `['At Rest', 'Mid-Treatment', 'Post-Treatment']`
- `blood_pressure[].treatment_id` — already links readings to treatments
- `blood_pressure[].pulse` — already exists (optional numeric)

---

## BP Display Notes

- BP increase across phases is **expected** for ketamine infusions
- No warning colors, no up/down arrows, no "elevated" labels
- Delta summary is purely informational: flat text showing each phase's numbers

---

## Files to Modify

| File | Changes |
|------|---------|
| `js/treatments.js` | Add `renderToday()` view; modify `renderForm()` to remove end_time and add BP section; modify `renderDetail()` to add end_time row, collapsible BP phase rows, BP delta summary; update default view to `today` |
| `js/hub.js` | Update Health bucket Treatments row to show today's status |
