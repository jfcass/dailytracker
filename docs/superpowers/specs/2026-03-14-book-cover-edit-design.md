# Book Cover Edit — Design Spec
_Date: 2026-03-14_

## Overview

Two enhancements to the Library tab:

1. Tapping the cover on the "Now Reading" hero card opens the full book edit form.
2. The edit form gets a polished cover section: an image overlaid with a × button when a cover exists, and upload-from-device + paste-URL controls when no cover is set.

---

## Codebase context

The edit form is built by `buildLibBookForm()` in `books.js`. The current form:
- Shows a cover preview + text "✕ Remove cover" button (`book-cover-clear-btn`) when `fbCoverUrl` is non-empty. `Books._fbClearCover()` already exists and handles this (sets `fbCoverUrl = ''`, calls `renderLibraryTab()`).
- Shows Title, Author, Pages fields, then Save/Cancel.
- No URL input or upload button is currently present for adding a cover.

All `fb*` variables (`fbTitle`, `fbAuthor`, `fbPages`, `fbCoverUrl`, `fbIsbn`) are module-level closure variables. `renderLibraryTab()` reads them to rebuild the form HTML — it does not reset them. Re-rendering mid-edit preserves all in-progress field values.

---

## Feature 1: Hero Cover → Edit Form

**Trigger:** User taps the cover area on the hero card.

**Change in `renderHeroCard()`:** Wrap the existing cover element (`<img class="lib-hero-cover">` or `<div class="lib-hero-cover lib-hero-cover--empty">`) in a new `<div>` with `onclick="Books._editHeroBook()" style="cursor:pointer; display:inline-block"`. The handler goes on the wrapper, not duplicated on each child.

**New public method `_editHeroBook()`:** Public wrapper that calls the existing private `startEditBook(id)` directly via closure scope (no exposure of `startEditBook` needed). Resolves the current hero book using the same logic already present in `renderLibraryTab()`:

```js
function _editHeroBook() {
  const bookList = Object.values(getBooks());
  const reading  = bookList
    .filter(b => b.status === 'reading')
    .sort((a, b) => {
      const la = getLastSessionDate(a.id);
      const lb = getLastSessionDate(b.id);
      if (!la && !lb) return 0;
      if (!la) return 1;
      if (!lb) return -1;
      return lb.localeCompare(la);
    });
  const book = reading[heroBookIdx];
  if (!book) return;
  startEditBook(book.id);
}
```

`startEditBook(id)` is an existing private function — no changes required. `heroBookIdx` is an existing module-level closure variable.

---

## Feature 2: Inline Cover Section in Edit Form

Modifies `buildLibBookForm()` to replace the current cover preview block (which uses `book-cover-preview` / `book-cover-clear-btn` classes) with a new polished section.

### New state variable

```js
let fbCoverError = ''; // inline error message for oversized file upload
```

Reset to `''` in `cancelBookEdit()` and `saveBook()` alongside the other `fb*` resets.

### When a cover exists (`fbCoverUrl` non-empty)

Replace the current `<div class="book-cover-preview">` block with:

```html
<div class="lib-form-cover-wrap">
  <img class="lib-form-cover-img" src="${escHtml(fbCoverUrl)}" alt="Book cover">
  <button class="lib-form-cover-remove" aria-label="Remove cover"
          onclick="Books._fbClearCover()">×</button>
</div>
```

`_fbClearCover()` already exists — no changes needed. It clears `fbCoverUrl` and calls `renderLibraryTab()`, which re-renders the form in the no-cover state.

CSS for new classes:
```css
.lib-form-cover-wrap {
  position: relative;
  display: inline-block;
}
.lib-form-cover-img {
  width: 88px;
  height: 128px;
  object-fit: cover;
  border-radius: 6px;
  display: block;
}
.lib-form-cover-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 28px;
  height: 28px;
  background: rgba(0,0,0,0.55);
  color: #fff;
  border: none;
  border-radius: 50%;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
/* Expand tap target without changing visual size */
.lib-form-cover-remove::after {
  content: '';
  position: absolute;
  inset: -8px;
}
```

### When no cover exists (`fbCoverUrl` empty)

Render below the (now absent) cover preview, before the Title field:

```html
<div class="lib-form-cover-empty">
  <input type="file" accept="image/*" id="lib-cover-file-input" style="display:none"
         onchange="Books._onCoverFileChange(this)">
  <button class="lib-form-cover-upload-btn" type="button"
          onclick="Books._triggerCoverUpload()">📷 Upload</button>
  <input type="text" class="lib-form-cover-url"
         placeholder="Paste image URL…"
         value="${escHtml(fbCoverUrl)}"
         oninput="Books._fbCoverUrlInput(this.value)"
         onblur="Books._fbCoverUrlCommit(this.value)">
</div>
${fbCoverError ? `<div class="lib-form-cover-error">${escHtml(fbCoverError)}</div>` : ''}
```

CSS:
```css
.lib-form-cover-empty {
  display: flex;
  align-items: center;
  gap: 8px;
}
.lib-form-cover-upload-btn {
  width: 110px;
  flex-shrink: 0;
  padding: 8px 0;
  background: var(--clr-surface-2);
  color: var(--clr-text);
  border: 1px solid var(--clr-border);
  border-radius: 8px;
  font-size: 0.85rem;
  font-family: inherit;
  cursor: pointer;
  text-align: center;
}
.lib-form-cover-url {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  background: var(--clr-surface-2);
  color: var(--clr-text);
  border: 1px solid var(--clr-border);
  border-radius: 8px;
  font-size: 0.9rem;
  font-family: inherit;
}
.lib-form-cover-error {
  font-size: 0.8rem;
  color: var(--clr-error);
  margin-top: 4px;
}
```

### URL field — two handlers

**`_fbCoverUrlInput(val)`** (fires on every keystroke via `oninput`): updates `fbCoverUrl = val.trim()` in state only — no re-render. This keeps state in sync without triggering a re-render on each keystroke (which would show a broken-image preview for partial URLs).

**`_fbCoverUrlCommit(val)`** (fires on `onblur`): sets `fbCoverUrl = val.trim(); fbCoverError = '';` then calls `renderLibraryTab()`. If the value is non-empty, the form re-renders showing the cover preview + × button. If empty, re-renders in the no-cover state.

Note: the `value` attribute of the URL input is always set from `fbCoverUrl` in the rendered HTML. After a file is selected (setting `fbCoverUrl` to a data URL and re-rendering), the `lib-form-cover-empty` block is replaced by `lib-form-cover-wrap` — the URL input does not appear, so no explicit "clear the URL field" step is needed.

### Upload handlers

**`_triggerCoverUpload()`** — synchronous, no async operations before `.click()`:
```js
function _triggerCoverUpload() {
  document.getElementById('lib-cover-file-input').click();
}
```
This preserves the user-gesture chain required by mobile Safari for programmatic file input activation.

**`_onCoverFileChange(input)`:**
```
1. const file = input.files[0]; if (!file) return;
2. if (file.size > 2 * 1024 * 1024):
     fbCoverError = 'Image too large — use a smaller file or paste a URL';
     renderLibraryTab(); return;
3. fbCoverError = '';
4. const reader = new FileReader();
5. reader.onload = e => { fbCoverUrl = e.target.result; renderLibraryTab(); };
6. reader.readAsDataURL(file);
```

The `<input type="file">` is rendered inline in the form HTML and re-created on each `renderLibraryTab()` call. After file selection, `renderLibraryTab()` immediately replaces it — this is intentional. There is no stale file input state to manage.

---

## Public API additions

New entries on the `Books` returned object:

| Method | Purpose |
|---|---|
| `_editHeroBook()` | Resolves hero book, calls private `startEditBook()` |
| `_fbCoverUrlInput(val)` | Updates `fbCoverUrl` state on keystroke (no re-render) |
| `_fbCoverUrlCommit(val)` | Commits URL on blur, clears error, re-renders |
| `_triggerCoverUpload()` | Synchronous `.click()` on hidden file input |
| `_onCoverFileChange(input)` | Size guard + FileReader + re-render |

`_fbClearCover()` already exists and is reused unchanged.

---

## Data & Storage

No schema change. `book.cover_url` accepts any string. The 2 MB guard limits data URL size to something manageable in the Drive JSON.

---

## Implementation notes

- **Cover block position:** Both the `lib-form-cover-wrap` (cover exists) and `lib-form-cover-empty` (no cover) blocks render at the same position in `buildLibBookForm()`: immediately before the Title field, replacing the current `book-cover-preview` block.
- **`startEditBook()` must reset `fbCoverError`:** `startEditBook()` already resets `fbTitle`, `fbAuthor`, etc. Add `fbCoverError = '';` there alongside the other resets to ensure the error doesn't persist when re-opening the form.
- **Blur with no change:** `_fbCoverUrlCommit` calling `renderLibraryTab()` even when nothing changed is harmless — all `fb*` vars are preserved.
- **No URL validation:** If the user pastes a URL that produces a broken image, the `<img>` shows a broken state. No `onerror` handling needed.
- **Partial URL on Save:** `saveBook()` reads `fbCoverUrl` as-is (set by `_fbCoverUrlInput` on each keystroke). A partial/invalid URL entered without blurring will be stored as `book.cover_url`. This is acceptable — the user chose to save.
- **`_triggerCoverUpload` null guard:** The Upload button only renders in the no-cover branch, so `document.getElementById('lib-cover-file-input')` will always find the element when the button is clicked. No null guard needed, but a single `if (!el) return;` guard is fine to add defensively.
- **`file` reference in FileReader callback:** `file` is captured as a local variable from `input.files[0]`. It remains valid for the lifetime of the FileReader even after the `<input>` element is removed from the DOM on re-render.
- **Hero cover empty state:** No additional visual affordance (e.g., "Add cover" label) needed on the empty hero cover placeholder.
- **`escHtml`:** Already defined within `books.js` scope — no import needed.
- **`getBooks()` and `getLastSessionDate()`:** Both are existing private helpers already in scope within `books.js`.

## Out of Scope

- The detail sheet "Update Cover" URL field is unchanged.
- No image compression.
- No changes outside `books.js` and `css/styles.css`.
