/**
 * pin.js — PIN entry and PIN setup screen logic
 */
const PIN = (() => {

  // ── State ────────────────────────────────────────────────────────────────────

  let entered  = '';           // digits typed so far on the active screen
  let confirm  = '';           // stored first-entry during setup confirm step
  let mode     = 'entry';      // 'entry' | 'setup-first' | 'setup-confirm'
  const LEN    = CONFIG.PIN_LENGTH;

  // ── Keypad builder ───────────────────────────────────────────────────────────

  /**
   * Render a numeric keypad into the given container element.
   * Layout: 1 2 3 / 4 5 6 / 7 8 9 / [blank] 0 [del]
   */
  function buildKeypad(container, onKey) {
    container.innerHTML = '';
    const keys = ['1','2','3','4','5','6','7','8','9','','0','del'];

    keys.forEach(k => {
      const btn = document.createElement('button');
      btn.type  = 'button';

      if (k === '') {
        btn.className = 'pin-key pin-key--phantom';
        btn.disabled  = true;
        btn.setAttribute('aria-hidden', 'true');
      } else if (k === 'del') {
        btn.className            = 'pin-key pin-key--del';
        btn.setAttribute('aria-label', 'Delete');
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
          width="22" height="22">
          <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
          <line x1="18" y1="9" x2="12" y2="15"/>
          <line x1="12" y1="9" x2="18" y2="15"/>
        </svg>`;
      } else {
        btn.className   = 'pin-key';
        btn.textContent = k;
      }

      btn.addEventListener('click', () => onKey(k));
      container.appendChild(btn);
    });
  }

  // ── Dot display ──────────────────────────────────────────────────────────────

  function updateDots(dotsEl, count) {
    dotsEl.querySelectorAll('.pin-dot').forEach((dot, i) => {
      dot.classList.toggle('pin-dot--filled', i < count);
    });
  }

  function shakeDots(dotsEl) {
    dotsEl.classList.remove('pin-dots--shake');
    // Force reflow so the animation restarts
    void dotsEl.offsetWidth;
    dotsEl.classList.add('pin-dots--shake');
    dotsEl.addEventListener('animationend', () =>
      dotsEl.classList.remove('pin-dots--shake'), { once: true });
  }

  // ── PIN Entry screen ─────────────────────────────────────────────────────────

  function showEntry() {
    mode    = 'entry';
    entered = '';

    const dotsEl = document.getElementById('pin-dots');
    updateDots(dotsEl, 0);
    setEntryError('');

    buildKeypad(
      document.getElementById('pin-keypad'),
      handleEntryKey,
    );

    App.showScreen('screen-pin');
  }

  function handleEntryKey(k) {
    if (k === 'del') {
      entered = entered.slice(0, -1);
    } else if (entered.length < LEN) {
      entered += k;
    }

    updateDots(document.getElementById('pin-dots'), entered.length);

    if (entered.length === LEN) {
      // Small delay so the last dot fills visibly before verifying
      setTimeout(verifyEntry, 180);
    }
  }

  async function verifyEntry() {
    const ok = await Data.verifyPIN(entered);
    if (ok) {
      App.showMain();
    } else {
      shakeDots(document.getElementById('pin-dots'));
      setEntryError('Incorrect PIN');
      entered = '';
      setTimeout(() => {
        updateDots(document.getElementById('pin-dots'), 0);
        setEntryError('');
      }, 900);
    }
  }

  function setEntryError(msg) {
    const el = document.getElementById('pin-error');
    if (el) el.textContent = msg;
  }

  // ── PIN Setup screen ─────────────────────────────────────────────────────────

  function showSetup() {
    mode    = 'setup-first';
    entered = '';
    confirm = '';

    _updateSetupUI();
    buildKeypad(
      document.getElementById('pin-setup-keypad'),
      handleSetupKey,
    );

    App.showScreen('screen-pin-setup');
  }

  function _updateSetupUI() {
    const title = document.getElementById('pin-setup-title');
    const sub   = document.getElementById('pin-setup-subtitle');
    if (mode === 'setup-first') {
      title.textContent = 'Set Your PIN';
      sub.textContent   = 'Choose a 4-digit PIN to protect your data.';
    } else {
      title.textContent = 'Confirm PIN';
      sub.textContent   = 'Enter the same PIN again.';
    }
    updateDots(document.getElementById('pin-setup-dots'), 0);
    setSetupError('');
  }

  function handleSetupKey(k) {
    if (k === 'del') {
      entered = entered.slice(0, -1);
    } else if (entered.length < LEN) {
      entered += k;
    }

    updateDots(document.getElementById('pin-setup-dots'), entered.length);

    if (entered.length === LEN) {
      setTimeout(advanceSetup, 180);
    }
  }

  function advanceSetup() {
    if (mode === 'setup-first') {
      confirm  = entered;
      entered  = '';
      mode     = 'setup-confirm';
      _updateSetupUI();
    } else {
      // Confirm step
      if (entered === confirm) {
        commitSetup();
      } else {
        shakeDots(document.getElementById('pin-setup-dots'));
        setSetupError("PINs don't match — try again");
        entered  = '';
        confirm  = '';
        mode     = 'setup-first';
        setTimeout(() => {
          _updateSetupUI();
          setSetupError('');
        }, 1000);
      }
    }
  }

  async function commitSetup() {
    try {
      document.getElementById('pin-setup-keypad').style.pointerEvents = 'none';
      await Data.setPIN(entered);   // hashes + saves to Drive
      App.showMain();
    } catch (err) {
      console.error('Failed to save PIN:', err);
      setSetupError('Save failed — check your connection and try again.');
      document.getElementById('pin-setup-keypad').style.pointerEvents = '';
      entered = '';
      confirm = '';
      mode    = 'setup-first';
      _updateSetupUI();
    }
  }

  function setSetupError(msg) {
    const el = document.getElementById('pin-setup-error');
    if (el) el.textContent = msg;
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  return { showEntry, showSetup };
})();
