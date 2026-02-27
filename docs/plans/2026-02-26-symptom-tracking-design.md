# Symptom Tracking Redesign — Design Summary

**Date:** 2026-02-26
**Status:** Approved / In Progress

---

## Problem

The previous model required creating an "Issue" before logging any symptom. This inverted the natural workflow — users often want to quickly log "headache, severity 3" and optionally tie it to a chronic issue later.

---

## Solution: Symptoms-First Model

Symptoms are primary daily entries. Issues are optional grouping labels.

### Key changes:
- Daily entries are now `symptoms[]` (not `issue_logs[]`)
- Issues are lightweight containers (`remind_daily` flag replaces `ongoing`)
- Linking works bidirectionally: from symptom → issue or from issue → claim unlinked symptoms

---

## Data Shape

### `days[date].symptoms[]`
```json
{
  "id": "<uuid>",
  "category": "Eyes",
  "severity": 3,
  "description": "Dry and itchy after screen time",
  "time": "14:30",
  "issue_id": "<uuid | null>"
}
```

### `data.issues[<uuid>]`
```json
{
  "id": "<uuid>",
  "name": "Recurring Dry Eyes",
  "category": "Eyes",
  "remind_daily": true,
  "start_date": "YYYY-MM-DD",
  "end_date": null,
  "resolved": false,
  "notes": ""
}
```

---

## Daily View Layout

1. **Remind-daily prompts** — compact cards for active issues with `remind_daily: true`
   - Shows issue name, last severity, and "Log today" button (or today's severity badge if already logged)
2. **Today's symptoms** — all `symptoms[]` for the current date as cards
   - Each card: category dot, severity badge, description, time (if set), issue badge (if linked)
   - Actions: edit, delete, link/unlink
3. **"+ Add Symptom" button** at the bottom

---

## Issue Management Panel

Opened via "Issues" button in the section header. Content:
- List of all issues (active then resolved)
- Per issue: name, category, `remind_daily` toggle, resolve button, clickable name → detail view
- "+ New Issue" inline form: name, category, `remind_daily` toggle

---

## Issue Detail View

- Header: name, category, resolve button, ← back link
- Stats: total occurrences, avg severity, first/last seen
- Severity sparkline chart
- Chronological symptom list
- "Find related symptoms" — unlinked symptoms from same category, each with "Assign" button

---

## Migration

**Old:** `days[date].issue_logs[]` with `{id, issue_id, symptoms: string[], severity, note}`
**New:** `days[date].symptoms[]` with `{id, issue_id, category, severity, description, time}`

Mapping:
- `id` → `id`
- `issue_id` → `issue_id`
- `severity` → `severity`
- `symptoms.join(', ') + (note ? ': ' + note : '')` → `description`
- `null` → `time`
- `issues[issue_id].category ?? 'Other'` → `category`

Issues: `ongoing: true` → `remind_daily: true`; `ongoing: false` → `remind_daily: false`; remove `ongoing`.

Version bumped to `"2.0"` after migration.
