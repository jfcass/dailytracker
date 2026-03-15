# Book Cover Edit Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users tap the hero card cover to edit a book, remove existing cover art via an overlay × button, and add cover art via file upload or URL paste.

**Architecture:** All changes are in `books.js` and `css/styles.css`. No new files. The edit form's cover block is replaced with a polished section; hero card cover gets a click handler that opens the edit form.

**Tech Stack:** Vanilla JS, CSS custom properties. No build step. Testing is manual on device after `git push`.

**Spec:** `docs/superpowers/specs/2026-03-14-book-cover-edit-design.md`

---

## Chunk 1: State + edit form cover section

### Task 1: Add `fbCoverError` state variable and reset it everywhere

**Files:**
- Modify: `js/books.js` (state declarations ~line 40, `startAddBook` ~line 472, `startEditBook` ~line 487, `cancelBookEdit` ~line 502, `saveBook` ~line 555)

- [ ] **Step 1: Add the state variable declaration**

Find the block of `fb*` variable declarations near line 40:
```js
  let fbIsbn     = '';
```
Add immediately after it:
```js
  let fbCoverError = ''; // inline error for oversized file upload
```

- [ ] **Step 2: Reset in `startAddBook()`**

In `startAddBook()`, find the single line:
```js
    fbIsbn          = '';
```
Add `fbCoverError = '';` on the next line immediately after it:
```js
    fbIsbn          = '';
    fbCoverError    = '';
```
(There is exactly one `fbIsbn = '';` in `startAddBook` — it is followed by `fbSearchQuery = '';` and more lines.)

- [ ] **Step 3: Reset in `startEditBook()`**

In `startEditBook()`, find the single line:
```js
    fbIsbn          = book.isbn        ?? '';
```
Add `fbCoverError = '';` on the next line immediately after it:
```js
    fbIsbn          = book.isbn        ?? '';
    fbCoverError    = '';
```
(There is exactly one `fbIsbn` assignment in `startEditBook` — it is followed by `fbSearchQuery = '';` and more lines.)

- [ ] **Step 4: Reset in `cancelBookEdit()`**

In `cancelBookEdit()`, find the single line:
```js
    fbIsbn          = '';
```
Add `fbCoverError = '';` on the next line immediately after it. To disambiguate from the similar line in `startAddBook`, look for this function starting with `function cancelBookEdit()`.

Result:
```js
    fbIsbn          = '';
    fbCoverError    = '';
```

- [ ] **Step 5: Reset in `saveBook()`**

In `saveBook()`, find the single line that resets `fbIsbn` in the teardown block near the bottom of the function (after the `if (editingBookId) { ... } else { ... }` branches):
```js
    fbIsbn          = '';
```
Add `fbCoverError = '';` on the next line immediately after it:
```js
    fbIsbn          = '';
    fbCoverError    = '';
```

---

### Task 2: Replace the cover preview block in `buildLibBookForm()`

**Files:**
- Modify: `js/books.js` (`buildLibBookForm` function ~line 934)

The current cover block in `buildLibBookForm()` looks like this:
```js
    if (fbCoverUrl) {
      html += `<div class="book-cover-preview">
        <img src="${escHtml(fbCoverUrl)}" alt="Book cover" class="book-cover-preview-img">
        <button class="book-cover-clear-btn" type="button" onclick="Books._fbClearCover()">✕ Remove cover</button>
      </div>`;
    }
```

- [ ] **Step 1: Replace the entire cover block**

Replace the existing `if (fbCoverUrl) { ... }` cover block with:
```js
    if (fbCoverUrl) {
      html += `<div class="lib-form-cover-wrap">
        <img class="lib-form-cover-img" src="${escHtml(fbCoverUrl)}" alt="Book cover">
        <button class="lib-form-cover-remove" aria-label="Remove cover"
                onclick="Books._fbClearCover()">×</button>
      </div>`;
    } else {
      html += `<div class="lib-form-cover-empty">
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
      ${fbCoverError ? `<div class="lib-form-cover-error">${escHtml(fbCoverError)}</div>` : ''}`;
    }
```

---

### Task 3: Add new handler functions and update the public API

**Files:**
- Modify: `js/books.js` (handler functions ~line 1278, public API `return` block ~line 1350)

- [ ] **Step 1: Add new handlers after `_fbClearCover`**

Find `_fbClearCover` (around line 1278):
```js
  function _fbClearCover()          { fbCoverUrl = ''; renderLibraryTab(); }
```
Add these four functions immediately after it:
```js
  function _fbCoverUrlInput(val)  { fbCoverUrl = val.trim(); }
  function _fbCoverUrlCommit(val) { fbCoverUrl = val.trim(); fbCoverError = ''; renderLibraryTab(); }
  function _triggerCoverUpload()  {
    const el = document.getElementById('lib-cover-file-input');
    if (el) el.click();
  }
  function _onCoverFileChange(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      fbCoverError = 'Image too large — use a smaller file or paste a URL';
      renderLibraryTab();
      return;
    }
    fbCoverError = '';
    const reader = new FileReader();
    reader.onload = e => { fbCoverUrl = e.target.result; renderLibraryTab(); };
    reader.readAsDataURL(file);
  }
```

- [ ] **Step 2: Add new methods to the public API `return` block**

Find the `return {` block at the bottom of the module. Find the line:
```js
    _fbSearch, _fbSelectResult, _fbClearCover,
```
Replace it with:
```js
    _fbSearch, _fbSelectResult, _fbClearCover,
    _fbCoverUrlInput, _fbCoverUrlCommit, _triggerCoverUpload, _onCoverFileChange,
```
(Note: `_editHeroBook` is added to the public API in Chunk 3 Task 5, not here.)

---

## Chunk 2: CSS for the cover section

### Task 4: Add CSS classes for the new cover section

**Files:**
- Modify: `css/styles.css` (add after existing `lib-*` cover styles — search for `.lib-detail-cover` to find a good anchor)

- [ ] **Step 1: Add the new CSS block**

Find the end of the `lib-detail-cover` styles block in `styles.css`. Add the following after them:
```css
/* ── Book edit form cover section ──────────────────────────────────────────── */
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
.lib-form-cover-remove::after {
  content: '';
  position: absolute;
  inset: -8px;
}
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

- [ ] **Step 2: Commit Chunks 1–2**

```bash
git add js/books.js css/styles.css
git commit -m "feat(library): polished cover section in book edit form"
```

- [ ] **Step 3: Push and verify on device**

```bash
git push
```

Verify on device:
- Open Library tab → tap "Add Book" or "Edit Details" on an existing book
- **No cover set:** Upload button + URL paste field appear side by side. Tap Upload → file picker opens. Select a photo → cover preview appears with × button overlaid. Tap × → empty state returns.
- **URL paste:** Tap the URL field, paste an image URL, tap outside (blur) → cover preview appears with × button.
- **Oversized file (>2 MB):** Select a large image → error message "Image too large — use a smaller file or paste a URL" appears below the controls.
- **Edit existing book with cover:** Cover shows with × overlaid. Other fields (Title, Author, Pages) display correctly. Tap × → empty state, other fields unchanged.
- **Save:** Cover is saved correctly (both file upload data URL and pasted URL).

---

## Chunk 3: Hero cover → edit form

### Task 5: Wire hero cover tap to open the edit form

**Files:**
- Modify: `js/books.js` (`renderHeroCard` function ~line 763, handler functions, public API `return` block)

- [ ] **Step 1: Wrap the hero cover element**

In `renderHeroCard()`, find this block:
```js
    if (book.cover_url) {
      html += `<img src="${escHtml(book.cover_url)}" class="lib-hero-cover" alt="" loading="lazy">`;
    } else {
      html += `<div class="lib-hero-cover lib-hero-cover--empty">📚</div>`;
    }
```
Replace it with:
```js
    html += `<div onclick="Books._editHeroBook()" style="cursor:pointer;display:inline-block">`;
    if (book.cover_url) {
      html += `<img src="${escHtml(book.cover_url)}" class="lib-hero-cover" alt="" loading="lazy">`;
    } else {
      html += `<div class="lib-hero-cover lib-hero-cover--empty">📚</div>`;
    }
    html += `</div>`;
```

- [ ] **Step 2: Add the `_editHeroBook()` function**

Find the four functions added in Task 3 (`_fbCoverUrlInput`, etc.). Add `_editHeroBook` before them:
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

- [ ] **Step 3: Add `_editHeroBook` to the public API**

Find the line just added in Task 3 Step 2:
```js
    _fbSearch, _fbSelectResult, _fbClearCover,
    _fbCoverUrlInput, _fbCoverUrlCommit, _triggerCoverUpload, _onCoverFileChange,
```
Replace with:
```js
    _fbSearch, _fbSelectResult, _fbClearCover,
    _editHeroBook,
    _fbCoverUrlInput, _fbCoverUrlCommit, _triggerCoverUpload, _onCoverFileChange,
```

- [ ] **Step 4: Commit and push**

```bash
git add js/books.js
git commit -m "feat(library): tap hero cover to edit book"
git push
```

- [ ] **Step 5: Verify on device**

- Library tab, "Now Reading" hero card visible
- Tap the book cover (or the 📚 placeholder if no cover) → full edit form opens for that book
- All fields (Title, Author, Pages, cover) are pre-populated
- Swipe to a different hero book (if you have multiple) → tap its cover → correct book's edit form opens
- Cancel → returns to library without changes

---

## Pre-push checklist (before final push)

Per CLAUDE.md:
- [ ] Bump version in `js/config.js` (patch bump — e.g. `1.2.3` → `1.2.4`)
- [ ] Update `## Current Work` in `CLAUDE.md`
- [ ] Confirm both Hub and Accordion layouts still render correctly on device
