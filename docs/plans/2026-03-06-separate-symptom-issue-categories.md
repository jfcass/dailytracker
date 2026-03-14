# Separate Symptom & Issue Categories Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split the shared `symptom_categories` list into two independent lists — `symptom_categories` and `issue_categories` — with a lossless migration for existing data.

**Architecture:** Add `issue_categories` to settings (initialized as a copy of `symptom_categories` on first load). Update `symptoms.js` to use the appropriate list for symptom vs issue forms. Update the category manager UI to show two separate management sections.

**Tech Stack:** Vanilla JS, no frameworks. Data persists to Google Drive JSON.

---

### Task 1: Update data schema defaults

**Files:**
- Modify: `js/data.js` (SCHEMA_DEFAULTS object)

**Step 1: Add issue_categories to schema defaults**

Open `js/data.js` and find the `SCHEMA_DEFAULTS` object. Locate the `settings` section:

```javascript
settings: {
  pin_hash: null,
  habits: ['Reading', 'Gym', 'Photo Stroll'],
  moderation_substances: [...],
  symptom_categories: ['Headache', 'Fever', 'Fatigue', 'Nausea', 'Diarrhea', 'Other'],
  theme: 'system',
  weather_unit: 'auto',
  default_report_period: '7d',
  hidden_sections: [],
}
```

Add a new line after `symptom_categories`:

```javascript
issue_categories: ['Headache', 'Fever', 'Fatigue', 'Nausea', 'Diarrhea', 'Other'],
```

**Step 2: Commit**

```bash
git add js/data.js
git commit -m "feat(data): add issue_categories to schema defaults"
```

---

### Task 2: Add migration logic for existing data

**Files:**
- Modify: `js/data.js` (mergeWithDefaults function)

**Step 1: Add migration in mergeWithDefaults**

In `js/data.js`, find the `mergeWithDefaults()` function. After the main return statement that merges settings, add this check:

Locate this section:
```javascript
function mergeWithDefaults(loaded) {
  return {
    ...SCHEMA_DEFAULTS,
    ...loaded,
    settings: {
      ...SCHEMA_DEFAULTS.settings,
      ...(loaded.settings ?? {}),
    },
  };
}
```

After the function body, add migration logic. The function should now look like:

```javascript
function mergeWithDefaults(loaded) {
  const merged = {
    ...SCHEMA_DEFAULTS,
    ...loaded,
    settings: {
      ...SCHEMA_DEFAULTS.settings,
      ...(loaded.settings ?? {}),
    },
  };

  // Migration: Initialize issue_categories from symptom_categories if missing
  if (!merged.settings.issue_categories && merged.settings.symptom_categories) {
    merged.settings.issue_categories = [...merged.settings.symptom_categories];
  }

  return merged;
}
```

**Step 2: Commit**

```bash
git add js/data.js
git commit -m "feat(data): add migration to populate issue_categories from symptom_categories"
```

---

### Task 3: Update symptoms.js to use symptom_categories for symptoms

**Files:**
- Modify: `js/symptoms.js` (symptom form rendering)

**Step 1: Find the symptom form rendering code**

In `js/symptoms.js`, search for where the symptom category dropdown is rendered. Look for a section that builds HTML with something like `getSettings().symptom_categories`.

Find the line that looks like:
```javascript
const categories = Data.getSettings().symptom_categories ?? [];
```

Verify it's used in the symptom add/edit form (look for context like building a dropdown with categories). This line is already correct — it uses `symptom_categories` for symptoms.

**Step 2: Verify and document**

Add a comment above it to make it explicit:

```javascript
// Symptom categories — for classifying daily symptoms
const categories = Data.getSettings().symptom_categories ?? [];
```

**Step 3: Commit**

```bash
git add js/symptoms.js
git commit -m "refactor(symptoms): clarify symptom form uses symptom_categories"
```

---

### Task 4: Update symptoms.js to use issue_categories for issues

**Files:**
- Modify: `js/symptoms.js` (issue form rendering)

**Step 1: Find the issue form category selection**

In `js/symptoms.js`, search for the issue management panel. Look for where a category is assigned to an issue (likely in a form or when creating/editing an issue).

Search for patterns like `"issue"` and `"category"` in the rendering functions. Find where the issue form renders a category dropdown or selection.

**Step 2: Update to use issue_categories**

When rendering the issue form category selection, change it to use `issue_categories`:

```javascript
const issueCategories = Data.getSettings().issue_categories ?? [];
// Use issueCategories in the dropdown/form instead of the symptom categories
```

Look for code that might look like:
```javascript
const cat = fIssName; // or similar
```

And update any category references to use `Data.getSettings().issue_categories` instead of `symptom_categories`.

**Step 3: Commit**

```bash
git add js/symptoms.js
git commit -m "feat(symptoms): use issue_categories for issue categorization"
```

---

### Task 5: Split category manager into two sections

**Files:**
- Modify: `js/symptoms.js` (category manager UI)

**Step 1: Find the category manager rendering**

In `js/symptoms.js`, find the `toggleCatManager()` function and the category manager rendering code. Look for a function that builds the HTML for the category management panel.

**Step 2: Update to show two sections**

The category manager should now show two separate collapsible sections:

1. **Symptom Categories** — manages `symptom_categories`
2. **Issue Categories** — manages `issue_categories`

Modify the rendering code to:
- Render two category lists side-by-side or stacked
- Each list has its own add/remove/edit buttons
- Changes to symptom categories only affect symptom form
- Changes to issue categories only affect issue form

Example structure:
```
┌─────────────────────────────┐
│  Category Manager           │
├─────────────────────────────┤
│                             │
│  Symptom Categories:        │
│  [Headache] [x]             │
│  [Fever] [x]                │
│  [+ Add category]           │
│                             │
│  Issue Categories:          │
│  [Headache] [x]             │
│  [Fever] [x]                │
│  [+ Add category]           │
│                             │
└─────────────────────────────┘
```

**Step 3: Ensure add/remove/edit logic works for both lists**

When a user adds/edits/removes a category:
- If it's in the "Symptom Categories" section, update `symptom_categories` in settings
- If it's in the "Issue Categories" section, update `issue_categories` in settings

Make sure existing logic for adding/removing categories is duplicated for the issue list.

**Step 4: Commit**

```bash
git add js/symptoms.js
git commit -m "feat(symptoms): split category manager into symptom and issue sections"
```

---

### Task 6: Manual testing

**Files:**
- None (testing only)

**Step 1: Test migration on existing data**

Open the app with existing data that has issues with categories:
- Verify `issue_categories` appears in the data after load
- Verify it contains the same values as `symptom_categories`
- Verify existing issues still display their categories correctly

**Step 2: Test symptom form**

- Log a new symptom
- Verify the category dropdown shows only `symptom_categories` values
- Add a symptom with any category

**Step 3: Test issue form**

- Create a new issue or edit an existing one
- Verify the category dropdown shows only `issue_categories` values
- Assign a category to the issue

**Step 4: Test category manager**

- Open the category manager (gear icon)
- Verify two separate sections appear: "Symptom Categories" and "Issue Categories"
- Add a new symptom category (e.g., "Cough")
- Verify it appears in the symptom form but NOT the issue form
- Add a new issue category (e.g., "Chronic Condition")
- Verify it appears in the issue form but NOT the symptom form

**Step 5: Test independence**

- Verify removing a symptom category doesn't affect issue categories
- Verify removing an issue category doesn't affect symptom categories
- Create a symptom with the new "Cough" category — verify it works
- Create an issue with "Chronic Condition" — verify it works

**Step 6: No manual commit — testing only**

---

### Task 7: Final verification and commit check

**Files:**
- None (verification only)

**Step 1: Verify all tests pass (if any exist)**

Run any existing tests (though this app doesn't have a test suite):
```bash
# No tests currently — verification is manual
```

**Step 2: Verify git history**

```bash
git log --oneline | head -7
```

Expected output shows 7 commits:
1. Task 2: migration logic
2. Task 1: schema defaults
3. Task 3: symptom form clarification
4. Task 4: issue categories
5. Task 5: category manager split
6. Any previous commits

**Step 3: Check data integrity**

Load the app one more time and verify:
- `Data.getData().settings.symptom_categories` exists ✓
- `Data.getData().settings.issue_categories` exists ✓
- Both are arrays ✓
- All existing issues still have valid categories ✓

**Step 4: Done**

No additional commit needed — all work is committed in previous tasks.
