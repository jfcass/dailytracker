# Persistent Google Auth — Design

**Date:** 2026-03-04
**Status:** Approved

## Problem

The app uses the Google Identity Services (GIS) token model (browser-only OAuth). This issues
1-hour access tokens with no refresh token. On mobile, the OS suspends background tabs and kills
the `scheduleRefresh` setTimeout, so the token expires silently. The user hits the sign-in screen
on return, and mid-session save failures can lose data.

## Solution

Add a Cloudflare Worker (`ht-auth.jfcass.workers.dev`) that handles the OAuth Authorization Code
flow server-side. The Worker holds the `client_secret` and `refresh_token` — neither ever reaches
the browser. The browser gets a session cookie; the app calls the Worker to get fresh access tokens
invisibly.

## Infrastructure (already configured)

| Resource | Value |
|---|---|
| Worker URL | `https://ht-auth.jfcass.workers.dev` |
| KV namespace | `HT_SESSIONS` bound as `SESSIONS` |
| `GOOGLE_CLIENT_ID` | `145577028186-85gl257hjuqbuu6qs80l5l8mueopam4q.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Encrypted secret in Worker |
| `ALLOWED_ORIGIN` | `https://jfcass.github.io/habit-tracker` (Worker extracts origin for CORS) |
| Google redirect URI | `https://ht-auth.jfcass.workers.dev/callback` (added to OAuth client) |
| App URL | `https://jfcass.github.io/habit-tracker` |

## Worker Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/auth` | Generates PKCE + state, stores in KV (5 min TTL), redirects to Google OAuth |
| `GET` | `/callback` | Validates state, exchanges code for tokens, stores refresh_token in KV (30-day TTL), sets session cookie, redirects to app |
| `GET` | `/token` | Reads session cookie → looks up refresh_token in KV → returns fresh access_token |
| `POST` | `/logout` | Revokes access token, deletes KV session entry, clears cookie |

## Auth Flow

```
1. User clicks "Sign in"
2. App redirects browser → https://ht-auth.jfcass.workers.dev/auth
3. Worker generates state + PKCE, saves to KV, redirects → Google consent screen
4. Google redirects → https://ht-auth.jfcass.workers.dev/callback?code=...&state=...
5. Worker validates state, exchanges code (using client_secret) for access+refresh tokens
6. Worker stores { refresh_token, email } in KV with 30-day TTL, keyed by session_id (UUID)
7. Worker sets cookie: session_id=<uuid>; HttpOnly; Secure; SameSite=None; Max-Age=2592000
8. Worker redirects browser → https://jfcass.github.io/habit-tracker
9. App loads, calls GET /token (credentials: 'include')
10. Worker reads session cookie → KV lookup → calls Google token endpoint → returns { access_token, expires_in }
11. App stores access_token in memory, loads Drive data, shows main screen
```

## Token Refresh (invisible to user)

- App keeps `accessToken` + `tokenExpiry` in memory (same as before)
- `scheduleRefresh()` sets a timer to call `/token` 5 min before expiry
- `visibilitychange` listener: on returning to tab, if token expired → call `/token` before any Drive op
- If `/token` returns 401 (session expired after 30 days): show inline "Session expired — tap to sign in" banner. In-memory data preserved. After sign-in, auto-save pending data.

## Security Properties

- `client_secret` never in browser (Worker env secret)
- `refresh_token` never in browser (KV only)
- Session cookie is `HttpOnly` (unreadable by JS), `Secure`, `SameSite=None`
- PKCE prevents auth code interception
- State parameter prevents CSRF on login redirect
- CORS restricted to `https://jfcass.github.io` origin
- KV entries auto-expire after 30 days (Cloudflare TTL)
- Sign-out revokes the Google access token and deletes the KV entry

## Frontend Changes

### `index.html`
- Remove GIS `<script src="https://accounts.google.com/gsi/client">` tag

### `js/auth.js`
- Complete rewrite: replaces GIS token model with Worker fetch calls
- Public API stays identical: `init()`, `requestToken()`, `tryAutoAuth()`, `getToken()`, `isTokenValid()`, `signOut()`
- Add `visibilitychange` listener for mobile background-tab token recovery
- Add `scheduleRefresh()` that calls Worker `/token` instead of GIS

### `js/config.js`
- Add `AUTH_WORKER: 'https://ht-auth.jfcass.workers.dev'`

### New file: `worker/auth-worker.js`
- The Cloudflare Worker code (deployed via Cloudflare dashboard Edit Code)

## What Does NOT Change

- `data.js` — unchanged, still calls `Auth.getToken()` as before
- All section files (`habits.js`, `mood.js`, etc.) — unchanged
- `app.js` — minor change: sign-in button triggers redirect instead of GIS popup
- Google Drive API calls — unchanged, still use Bearer token directly
- PIN flow — unchanged
- Data schema — unchanged
