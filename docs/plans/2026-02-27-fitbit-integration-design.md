# Fitbit Integration — Design

**Date:** 2026-02-27
**Status:** Approved

---

## Overview

Auto-sync health data from the user's Google Pixel Watch (via Fitbit cloud API) into the Daily Tracker on every app open. Covers sleep, HRV, resting heart rate, steps, SpO2, and breathing rate. Connection management lives in the Settings tab.

---

## Auth Flow

New module: `js/fitbit-auth.js`

Uses OAuth 2.0 Authorization Code + PKCE (no client secret — Personal app type on dev.fitbit.com).

1. Generate random `code_verifier`; compute `code_challenge` = base64url(SHA-256(verifier)) via Web Crypto API (already used for PIN hashing)
2. Store `code_verifier` in `sessionStorage`
3. Redirect to `https://www.fitbit.com/oauth2/authorize` with `client_id`, scopes, `redirect_uri`, `code_challenge`, `code_challenge_method=S256`
4. Fitbit redirects back with `?code=...`
5. App detects code on load; POSTs to `https://api.fitbit.com/oauth2/token` to exchange for access + refresh tokens
6. Store tokens in Drive JSON under `data.fitbit`
7. On subsequent opens: silently refresh access token if expired (tokens last 8 hours; refresh tokens are indefinite)

**Scopes requested:** `sleep activity heartrate oxygen_saturation respiratory_rate cardio_fitness`

**Redirect URI:** the app's own URL (same origin). On load, detect `?code=` in the URL, handle the exchange, then strip the query string with `history.replaceState`.

---

## Data Schema

### New root-level key in Drive JSON

```json
"fitbit": {
  "access_token":  "<string>",
  "refresh_token": "<string>",
  "expires_at":    1234567890000,
  "last_sync":     "YYYY-MM-DD",
  "sync_error":    null
}
```

`sync_error` is `null` on success, or a short string on failure (e.g. `"Token expired"`).

### New per-day fields (added to `data.js` `getDay()` defaults)

| Field | Type | Source |
|---|---|---|
| `steps` | number \| null | Fitbit activities summary |
| `resting_hr` | number \| null | Fitbit heart rate summary |
| `hrv` | number \| null | Fitbit HRV daily RMSSD (ms) |
| `spo2` | number \| null | Fitbit SpO2 average during sleep |
| `breathing_rate` | number \| null | Fitbit breathing rate during sleep |

Existing `sleep` fields already in schema are also populated:
- `sleep.hours` ← `minutesAsleep / 60`
- `sleep.bedtime` ← `startTime` of main sleep log
- `sleep.wake_time` ← `endTime` of main sleep log
- `sleep.quality` is **not overwritten** (manual 1–5 rating, Fitbit has no equivalent)

All Fitbit data **overwrites** existing values for that day.

---

## Sync Logic

New module: `js/fitbit.js`

Called from `app.js` `showMain()` after `Data.load()` completes. Runs entirely in the background — no loading state shown to the user.

### Sync steps

1. Check `data.fitbit` — if missing or has no tokens, return early (not connected)
2. Refresh access token if `expires_at < Date.now()`
3. Determine dates to sync: today + yesterday (yesterday captures last night's sleep, which Fitbit logs on the prior date)
4. For each date, fire all 6 API calls in parallel:
   - `GET /1/user/-/sleep/date/{date}.json`
   - `GET /1/user/-/activities/date/{date}.json` (steps + resting HR)
   - `GET /1/user/-/hrv/date/{date}.json`
   - `GET /1/user/-/spo2/date/{date}.json`
   - `GET /1/user/-/br/date/{date}.json`
5. Write results into `Data.getDay(date)` fields
6. Set `data.fitbit.last_sync = today`, `data.fitbit.sync_error = null`
7. Call `Data.save()`
8. On any error: set `data.fitbit.sync_error = <message>`, save, and re-render Settings if visible

---

## Settings UI

New section in `js/settings.js` render output.

### State: Not connected
```
Fitbit
Connect your Pixel Watch to auto-sync sleep, HRV, steps and more.
[Connect Fitbit]
```

### State: Connected, healthy
```
Fitbit                                        [Disconnect]
Last synced: Today at 8:42 am
Sleep · HRV · Steps · Heart Rate · SpO2 · Breathing Rate
```

### State: Connected, error
```
Fitbit                                        [Disconnect]
⚠ Last sync failed: Token expired
[Reconnect]
```

---

## New Files

| File | Purpose |
|---|---|
| `js/fitbit-auth.js` | PKCE flow, token storage, token refresh |
| `js/fitbit.js` | Sync logic — fetch + write to data store |

## Modified Files

| File | Change |
|---|---|
| `js/config.js` | Add `FITBIT_CLIENT_ID` |
| `js/data.js` | Add `fitbit: null` to schema defaults; add 5 new fields to `getDay()` defaults |
| `js/app.js` | Call `Fitbit.sync()` in `showMain()` after data loads; handle `?code=` redirect on init |
| `js/settings.js` | Add Fitbit section to settings render |
| `index.html` | Add `<script>` tags for `fitbit-auth.js` and `fitbit.js` |

---

## Out of Scope (this version)

- Manual "Sync now" button (auto-sync on open is sufficient)
- Displaying Fitbit data in a dedicated section (data populates existing sleep/today fields)
- Intraday heart rate or step charts
- Stress score / readiness score (no public Fitbit API endpoint)
