# Persistent Google Auth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the browser-only GIS token model with a Cloudflare Worker that holds the OAuth client_secret and refresh_token server-side, giving persistent 30-day sessions.

**Architecture:** A Cloudflare Worker (`ht-auth.jfcass.workers.dev`) handles the Authorization Code + PKCE flow. On login it stores the refresh_token in KV and sets an HttpOnly session cookie. The app calls `/token` to get a fresh access_token silently — no user interaction needed until the 30-day session expires. A `visibilitychange` listener handles mobile background-tab token recovery.

**Tech Stack:** Vanilla JS, Cloudflare Workers (ES modules), Cloudflare KV, Google OAuth 2.0 Authorization Code flow with PKCE.

---

## Pre-flight Checklist

Confirm these are true before starting:

- [ ] Cloudflare Worker `ht-auth` exists at `ht-auth.jfcass.workers.dev`
- [ ] KV namespace `HT_SESSIONS` bound to Worker as variable `SESSIONS`
- [ ] Worker variables set: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (secret), `ALLOWED_ORIGIN` = `https://jfcass.github.io/habit-tracker`
- [ ] Google Cloud Console: `https://ht-auth.jfcass.workers.dev/callback` added to Authorized Redirect URIs

---

### Task 1: Create the Worker file

**Files:**
- Create: `worker/auth-worker.js`

**Step 1: Create the file**

Create `worker/auth-worker.js` with this exact content:

```javascript
/**
 * auth-worker.js — Google OAuth Authorization Code + PKCE proxy
 *
 * Endpoints:
 *   GET  /auth      → start login (redirect to Google)
 *   GET  /callback  → handle Google redirect, store session, redirect to app
 *   GET  /token     → return fresh access_token using stored refresh_token
 *   POST /logout    → revoke token, clear session + cookie
 *
 * Environment variables (set in Cloudflare dashboard):
 *   GOOGLE_CLIENT_ID     — OAuth client ID
 *   GOOGLE_CLIENT_SECRET — OAuth client secret (Secret type)
 *   ALLOWED_ORIGIN       — app URL e.g. https://jfcass.github.io/habit-tracker
 *   SESSIONS             — KV namespace binding
 */

const GOOGLE_AUTH_URL   = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL  = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const DRIVE_SCOPE       = 'https://www.googleapis.com/auth/drive.file';
const SESSION_TTL       = 30 * 24 * 60 * 60;  // 30 days (seconds)
const PKCE_TTL          = 5  * 60;             // 5 minutes (seconds)

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const origin = new URL(env.ALLOWED_ORIGIN).origin;   // strip path — browsers send origin only

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return corsHeaders(new Response(null, { status: 204 }), origin);
    }

    switch (url.pathname) {
      case '/auth':     return handleAuth(request, env, origin);
      case '/callback': return handleCallback(request, env);
      case '/token':    return handleToken(request, env, origin);
      case '/logout':   return handleLogout(request, env, origin);
      default:          return new Response('Not found', { status: 404 });
    }
  },
};

// ── /auth ────────────────────────────────────────────────────────────────────

async function handleAuth(request, env, origin) {
  const { verifier, challenge } = await generatePKCE();
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));

  // Store code_verifier keyed by state (5-min TTL)
  await env.SESSIONS.put(`pkce:${state}`, verifier, { expirationTtl: PKCE_TTL });

  const params = new URLSearchParams({
    client_id:             env.GOOGLE_CLIENT_ID,
    redirect_uri:          callbackUrl(request),
    response_type:         'code',
    scope:                 DRIVE_SCOPE,
    access_type:           'offline',
    prompt:                'consent',   // always returns refresh_token
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    state,
  });

  return Response.redirect(`${GOOGLE_AUTH_URL}?${params}`, 302);
}

// ── /callback ────────────────────────────────────────────────────────────────

async function handleCallback(request, env) {
  const url      = new URL(request.url);
  const code     = url.searchParams.get('code');
  const state    = url.searchParams.get('state');
  const errParam = url.searchParams.get('error');
  const appUrl   = env.ALLOWED_ORIGIN;

  if (errParam || !code || !state) {
    return Response.redirect(`${appUrl}?auth_error=${errParam || 'missing_params'}`, 302);
  }

  // Validate state and retrieve PKCE verifier
  const verifier = await env.SESSIONS.get(`pkce:${state}`);
  if (!verifier) {
    return Response.redirect(`${appUrl}?auth_error=invalid_state`, 302);
  }
  await env.SESSIONS.delete(`pkce:${state}`);

  // Exchange code for tokens
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      client_id:     env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      code_verifier: verifier,
      grant_type:    'authorization_code',
      redirect_uri:  callbackUrl(request),
    }),
  });

  if (!tokenRes.ok) {
    console.error('Token exchange failed:', await tokenRes.text());
    return Response.redirect(`${appUrl}?auth_error=token_exchange_failed`, 302);
  }

  const tokens = await tokenRes.json();

  if (!tokens.refresh_token) {
    // Google only sends refresh_token on first consent.
    // If missing, the user needs to revoke app access in their Google account and retry.
    return Response.redirect(`${appUrl}?auth_error=no_refresh_token`, 302);
  }

  // Create session in KV
  const sessionId = crypto.randomUUID();
  await env.SESSIONS.put(`session:${sessionId}`, JSON.stringify({
    refresh_token: tokens.refresh_token,
    access_token:  tokens.access_token,
    expires_at:    Date.now() + tokens.expires_in * 1000 - 60_000,
  }), { expirationTtl: SESSION_TTL });

  const cookie = [
    `ht_session=${sessionId}`,
    'HttpOnly',
    'Secure',
    'SameSite=None',
    `Max-Age=${SESSION_TTL}`,
    'Path=/',
  ].join('; ');

  return new Response(null, {
    status: 302,
    headers: { Location: appUrl, 'Set-Cookie': cookie },
  });
}

// ── /token ───────────────────────────────────────────────────────────────────

async function handleToken(request, env, origin) {
  const sessionId = getSessionCookie(request);
  if (!sessionId) {
    return corsHeaders(jsonResponse({ error: 'no_session' }, 401), origin);
  }

  const raw = await env.SESSIONS.get(`session:${sessionId}`);
  if (!raw) {
    return corsHeaders(jsonResponse({ error: 'session_expired' }, 401), origin);
  }

  const session = JSON.parse(raw);

  // Return cached token if still valid
  if (session.expires_at > Date.now()) {
    return corsHeaders(jsonResponse({
      access_token: session.access_token,
      expires_in:   Math.floor((session.expires_at - Date.now()) / 1000),
    }, 200), origin);
  }

  // Use refresh_token to get a new access_token
  const refreshRes = await fetch(GOOGLE_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      client_id:     env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: session.refresh_token,
      grant_type:    'refresh_token',
    }),
  });

  if (!refreshRes.ok) {
    await env.SESSIONS.delete(`session:${sessionId}`);
    return corsHeaders(jsonResponse({ error: 'refresh_failed' }, 401), origin);
  }

  const newTokens = await refreshRes.json();
  session.access_token = newTokens.access_token;
  session.expires_at   = Date.now() + newTokens.expires_in * 1000 - 60_000;
  if (newTokens.refresh_token) session.refresh_token = newTokens.refresh_token;  // rotation

  await env.SESSIONS.put(`session:${sessionId}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL,
  });

  return corsHeaders(jsonResponse({
    access_token: session.access_token,
    expires_in:   Math.floor((session.expires_at - Date.now()) / 1000),
  }, 200), origin);
}

// ── /logout ──────────────────────────────────────────────────────────────────

async function handleLogout(request, env, origin) {
  const sessionId = getSessionCookie(request);
  if (sessionId) {
    const raw = await env.SESSIONS.get(`session:${sessionId}`);
    if (raw) {
      const { access_token } = JSON.parse(raw);
      // Revoke token (best effort — don't await)
      fetch(`${GOOGLE_REVOKE_URL}?token=${access_token}`).catch(() => {});
      await env.SESSIONS.delete(`session:${sessionId}`);
    }
  }

  const clearCookie = 'ht_session=; HttpOnly; Secure; SameSite=None; Max-Age=0; Path=/';
  const res = jsonResponse({ ok: true }, 200);
  res.headers.set('Set-Cookie', clearCookie);
  return corsHeaders(res, origin);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function callbackUrl(request) {
  return `${new URL(request.url).origin}/callback`;
}

function getSessionCookie(request) {
  const header = request.headers.get('Cookie') || '';
  const match  = header.match(/(?:^|;\s*)ht_session=([^;]+)/);
  return match ? match[1] : null;
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function corsHeaders(response, origin) {
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}

function base64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generatePKCE() {
  const verifier  = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = base64url(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  );
  return { verifier, challenge };
}
```

**Step 2: Deploy to Cloudflare**

1. In Cloudflare dashboard → Workers & Pages → `ht-auth` → **Edit code**
2. Select all existing code in the editor and delete it
3. Paste the entire contents of `worker/auth-worker.js`
4. Click **Deploy**

**Step 3: Verify deployment**

Visit `https://ht-auth.jfcass.workers.dev/token` in browser.
Expected: JSON response `{"error":"no_session"}` with status 401 (not "Hello World").

**Step 4: Commit**

```bash
git add worker/auth-worker.js
git commit -m "feat(auth-worker): add Google OAuth Authorization Code + PKCE proxy"
```

---

### Task 2: Update config.js

**Files:**
- Modify: `js/config.js`

**Step 1: Add AUTH_WORKER constant**

In `js/config.js`, add `AUTH_WORKER` to the CONFIG object:

```javascript
const CONFIG = Object.freeze({
  CLIENT_ID:      '145577028186-85gl257hjuqbuu6qs80l5l8mueopam4q.apps.googleusercontent.com',
  SCOPES:         'https://www.googleapis.com/auth/drive.file',
  DATA_FILE_NAME: 'health-tracker-data.json',
  PIN_LENGTH:     4,
  PIN_SALT:       'ht-v1-',
  DRIVE_API:      'https://www.googleapis.com/drive/v3',
  DRIVE_UPLOAD:   'https://www.googleapis.com/upload/drive/v3',
  AUTH_WORKER:    'https://ht-auth.jfcass.workers.dev',   // ← add this line
  BOOKS_API_KEY:  'AIzaSyC_W1zuUVRMDgXrbbMSuwDkABjTZsLxamY',
  FITBIT_CLIENT_ID: '23V34Q',
  FITBIT_API:       'https://fitbit-proxy.jfcass.workers.dev/1/user/-',
  FITBIT_TOKEN_URL: 'https://api.fitbit.com/oauth2/token',
  FITBIT_AUTH_URL:  'https://www.fitbit.com/oauth2/authorize',
  GOOGLE_POLLEN_KEY: 'AIzaSyD6YmmqvpXkWDMH6Es1biooiHTN2iBKN9s',
});
```

**Step 2: Commit**

```bash
git add js/config.js
git commit -m "feat(config): add AUTH_WORKER url"
```

---

### Task 3: Rewrite auth.js

**Files:**
- Modify: `js/auth.js` (full replacement)

**Step 1: Replace the entire file**

Replace `js/auth.js` with:

```javascript
/**
 * auth.js — Google Auth via ht-auth Cloudflare Worker
 *
 * Replaces the GIS token model. OAuth handled server-side by the Worker.
 * The browser holds only an HttpOnly session cookie (set by Worker) and
 * a short-lived access_token in memory.
 *
 * Public API (unchanged from previous version):
 *   init()          — set up visibilitychange listener
 *   requestToken()  — get a valid access_token (calls Worker)
 *   tryAutoAuth()   — silent check for existing session (used on app load)
 *   getToken()      — return cached token or null (synchronous)
 *   isTokenValid()  — true if token is cached and not expired
 *   signOut()       — clear session (calls Worker /logout)
 *   startSignIn()   — redirect to Worker /auth to begin OAuth flow
 */
const Auth = (() => {
  let accessToken  = null;
  let tokenExpiry  = 0;
  let refreshTimer = null;

  const WORKER = CONFIG.AUTH_WORKER;

  // ── Initialization ──────────────────────────────────────────────────────────

  function init() {
    // On mobile, the OS suspends background tabs and kills setTimeout timers.
    // When the user returns to the tab, re-check the token immediately.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !isTokenValid()) {
        requestToken(true).catch(() => {
          // Silent failure: next Drive operation will surface the error
        });
      }
    });
    return Promise.resolve();
  }

  // ── Token state ──────────────────────────────────────────────────────────────

  function isTokenValid() {
    return !!accessToken && Date.now() < tokenExpiry;
  }

  function getToken() {
    return isTokenValid() ? accessToken : null;
  }

  // ── Token acquisition ────────────────────────────────────────────────────────

  /**
   * Get a valid access_token from the Worker.
   * The Worker reads the session cookie, refreshes via stored refresh_token if needed,
   * and returns a fresh access_token — no user interaction required.
   *
   * @param {boolean} silent  true = return null on failure instead of redirecting
   * @returns {Promise<string|null>}
   */
  async function requestToken(silent = false) {
    if (isTokenValid()) return accessToken;

    try {
      const res = await fetch(`${WORKER}/token`, { credentials: 'include' });

      if (!res.ok) {
        // 401 = no session or session expired
        if (!silent) startSignIn();
        else document.dispatchEvent(new CustomEvent('ht-auth-expired'));
        return null;
      }

      const data = await res.json();
      accessToken = data.access_token;
      tokenExpiry = Date.now() + data.expires_in * 1000 - 60_000;
      scheduleRefresh();
      return accessToken;

    } catch {
      // Network error — don't redirect, surface through Drive call failures
      return null;
    }
  }

  /**
   * Called on app load to check for an existing session without any UI.
   * Returns true if a valid session exists (session cookie → KV → refresh_token).
   */
  async function tryAutoAuth() {
    const token = await requestToken(true);
    return !!token;
  }

  /**
   * Redirect the browser to the Worker's /auth endpoint to start the OAuth flow.
   * The Worker handles Google consent, token exchange, and redirects back to the app.
   */
  function startSignIn() {
    window.location.href = `${WORKER}/auth`;
  }

  // ── Token refresh ─────────────────────────────────────────────────────────────

  /**
   * Schedule a silent token refresh 5 minutes before the current token expires.
   * If the timer is killed by the OS (mobile), the visibilitychange listener
   * will catch it when the user returns to the tab.
   */
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    const delay = tokenExpiry - Date.now() - 5 * 60_000;
    if (delay > 0) {
      refreshTimer = setTimeout(() => {
        requestToken(true).catch(() => {});
      }, delay);
    }
  }

  // ── Sign out ──────────────────────────────────────────────────────────────────

  async function signOut() {
    clearTimeout(refreshTimer);
    accessToken = null;
    tokenExpiry = 0;
    try {
      await fetch(`${WORKER}/logout`, {
        method:      'POST',
        credentials: 'include',
      });
    } catch { /* best effort */ }
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  return { init, requestToken, tryAutoAuth, getToken, isTokenValid, signOut, startSignIn };
})();
```

**Step 2: Commit**

```bash
git add js/auth.js
git commit -m "feat(auth): replace GIS token model with Cloudflare Worker session auth"
```

---

### Task 4: Update index.html

**Files:**
- Modify: `index.html`

**Step 1: Remove the GIS script tag**

Find and delete this line (it loads the Google Identity Services library, which is no longer used):

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

**Step 2: Add the session-expired reconnect banner**

Find the `<body>` tag (or the first element inside it) and add this banner HTML right before the closing `</body>` tag:

```html
<!-- Session expired banner (shown when 30-day session expires mid-use) -->
<div id="reconnect-banner" class="reconnect-banner" hidden>
  <span>Session expired.</span>
  <button id="btn-reconnect" class="reconnect-banner__btn">Sign in again</button>
</div>
```

**Step 3: Add banner styles to css/styles.css**

Add at the end of `css/styles.css`:

```css
/* ── Reconnect banner ────────────────────────────────────────────────────── */
.reconnect-banner {
  position: fixed;
  bottom: calc(env(safe-area-inset-bottom) + 4rem);
  left: 50%;
  transform: translateX(-50%);
  background: var(--clr-surface);
  border: 1px solid var(--clr-error);
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  box-shadow: 0 4px 16px rgba(0,0,0,0.18);
  z-index: 9999;
  font-size: 0.9rem;
  color: var(--clr-text);
  white-space: nowrap;
}

.reconnect-banner__btn {
  background: var(--clr-error);
  color: #fff;
  border: none;
  border-radius: 0.5rem;
  padding: 0.35rem 0.75rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
```

**Step 4: Commit**

```bash
git add index.html css/styles.css
git commit -m "feat(auth): add session-expired reconnect banner, remove GIS script"
```

---

### Task 5: Update app.js

**Files:**
- Modify: `js/app.js`

**Step 1: Update the `init()` function**

Replace the existing `init()` function (lines ~221–259) with:

```javascript
async function init() {
  // Detect Fitbit OAuth callback (?code=... in URL after Fitbit redirect)
  const _fitbitParams = new URLSearchParams(window.location.search);
  const _fitbitCode   = _fitbitParams.get('code');
  const _fitbitState  = _fitbitParams.get('state');
  if (_fitbitCode) {
    sessionStorage.setItem('fitbit_pending_code',  _fitbitCode);
    sessionStorage.setItem('fitbit_pending_state', _fitbitState ?? '');
    history.replaceState({}, '', window.location.pathname);
  }

  // Check for auth_error query param returned from Worker after failed OAuth
  const _authError = _fitbitParams.get('auth_error');
  if (_authError) {
    history.replaceState({}, '', window.location.pathname);
  }

  // Wire up buttons
  document.getElementById('btn-signin').addEventListener('click', handleSignIn);
  document.getElementById('btn-pin-signout')?.addEventListener('click', handleSignOut);
  document.getElementById('btn-reconnect')?.addEventListener('click', handleReconnect);

  // Listen for mid-session auth expiry (dispatched by auth.js)
  document.addEventListener('ht-auth-expired', () => showReconnectBanner(true));

  // Always show loading screen while we check for an existing session
  showScreen('screen-loading');
  setLoadingMsg('Signing in…');

  await Auth.init();

  const silentOk = await Auth.tryAutoAuth();
  if (silentOk) {
    await loadData();
  } else {
    if (_authError) setAuthError(authErrorMessage(_authError));
    showScreen('screen-auth');
  }
}
```

**Step 2: Replace `handleSignIn()` and `handleSignOut()`**

Replace the existing `handleSignIn` and `handleSignOut` functions with:

```javascript
function handleSignIn() {
  const btn = document.getElementById('btn-signin');
  btn.disabled = true;
  setAuthError('');
  Auth.startSignIn();   // full-page redirect to Worker /auth → Google → back to app
  // Page will navigate away; no need to re-enable the button
}

async function handleSignOut() {
  await Auth.signOut();
  showScreen('screen-auth');
}
```

**Step 3: Add reconnect banner helpers**

Add these three functions after `handleSignOut`:

```javascript
function showReconnectBanner() {
  const banner = document.getElementById('reconnect-banner');
  if (banner) banner.hidden = false;
}

function hideReconnectBanner() {
  const banner = document.getElementById('reconnect-banner');
  if (banner) banner.hidden = true;
}

function handleReconnect() {
  hideReconnectBanner();
  Auth.startSignIn();
}
```

**Step 4: Add auth error message helper**

Add this function after `handleReconnect`:

```javascript
function authErrorMessage(code) {
  const messages = {
    no_refresh_token:     'Sign-in failed: please revoke app access in your Google Account settings and try again.',
    token_exchange_failed:'Sign-in failed: could not connect to Google. Please try again.',
    invalid_state:        'Sign-in failed: security check failed. Please try again.',
    missing_params:       'Sign-in failed. Please try again.',
  };
  return messages[code] ?? 'Sign-in failed. Please try again.';
}
```

**Step 5: Update the public API return statement**

Find the return statement at the bottom of App and add the new functions:

```javascript
return { init, showScreen, showMain, switchTab, toggleSection, applyVisibility, showReconnectBanner };
```

**Step 6: Commit**

```bash
git add js/app.js
git commit -m "feat(app): update boot flow and sign-in for Worker-based auth"
```

---

### Task 6: End-to-end test

**Step 1: Deploy to GitHub Pages**

```bash
git push origin main
```

Wait ~60 seconds for GitHub Pages to deploy.

**Step 2: Test fresh sign-in**

1. Open `https://jfcass.github.io/habit-tracker` in a private/incognito window
2. Expected: loading screen briefly, then sign-in screen appears
3. Click "Sign in with Google"
4. Expected: full-page redirect to Google consent screen
5. Select your account and approve
6. Expected: redirected back to app, loads your data, shows main screen
7. Open browser DevTools → Application → Cookies → `ht-auth.jfcass.workers.dev`
8. Expected: `ht_session` cookie present, HttpOnly checked, Secure checked, SameSite=None

**Step 3: Test persistent session**

1. Close the tab completely
2. Open `https://jfcass.github.io/habit-tracker` again (not incognito)
3. Expected: loading screen for ~1 second, then goes directly to main app with NO sign-in screen

**Step 4: Test token refresh (simulate expiry)**

In browser DevTools console on the app:
```javascript
// Simulate expired token
Auth._forceExpiry?.();   // if you added this helper, or:
// Just wait 1 hour, or manually clear the in-memory token by:
// (not possible directly — observe via Network tab that /token is called)
```
Instead, watch the Network tab: within ~55 minutes of signing in, you should see a `GET /token` request fire automatically (the scheduleRefresh timer).

**Step 5: Test sign-out**

1. Go to Settings tab → Sign out (or use the PIN screen sign-out)
2. Expected: sign-in screen appears
3. Check Cookies: `ht_session` cookie should be gone
4. Reload the page
5. Expected: sign-in screen again (session cleared)

**Step 6: Test on mobile**

1. Open app on phone browser
2. Sign in
3. Background the app for several minutes, then return
4. Expected: app still shows main screen (no sign-in prompt)
5. Interact with the app (log something)
6. Expected: save succeeds silently

---

### Task 7: Clean up localStorage remnants (optional tidy-up)

The old `auth.js` stored `ht_authed` and `ht_email` keys in localStorage. These are now unused. The new code doesn't write them, but old values may still exist in the browser.

**Step 1: Remove stale localStorage keys on app load**

In `js/app.js` `init()`, add these two lines right at the top of the function (before the Fitbit callback detection):

```javascript
// Remove stale keys from the old GIS-based auth (no longer used)
localStorage.removeItem('ht_authed');
localStorage.removeItem('ht_email');
```

**Step 2: Commit**

```bash
git add js/app.js
git commit -m "chore(auth): remove stale localStorage keys from old GIS auth"
```

---

## Troubleshooting

**"Sign-in failed: no_refresh_token"**
Google only sends a refresh_token on first consent. If you previously authorized the app, Google may skip it. Fix: go to [myaccount.google.com/permissions](https://myaccount.google.com/permissions), remove the Habit Tracker app access, then sign in again.

**CORS error in browser console (`Access-Control-Allow-Origin` missing)**
The `ALLOWED_ORIGIN` variable in the Worker may have a trailing slash or path mismatch. Verify it's exactly `https://jfcass.github.io/habit-tracker` (no trailing slash). The Worker extracts just the origin (`https://jfcass.github.io`) for CORS — if you see a mismatch, check the Worker logs in Cloudflare dashboard → Workers → ht-auth → Observability.

**Token fetch works in desktop but not mobile**
Ensure the `ht_session` cookie has `SameSite=None; Secure`. Check in DevTools → Application → Cookies.

**Session lost after browser restart**
`Max-Age=2592000` (30 days) should persist across restarts. If it's not persisting, check that the browser isn't set to clear cookies on close (common in Safari private mode).
