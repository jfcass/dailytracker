# Book Quotes + OCR Design

**Date:** 2026-03-05
**Status:** Approved

---

## Problem

When reading, the user frequently photographs book pages to save quotes. Currently there is
no structured way to capture, store, or browse these quotes in the app. Notes fields on
sessions are plain text and unsearchable.

## Solution

Add a photo-to-quote flow: user photographs a page → Google Cloud Vision OCR extracts the
text → user confirms/edits in a modal → quote saved with book attribution, page number, and
tags. Quotes are browsable per-book, per-session, and in a searchable/filterable standalone
screen.

---

## Effort Estimate

| Area | Lines | Time |
|---|---|---|
| Google Cloud Console setup (manual) | — | ~10 min |
| Worker `/ocr` endpoint | ~60 | ~30 min |
| Data schema addition | ~5 | ~5 min |
| Image capture + canvas resize | ~80 | ~45 min |
| OCR confirmation modal (JS + HTML) | ~150 | ~60 min |
| Quote save / edit / delete logic | ~80 | ~45 min |
| Session form camera button | ~40 | ~20 min |
| Book card quotes section | ~130 | ~60 min |
| Standalone quotes screen + filters | ~280 | ~90 min |
| CSS for all new elements | ~160 | ~45 min |
| **Total** | **~985 lines** | **~7–8 hrs** |

**Token intensity:** Medium-high. Mostly UI code (lots of HTML string building in the
existing inline-render pattern). Logic is straightforward.

**Sessions:** 2–3 implementation sessions recommended (Worker + schema, core OCR flow,
quotes UI + standalone screen).

---

## Infrastructure Change

**New Cloudflare Worker secret:** `GOOGLE_VISION_API_KEY`
Add to `ht-auth.jfcass.workers.dev` → Settings → Variables and Secrets → Secret type.

**Google Cloud Console (manual one-time steps):**
1. Enable **Cloud Vision API** in the same project as the OAuth client
2. Create a new API key, restrict it to Cloud Vision API only
3. Paste key into Cloudflare Worker as `GOOGLE_VISION_API_KEY`

---

## Data Schema

New top-level array in `health-tracker-data.json`. Single canonical store — all views
filter from this one array. No duplication.

```json
"quotes": [
  {
    "id":         "<uuid>",
    "book_id":    "<uuid>",
    "session_id": "<uuid | null>",
    "text":       "You do not rise to the level of your goals…",
    "page":       142,
    "tags":       ["inspiring", "to-revisit"],
    "date":       "YYYY-MM-DD",
    "created_at": "ISO string"
  }
]
```

`session_id` is `null` for quotes added from the book card (not tied to a specific session).
`page` is `null` if not provided.

**Preset tags:** `inspiring`, `funny`, `important`, `to-revisit`, `research`
Custom tags also allowed (free-text input).

---

## Worker Endpoint

Add to `worker/auth-worker.js`:

```
POST /ocr
Authorization: Bearer <session_id>
Content-Type: application/json
Body: { "image": "<base64 JPEG string>" }

200 Response: { "text": "extracted text..." }
401 Response: { "error": "no_session" }
500 Response: { "error": "ocr_failed" }
```

- Validates session via `Authorization: Bearer` header (same pattern as `/token`)
- Calls Google Cloud Vision API `DOCUMENT_TEXT_DETECTION` (better than basic OCR for
  dense printed text — preserves paragraph breaks)
- Returns plain extracted text string
- Does NOT store the image

**Vision API call:**
```
POST https://vision.googleapis.com/v1/images:annotate?key=<GOOGLE_VISION_API_KEY>
Body: {
  "requests": [{
    "image": { "content": "<base64>" },
    "features": [{ "type": "DOCUMENT_TEXT_DETECTION" }]
  }]
}
```
Extract: `response.fullTextAnnotation.text`

---

## Image Flow (client-side)

```
User taps camera button
  → hidden <input type="file" accept="image/*" capture="environment"> clicked
  → user photographs page (or picks from gallery)
  → JS reads file via FileReader
  → resize to max 1600px on a canvas (keeps payload ~200–500KB)
  → export as JPEG quality 0.85
  → POST base64 to Worker /ocr with Authorization: Bearer <session_id>
  → show spinner overlay "Reading text…"
  → on success: show confirmation modal
  → on failure: show inline error, allow retry
```

Photo is discarded after the OCR call. Never stored in Drive or KV.

---

## OCR Confirmation Modal

Bottom sheet modal. Appears after OCR returns text.

```
┌─────────────────────────────┐
│  📖 Confirm Quote           │
│                             │
│  [small photo thumbnail]    │
│                             │
│  ┌─────────────────────┐    │
│  │ [OCR text here —    │    │  editable textarea
│  │  trim to just the   │    │  pre-filled with full OCR output
│  │  quote you want]    │    │
│  └─────────────────────┘    │
│                             │
│  Page  [___]   (optional)   │
│                             │
│  Tags                       │
│  [inspiring] [funny]        │  tap to toggle
│  [important] [to-revisit]   │
│  [research]  [+ custom]     │
│                             │
│  [Cancel]        [Save]     │
└─────────────────────────────┘
```

- Textarea is fully editable — user trims OCR output to just the quote they want
- Page field: `<input type="number">`, optional
- Tags: chip-style toggle buttons for presets + free-text input for custom
- Save → creates quote object → pushes to `data.quotes` → `Data.save()`

---

## Entry Points

### 1. Session log form
- `📷` camera icon button added to the right of the Notes field
- Tapping it opens the file input (camera capture)
- Resulting quote saved with `book_id = fFormBookId` and `session_id = editingSession ?? newSessionId`
- After save, session card shows "📖 1 quote" count chip

### 2. Book card in Library tab
- Each book card gets a `Quotes (N)` button in its actions row
- Tapping expands an inline quotes section below the card showing all quotes for that book
- `+ Add Quote` button inside triggers the camera/OCR flow
- Resulting quote saved with `book_id` set, `session_id: null`
- Edit / delete available on each quote row

---

## Standalone Quotes Screen

Accessed via `"All Quotes →"` button in the Library tab header.
Uses the same slide-in detail view pattern as Health Log and Treatments
(`history.pushState` + `popstate` back navigation).

### Layout

```
┌─────────────────────────────┐
│ ← All Quotes         [42]   │  total quote count
│                             │
│ 🔍 [Search text…          ] │  live keyword filter on quote text
│                             │
│ ▼ Filter  (2 active)        │  collapsed by default; badge shows active count
│ ┌─────────────────────────┐ │
│ │ Book   [All books    ▾] │ │  dropdown from book library
│ │ Author [All authors  ▾] │ │  derived from books
│ │ Tag    [All tags     ▾] │ │  derived from all quotes
│ │ From   [date]  To [date]│ │  filters by created_at
│ │                [Clear]  │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ [cover] Atomic Habits   │ │
│ │         James Clear     │ │
│ │         p.142 · Mar 2   │ │
│ │  [inspiring] [to-revisit│ │
│ │                         │ │
│ │ "You do not rise to the │ │
│ │  level of your goals…"  │ │
│ │                  [⋯]    │ │  edit / delete menu
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

### Filter behaviour
- Keyword: case-insensitive substring match on `quote.text`
- Book: exact match on `book_id`
- Author: exact match on `book.author`
- Tag: quote's `tags` array includes selected tag
- Date range: `created_at` between from/to (inclusive)
- All filters combine with AND logic
- Results sorted newest first (`created_at` descending)
- Filter panel badge: count of active (non-default) filters
- Clear button resets all filters at once

---

## Files Changed

| File | Change |
|---|---|
| `worker/auth-worker.js` | Add `POST /ocr` endpoint |
| `js/data.js` | Add `quotes: []` to `SCHEMA_DEFAULTS`; add `getQuotes()` helper |
| `js/books.js` | Add OCR flow, confirmation modal, session camera button, book card quotes section, standalone screen |
| `css/styles.css` | Add quote modal, quote card, filter panel, standalone screen styles |
| `index.html` | Add `<input type="file">` for camera, OCR modal overlay |

No new JS files — all quote logic lives in `books.js`.
No changes to `app.js`, `config.js`, or other section files.

---

## Error States

| Scenario | Handling |
|---|---|
| Camera permission denied | File input falls back to gallery picker silently |
| Image too large (>10MB raw) | Client-side resize handles this before sending |
| OCR returns empty text | Modal opens with empty textarea + message "No text detected — type manually" |
| Worker `/ocr` fails (500) | Error toast "Couldn't read text — try again or type manually", modal still opens |
| Network offline | Error toast, modal does not open |
| Save fails | Standard `Data.save()` error handling (existing pattern) |
