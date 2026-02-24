# Daily Tracker — Developer Reference

## Project Overview

Personal daily health and lifestyle tracker. Single-page web app (no framework, no build step).
All data lives in the user's Google Drive as a single JSON file — no other servers involved.

## Architecture

- Pure vanilla HTML/CSS/JS — no framework, no bundler
- Google Identity Services (GIS) for OAuth 2.0 token flow
- Google Drive REST API for file storage (scope: `drive.file`)
- Web Crypto API (SHA-256) for PIN hashing
- CSS custom properties + `prefers-color-scheme` for dark/light theming

## File Structure

```
index.html              Main app — all screens in one HTML file
css/
  styles.css            All styles (dark/light mode, mobile-first, green accent)
js/
  config.js             Constants: CLIENT_ID, SCOPES, file name, PIN config
  auth.js               Google OAuth via GIS — token request & management
  data.js               Drive REST API calls + data load/save + schema defaults
  pin.js                PIN entry and PIN setup screen logic
  app.js                App orchestration: screen flow, init
  habits.js             (Phase 2) Habit tracker section
  moderation.js         (Phase 3) Moderation tracker section
  symptoms.js           (Phase 4) Symptom log section
  medications.js        (Phase 5) Medication tracker section
  sleep.js              (Phase 6) Sleep tracker
  mood.js               (Phase 6) Mood/energy tracker
  food.js               (Phase 6) Food/diet tracker
  social.js             (Phase 6) Social activity tracker
  reports.js            (Phase 7) Reports & charts
CLAUDE.md               This file
```

## Google Drive Setup

- OAuth Client ID: `145577028186-85gl257hjuqbuu6qs80l5l8mueopam4q.apps.googleusercontent.com`
- Scope: `https://www.googleapis.com/auth/drive.file`
  - Only accesses files this specific app (same client ID) created in this user's Drive
  - Works cross-device: any instance of the app with this client ID can see the file
- Data file name: `health-tracker-data.json` (stored in Drive root)
- GIS script: `https://accounts.google.com/gsi/client`

### Authorized Origins (must be added in Google Cloud Console)
- `http://localhost` (for local dev — add port variants as needed)
- Any domain you deploy to

---

## Full JSON Data Schema

All data lives in `health-tracker-data.json` in Google Drive.

```json
{
  "version": "1.1",

  "settings": {
    "pin_hash": "<sha256 hex string | null>",
    "habits": ["Reading", "Gym", "Long Walk"],
    "moderation_substances": [
      { "id": "alcohol",  "name": "Alcohol",  "default_unit": "drinks"   },
      { "id": "cannabis", "name": "Cannabis", "default_unit": "sessions" }
    ],
    "symptom_categories": ["Eyes", "Body Pain", "GI", "Headaches", "Other"],
    "theme": "system"
  },

  "days": {
    "YYYY-MM-DD": {

      "habits": {
        "Reading":   true,
        "Gym":       false,
        "Long Walk": true
      },

      "moderation": {
        "alcohol":  { "quantity": 2, "unit": "drinks",   "note": "wine with dinner" },
        "cannabis": null
      },

      "symptoms": [
        {
          "id":          "<uuid>",
          "issue_id":    "<uuid | null>",
          "category":    "Eyes",
          "severity":    3,
          "description": "Dry and itchy",
          "time":        "14:30"
        }
      ],

      "sleep": {
        "hours":     7.5,
        "quality":   4,
        "bedtime":   "23:00",
        "wake_time": "06:30",
        "notes":     ""
      },

      "mood": {
        "mood":   3,
        "energy": 4,
        "notes":  ""
      },

      "food": {
        "notes": "",
        "entries": [
          {
            "time":        "12:30",
            "description": "Salad with chicken",
            "notes":       ""
          }
        ]
      },

      "medications_taken": [
        {
          "medication_id": "<uuid>",
          "taken":         true,
          "time":          "08:00",
          "dose_override": null,
          "notes":         ""
        }
      ],

      "social": [
        {
          "id":          "<uuid>",
          "description": "Dinner with friends",
          "people":      ["Alice", "Bob"],
          "start_time":  "19:00",
          "end_time":    "22:00",
          "mood_impact": 2,
          "notes":       ""
        }
      ]

    }
  },

  "ongoing_issues": {
    "<uuid>": {
      "id":         "<uuid>",
      "category":   "Eyes",
      "title":      "Recurring dry eyes",
      "start_date": "YYYY-MM-DD",
      "end_date":   null,
      "resolved":   false,
      "notes":      ""
    }
  },

  "medications": {
    "<uuid>": {
      "id":        "<uuid>",
      "name":      "Metformin",
      "dose":      "500mg",
      "frequency": "daily",
      "timing":    ["morning", "evening"],
      "start_date":"YYYY-MM-DD",
      "end_date":  null,
      "active":    true,
      "as_needed": false,
      "notes":     ""
    }
  }
}
```

---

## Schema Field Notes

### `settings.pin_hash`
SHA-256 of `"ht-v1-" + pin`. Stored in the Drive JSON. Never stored in plaintext.
`null` on brand-new files (triggers PIN setup flow).

### `days[date].habits`
Key = habit name string, value = boolean. Add new habits via `settings.habits` array.

### `days[date].moderation`
Key = substance `id` from `settings.moderation_substances`. Value = object or `null` (not logged).

### `days[date].symptoms[]`
- `issue_id`: References a key in `ongoing_issues`. `null` = one-off entry.
- `severity`: 1 (mild) → 5 (severe).
- `time`: HH:MM 24h, optional.

### `days[date].sleep`
- `quality`: 1 (terrible) → 5 (excellent).
- `bedtime`: HH:MM 24h; may refer to the prior night (e.g. "23:30" logged on the wakeup day).

### `days[date].mood`
- `mood`: 1 (very low) → 5 (excellent).
- `energy`: 1 (exhausted) → 5 (high energy).

### `ongoing_issues`
Persistent/recurring issues. Daily symptom entries reference these via `issue_id`.
Duration = `start_date` → `end_date` (or today if `end_date` is null and not resolved).

### `medications`
Master medication list. Daily `medications_taken` entries reference these via `medication_id`.

---

## Build Phases

| Phase | Status | Content |
|-------|--------|---------|
| 1 | ✅ Done | File structure, data schema, PIN screen, Google Drive auth |
| 2 | ✅ Done | Habit Tracker section |
| 3 | ✅ Done | Moderation Tracker section |
| 4 | ✅ Done | Symptom Log section |
| 5 | ✅ Done | Medication Tracker |
| 6 | Planned | Sleep, Mood, Food, Social trackers |
| 7 | Planned | Reports & Charts (timeline, correlation, date range filters) |

---

## Design System

### Colors
| Token              | Light          | Dark           | Notes                    |
|--------------------|----------------|----------------|--------------------------|
| `--clr-bg`         | `#f8f9f8`      | `#0f1210`      | Page background          |
| `--clr-surface`    | `#ffffff`      | `#1a1f1a`      | Cards, dialogs           |
| `--clr-surface-2`  | `#f0f4f0`      | `#222822`      | Subtle nested surfaces   |
| `--clr-border`     | `#dde5dd`      | `#2a342a`      | Dividers, key outlines   |
| `--clr-text`       | `#1a211a`      | `#e2ebe2`      | Primary text             |
| `--clr-text-2`     | `#5a6e5a`      | `#7a967a`      | Secondary/muted text     |
| `--clr-accent`     | `#3a8f40`      | `#4caf50`      | Green accent             |
| `--clr-accent-dim` | `#e8f5e9`      | `#1b3a1d`      | Accent background tint   |
| `--clr-error`      | `#c62828`      | `#ef5350`      | Error states             |

### Severity Colors (symptoms, mood, etc.)
`1` → `#4caf50` · `2` → `#8bc34a` · `3` → `#ffc107` · `4` → `ff5722` · `5` → `#f44336`

---

## PIN Security

- 4-digit numeric PIN
- Hashed client-side with SHA-256 (Web Crypto API) before any storage
- Salt format: `"ht-v1-" + pin` (prefix versioned for future migrations)
- Hash stored in Google Drive JSON — never in `localStorage` or `sessionStorage`
- No PIN lockout (personal-use app). Wrong entry just shakes and resets.
- **Forgotten PIN recovery**: Delete `health-tracker-data.json` from Google Drive.
  App will recreate the file and prompt for a new PIN (all data lost).

---

## Generating UUIDs

Use `crypto.randomUUID()` (supported in all modern browsers).

---

## Local Development

Open `index.html` directly in a browser via a local server (required for OAuth):
```
npx serve .
# or
python -m http.server 8080
```
OAuth will not work from `file://` URLs — must be `http://localhost`.
