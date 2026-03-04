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
