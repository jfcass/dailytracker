# Future Ideas Backlog

Ideas to consider building later. Not prioritized.

---

## Security

### Move GOOGLE_POLLEN_KEY to ht-auth Worker
**Why:** The Pollen / Air Quality / Weather API key (`GOOGLE_POLLEN_KEY`) is currently
exposed in `config.js` (visible in browser JS). It has billing attached, so if someone
copied the key they could generate charges. Low-priority since it's a personal app, but
worth hardening by adding a `/weather` proxy endpoint to `ht-auth.jfcass.workers.dev`
and removing the key from the frontend.
**Files:** `worker/auth-worker.js`, `js/weather.js`, `js/config.js`

---
