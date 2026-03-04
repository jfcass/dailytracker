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

  let currentTab = 'today';

  function switchTab(name, pushHistory = true) {
    if (pushHistory && name !== currentTab) {
      history.pushState({ ht: 'tab', tab: name }, '');
    }
    currentTab = name;

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
    if (name === 'reports')    Reports.render();
    if (name === 'library')    Books.render();
    if (name === 'settings')   Settings.render();
    if (name === 'health-log') HealthLog.render();
    if (name === 'treatments') Treatments.render();
  }

  // ── Back-gesture / popstate handling ─────────────────────────────────────────

  function handlePopState(e) {
    const s = e.state;
    if (!s?.ht) return;
    if (s.ht === 'tab') {
      // Returning to a tab — close any open detail views first
      if (typeof HealthLog    !== 'undefined') HealthLog._exitDetail();
      if (typeof Treatments   !== 'undefined') Treatments._exitDetail();
      switchTab(s.tab, false);
    } else if (s.ht === 'tx-detail') {
      // Back from within a treatment detail — return to treatment list
      if (typeof Treatments !== 'undefined') {
        Treatments._exitDetail();
        App.switchTab('treatments', false);
      }
    } else if (s.ht === 'hl-detail') {
      if (typeof HealthLog !== 'undefined') HealthLog._exitDetail();
      App.switchTab('health-log', false);
    }
  }

  // ── Post-PIN: show main app ──────────────────────────────────────────────────

  function showMain() {
    showScreen('screen-app');

    // Seed history so the first swipe-back has a state to land on
    history.replaceState({ ht: 'tab', tab: 'today' }, '');
    currentTab = 'today';
    window.addEventListener('popstate', handlePopState);

    // Shared date navigator — must init before sections so getDate() is ready
    DateNav.init(date => {
      Weather.setDate(date);
      Mood.setDate(date);
      Habits.setDate(date);
      Moderation.setDate(date);
      Symptoms.setDate(date);
      Medications.setDate(date);
      Bowel.setDate(date);
      Gratitudes.setDate(date);
      if (typeof Books !== 'undefined') Books.setDate(date);
    });

    Weather.init();
    Mood.init();

    Habits.init();
    Moderation.init();
    Symptoms.init();
    Medications.init();
    Bowel.init();
    Gratitudes.init();
    Books.init();
    Reports.init();
    Settings.init();
    HealthLog.init();
    Treatments.init();

    // Sync Fitbit in background — don't await, never blocks the UI
    if (typeof Fitbit !== 'undefined') Fitbit.sync();

    applyCollapsedState();
    applyVisibility();
    initSwipe();
  }

  // ── Section visibility (show/hide in settings) ───────────────────────────────

  function applyVisibility() {
    const hidden = new Set(Data.getSettings().hidden_sections ?? []);

    // Today tab sections
    const sectionMap = {
      habits:     'section-habits',
      mood:       'section-mood',
      symptoms:   'section-symptoms',
      moderation: 'section-moderation',
      bowel:      'section-bowel',
      gratitudes: 'section-gratitudes',
      note:       'section-note',
    };
    Object.entries(sectionMap).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el) el.hidden = hidden.has(key);
    });

    // Tab nav buttons — hide button; redirect if on a now-hidden tab
    ['health-log', 'treatments', 'library', 'reports'].forEach(tab => {
      const btn = document.querySelector(`.bottom-nav-btn[data-tab="${tab}"]`);
      if (btn) btn.hidden = hidden.has(`tab-${tab}`);
      if (hidden.has(`tab-${tab}`) && currentTab === tab) switchTab('today');
    });
  }

  // ── Swipe-to-navigate ────────────────────────────────────────────────────────

  function getVisibleTabs() {
    return [...document.querySelectorAll('.bottom-nav-btn:not([hidden])')]
      .map(btn => btn.dataset.tab);
  }

  function initSwipe() {
    const el = document.getElementById('screen-app');
    if (!el) return;

    let startX = 0, startY = 0, startTarget = null;

    el.addEventListener('touchstart', e => {
      startX      = e.touches[0].clientX;
      startY      = e.touches[0].clientY;
      startTarget = e.target;
    }, { passive: true });

    el.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;

      // Need a clear horizontal swipe — at least 60px and wider than tall
      if (Math.abs(dx) < 60) return;
      if (Math.abs(dy) > Math.abs(dx) * 0.6) return;

      // Don't trigger when the gesture started on a horizontally-scrollable element
      if (startTarget?.closest(
        '.health-chart-scroll, .rpt-heatmap, .rpt-chart-wrap, .conditions-bar'
      )) return;

      const tabs = getVisibleTabs();
      const idx  = tabs.indexOf(currentTab);
      if (idx === -1) return;

      if (dx < 0 && idx < tabs.length - 1) switchTab(tabs[idx + 1]);
      else if (dx > 0 && idx > 0)          switchTab(tabs[idx - 1]);
    }, { passive: true });
  }

  // ── Boot ─────────────────────────────────────────────────────────────────────

  async function init() {
    // Remove stale keys from the old GIS-based auth (no longer used)
    localStorage.removeItem('ht_authed');
    localStorage.removeItem('ht_email');

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
    // Only show the banner when the user is already in the main app — not during boot
    document.addEventListener('ht-auth-expired', () => {
      if (document.getElementById('screen-app')?.classList.contains('screen--active')) {
        showReconnectBanner();
      }
    });

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

  async function loadData() {
    showScreen('screen-loading');
    setLoadingMsg('Loading your data…');

    try {
      await Data.load();

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

      showMain();
    } catch (err) {
      console.error('Data load error:', err);
      setAuthError('Failed to load your data. Please try again.');
      showScreen('screen-auth');
    }
  }

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

  function authErrorMessage(code) {
    const messages = {
      no_refresh_token:      'Sign-in failed: please revoke app access in your Google Account settings and try again.',
      token_exchange_failed: 'Sign-in failed: could not connect to Google. Please try again.',
      invalid_state:         'Sign-in failed: security check failed. Please try again.',
      missing_params:        'Sign-in failed. Please try again.',
    };
    return messages[code] ?? 'Sign-in failed. Please try again.';
  }

  function setAuthError(msg) {
    const el = document.getElementById('auth-error');
    if (!el) return;
    el.textContent    = msg;
    el.style.display  = msg ? 'block' : 'none';
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  return { init, showScreen, showMain, switchTab, toggleSection, applyVisibility, showReconnectBanner };
})();

// Kick off on DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());
