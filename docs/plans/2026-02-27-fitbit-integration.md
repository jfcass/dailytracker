# Fitbit Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-sync sleep, HRV, steps, heart rate, SpO2, and breathing rate from Fitbit into the tracker on every app open, with connection management in the Settings tab.

**Architecture:** Two new modules — `fitbit-auth.js` handles the PKCE OAuth dance and token lifecycle, `fitbit.js` fetches data and writes it into the day store. `app.js` triggers the sync after data loads and intercepts the Fitbit OAuth callback URL. Settings gains a Fitbit card with connected/error/disconnected states.

**Tech Stack:** Fitbit Web API (REST, CORS-enabled), OAuth 2.0 Authorization Code + PKCE (no client secret), Web Crypto SHA-256 (already used for PIN), vanilla JS fetch.

---

## Pre-requisite: Register a Fitbit App

Before writing any code, register the app at https://dev.fitbit.com/apps/new:
- **Application Type:** Personal
- **OAuth 2.0 Application Type:** Personal
- **Redirect URL:** `http://localhost` (for dev) + your production URL
- After saving, copy the **OAuth 2.0 Client ID** — you'll need it in Task 1.

---

## Task 1: Schema defaults, config, and script tags

**Files:**
- Modify: `js/config.js`
- Modify: `js/data.js`
- Modify: `index.html`

**Step 1: Add Fitbit client ID to config.js**

In `js/config.js`, add after `BOOKS_API_KEY`:

```js
  FITBIT_CLIENT_ID: 'YOUR_CLIENT_ID_HERE',
  FITBIT_API:       'https://api.fitbit.com/1/user/-',
  FITBIT_TOKEN_URL: 'https://api.fitbit.com/oauth2/token',
  FITBIT_AUTH_URL:  'https://www.fitbit.com/oauth2/authorize',
```

**Step 2: Add fitbit key to SCHEMA_DEFAULTS in data.js**

In `js/data.js`, in `SCHEMA_DEFAULTS`, add after `blood_pressure: []`:

```js
    fitbit: null,
```

**Step 3: Add 5 new fields to getDay() defaults in data.js**

In `js/data.js`, in the `getDay()` function's default day object, add after `bowel: []`:

```js
        steps:          null,
        resting_hr:     null,
        hrv:            null,
        spo2:           null,
        breathing_rate: null,
```

**Step 4: Add script tags to index.html**

After `<script src="js/health-log.js"></script>` and before `<script src="js/app.js"></script>`, add:

```html
  <script src="js/fitbit-auth.js"></script>
  <script src="js/fitbit.js"></script>
```

**Step 5: Commit**

```bash
git add js/config.js js/data.js index.html
git commit -m "feat(fitbit): schema defaults, config keys, script tags"
```

---

## Task 2: Create js/fitbit-auth.js

**Files:**
- Create: `js/fitbit-auth.js`

**Step 1: Create the file with this complete content**

```js
/**
 * fitbit-auth.js — Fitbit OAuth 2.0 Authorization Code + PKCE
 *
 * No client secret required (Personal app type).
 * Tokens stored in data.fitbit in the Drive JSON.
 */
const FitbitAuth = (() => {

  // ── PKCE helpers ─────────────────────────────────────────────────────────────

  function base64urlEncode(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  function generateCodeVerifier() {
    const buf = new Uint8Array(48);
    crypto.getRandomValues(buf);
    return base64urlEncode(buf);
  }

  async function generateCodeChallenge(verifier) {
    const data   = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return base64urlEncode(digest);
  }

  function getRedirectUri() {
    return window.location.origin + window.location.pathname;
  }

  // ── Connect flow ─────────────────────────────────────────────────────────────

  async function startAuth() {
    const verifier  = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state     = base64urlEncode(crypto.getRandomValues(new Uint8Array(16)));

    sessionStorage.setItem('fitbit_cv',    verifier);
    sessionStorage.setItem('fitbit_state', state);

    const params = new URLSearchParams({
      client_id:             CONFIG.FITBIT_CLIENT_ID,
      response_type:         'code',
      scope:                 'sleep activity heartrate oxygen_saturation respiratory_rate cardio_fitness',
      redirect_uri:          getRedirectUri(),
      code_challenge:        challenge,
      code_challenge_method: 'S256',
      state,
    });

    window.location.href = `${CONFIG.FITBIT_AUTH_URL}?${params}`;
  }

  // ── Callback handler ─────────────────────────────────────────────────────────

  async function handleCallback(code, returnedState) {
    const verifier = sessionStorage.getItem('fitbit_cv');
    const state    = sessionStorage.getItem('fitbit_state');
    sessionStorage.removeItem('fitbit_cv');
    sessionStorage.removeItem('fitbit_state');

    if (!verifier)                  throw new Error('Missing code verifier');
    if (returnedState !== state)    throw new Error('State mismatch — possible CSRF');

    const body = new URLSearchParams({
      client_id:     CONFIG.FITBIT_CLIENT_ID,
      grant_type:    'authorization_code',
      code,
      redirect_uri:  getRedirectUri(),
      code_verifier: verifier,
    });

    const res = await fetch(CONFIG.FITBIT_TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) throw new Error(`Fitbit token exchange failed: ${res.status}`);

    storeTokens(await res.json());
  }

  // ── Token management ─────────────────────────────────────────────────────────

  function storeTokens(json) {
    const d = Data.getData();
    if (!d.fitbit) d.fitbit = {};
    d.fitbit.access_token  = json.access_token;
    d.fitbit.refresh_token = json.refresh_token;
    d.fitbit.expires_at    = Date.now() + json.expires_in * 1000 - 60_000;
    d.fitbit.sync_error    = null;
  }

  async function refreshIfNeeded() {
    const d = Data.getData();
    if (!d.fitbit?.refresh_token) throw new Error('No refresh token');
    if (d.fitbit.expires_at > Date.now()) return;   // still valid

    const body = new URLSearchParams({
      client_id:     CONFIG.FITBIT_CLIENT_ID,
      grant_type:    'refresh_token',
      refresh_token: d.fitbit.refresh_token,
    });

    const res = await fetch(CONFIG.FITBIT_TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);

    storeTokens(await res.json());
    await Data.save();
  }

  // ── Public helpers ───────────────────────────────────────────────────────────

  function getAccessToken() {
    return Data.getData().fitbit?.access_token ?? null;
  }

  function isConnected() {
    const f = Data.getData().fitbit;
    return !!(f?.access_token && f?.refresh_token);
  }

  async function disconnect() {
    Data.getData().fitbit = null;
    await Data.save();
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  return { startAuth, handleCallback, refreshIfNeeded, getAccessToken, isConnected, disconnect };
})();
```

**Step 2: Verify file was created**

Open `js/fitbit-auth.js` in a text editor and confirm it has ~100 lines.

**Step 3: Commit**

```bash
git add js/fitbit-auth.js
git commit -m "feat(fitbit): PKCE auth module — connect, token exchange, refresh, disconnect"
```

---

## Task 3: Create js/fitbit.js

**Files:**
- Create: `js/fitbit.js`

**Step 1: Create the file with this complete content**

```js
/**
 * fitbit.js — Fitbit data sync
 *
 * Called from app.js showMain() after data loads.
 * Fetches today + yesterday from Fitbit and writes into Data.getDay().
 * Overwrites any manually entered values.
 */
const Fitbit = (() => {

  // ── API helper ────────────────────────────────────────────────────────────────

  async function apiFetch(path) {
    const token = FitbitAuth.getAccessToken();
    const res   = await fetch(`${CONFIG.FITBIT_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('Token expired — please reconnect Fitbit');
      throw new Error(`Fitbit API error ${res.status}: ${path}`);
    }
    return res.json();
  }

  // ── Date helper ───────────────────────────────────────────────────────────────

  function yesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y  = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dy = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${dy}`;
  }

  // ── Sync a single date ────────────────────────────────────────────────────────

  async function syncDate(date) {
    const [sleepRes, actRes, hrvRes, spo2Res, brRes] = await Promise.allSettled([
      apiFetch(`/sleep/date/${date}.json`),
      apiFetch(`/activities/date/${date}.json`),
      apiFetch(`/hrv/date/${date}.json`),
      apiFetch(`/spo2/date/${date}.json`),
      apiFetch(`/br/date/${date}.json`),
    ]);

    const day = Data.getDay(date);

    // Sleep: duration, bedtime, wake time
    if (sleepRes.status === 'fulfilled') {
      const main = (sleepRes.value.sleep ?? []).find(s => s.isMainSleep)
                ?? sleepRes.value.sleep?.[0];
      if (main) {
        if (!day.sleep) day.sleep = {};
        day.sleep.hours     = +(main.minutesAsleep / 60).toFixed(1);
        // Fitbit times include date: "2026-02-27T23:15:00.000" → take HH:MM
        day.sleep.bedtime   = (main.startTime ?? '').slice(11, 16);
        day.sleep.wake_time = (main.endTime   ?? '').slice(11, 16);
      }
    }

    // Steps + resting heart rate (both come from activities summary)
    if (actRes.status === 'fulfilled') {
      const summary = actRes.value.summary ?? {};
      if (summary.steps != null)       day.steps      = summary.steps;
      if (summary.restingHeartRate)    day.resting_hr = summary.restingHeartRate;
    }

    // HRV — daily RMSSD in milliseconds
    if (hrvRes.status === 'fulfilled') {
      const rmssd = hrvRes.value.hrv?.[0]?.value?.dailyRmssd;
      if (rmssd != null) day.hrv = +rmssd.toFixed(1);
    }

    // SpO2 — average blood oxygen during sleep
    if (spo2Res.status === 'fulfilled') {
      const avg = spo2Res.value.value?.avg;
      if (avg != null) day.spo2 = +avg.toFixed(1);
    }

    // Breathing rate during sleep
    if (brRes.status === 'fulfilled') {
      const br = brRes.value.br?.[0]?.value?.breathingRate;
      if (br != null) day.breathing_rate = +br.toFixed(1);
    }
  }

  // ── Main sync entry point ─────────────────────────────────────────────────────

  async function sync() {
    if (!FitbitAuth.isConnected()) return;

    const d = Data.getData();

    try {
      await FitbitAuth.refreshIfNeeded();

      const today = Data.today();
      const yest  = yesterday();

      // Sync both days in parallel
      await Promise.all([syncDate(today), syncDate(yest)]);

      d.fitbit.last_sync  = today;
      d.fitbit.sync_error = null;
      await Data.save();

    } catch (err) {
      console.error('Fitbit sync error:', err);
      d.fitbit          = d.fitbit ?? {};
      d.fitbit.sync_error = err.message ?? 'Sync failed';
      await Data.save();
    }

    // Re-render Settings if it's the active tab (shows error/last-sync update)
    if (typeof Settings !== 'undefined') Settings.render();
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  return { sync };
})();
```

**Step 2: Commit**

```bash
git add js/fitbit.js
git commit -m "feat(fitbit): sync module — sleep, steps, HR, HRV, SpO2, breathing rate"
```

---

## Task 4: Update app.js — callback detection + sync trigger

**Files:**
- Modify: `js/app.js`

**Step 1: Detect Fitbit callback in init()**

In `js/app.js`, in the `init()` function, add this block at the very start of the function body, before the sign-in button wiring:

```js
    // Detect Fitbit OAuth callback (?code=... in URL after Fitbit redirect)
    const _fitbitParams = new URLSearchParams(window.location.search);
    const _fitbitCode   = _fitbitParams.get('code');
    const _fitbitState  = _fitbitParams.get('state');
    if (_fitbitCode) {
      sessionStorage.setItem('fitbit_pending_code',  _fitbitCode);
      sessionStorage.setItem('fitbit_pending_state', _fitbitState ?? '');
      history.replaceState({}, '', window.location.pathname);
    }
```

**Step 2: Handle pending Fitbit code after data loads**

In `js/app.js`, in the `loadData()` function, after `await Data.load();` and before `showMain();`, add:

```js
      // Complete Fitbit token exchange if this load follows a Fitbit OAuth redirect
      const _pendingCode  = sessionStorage.getItem('fitbit_pending_code');
      const _pendingState = sessionStorage.getItem('fitbit_pending_state');
      if (_pendingCode) {
        sessionStorage.removeItem('fitbit_pending_code');
        sessionStorage.removeItem('fitbit_pending_state');
        try {
          await FitbitAuth.handleCallback(_pendingCode, _pendingState);
          await Data.save();
        } catch (err) {
          console.error('Fitbit auth callback error:', err);
          const d = Data.getData();
          if (!d.fitbit) d.fitbit = {};
          d.fitbit.sync_error = 'Connection failed: ' + (err.message ?? 'unknown error');
          await Data.save();
        }
      }
```

**Step 3: Trigger sync in showMain()**

In `js/app.js`, in the `showMain()` function, after `HealthLog.init();` and before `applyCollapsedState();`, add:

```js
    // Sync Fitbit in background — don't await, never blocks the UI
    if (typeof Fitbit !== 'undefined') Fitbit.sync();
```

**Step 4: Verify logic in browser**

Open the app, open DevTools console. You should see no new errors. The Fitbit sync will silently fail with "not connected" (expected — Fitbit isn't connected yet).

**Step 5: Commit**

```bash
git add js/app.js
git commit -m "feat(fitbit): detect OAuth callback in app.js, trigger background sync on open"
```

---

## Task 5: Add Fitbit card to Settings

**Files:**
- Modify: `js/settings.js`

**Step 1: Add buildFitbitCard() function**

In `js/settings.js`, add this function after `buildAccountCard()` and before the `scheduleSave()` function:

```js
  // ── Fitbit Card ───────────────────────────────────────────────────────────────

  function buildFitbitCard() {
    const card = makeCard(`
      <span class="stg-card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        Fitbit
      </span>
    `);

    const fitbit    = Data.getData().fitbit;
    const connected = FitbitAuth.isConnected();

    if (!connected) {
      // ── Not connected ──
      const row = document.createElement('div');
      row.className = 'stg-action-row';
      row.innerHTML = `
        <div class="stg-action-info">
          <div class="stg-action-title">Pixel Watch sync</div>
          <div class="stg-action-desc">Auto-sync sleep, HRV, steps, heart rate, SpO2 and more</div>
        </div>
        <button class="stg-action-btn" type="button">Connect</button>
      `;
      row.querySelector('.stg-action-btn').addEventListener('click', () => FitbitAuth.startAuth());
      card.appendChild(row);
      return card;
    }

    // ── Connected ──
    const disconnectBtn = document.createElement('button');
    disconnectBtn.className = 'stg-action-btn stg-action-btn--danger';
    disconnectBtn.type = 'button';
    disconnectBtn.textContent = 'Disconnect';
    disconnectBtn.addEventListener('click', async () => {
      if (!confirm('Disconnect Fitbit? Auto-sync will stop, your logged data is kept.')) return;
      await FitbitAuth.disconnect();
      render();
    });
    card.querySelector('.stg-card-header').appendChild(disconnectBtn);

    if (fitbit?.sync_error) {
      // ── Error state ──
      const errRow = document.createElement('div');
      errRow.className = 'stg-fitbit-error';
      errRow.innerHTML = `
        <span class="stg-fitbit-error-msg">⚠ Last sync failed: ${escHtml(fitbit.sync_error)}</span>
        <button class="stg-action-btn" type="button">Reconnect</button>
      `;
      errRow.querySelector('.stg-action-btn').addEventListener('click', () => FitbitAuth.startAuth());
      card.appendChild(errRow);
    } else {
      // ── Healthy ──
      const statusRow = document.createElement('div');
      statusRow.className = 'stg-fitbit-status';
      const lastSync = fitbit?.last_sync
        ? (fitbit.last_sync === Data.today() ? 'Today' : fitbit.last_sync)
        : 'Never';
      statusRow.innerHTML = `
        <span class="stg-fitbit-synced">Last synced: ${escHtml(lastSync)}</span>
        <span class="stg-fitbit-fields">Sleep · HRV · Steps · Heart Rate · SpO2 · Breathing Rate</span>
      `;
      card.appendChild(statusRow);
    }

    return card;
  }
```

**Step 2: Add buildFitbitCard() to render()**

In `js/settings.js`, in the `render()` function, add after `wrap.appendChild(buildAccountCard());`:

```js
    wrap.appendChild(buildFitbitCard());
```

**Step 3: Add CSS for Fitbit card elements**

In `css/styles.css`, find the end of the existing `stg-` styles block and append:

```css
/* ── Settings: Fitbit card ───────────────────────────────────────────────── */

.stg-fitbit-status {
  display:        flex;
  flex-direction: column;
  gap:            4px;
  padding:        10px 0 4px;
}
.stg-fitbit-synced {
  font-size: 0.85rem;
  color:     var(--clr-text);
}
.stg-fitbit-fields {
  font-size: 0.78rem;
  color:     var(--clr-text-2);
}
.stg-fitbit-error {
  display:     flex;
  align-items: center;
  gap:         12px;
  padding:     10px 0 4px;
  flex-wrap:   wrap;
}
.stg-fitbit-error-msg {
  font-size: 0.85rem;
  color:     var(--clr-error);
  flex:      1;
}
```

**Step 4: Verify in browser**

- Open app → Settings tab → you should see a "Fitbit" card at the bottom with a "Connect" button
- Click Connect — you'll be redirected to Fitbit's auth page (you need to have put your real `FITBIT_CLIENT_ID` in config.js first)
- After approving, you're redirected back; app loads, exchanges code, starts sync
- Settings shows "Last synced: Today" with the list of synced fields

**Step 5: Commit**

```bash
git add js/settings.js css/styles.css
git commit -m "feat(fitbit): Fitbit card in Settings — connect/disconnect/error states"
```

---

## Verification Checklist

1. Settings tab shows Fitbit card in "Not connected" state before auth
2. Clicking "Connect" redirects to `fitbit.com/oauth2/authorize`
3. After approving on Fitbit, app reloads, strips `?code=` from URL
4. Settings shows "Last synced: Today" with the 6 field labels
5. `Data.getData().fitbit` in DevTools console has `access_token`, `refresh_token`, `expires_at`, `last_sync`
6. `Data.getData().days[today]` has `steps`, `resting_hr`, `hrv`, `spo2`, `breathing_rate` values (may be null if Fitbit has no data yet for today)
7. `Data.getData().days[yesterday].sleep.hours` is populated from Fitbit
8. Clicking "Disconnect" → confirm dialog → card returns to "Connect" state
9. If sync fails, Settings shows ⚠ error message with "Reconnect" button
