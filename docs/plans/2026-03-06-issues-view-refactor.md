# Issues View Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move Issues management from an inline panel on the Today tab into a dedicated full-screen view accessible from both the Today tab and Health Log tab, while fixing the category edit and save bugs.

**Architecture:** A new `#view-issues` full-screen overlay div (sibling to tab views inside `#screen-app`) replaces the existing inline `#symp-issues-panel`. Opening the view records `_issueReturnTab` so the back button always returns the user to where they came from. All issue rendering continues to live in `symptoms.js`.

**Tech Stack:** Vanilla JS, CSS custom properties, existing `App.switchTab()` for navigation.

---

### Task 1: Fix "+ New Issue" button overflow in symptom form

**Files:**
- Modify: `css/styles.css` (`.symp-issue-link-row` and `.symp-new-issue-quick-btn`)

**Step 1: Find the styles and update them**

In `css/styles.css`, find `.symp-issue-link-row` (around line 6383) and add `flex-wrap: wrap` so the row wraps on narrow screens. Also cap the button with `min-width` so it doesn't grow too large.

Replace:
```css
.symp-issue-link-row {
  display:   flex;
  gap:       8px;
  align-items: center;
}
```
With:
```css
.symp-issue-link-row {
  display:     flex;
  gap:         6px;
  align-items: center;
  flex-wrap:   wrap;
}
```

And replace the `symp-new-issue-quick-btn` `padding` to be tighter:
```css
.symp-new-issue-quick-btn {
  flex-shrink:   0;
  padding:       6px 10px;
  background:    var(--clr-accent-dim);
  color:         var(--clr-accent);
  border:        1.5px solid var(--clr-accent);
  border-radius: 8px;
  font-size:     0.80rem;
  font-weight:   600;
  cursor:        pointer;
  white-space:   nowrap;
  -webkit-tap-highlight-color: transparent;
}
```

**Step 2: Commit**
```bash
git add css/styles.css
git commit -m "fix(css): fix New Issue button overflow in symptom form"
```

---

### Task 2: Fix issue category edit form — visual update + old issue defaults

**Files:**
- Modify: `js/symptoms.js` (lines ~1063–1079 `startIssEdit`, `_setIssEditCat`)

**Problem:** Two bugs:
1. When a user clicks a category pill in the **issue edit form**, the pill doesn't visually highlight (because `_setIssEditCat` only updates state, it doesn't toggle the `.health-form-cat--active` class the way `_setCat` does).
2. Old issues with no `category` field show no pre-selected pill.

**Step 1: Fix `startIssEdit()` to default missing category**

Find `startIssEdit` (~line 1063) and change the `fIssEditCat` initialisation:
```javascript
function startIssEdit(issueId) {
  const issue = getIssues()[issueId];
  if (!issue) return;
  editingIssueId = issueId;
  fIssEditName   = issue.name ?? '';
  fIssEditRemind = !!issue.remind_daily;
  fIssEditNotes  = issue.notes ?? '';
  // Default to existing category, or first issue_category if missing
  const issueCats = Data.getSettings().issue_categories ?? [];
  fIssEditCat = (issue.category && issueCats.includes(issue.category))
    ? issue.category
    : (issueCats[0] ?? '');
  renderIssuePanel();
  requestAnimationFrame(() => {
    const inp = document.getElementById(`symp-iss-edit-name-${issueId}`);
    if (inp) inp.focus();
  });
}
```

**Step 2: Fix `_setIssEditCat` to update pill visual state**

Find `_setIssEditCat` and replace with:
```javascript
function _setIssEditCat(v) {
  fIssEditCat = v;
  // Update pill active state within the edit form only
  document.querySelectorAll('.symp-iss-edit-form .health-form-cat').forEach(b => {
    const on = b.dataset.cat === v;
    b.classList.toggle('health-form-cat--active', on);
    b.setAttribute('aria-pressed', String(on));
  });
}
```

**Step 3: Commit**
```bash
git add js/symptoms.js
git commit -m "fix(symptoms): fix issue category pre-selection and visual update in edit form"
```

---

### Task 3: Fix issue editing save not working

**Files:**
- Modify: `js/symptoms.js` (`saveIssEdit`)

**Problem:** `saveIssEdit()` silently returns early if `fIssEditName.trim()` is empty. In practice the name IS populated from `startIssEdit()`, so the real problem is likely that **after save the user doesn't see feedback** — the issue panel re-renders showing the list and it's not obvious the save happened. Also, `render()` is called inside `saveIssEdit()` which could cause a flicker. Verify by adding a `console.log` first.

**Step 1: Add diagnostic log, then test in browser**

Temporarily add to `saveIssEdit()`:
```javascript
function saveIssEdit(issueId) {
  console.log('[saveIssEdit] called', issueId, 'name:', fIssEditName, 'cat:', fIssEditCat);
  const name = fIssEditName.trim();
  if (!name) { console.warn('[saveIssEdit] empty name, returning'); return; }
  ...
}
```

Deploy, open browser console, try editing an issue, click Save, see what logs.

**Step 2: Fix based on findings**

Expected finding: the save IS working but `renderIssuePanel()` re-renders and the view switches back to the list without any visible confirmation. If so, the fix is just UX — no functional change needed.

If `fIssEditName` IS empty despite the input being filled: the `oninput` handler is not firing. Fix by reading the input value directly in `saveIssEdit()`:
```javascript
function saveIssEdit(issueId) {
  // Read directly from DOM in case oninput didn't fire
  const inp = document.getElementById(`symp-iss-edit-name-${issueId}`);
  if (inp) fIssEditName = inp.value;
  const name = fIssEditName.trim();
  if (!name) return;
  ...
}
```

**Step 3: Remove diagnostic log and commit**
```bash
git add js/symptoms.js
git commit -m "fix(symptoms): ensure issue edit name is read from DOM on save"
```

---

### Task 4: Add Issues full-screen view to HTML and CSS

**Files:**
- Modify: `index.html` (add `#view-issues` div)
- Modify: `css/styles.css` (add `.view-issues` styles)

**Step 1: Add the view div to index.html**

After the last `tab-view` div (after `#tab-treatments`, which ends around line 530) and before the bottom nav, add:
```html
<!-- ── Issues full-screen view ──────────────────────────────────────── -->
<div id="view-issues" class="view-issues" hidden>
  <div class="view-issues-header">
    <button class="view-issues-back-btn" type="button"
            id="view-issues-back"
            onclick="Symptoms._closeIssuesView()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
           width="18" height="18" aria-hidden="true">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
      Back
    </button>
    <span class="view-issues-title">Issues</span>
    <div style="width:64px"></div><!-- spacer to center title -->
  </div>
  <div id="view-issues-content" class="view-issues-content"></div>
</div>
```

**Step 2: Add CSS for the view**

In `css/styles.css`, find the end of the symp-issues-panel section (~line 6070) and add after it:
```css
/* ── Issues full-screen view ────────────────────────────────────────── */
.view-issues {
  position:      fixed;
  inset:         0;
  z-index:       200;
  background:    var(--clr-bg);
  display:       flex;
  flex-direction: column;
  overflow:      hidden;
}
.view-issues[hidden] { display: none !important; }

.view-issues-header {
  display:         flex;
  align-items:     center;
  justify-content: space-between;
  padding:         12px 16px;
  border-bottom:   1px solid var(--clr-border);
  background:      var(--clr-surface);
  flex-shrink:     0;
}

.view-issues-back-btn {
  display:     flex;
  align-items: center;
  gap:         4px;
  font-size:   0.88rem;
  font-weight: 600;
  color:       var(--clr-accent);
  background:  transparent;
  border:      none;
  cursor:      pointer;
  padding:     4px 0;
  -webkit-tap-highlight-color: transparent;
}

.view-issues-title {
  font-size:   1rem;
  font-weight: 700;
  color:       var(--clr-text);
}

.view-issues-content {
  flex:       1 1 0;
  overflow-y: auto;
  padding:    12px 0;
}
```

**Step 3: Commit**
```bash
git add index.html css/styles.css
git commit -m "feat(issues): add full-screen issues view container to HTML and CSS"
```

---

### Task 5: Wire up Issues view in symptoms.js

**Files:**
- Modify: `js/symptoms.js`

This is the core task. We:
1. Add `_issueReturnTab` state variable
2. Add `openIssuesView(returnTab, openNewForm)` function
3. Add `closeIssuesView()` function
4. Update `renderIssuePanel()` to render into `#view-issues-content`
5. Remove the `pendingNewIssue` mechanism (no longer needed)
6. Update the `#symp-issues-btn` click handler to call `openIssuesView('today')`
7. Update `closeIssuePanel()` to call `closeIssuesView()` instead

**Step 1: Add state variable**

Find the state variables section (~line 60) and add after `pendingNewIssue`:
```javascript
let _issueReturnTab = 'today';  // which tab to return to when closing issues view
```

**Step 2: Add `openIssuesView()` and `closeIssuesView()` functions**

Add these after `closeIssuePanel()` (~line 1075):
```javascript
function openIssuesView(returnTab = 'today', openNewForm = false) {
  _issueReturnTab   = returnTab;
  managingIssues    = true;
  issueDetailId     = null;
  issuePanelNewForm = false;
  pendingNewIssue   = false;
  if (openNewForm) {
    issuePanelNewForm = true;
    fIssName          = '';
    fIssRemind        = false;
    const issueCategories = Data.getSettings().issue_categories ?? [];
    fIssCat           = issueCategories[0] ?? 'Other';
  }
  document.getElementById('view-issues').hidden = false;
  renderIssuePanel();
}

function closeIssuesView() {
  document.getElementById('view-issues').hidden = true;
  managingIssues    = false;
  issueDetailId     = null;
  issuePanelNewForm = false;
  editingIssueId    = null;
  renderIssuePanel(); // clears the content
  App.switchTab(_issueReturnTab);
}
```

**Step 3: Update `renderIssuePanel()` to use `#view-issues-content`**

At the top of `renderIssuePanel()`, change the panel target:
```javascript
function renderIssuePanel() {
  // Render into the full-screen view, not the inline panel
  const panel = document.getElementById('view-issues-content');
  if (!panel) return;
  if (!managingIssues) { panel.innerHTML = ''; return; }
  // ... rest unchanged ...
}
```

Also remove the line `panel.hidden = false;` (no longer needed — visibility is controlled by `openIssuesView`) and the line `if (!managingIssues) { panel.hidden = true; panel.innerHTML = ''; return; }` — replace with just clearing innerHTML.

**Step 4: Update the "Done" button in the panel HTML to call `closeIssuesView`**

Inside `renderIssuePanel()`, find the "Done" button in the `panel.innerHTML`:
```javascript
// Change from:
<button class="symp-cat-done-btn" type="button" onclick="Symptoms._closeIssuePanel()">Done</button>
// To:
<button class="symp-cat-done-btn" type="button" onclick="Symptoms._closeIssuesView()">Done</button>
```

Also update the `buildIssueDetail()` back-chevron if it calls `closeIssuePanel` — change any `_closeIssuePanel` calls in the issue panel HTML to `_closeIssuesView`.

**Step 5: Update `init()` to wire up the issues button**

In `init()`, change the issues button click handler:
```javascript
function init() {
  currentDate = DateNav.getDate();
  document.getElementById('symp-cat-toggle').addEventListener('click', toggleCatManager);
  document.getElementById('symp-issues-btn').addEventListener('click', () => openIssuesView('today'));
  render();
}
```

**Step 6: Remove `pendingNewIssue` from `setDate()`**

In `setDate()`, remove the `pendingNew` branch:
```javascript
// Remove these lines:
const pendingNew = pendingNewIssue;
// ...
pendingNewIssue = false;
// ...
} else if (pendingNew) {
  render();
  quickNewIssue();
}
```
Keep the rest of `setDate()` as-is.

Also remove `pendingNewIssue` state variable declaration and `openNewIssueFromHealthLog()` function — they're replaced by `openIssuesView()`.

**Step 7: Add public wrappers and update public API**

Add wrappers:
```javascript
function _openIssuesView(tab, newForm) { openIssuesView(tab, !!newForm); }
function _closeIssuesView()            { closeIssuesView(); }
```

In the `return {}` block, replace `_closeIssuePanel`, `_openNewIssueFromHealthLog`, `_quickNewIssue` with:
```javascript
_openIssuesView, _closeIssuesView,
```
Keep `_closeIssueDetail` and `_openIssueFromHealthLog` if still used.

**Step 8: Commit**
```bash
git add js/symptoms.js
git commit -m "feat(symptoms): move issues management to full-screen view with back navigation"
```

---

### Task 6: Update entry points in Today tab and Health Log

**Files:**
- Modify: `index.html` (symp-issues-btn onclick/label)
- Modify: `js/health-log.js` (+ New Issue button, issue row click)

**Step 1: Update the Today tab Issues button**

In `index.html`, the `#symp-issues-btn` currently has `onclick="event.stopPropagation()"`. The click is wired in JS via `init()`. That's fine — no HTML change needed for the button itself.

**Step 2: Update Health Log "+ New Issue" button**

In `js/health-log.js`, find the `+ New Issue` button (~line 464) and change the onclick:
```javascript
// Change from:
onclick="event.stopPropagation(); Symptoms._openNewIssueFromHealthLog()"
// To:
onclick="event.stopPropagation(); Symptoms._openIssuesView('health-log', true)"
```

**Step 3: Update Health Log issue row click**

In `js/health-log.js`, the `issueRow()` function calls `HealthLog._openDetail('${issue.id}')` which opens the issue detail within the Health Log's own detail view. This is fine — leave it as-is since it's a different view.

However, we should also allow clicking an issue in the HL list to open it in the Issues full-screen view instead. Change `issueRow()` onclick:
```javascript
// Change from:
return `<div class="hl-issue-row" onclick="HealthLog._openDetail('${issue.id}')">
// To:
return `<div class="hl-issue-row" onclick="Symptoms._openIssueDetailFromTab('${issue.id}', 'health-log')">
```

And add a new wrapper in `symptoms.js`:
```javascript
function _openIssueDetailFromTab(issueId, returnTab) {
  openIssuesView(returnTab, false);
  openIssueDetail(issueId);
}
```

**Step 4: Commit**
```bash
git add js/health-log.js js/symptoms.js
git commit -m "feat(issues): update Today and Health Log entry points to use full-screen issues view"
```

---

### Task 7: Hide the old inline panel and clean up

**Files:**
- Modify: `index.html` (remove or hide `#symp-issues-panel`)
- Modify: `css/styles.css` (can remove `.symp-issues-panel` styles if panel removed)
- Modify: `js/symptoms.js` (remove stale `toggleIssuePanel`, old `closeIssuePanel` wrappers)

**Step 1: Remove `#symp-issues-panel` from index.html**

Find and delete this line in index.html (~line 415):
```html
<div id="symp-issues-panel" class="symp-issues-panel" hidden></div>
```

**Step 2: Remove `toggleIssuePanel()` from symptoms.js**

The old `toggleIssuePanel()` function is replaced by `openIssuesView()`. Delete it (or leave it unreferenced — safe either way).

Remove from public API if present: `_closeIssuePanel`, `_openNewIssueFromHealthLog`, `_quickNewIssue`.

**Step 3: Bump version and push**
```bash
git add index.html css/styles.css js/symptoms.js js/health-log.js
# Update APP_VERSION in js/config.js to '2026.03.07'
git add js/config.js
git commit -m "chore: bump version to 2026.03.07 (issues full-screen view)"
git push
```

---

### Task 8: Manual testing checklist

After pushing, test at https://jfcass.github.io/dailytracker (hard refresh first):

- [ ] App loads without console errors
- [ ] Today tab: tapping the Issues button (shield/checkmark icon in Health section header) opens the full-screen Issues view
- [ ] Issues view shows all active and resolved issues
- [ ] "+ New Issue" button in Issues view opens the new issue form with issue_categories pills
- [ ] Creating a new issue and tapping "Create Issue" → saves and returns to issues list
- [ ] "Done" / back button returns to the Today tab
- [ ] Health Log tab: expanding Issues section shows "+ New Issue" button
- [ ] Tapping "+ New Issue" from Health Log opens Issues full-screen view with new issue form open
- [ ] "Done" / back from that view returns to Health Log tab
- [ ] Editing an existing issue (old or new) shows category pills with correct selection pre-filled
- [ ] Clicking a category pill highlights it visually
- [ ] Tapping Save after editing saves the changes (name + category visible in list after)
- [ ] "Link to issue" dropdown in Add Symptom form: "+ New" button doesn't overflow on mobile
- [ ] No JavaScript errors in console throughout all flows
