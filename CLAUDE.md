# Daily Tracker — Developer Reference

## Project Overview

Personal daily health and lifestyle tracker. Single-page web app (no framework, no build step).
All data lives in the user's Google Drive as a single JSON file.

- **App URL:** `https://jfcass.github.io/dailytracker`
- **Data file:** `health-tracker-data.json` in user's Google Drive root

## Architecture

- Pure vanilla HTML/CSS/JS — no framework, no bundler, no build step
- **OAuth:** Authorization Code + PKCE via Cloudflare Worker (`ht-auth.jfcass.workers.dev`)
  - Worker holds refresh tokens in Cloudflare KV; browser holds only a session ID in localStorage
  - Worker endpoints: `GET /auth`, `GET /callback`, `GET /token`, `POST /logout`
- **Data storage:** Google Drive REST API (scope: `drive.file`) — single JSON file
- **Charts:** Chart.js v4.4.4 (CDN)
- **PWA:** `manifest.json` + `sw.js` for installability and caching
- CSS custom properties + `prefers-color-scheme` for dark/light theming

## Development Workflow

- **Cannot test locally** — OAuth redirects to GitHub Pages; `file://` or `localhost` don't work for the full auth flow. Do NOT attempt to start a local dev server or preview. Testing is done by the user on their phone after `git push`.
- **Always push to git to test** — every session should end with `git push`
- **Keep CLAUDE.md current** — before every `git push`, update this file to reflect any new or removed JS files (File Structure section), schema changes, new settings fields, or architectural changes made during the session.

## Pre-commit Checklist (MUST do before every commit)

1. **Bump the version** in `js/config.js` — patch (x.x.X) for fixes/tweaks, minor (x.X.0) for new features
2. **Update CLAUDE.md** if any files, schema, or architecture changed
3. **Update `## Current Work`** at the bottom of this file to reflect what was done this session
4. After pushing, report the new version number to the user

## File Structure

```
index.html              Main app shell — all screens in one HTML file
manifest.json           PWA manifest
sw.js                   Service worker (offline/caching)
css/
  styles.css            All styles (dark/light mode, mobile-first, teal+gold palette)
js/
  config.js             Constants: CLIENT_ID, Worker URL, API keys
  auth.js               Google OAuth via Cloudflare Worker — token request & management
  data.js               Drive REST API + in-memory data store + schema migrations
  app.js                App orchestration: screen flow, tabs, swipe nav, date sync
  pin.js                PIN entry/setup screen logic + dynamic keypad

  datenav.js            Shared date navigator (prev/next, calendar picker, today button)

  habits.js             Habit tracker with streaks + Reading/Gym/Meditation inline panels
  moderation.js         Substance tracking (alcohol, cannabis, coffee) — list of timed entries
  mood.js               Mood/Energy/Stress/Focus (1–5) + Daily Notes + tags + streaks
  bowel.js              Digestion/bowel movement tracking
  gratitudes.js         Daily gratitude entries + streak

  symptoms.js           Symptom log + Issues management
  vitals.js             Vitals section: steps/calories/floors stats row + vitals bar (sleep, HR, HRV, SpO2, breathing rate)
  medications.js        Daily med logging: AM/Afternoon/PM slots, PRN doses, reminders
  meds-manage.js        Medication master list editor (full-screen overlay)
  treatments.js         Treatment/therapy plan logging
  health-log.js         Unified health history view with filters
  tasks.js              Task/To-Do management — top-level tasks (not per-day); surfaces due tasks in daily view

  weather.js            Open-Meteo weather + Google Pollen API + Google Air Quality API
  reports.js            Charts: habit streaks, mood trends, symptom heatmap (Chart.js)
  books.js              Book tracking + reading sessions via Google Books API
  settings.js           Settings tab: habits, substances, categories, theme, visibility, layout

  fitbit.js             Fitbit data sync: steps, HR, sleep, calories
  fitbit-auth.js        Fitbit OAuth flow + callback handling
  hub.js                Hub view: 2×2 bucket grid for Today tab
  bucket-datenav.js     Date nav within Hub bucket detail panels

worker/
  auth-worker.js        Cloudflare Worker — OAuth proxy + KV session management

icons/
  icon-192.png / .svg
  icon-512.png / .svg

.claude/
  launch.json           Dev server config: npx http-server on port 3000 (not used — local testing doesn't work)

docs/
  future-ideas.md       Feature backlog
  plans/                Date-prefixed implementation planning docs
```

## External APIs & Services

| Service | Purpose | Key/Config |
|---------|---------|------------|
| Google OAuth 2.0 | Auth (via Cloudflare Worker) | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in Worker secrets |
| Google Drive REST | Data file storage | scope: `drive.file` |
| Google Books API | Book search + covers | `GOOGLE_BOOKS_KEY` in config.js |
| Google Pollen API | Species-level pollen data | `GOOGLE_POLLEN_KEY` in config.js |
| Google Air Quality API | AQI, PM2.5, ozone | same `GOOGLE_POLLEN_KEY` |
| Open-Meteo | Weather: temp, pressure, UV, humidity | No key required |
| Fitbit API | Steps, HR, sleep, calories | via `fitbit-proxy.jfcass.workers.dev` |
| Cloudflare Workers | OAuth proxy + Fitbit proxy | `ht-auth.jfcass.workers.dev` |
| GitHub Pages | App hosting | `https://jfcass.github.io/dailytracker` |
| Chart.js v4.4.4 | Charts in Reports tab | CDN |

## Google Cloud Setup

- **OAuth Client ID:** `145577028186-85gl257hjuqbuu6qs80l5l8mueopam4q.apps.googleusercontent.com`
- **Authorized redirect URI (for Worker):** `https://ht-auth.jfcass.workers.dev/callback`
- **APIs enabled:** Drive API, Books API, Pollen API, Air Quality API

---

## App Initialization Flow

```
DOMContentLoaded → App.init()
  Auth.init()          ← extract session from URL hash, set up visibilitychange listener
  Auth.tryAutoAuth()   ← silent re-auth check with Cloudflare Worker
    ├ success → Data.load() → run migrations → App.showMain()
    └ fail    → showScreen('screen-auth')

App.showMain()
  showScreen('screen-app')
  DateNav.init(onChange callback)
  init() all modules: Weather, Mood, Habits, Moderation, Symptoms, Meds, etc.
  Apply collapsed sections (from localStorage 'ht_collapsed')
  Apply visibility settings (hidden_sections)
  Hub.render() if today_layout === 'hub'
  Set up swipe gestures + popstate listener
```


## UI Conventions
All user-facing times display in 12-hour format with am/pm (e.g., 2:30pm). Never display 24-hour time in the UI.


## Screen Flow

1. `#screen-auth` — Google sign-in button
2. `#screen-loading` — spinner while loading data
3. `#screen-pin-setup` — first-time PIN creation (enter + confirm)
4. `#screen-pin` — unlock entry on subsequent sessions
5. `#screen-app` — main app (after auth + PIN)

Also: `#reconnect-banner` (session expired mid-use), `#conflict-modal` (Drive file updated elsewhere).

## Tab Navigation

- **Today** — accordion or hub layout with all daily sections
- **Library** — book tracking
- **Reports** — charts (habit streaks, mood, symptom heatmap)
- **Health Log** — unified cross-date history view
- **Settings** — manage habits, substances, theme, visibility, layout
- **Treatments** — therapy/intervention log (hidden by default via `hidden_sections`)

Swipe gestures:
- Today tab: left/right = date navigation (prev/next day)
- Other tabs: left/right = tab switching

## Today Tab Layouts

Two modes toggled via `settings.today_layout`:

**`'accordion'`** (default) — vertical stack of collapsible sections:
Habits, Moderation, Mood, Bowel, Symptoms, Medications, Gratitudes, Daily Notes.
Section collapse state stored in `localStorage` key `ht_collapsed`.

**`'hub'`** — 2×2 tile grid (rendered by `hub.js`):
- Routine tile: Habits + Moderation
- Wellbeing tile: Mood + sleep stats carousel
- Health tile: Medications + Bowel + Symptoms + Treatments
- Reflections tile: Gratitudes + Daily Notes
- Tap tile → opens bucket detail panel with date navigation (`bucket-datenav.js`)

Active development is focused on Hub layout. When building new features, implement for Hub first. All changes must also be verified not to break Accordion layout -- both must remain functional.

---

## Full JSON Data Schema

All data lives in `health-tracker-data.json` in Google Drive.

```json
{
  "version": "1.1",

  "settings": {
    "pin_hash": "<sha256 hex string | null>",
    "habits": ["Reading", "Gym", "Photo Stroll"],
    "moderation_substances": [
      { "id": "alcohol",  "name": "Alcohol",  "default_unit": "drinks"   },
      { "id": "cannabis", "name": "Cannabis", "default_unit": "sessions" },
      { "id": "coffee",   "name": "Coffee",   "default_unit": "cups"     }
    ],
    "symptom_categories": ["Headache", "Fever", "Fatigue", "Other"],
    "issue_categories":   ["Eyes", "GI", "Other"],
    "note_tags": ["Positive News", "Travel", "Work Stress"],
    "theme": "system | light | dark",
    "weather_unit": "auto | metric | imperial",
    "default_report_period": "7d | 30d",
    "hidden_sections": ["tab-treatments"],
    "today_accordion": false,
    "today_layout": "accordion | hub"
  },

  "days": {
    "YYYY-MM-DD": {

      "habits": {
        "Reading":      true,
        "Gym":          false,
        "Photo Stroll": true
      },

      "moderation": {
        "alcohol":  [ { "id": "<uuid>", "quantity": 2, "unit": "drinks", "time": "19:00", "note": "" } ],
        "cannabis": null,
        "coffee":   null
      },

      "mood": {
        "mood":   3,
        "energy": 4,
        "stress": 2,
        "focus":  4
      },

      "note": "Free text daily note",
      "tags": ["Positive News"],

      "sleep": {
        "hours":     7.5,
        "quality":   4,
        "bedtime":   "23:00",
        "wake_time": "06:30",
        "notes":     ""
      },

      "bowel": [
        { "id": "<uuid>", "time": "08:30", "quality": 3, "notes": "" }
      ],

      "gratitudes": [
        { "id": "<uuid>", "text": "Grateful for..." }
      ],

      "symptoms": [
        {
          "id":          "<uuid>",
          "issue_id":    "<uuid | null>",
          "category":    "Headache",
          "severity":    3,
          "description": "Mild tension headache",
          "time":        "14:30"
        }
      ],

      "med_slots": {
        "am":        { "time": "08:00", "skipped": [], "extras": [] },
        "afternoon": { "time": null,    "skipped": [], "extras": [] },
        "pm":        { "time": "20:30", "skipped": ["<med-id>"], "extras": [] }
      },

      "med_reminders": { "<med-id>": "HH:MM" },

      "prn_doses": [
        {
          "id":            "<uuid>",
          "medication_id": "<uuid>",
          "iso_timestamp": "2026-03-09T14:30:00Z",
          "dose":          "500mg",
          "notes":         "For headache"
        }
      ],

      "weather": {
        "temp_max_c":     23.5,
        "temp_max_f":     74.3,
        "temp_min_c":     14.2,
        "temp_min_f":     57.6,
        "code":           2,
        "pressure_hpa":   1013.2,
        "pressure_trend": "rising | steady | falling",
        "humidity_pct":   55,
        "uv_index":       6,
        "pollen_tree":    3,
        "pollen_grass":   1,
        "pollen_weed":    0,
        "pollen_alder":   4,
        "pollen_birch":   2,
        "pollen_oak":     3,
        "pollen_maple":   2,
        "pollen_elm":     1,
        "pollen_cottonwood": 0,
        "pollen_ash":     1,
        "pollen_pine":    0,
        "pollen_juniper": 0,
        "pollen_ragweed": 0,
        "aqi_us":         42,
        "aqi_category":   "Good",
        "pm25":           8.2,
        "o3_ppb":         35.4
      },

      "steps":            8500,
      "resting_hr":       62,
      "hrv":              45.2,
      "spo2":             98,
      "breathing_rate":   16,
      "sleep_efficiency": 87,
      "sleep_deep":       1.5,
      "sleep_light":      4.0,
      "sleep_rem":        2.0,
      "sleep_awake":      0.5,
      "calories":         2100,
      "active_minutes":   45,
      "floors":           12
    }
  },

  "issues": {
    "<uuid>": {
      "id":           "<uuid>",
      "name":         "Recurring dry eyes",
      "category":     "Eyes",
      "remind_daily": false,
      "start_date":   "YYYY-MM-DD",
      "end_date":     null,
      "resolved":     false,
      "notes":        ""
    }
  },

  "medications": {
    "<uuid>": {
      "id":           "<uuid>",
      "name":         "Metformin",
      "dose":         "500mg",
      "frequency":    "daily",
      "timing":       ["am", "pm"],
      "start_date":   "YYYY-MM-DD",
      "end_date":     null,
      "active":       true,
      "as_needed":    false,
      "med_reminder": false,
      "notes":        ""
    }
  },

  "treatment_medications": {
    "<uuid>": {
      "id":     "<uuid>",
      "name":   "Ibuprofen",
      "doses":  ["500mg", "1000mg"],
      "active": true,
      "notes":  ""
    }
  },

  "treatments": {
    "<uuid>": {
      "id":            "<uuid>",
      "date":          "YYYY-MM-DD",
      "start_time":    "14:00",
      "end_time":      "15:00",
      "intention":     "Pain management",
      "medication_id": "<uuid>",
      "dose":          "500mg",
      "notes":         ""
    }
  },

  "books": {
    "<uuid>": {
      "id":        "<uuid>",
      "title":     "Book Title",
      "author":    "Author Name",
      "isbn":      "...",
      "cover_url": "...",
      "sessions":  [ { "date": "YYYY-MM-DD", "duration_minutes": 30, "pages_read": 10 } ]
    }
  },

  "fitbit": {
    "access_token":  "...",
    "refresh_token": "...",
    "expires_at":    1234567890000,
    "user_id":       "...",
    "last_sync":     "YYYY-MM-DDTHH:MM:SSZ",
    "sync_error":    null
  },

  "blood_pressure": [
    { "date": "YYYY-MM-DD", "time": "08:00", "systolic": 120, "diastolic": 80, "notes": "" }
  ],

  "tasks": [
    {
      "id":             "<uuid>",
      "text":           "Task description",
      "category":       "Work",
      "due_date":       "YYYY-MM-DD | null",
      "completed":      false,
      "completed_date": "YYYY-MM-DD | null",
      "created_date":   "YYYY-MM-DD",
      "notes":          ""
    }
  ]
}
```

---

## Schema Field Notes

### `settings.pin_hash`
SHA-256 of `"ht-v1-" + pin`. Stored in Drive JSON. Never stored in plaintext.
`null` on brand-new files (triggers PIN setup flow).

### `settings.habits`
Order matters — renders top to bottom. Default: `["Reading", "Gym", "Photo Stroll"]`.
"Long Walk" was renamed to "Photo Stroll" via `migrateData()` in `data.js`.

### `days[date].moderation`
Key = substance `id` from `settings.moderation_substances`. Value = array of entries or `null`.
Each entry: `{ id, quantity, unit, time (HH:MM | null), note }`.
Old single-object entries are migrated to arrays on load.

### `days[date].mood`
Four fields: `mood`, `energy`, `stress`, `focus` — each 1–5 scale (floats supported for half-scores, e.g., 3.5).
Wellness composite = avg(mood, energy, 6-stress, focus).

### `days[date].bowel[].quality`
Bristol Stool Scale integer 1–7 (floats supported for half-scores, e.g., 3.5):
1=Hard · 2=Lumpy · 3=Cracked · 4=Normal · 5=Soft · 6=Mushy · 7=Watery

### `days[date].med_slots`
Three slots: `am`, `afternoon`, `pm`. Slot is "logged" when `time` is set.
`skipped[]` = med IDs intentionally skipped. `extras[]` = med IDs added ad-hoc.

### `days[date].prn_doses`
As-needed doses outside slot system. Timestamp stored as ISO string.

### `issues` (top-level)
Previously `ongoing_issues` — migrated by `migrateSymptoms()` in data.js.
Chronic/recurring issues that symptoms can be linked to via `issue_id`.

### `days[date].weather`
Fetched for today only; stored so past dates show historical conditions.
`code` = WMO weather code → emoji + label in weather.js.
`pressure_trend`: noon vs 6am delta, threshold > 1 hPa.
Pollen UPI scale: 0=None · 1=Very Low · 2=Low · 3=Medium · 4=High · 5=Very High.
AQI scale: 0–50 Good · 51–100 Moderate · 101–150 Sensitive · 151–200 Unhealthy · 201–300 Very Unhealthy.

### Fitbit fields on day object
Synced from Fitbit API via Worker proxy. Stored flat on the day (not nested).

---

## Design System

### Colors (CSS Custom Properties)

| Token              | Light          | Dark           | Notes                    |
|--------------------|----------------|----------------|--------------------------|
| `--clr-bg`         | `#f8f9f8`      | `#0f1210`      | Page background          |
| `--clr-surface`    | `#ffffff`      | `#1a1f1a`      | Cards, dialogs           |
| `--clr-surface-2`  | `#f0f4f0`      | `#222822`      | Subtle nested surfaces   |
| `--clr-border`     | `#dde5dd`      | `#2a342a`      | Dividers, key outlines   |
| `--clr-text`       | `#1a211a`      | `#e2ebe2`      | Primary text             |
| `--clr-text-2`     | `#5a6e5a`      | `#7a967a`      | Secondary/muted text     |
| `--clr-accent`     | `#1ABEA5`      | `#22D4B8`      | Teal accent              |
| `--clr-accent-dim` | `#e8f5e9`      | `#1b3a1d`      | Accent background tint   |
| `--clr-error`      | `#c62828`      | `#ef5350`      | Error states             |

**Accent gradient:** Teal → Gold (logo, primary buttons)
**Typography:** Figtree (Google Fonts) — 400, 500, 600, 700 weights

### Severity Colors
`1` → `#4caf50` · `2` → `#8bc34a` · `3` → `#ffc107` · `4` → `#ff5722` · `5` → `#f44336`

---

## Key Architectural Patterns

1. **Module pattern:** Every JS file exports a single named object (Auth, Data, Habits, etc.) with private state + public API
2. **Passive event listeners:** All touch/scroll handlers use `{ passive: true }` for mobile performance
3. **Debounced saves:** Changes trigger `scheduleSave()` (1.2s delay), then flush to Drive with visual status feedback
4. **Date broadcasting:** Single shared `DateNav` broadcasts date changes; all sections listen and re-render
5. **Migrations in data.js:** Schema evolution handled by migration functions on load; backward compatible
6. **Client-side PIN hashing:** SHA-256 with `"ht-v1-"` prefix salt via Web Crypto API
7. **OAuth via Worker:** Refresh tokens held server-side in Cloudflare KV; browser holds only session ID
8. **Conflict detection:** Pre-save check (rate-limited to once/min) detects if Drive file was updated elsewhere
9. **Swipe navigation:** Touch start/end delta — Today = date nav; other tabs = tab switch
10. **UUID generation:** `crypto.randomUUID()` throughout

---

## PIN Security

- 4-digit numeric PIN
- Hashed client-side: SHA-256(`"ht-v1-" + pin`) before any storage
- Hash stored only in Google Drive JSON — never in `localStorage` or `sessionStorage`
- No lockout (personal app). Wrong entry shakes and resets.
- **Recovery:** Delete `health-tracker-data.json` from Google Drive. App recreates file and prompts for new PIN (all data lost).

---

## Implementation Status

### ✅ Complete
- Phase 1: Auth (Cloudflare Worker PKCE), PIN, Drive I/O, schema + migrations
- Phase 2: Habit Tracker (streaks, Reading/Gym/Meditation inline panels)
- Phase 3: Moderation Tracker (alcohol, cannabis, coffee; timed entries)
- Phase 4: Symptom Log (Issues management, categories, severity, vitals bar)
- Phase 5: Medications (AM/Afternoon/PM slots, PRN doses, reminders)
- Plus: Mood/Energy/Stress/Focus, Bowel, Gratitudes, Daily Notes, Weather, Fitbit, Books, Reports, Settings, Health Log, Treatments (hidden), Hub layout

### 🔄 In Progress
- Hub layout bucket date navigation (`.worktrees/bucket-date-nav/` branch)
- Book quotes + OCR — design doc at `docs/plans/2026-03-05-book-quotes-ocr-design.md`; design research saved at that path, implementation not started.

### 📋 Planned (see docs/plans/ and docs/future-ideas.md)
- Smart medication reminders (infer expected time from history)
- Separate symptom vs. issue category lists
- Slot-level medication snapshot
- Conflict detection UX improvements

---

## Generating UUIDs

Use `crypto.randomUUID()` (supported in all modern browsers).

---

## Current Work
**Tasks due-date widget (2026-03-14):** Replaced the native full-width `<input type="date">` in all three task forms (daily add, daily edit, tab form) with a custom widget: "Due Date" label + calendar icon button when no date is set, MM/DD/YY + pencil icon when a date is set. Hidden `<input type="date">` triggered via `showPicker()`. Also migrated repo to MacBook Air — normalized CRLF→LF line endings via `.gitattributes`, configured git identity and SSH auth.