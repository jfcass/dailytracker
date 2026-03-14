# Tasks Feature — Design Doc

**Date:** 2026-03-11
**Status:** Approved

---

## Problem / Motivation

While entering daily reflections, users think of things they want to do later — app ideas, errands, reminders. There's no lightweight way to capture these in-context. The feature should support both time-bound reminders (surfaced on their due date) and open-ended reference lists (ideas, backlogs) that don't need to nag.

---

## Goals

- Quick task capture from the Reflections section during daily journaling
- Due-date tasks resurface automatically in the daily view; reference tasks stay on the Tasks tab only
- Overdue tasks roll over day-to-day until completed
- Dedicated Tasks tab for full list management with search, filtering, grouping
- Data stored portably (top-level key in existing Drive file) for potential future task/journaling app

---

## Data Schema

### Top-level key in `health-tracker-data.json`

```json
"tasks": [
  {
    "id": "<uuid>",
    "text": "Pick up prescription",
    "category": "Health",
    "due_date": "2026-03-12",
    "completed": false,
    "completed_date": null,
    "created_date": "2026-03-11",
    "notes": ""
  }
]
```

- `due_date: null` = reference/backlog task — never appears in daily view
- `completed_date` is set silently (to today's date) when checkbox is ticked
- `notes` is optional free text for future use

### Settings addition

```json
"task_categories": ["App Ideas", "Shopping", "Personal", "Health"]
```

Category order in this array controls display order on the Tasks tab. Managed in Settings with inline-add (mirrors `note_tags` pattern).

---

## Daily View Integration (Reflections Sub-section)

Tasks become a third sub-section within the Reflections area, **below Gratitudes and Daily Notes**, in both accordion and hub layouts.

### What appears

Only tasks where `due_date <= today` AND `completed === false`. If none, the sub-section renders a minimal `+ Add task` link only — no visual clutter.

### Task row

```
[ ] Pick up prescription  [Health]  Mar 12          ✏
[ ] Call dentist          [Health]  Mar 9 (overdue)  ✏
```

- Checkbox — tap to complete; `completed_date` stored silently, task disappears
- Task text
- Category pill (small, muted)
- Due date — muted text if today or future, red if overdue
- Edit button (pencil icon) — opens inline form pre-populated for editing/rescheduling

### Quick-capture form (inline)

Tapping `+ Add task` expands below the list:

1. Text input (required)
2. Category picker — pill buttons from `task_categories`; `+ new category` inline add saves to settings
3. Due date picker — optional; blank = reference/backlog (won't appear in daily view)

### Hub tile update

The Reflections tile's swipe button gains a third option: **"Tasks"** (alongside "Log Gratitude" and "Add Note"). If tasks are due/overdue, a count badge appears on the tile.

---

## Tasks Tab

A new **Tasks** tab added to the bottom nav.

### Layout

- Search bar at top — live keyword filter across task text, category, and notes
- Filter pills: `All` · `Due / Overdue` · `Completed`
- `+ New Task` button
- Tasks grouped by category; each group is collapsible
  - Each group shows first 4 tasks; "Show X more" expands the rest
  - Group collapse state stored in localStorage
  - Group order controlled by up/down arrows on category header (order persists via `task_categories` array in settings)
- Reference/backlog tasks (no due date) show a subtle "No due date" label
- Completed tasks shown struck through with completion date in muted text

### Task row (same as daily view)

Checkbox · text · category pill · due date (red if overdue) · edit button

### Edit form fields

- Text (required)
- Category (picker with inline add)
- Due date (date picker, clearable)
- Notes (optional free text)

---

## New Module: `tasks.js`

Follows existing module pattern (IIFE exporting named object).

**Public API:**

```js
Tasks.init()              // register tab, bind events
Tasks.render(date)        // render Reflections sub-section for given date
Tasks.renderTab()         // render full Tasks tab
Tasks.addTask(task)       // create new task, save
Tasks.toggleComplete(id)  // flip completed, set/clear completed_date, save
Tasks.editTask(id, updates) // update fields, save
Tasks.deleteTask(id)      // remove from array, save
```

---

## Files to Modify

| File | Change |
|------|--------|
| `data.js` | Add `tasks: []` and `settings.task_categories: []` to `SCHEMA_DEFAULTS`; add migration for missing keys |
| `index.html` | Add Tasks sub-section HTML in Reflections accordion area; add Tasks tab to bottom nav |
| `hub.js` | Update `buildReflectionsTile()` — add "Tasks" swipe option, count badge |
| `settings.js` | Add `task_categories` editor (mirrors note_tags UI) |
| `app.js` | Call `Tasks.init()` in `showMain()`; include Tasks in date-change broadcast |
| `css/styles.css` | Task list styles, category pills, overdue state, edit form |
| **New:** `js/tasks.js` | Full tasks module |

---

## Behaviour Notes

- Tasks with `due_date <= today` surface in the daily Reflections sub-section for **every** date (including past/future date navigation) — consistent with how the rest of the app works
- Completing a task from the daily view or the Tasks tab produces the same result
- Category rename in Settings renames the category on all existing tasks (string replace across `tasks` array)
- Category delete in Settings prompts: move affected tasks to "Uncategorized" or delete them

---

## Out of Scope (for now)

- Sub-tasks / task hierarchy
- Recurring tasks
- Task priority levels
- Drag-and-drop (not touch-friendly in vanilla JS; use up/down arrows instead)
- Push notifications / reminders
- Separate Drive file (can migrate later if a standalone tasks app is built)
