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
