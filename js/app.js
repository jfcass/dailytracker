/**
 * app.js — Application orchestration
 *
 * Manages the screen flow:
 *   auth  →  (loading)  →  main app
 */
const App = (() => {

  // ── Screen management ────────────────────────────────────────────────────────

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
      const active = s.id === id;
      s.classList.toggle('screen--active', active);
      s.setAttribute('aria-hidden', String(!active));
    });
  }

  function setLoadingMsg(msg) {
    const el = document.getElementById('loading-msg');
    if (el) el.textContent = msg;
  }

  // ── Section collapse / expand ────────────────────────────────────────────────

  const COLLAPSED_KEY = 'ht_collapsed';
  let collapsedSections = new Set(
    JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]')
  );

  function applyCollapsedState() {
    document.querySelectorAll('.tracker-section[id]').forEach(sec => {
      sec.classList.toggle('tracker-section--collapsed', collapsedSections.has(sec.id));
    });
  }

  function toggleSection(id) {
    if (collapsedSections.has(id)) {
      collapsedSections.delete(id);
    } else {
      collapsedSections.add(id);
    }
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsedSections]));
    const sec = document.getElementById(id);
    if (sec) sec.classList.toggle('tracker-section--collapsed', collapsedSections.has(id));
  }

  // ── Tab navigation ────────────────────────────────────────────────────────────

  function switchTab(name) {
    // Show / hide tab content
    document.querySelectorAll('.tab-view').forEach(t => {
      const active = t.id === `tab-${name}`;
      t.hidden = !active;
      t.classList.toggle('tab-view--active', active);
    });

    // Update bottom nav active state
    document.querySelectorAll('.bottom-nav-btn').forEach(b => {
      b.classList.toggle('bottom-nav-btn--active', b.dataset.tab === name);
    });

    // Scroll to top of screen on every tab switch
    const screenEl = document.getElementById('screen-app');
    if (screenEl) screenEl.scrollTop = 0;

    // Render the selected tab
    if (name === 'reports')  Reports.render();
    if (name === 'library')  Books.render();
    if (name === 'settings') Settings.render();
    if (name === 'health-log') HealthLog.render();
  }

  // ── Post-PIN: show main app ──────────────────────────────────────────────────

  function showMain() {
    showScreen('screen-app');

    // Shared date navigator — must init before sections so getDate() is ready
    DateNav.init(date => {
      Weather.setDate(date);
      Mood.setDate(date);
      Habits.setDate(date);
      Moderation.setDate(date);
      Symptoms.setDate(date);
      Bowel.setDate(date);
      Gratitudes.setDate(date);
      if (typeof Books !== 'undefined') Books.setDate(date);
    });

    Weather.init();
    Mood.init();

    Habits.init();
    Moderation.init();
    Symptoms.init();
    Bowel.init();
    Gratitudes.init();
    Books.init();
    Reports.init();
    Settings.init();
    HealthLog.init();

    applyCollapsedState();
  }

  // ── Boot ─────────────────────────────────────────────────────────────────────

  async function init() {
    // Wire up sign-in button
    document.getElementById('btn-signin').addEventListener('click', handleSignIn);

    // Wire up sign-out link (on PIN screen)
    document.getElementById('btn-pin-signout')?.addEventListener('click', handleSignOut);

    // Returning users: show loading screen while we attempt silent re-auth
    // (avoids the sign-in screen flash on every visit)
    const wasAuthed = localStorage.getItem('ht_authed') === 'true';
    if (wasAuthed) {
      showScreen('screen-loading');
      setLoadingMsg('Signing in…');
    } else {
      showScreen('screen-auth');
    }

    // Initialise GIS (waits for the external script to load)
    await Auth.init();

    // Try silent auth — skips any Google UI if the browser session is still live
    const silentOk = await Auth.tryAutoAuth();
    if (silentOk) {
      await loadData();
    } else {
      // Silent auth failed (session expired, cookie blocked, etc.) — show sign-in
      showScreen('screen-auth');
    }
  }

  async function handleSignIn() {
    const btn = document.getElementById('btn-signin');
    btn.disabled = true;
    setAuthError('');

    try {
      showScreen('screen-loading');
      setLoadingMsg('Connecting to Google…');
      await Auth.requestToken(false);
      await loadData();
    } catch (err) {
      console.error('Sign-in error:', err);
      setAuthError('Sign-in failed. Please try again.');
      showScreen('screen-auth');
    } finally {
      btn.disabled = false;
    }
  }

  async function loadData() {
    showScreen('screen-loading');
    setLoadingMsg('Loading your data…');

    try {
      await Data.load();

      showMain();
    } catch (err) {
      console.error('Data load error:', err);
      setAuthError('Failed to load your data. Please try again.');
      showScreen('screen-auth');
    }
  }

  function handleSignOut() {
    Auth.signOut();
    showScreen('screen-auth');
  }

  function setAuthError(msg) {
    const el = document.getElementById('auth-error');
    if (!el) return;
    el.textContent    = msg;
    el.style.display  = msg ? 'block' : 'none';
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  return { init, showScreen, showMain, switchTab, toggleSection };
})();

// Kick off on DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());
