/**
 * auth.js — Google Identity Services (GIS) OAuth token management
 *
 * Uses the token model (implicit-style) via GIS.
 * Scope: drive.file — only accesses files this app created.
 */
const Auth = (() => {
  let tokenClient  = null;
  let accessToken  = null;
  let tokenExpiry  = 0;

  // ── Initialization ──────────────────────────────────────────────────────────

  /** Wait for the GIS script to finish loading, then create the token client. */
  function init() {
    return new Promise(resolve => {
      const tryInit = () => {
        if (window.google?.accounts?.oauth2) {
          tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CONFIG.CLIENT_ID,
            scope:     CONFIG.SCOPES,
            callback:  '',            // set per-request below
          });
          resolve();
        } else {
          setTimeout(tryInit, 50);
        }
      };
      tryInit();
    });
  }

  // ── Token management ────────────────────────────────────────────────────────

  function isTokenValid() {
    return !!accessToken && Date.now() < tokenExpiry;
  }

  function getToken() {
    return isTokenValid() ? accessToken : null;
  }

  /**
   * Request an access token.
   * @param {boolean} silent  true → suppress account chooser UI if possible
   * @returns {Promise<string>} resolves with the access token
   */
  function requestToken(silent = false) {
    return new Promise((resolve, reject) => {
      if (isTokenValid()) {
        resolve(accessToken);
        return;
      }

      tokenClient.callback = response => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        accessToken  = response.access_token;
        // Subtract 60 s as a buffer before real expiry
        tokenExpiry  = Date.now() + response.expires_in * 1000 - 60_000;
        localStorage.setItem('ht_authed', 'true');
        fetchAndStoreEmail(accessToken);   // fire-and-forget; skip account picker next time
        resolve(accessToken);
      };

      // hint → pre-selects stored account so user never sees the account-list picker
      const hint   = localStorage.getItem('ht_email') || '';
      const config = silent ? { prompt: '' } : {};
      if (hint) config.hint = hint;
      tokenClient.requestAccessToken(config);
    });
  }

  /**
   * Try to get a token without showing any UI (best-effort).
   * Returns false if the user hasn't signed in before, or if the silent
   * attempt fails.
   */
  async function tryAutoAuth() {
    if (localStorage.getItem('ht_authed') !== 'true') return false;
    try {
      await requestToken(true);
      return true;
    } catch {
      return false;
    }
  }

  /** Fetch account email from tokeninfo and store for future hint use. */
  function fetchAndStoreEmail(token) {
    fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`)
      .then(r => r.json())
      .then(info => { if (info.email) localStorage.setItem('ht_email', info.email); })
      .catch(() => {});
  }

  function signOut() {
    if (accessToken) {
      google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
    tokenExpiry = 0;
    localStorage.removeItem('ht_authed');
    localStorage.removeItem('ht_email');
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  return { init, requestToken, tryAutoAuth, getToken, isTokenValid, signOut };
})();
