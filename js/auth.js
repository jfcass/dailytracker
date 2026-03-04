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
