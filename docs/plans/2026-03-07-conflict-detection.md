# Drive Conflict Detection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Detect when Google Drive's copy of the data file was updated by another device since the app last loaded it, and offer the user a choice before their local changes overwrite it.

**Architecture:** Track the Drive file's `modifiedTime` on load and after every successful save. Before each save, do a rate-limited lightweight metadata fetch to compare — if the server's `modifiedTime` has advanced, dispatch a DOM event instead of saving. `app.js` listens for this event and shows a modal giving the user two choices: reload the latest data from Drive, or force-save their local version.

**Tech Stack:** Google Drive REST API v3 (`files.get?fields=modifiedTime`), custom DOM events, vanilla HTML/CSS/JS module pattern

---

## Background

All save calls across the app go through `Data.save()` → `writeFile()`. The load path is:
- `findFile()` — lists files matching the name, returns `id`
- `readFile(id)` — fetches `?alt=media` to get the JSON body

The Drive `files.list` and `files.get` responses can include `modifiedTime` (ISO 8601) for free by adding it to the `fields` parameter. The multipart upload (`PATCH`) response can also return `modifiedTime` when `fields=modifiedTime` is added to the URL.

No schema or data shape changes are needed — this is purely infrastructure.

---

## Task 1 — Track `modifiedTime` through load and save

**Files:**
- Modify: `js/data.js`

### Step 1 — Add state variable and rate-limit constant

In `data.js`, directly below `let fileId = null;` and `let data = null;`, add:

```js
let lastKnownModifiedTime = null;   // ISO string from Drive; null until first load
let lastConflictCheckAt   = 0;      // epoch ms; throttles the pre-save metadata fetch
const CONFLICT_CHECK_INTERVAL_MS = 60_000;  // check at most once per minute
```

### Step 2 — Capture `modifiedTime` in `findFile()`

Replace the existing `findFile()`:

```js
async function findFile() {
  const res  = await driveGet('/files', {
    q:      `name='${CONFIG.DATA_FILE_NAME}' and trashed=false`,
    fields: 'files(id,modifiedTime)',
    spaces: 'drive',
  });
  const json = await res.json();
  const file = json.files?.[0];
  if (file?.modifiedTime) lastKnownModifiedTime = file.modifiedTime;
  return file?.id ?? null;
}
```

### Step 3 — Capture updated `modifiedTime` after every successful write

Replace the existing `writeFile()`. Key changes:
1. Add `fields=id,modifiedTime` (create) / `fields=modifiedTime` (update) to upload URLs.
2. Parse the JSON response and store the new `modifiedTime`.

```js
async function writeFile(content) {
  const token = Auth.getToken();
  if (!token) throw new Error('Not authenticated');

  const body     = JSON.stringify(content, null, 2);
  const metadata = JSON.stringify({
    name:     CONFIG.DATA_FILE_NAME,
    mimeType: 'application/json',
  });

  const form = new FormData();
  form.append('metadata', new Blob([metadata], { type: 'application/json' }));
  form.append('media',    new Blob([body],     { type: 'application/json' }));

  if (!fileId) {
    // Create new file — get back id + modifiedTime
    const res = await fetch(
      `${CONFIG.DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,modifiedTime`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
    );
    if (!res.ok) throw new Error(`Drive create failed: ${res.status}`);
    const json = await res.json();
    fileId = json.id;
    if (json.modifiedTime) lastKnownModifiedTime = json.modifiedTime;
  } else {
    // Update existing file — get back modifiedTime
    const res = await fetch(
      `${CONFIG.DRIVE_UPLOAD}/files/${fileId}?uploadType=multipart&fields=modifiedTime`,
      { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: form }
    );
    if (!res.ok) throw new Error(`Drive update failed: ${res.status}`);
    const json = await res.json();
    if (json.modifiedTime) lastKnownModifiedTime = json.modifiedTime;
  }
}
```

### Step 4 — Manual verification (browser console)

Open the app, sign in. In the console:
```js
// After app loads, check that a modifiedTime was captured
// (Data module doesn't expose it directly yet — we'll verify via network tab)
```

Open DevTools → Network → filter `files?` — the files list request should have `modifiedTime` in the response JSON. ✓

### Step 5 — Commit

```bash
git add js/data.js
git commit -m "feat(data): track Drive modifiedTime through load and save"
```

---

## Task 2 — Pre-save conflict check + `forceSave()`

**Files:**
- Modify: `js/data.js`

### Step 1 — Add `getServerModifiedTime()` helper

Add after `writeFile()`:

```js
async function getServerModifiedTime() {
  if (!fileId) return null;
  const res  = await driveGet(`/files/${fileId}`, { fields: 'modifiedTime' });
  const json = await res.json();
  return json.modifiedTime ?? null;
}
```

### Step 2 — Add conflict check to `save()`

Replace the existing `save()`:

```js
async function save() {
  if (!data) return;
  try {
    // Rate-limited conflict check: only if we know the file and have a baseline time
    if (fileId && lastKnownModifiedTime) {
      const now = Date.now();
      if (now - lastConflictCheckAt >= CONFLICT_CHECK_INTERVAL_MS) {
        lastConflictCheckAt = now;
        const serverTime = await getServerModifiedTime();
        if (serverTime && serverTime !== lastKnownModifiedTime) {
          document.dispatchEvent(new CustomEvent('ht-data-conflict', {
            detail: { serverTime, ourTime: lastKnownModifiedTime }
          }));
          return;  // Do NOT save — let the user decide
        }
      }
    }
    await writeFile(data);
  } catch (err) {
    // If the token expired mid-session, try a silent re-auth and retry once
    const isAuthErr = err.message?.includes('Not authenticated')
                   || err.message?.includes('401');
    if (isAuthErr) {
      await Auth.requestToken(true);
      await writeFile(data);
    } else {
      throw err;
    }
  }
}
```

### Step 3 — Add `forceSave()` (bypasses the conflict check)

Add directly after `save()`:

```js
async function forceSave() {
  if (!data) return;
  lastConflictCheckAt = Date.now();  // reset the timer so next save doesn't re-check immediately
  await writeFile(data);
}
```

### Step 4 — Export `forceSave` in the return object

Locate the `return { load, save, ... }` at the bottom of `data.js` and add `forceSave`:

```js
return {
  load, save, forceSave,
  hashPIN, verifyPIN, setPIN, hasPIN,
  getData, getSettings, getDay, today,
};
```

### Step 5 — Commit

```bash
git add js/data.js
git commit -m "feat(data): conflict check before save, forceSave bypass"
```

---

## Task 3 — Conflict modal UI (HTML + CSS)

**Files:**
- Modify: `index.html`
- Modify: `css/styles.css`

### Step 1 — Add modal HTML to `index.html`

Find the `<div id="reconnect-banner" ...>` element (near the top of `screen-app` or just before `</body>`). Add the conflict modal immediately after it:

```html
<!-- Conflict modal — shown when Drive file was updated by another device -->
<div id="conflict-modal" class="conflict-modal" hidden aria-modal="true" role="dialog" aria-labelledby="conflict-title">
  <div class="conflict-modal__card">
    <h3 class="conflict-modal__title" id="conflict-title">Data Updated Elsewhere</h3>
    <p class="conflict-modal__body">
      This file was updated on another device since you opened the app here.
      Your unsaved changes would overwrite that update.
    </p>
    <div class="conflict-modal__actions">
      <button class="conflict-modal__btn conflict-modal__btn--reload" id="conflict-reload">
        Reload latest
      </button>
      <button class="conflict-modal__btn conflict-modal__btn--force" id="conflict-force">
        Keep my changes
      </button>
    </div>
  </div>
</div>
```

### Step 2 — Add CSS for conflict modal

At the end of `css/styles.css`, add:

```css
/* ── Conflict modal ──────────────────────────────────────────────────────── */
.conflict-modal {
  position:        fixed;
  inset:           0;
  background:      rgba(0,0,0,0.55);
  display:         flex;
  align-items:     center;
  justify-content: center;
  z-index:         9000;
  padding:         24px;
}
.conflict-modal[hidden] { display: none; }
.conflict-modal__card {
  background:    var(--clr-surface);
  border:        1px solid var(--clr-border);
  border-radius: 16px;
  padding:       24px;
  max-width:     340px;
  width:         100%;
  box-shadow:    0 8px 32px rgba(0,0,0,0.25);
}
.conflict-modal__title {
  font-size:   1rem;
  font-weight: 700;
  margin:      0 0 10px;
  color:       var(--clr-text);
}
.conflict-modal__body {
  font-size:    0.88rem;
  color:        var(--clr-text-2);
  line-height:  1.5;
  margin:       0 0 20px;
}
.conflict-modal__actions {
  display:        flex;
  flex-direction: column;
  gap:            10px;
}
.conflict-modal__btn {
  border:        none;
  border-radius: 10px;
  font-size:     0.92rem;
  font-weight:   600;
  padding:       12px 16px;
  cursor:        pointer;
  width:         100%;
}
.conflict-modal__btn--reload {
  background: var(--clr-accent);
  color:      #fff;
}
.conflict-modal__btn--force {
  background: var(--clr-surface-2);
  color:      var(--clr-text-2);
  border:     1px solid var(--clr-border);
}
```

### Step 3 — Visual check

Open the app in browser. In console run:
```js
document.getElementById('conflict-modal').hidden = false;
```
Verify the modal appears centred with a dark overlay, correct colours in both light and dark mode (toggle via DevTools → Rendering → Emulate prefers-color-scheme). Then:
```js
document.getElementById('conflict-modal').hidden = true;
```

### Step 4 — Commit

```bash
git add index.html css/styles.css
git commit -m "feat(ui): conflict modal HTML and styles"
```

---

## Task 4 — Wire conflict event → modal → reload / force-save

**Files:**
- Modify: `js/app.js`

### Step 1 — Add `reRenderAll()` helper

After `applyVisibility()` in `app.js`, add:

```js
/** Re-renders all today-tab sections after a data reload */
function reRenderAll() {
  const date = DateNav.getDate();
  // setDate() on each module re-renders it with the current in-memory data
  Weather.setDate(date);
  Mood.setDate(date);
  Habits.setDate(date);
  Moderation.setDate(date);
  Symptoms.setDate(date);
  Medications.setDate(date);
  Bowel.setDate(date);
  Gratitudes.setDate(date);
  if (typeof Books !== 'undefined') Books.setDate(date);
  // Force re-render of whatever tab is active
  switchTab(currentTab, false);
}
```

### Step 2 — Add `showConflictModal()` and `hideConflictModal()`

After `hideReconnectBanner()`:

```js
function showConflictModal() {
  const modal = document.getElementById('conflict-modal');
  if (modal) modal.hidden = false;
}

function hideConflictModal() {
  const modal = document.getElementById('conflict-modal');
  if (modal) modal.hidden = true;
}
```

### Step 3 — Wire conflict event listener and button handlers in `showMain()`

Inside `showMain()`, after the `document.addEventListener('ht-auth-expired', ...)` block (or anywhere after DOM is ready), add:

```js
// Conflict detection — fired by Data.save() when Drive file was updated elsewhere
document.addEventListener('ht-data-conflict', showConflictModal);

// "Reload latest" — fetch fresh data from Drive and re-render
document.getElementById('conflict-reload')?.addEventListener('click', async () => {
  hideConflictModal();
  try {
    await Data.load();
    reRenderAll();
  } catch (err) {
    console.error('Conflict reload failed:', err);
  }
});

// "Keep my changes" — force-save local data, accepting that other device's changes are lost
document.getElementById('conflict-force')?.addEventListener('click', async () => {
  hideConflictModal();
  try {
    await Data.forceSave();
  } catch (err) {
    console.error('Force save failed:', err);
  }
});
```

Note: wire the event listener in `showMain()` (not `init()`) so it only fires when the user is in the app screen, consistent with the pattern used for `ht-auth-expired`.

### Step 4 — Add `reRenderAll` to public API

In the `return { ... }` at the bottom of `app.js`:

```js
return { init, showScreen, showMain, switchTab, toggleSection, applyVisibility, showReconnectBanner, reRenderAll };
```

### Step 5 — Commit

```bash
git add js/app.js
git commit -m "feat(app): wire conflict modal to reload/force-save actions"
```

---

## Task 5 — End-to-end test

### Step 1 — Simulate a conflict in the console

With the app loaded in the browser, open the console and run:

```js
// Manually advance lastKnownModifiedTime to something in the past
// so the next save will see a newer server time.
// We can't access the private variable directly, so instead we trigger the event:
document.dispatchEvent(new CustomEvent('ht-data-conflict', {
  detail: { serverTime: 'simulated', ourTime: 'old' }
}));
```

The conflict modal should appear. ✓

### Step 2 — Test "Reload latest" path

Click "Reload latest" → modal closes, app re-renders with current data. ✓

### Step 3 — Test "Keep my changes" path

Trigger the conflict again (Step 1), click "Keep my changes" → modal closes, no visible error. In Network tab, verify a PATCH to the Drive upload endpoint was made. ✓

### Step 4 — Verify rate limiting

Check that `lastConflictCheckAt` prevents back-to-back checks: trigger two saves in quick succession — the Network tab should show only ONE metadata GET per minute window.

### Step 5 — Final commit + version bump

```bash
# Bump APP_VERSION in js/config.js  (e.g., '2026.03.07h')
git add js/config.js
git commit -m "chore: bump version to 2026.03.07h"
git push
```

---

## Files Changed Summary

| File | Change |
|---|---|
| `js/data.js` | Add `lastKnownModifiedTime`, `lastConflictCheckAt`; update `findFile()`, `writeFile()`, `save()`; add `getServerModifiedTime()`, `forceSave()` |
| `js/app.js` | Add `reRenderAll()`, `showConflictModal()`, `hideConflictModal()`; wire `ht-data-conflict` event + button handlers in `showMain()` |
| `index.html` | Add `#conflict-modal` overlay |
| `css/styles.css` | Add `.conflict-modal` and child styles |
| `js/config.js` | Version bump |
