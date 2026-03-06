# Separate Symptom & Issue Categories Design

**Date:** 2026-03-06
**Status:** Approved

---

## Problem

Currently, both symptom logging and issue categorization use the same `symptom_categories` list in settings. This conflates two different concepts:
- **Symptom categories** — how the user classifies daily symptoms (Headache, Fever, Fatigue, etc.)
- **Issue categories** — how the user organizes chronic/recurring health issues

Keeping them coupled makes it hard to manage them independently. The user wants to split them into two separate, configurable lists.

---

## Solution

Add a new `issue_categories` array to settings, initialized as a copy of the existing `symptom_categories`. Both lists start identical but can be managed independently going forward. Existing issues are not affected — their `category` values already exist in both lists after migration.

---

## Data Schema

### Before (current)
```json
"settings": {
  "symptom_categories": ["Headache", "Fever", "Fatigue", "Nausea", "Diarrhea", "Other"],
  ...
}
```

### After
```json
"settings": {
  "symptom_categories": ["Headache", "Fever", "Fatigue", "Nausea", "Diarrhea", "Other"],
  "issue_categories":   ["Headache", "Fever", "Fatigue", "Nausea", "Diarrhea", "Other"],
  ...
}
```

---

## Migration

**In `data.js` `mergeWithDefaults()` function:**

When loading data, if `issue_categories` does not exist in settings, initialize it as a copy of `symptom_categories`:

```javascript
if (!loaded.settings?.issue_categories && loaded.settings?.symptom_categories) {
  loaded.settings.issue_categories = [...loaded.settings.symptom_categories];
}
```

This is a **one-time, lossless migration**:
- Existing issues have `category` values (e.g., "Headache") that now exist in both lists
- No data is orphaned or lost
- On subsequent loads, both lists are independent

---

## Code Changes

### `js/data.js`
- Update `SCHEMA_DEFAULTS` to include `issue_categories: []` (initialized as copy of `symptom_categories`)
- Add migration logic in `mergeWithDefaults()` to populate `issue_categories` on first load

### `js/symptoms.js`
- **Symptom form:** category dropdown uses `getSettings().symptom_categories`
- **Issue form:** category dropdown uses `getSettings().issue_categories`
- **Category manager:** Split into two sections:
  - "Symptom Categories" — manage `symptom_categories`
  - "Issue Categories" — manage `issue_categories`
- Users can add/remove/edit categories in each list independently

### No changes needed
- `index.html` — no structural changes
- Other section files (`app.js`, `habits.js`, etc.) — no changes

---

## Error Handling

**Edge case:** User has old data where an issue's `category` value no longer exists in `issue_categories`:
- This is unlikely after migration, but if it happens, treat it gracefully:
  - Display the category value as-is (don't show "Unknown")
  - Allow the user to re-categorize the issue in the issue detail view
  - No data loss — the issue itself is not affected

---

## Testing

Manual verification steps:
1. Load the app with existing data → verify `issue_categories` is populated with a copy of `symptom_categories`
2. Open the category manager → confirm two separate sections appear
3. Add a new symptom category → verify it only appears in symptom form, not issue form
4. Add a new issue category → verify it only appears in issue form, not symptom form
5. Create a new symptom and new issue → verify they use their respective category lists
6. Edit an existing issue → verify its category still works and is shown correctly
