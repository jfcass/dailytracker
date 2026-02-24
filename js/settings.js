/**
 * settings.js — In-app configuration
 *
 * Renders into #settings-content in the Settings tab.
 * Manages: habits, moderation substances, symptom categories,
 *          theme preference, temperature unit, PIN change, sign-out.
 */
const Settings = (() => {

  let saveTimer = null;

  // ── Public entry points ───────────────────────────────────────────────────────

  function init() {
    // Apply stored theme preference immediately on startup
    applyTheme(Data.getSettings().theme ?? 'system');
  }

  function render() {
    const wrap = document.getElementById('settings-content');
    if (!wrap) return;

    wrap.innerHTML = '';
    wrap.appendChild(buildHabitsCard());
    wrap.appendChild(buildSubstancesCard());
    wrap.appendChild(buildCategoriesCard());
    wrap.appendChild(buildDisplayCard());
    wrap.appendChild(buildAccountCard());

    const status = document.createElement('div');
    status.id = 'stg-save-status';
    status.className = 'save-status';
    status.setAttribute('aria-live', 'polite');
    wrap.appendChild(status);
  }

  // ── Card builder ─────────────────────────────────────────────────────────────

  function makeCard(titleHtml) {
    const card = document.createElement('div');
    card.className = 'stg-card';
    const header = document.createElement('div');
    header.className = 'stg-card-header';
    header.innerHTML = titleHtml;
    card.appendChild(header);
    return card;
  }

  // ── Habits Card ──────────────────────────────────────────────────────────────

  function buildHabitsCard() {
    const card = makeCard(`
      <span class="stg-card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true">
          <path d="M9 11l3 3L22 4"/>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
        Habits
      </span>
    `);

    const habits = Data.getSettings().habits ?? [];
    const list   = document.createElement('div');
    list.className = 'stg-list';

    if (habits.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'stg-empty';
      empty.textContent = 'No habits yet. Add one below.';
      list.appendChild(empty);
    }

    habits.forEach((name, i) => {
      const row = document.createElement('div');
      row.className = 'stg-item-row';
      row.innerHTML = `
        <span class="stg-item-name">${escHtml(name)}</span>
        <div class="stg-row-actions">
          <button class="stg-icon-btn" data-op="up" type="button"
                  ${i === 0 ? 'disabled' : ''} aria-label="Move up">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                 stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
          </button>
          <button class="stg-icon-btn" data-op="down" type="button"
                  ${i === habits.length - 1 ? 'disabled' : ''} aria-label="Move down">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                 stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <button class="stg-icon-btn stg-icon-btn--danger" data-op="del" type="button"
                  aria-label="Remove ${escHtml(name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                 stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
              <line x1="18" y1="6"  x2="6"  y2="18"/>
              <line x1="6"  y1="6"  x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      `;
      row.querySelector('[data-op="up"]').addEventListener('click',  () => moveHabit(i, -1));
      row.querySelector('[data-op="down"]').addEventListener('click', () => moveHabit(i, 1));
      row.querySelector('[data-op="del"]').addEventListener('click',  () => removeHabit(i));
      list.appendChild(row);
    });

    card.appendChild(list);

    const addRow = document.createElement('div');
    addRow.className = 'stg-add-row';
    addRow.innerHTML = `
      <input class="stg-text-input" type="text" placeholder="New habit name"
             maxlength="40" aria-label="New habit name">
      <button class="stg-add-btn" type="button">Add</button>
    `;
    const inp   = addRow.querySelector('input');
    const doAdd = () => { if (addHabit(inp.value.trim())) { inp.value = ''; } inp.focus(); };
    addRow.querySelector('.stg-add-btn').addEventListener('click', doAdd);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
    card.appendChild(addRow);

    return card;
  }

  function addHabit(name) {
    if (!name) return false;
    const h = Data.getSettings().habits;
    if (h.includes(name)) return false;
    h.push(name);
    render(); scheduleSave(); Habits.render();
    return true;
  }

  function removeHabit(i) {
    Data.getSettings().habits.splice(i, 1);
    render(); scheduleSave(); Habits.render();
  }

  function moveHabit(i, dir) {
    const h = Data.getSettings().habits;
    const j = i + dir;
    if (j < 0 || j >= h.length) return;
    [h[i], h[j]] = [h[j], h[i]];
    render(); scheduleSave(); Habits.render();
  }

  // ── Substances Card ──────────────────────────────────────────────────────────

  function buildSubstancesCard() {
    const card = makeCard(`
      <span class="stg-card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true">
          <line x1="4"  y1="21" x2="4"  y2="14"/>
          <line x1="4"  y1="10" x2="4"  y2="3"/>
          <line x1="12" y1="21" x2="12" y2="12"/>
          <line x1="12" y1="8"  x2="12" y2="3"/>
          <line x1="20" y1="21" x2="20" y2="16"/>
          <line x1="20" y1="12" x2="20" y2="3"/>
          <line x1="1"  y1="14" x2="7"  y2="14"/>
          <line x1="9"  y1="8"  x2="15" y2="8"/>
          <line x1="17" y1="16" x2="23" y2="16"/>
        </svg>
        Moderation Substances
      </span>
    `);

    const subs = Data.getSettings().moderation_substances ?? [];
    const list = document.createElement('div');
    list.className = 'stg-list';

    if (subs.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'stg-empty';
      empty.textContent = 'No substances configured.';
      list.appendChild(empty);
    }

    subs.forEach(sub => {
      const row = document.createElement('div');
      row.className = 'stg-item-row';
      row.innerHTML = `
        <div class="stg-item-info">
          <span class="stg-item-name">${escHtml(sub.name)}</span>
          <span class="stg-item-meta">${escHtml(sub.default_unit)}</span>
        </div>
        <button class="stg-icon-btn stg-icon-btn--danger" type="button"
                aria-label="Remove ${escHtml(sub.name)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
            <line x1="18" y1="6"  x2="6"  y2="18"/>
            <line x1="6"  y1="6"  x2="18" y2="18"/>
          </svg>
        </button>
      `;
      row.querySelector('.stg-icon-btn').addEventListener('click', () => removeSubstance(sub.id));
      list.appendChild(row);
    });

    card.appendChild(list);

    const addRow = document.createElement('div');
    addRow.className = 'stg-add-row stg-add-row--multi';
    addRow.innerHTML = `
      <input class="stg-text-input" type="text" placeholder="Name (e.g. Wine)"
             maxlength="30" aria-label="Substance name">
      <input class="stg-text-input stg-text-input--short" type="text"
             placeholder="Unit (e.g. glasses)" maxlength="20" aria-label="Default unit">
      <button class="stg-add-btn" type="button">Add</button>
    `;
    const [nameInp, unitInp] = addRow.querySelectorAll('input');
    const doAdd = () => {
      if (addSubstance(nameInp.value.trim(), unitInp.value.trim())) {
        nameInp.value = '';
        unitInp.value = '';
        nameInp.focus();
      }
    };
    addRow.querySelector('.stg-add-btn').addEventListener('click', doAdd);
    [nameInp, unitInp].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); }));
    card.appendChild(addRow);

    return card;
  }

  function addSubstance(name, unit) {
    if (!name) return false;
    const subs = Data.getSettings().moderation_substances;
    const id   = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!id || subs.find(s => s.id === id)) return false;
    subs.push({ id, name, default_unit: unit || name.toLowerCase() });
    render(); scheduleSave(); Moderation.render();
    return true;
  }

  function removeSubstance(id) {
    const subs = Data.getSettings().moderation_substances;
    const idx  = subs.findIndex(s => s.id === id);
    if (idx === -1) return;
    subs.splice(idx, 1);
    render(); scheduleSave(); Moderation.render();
  }

  // ── Categories Card ──────────────────────────────────────────────────────────

  function buildCategoriesCard() {
    const card = makeCard(`
      <span class="stg-card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8"    x2="12"   y2="12"/>
          <line x1="12" y1="16"   x2="12.01" y2="16"/>
        </svg>
        Health Categories
      </span>
    `);

    const cats     = Data.getSettings().symptom_categories ?? [];
    const tagsWrap = document.createElement('div');
    tagsWrap.className = 'stg-tags';

    if (cats.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'stg-empty';
      empty.textContent = 'No categories. Add one below.';
      tagsWrap.appendChild(empty);
    } else {
      cats.forEach(cat => {
        const tag = document.createElement('span');
        tag.className = 'stg-tag';
        tag.innerHTML = `${escHtml(cat)}<button class="stg-tag-remove" type="button" aria-label="Remove ${escHtml(cat)}">×</button>`;
        tag.querySelector('.stg-tag-remove').addEventListener('click', () => removeCategory(cat));
        tagsWrap.appendChild(tag);
      });
    }

    card.appendChild(tagsWrap);

    const addRow = document.createElement('div');
    addRow.className = 'stg-add-row';
    addRow.innerHTML = `
      <input class="stg-text-input" type="text" placeholder="New category"
             maxlength="30" aria-label="New health category">
      <button class="stg-add-btn" type="button">Add</button>
    `;
    const inp   = addRow.querySelector('input');
    const doAdd = () => { if (addCategory(inp.value.trim())) { inp.value = ''; } inp.focus(); };
    addRow.querySelector('.stg-add-btn').addEventListener('click', doAdd);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
    card.appendChild(addRow);

    return card;
  }

  function addCategory(name) {
    if (!name) return false;
    const cats = Data.getSettings().symptom_categories;
    if (cats.includes(name)) return false;
    cats.push(name);
    render(); scheduleSave();
    if (typeof Symptoms !== 'undefined') Symptoms.render();
    return true;
  }

  function removeCategory(name) {
    const cats = Data.getSettings().symptom_categories;
    const idx  = cats.indexOf(name);
    if (idx === -1) return;
    cats.splice(idx, 1);
    render(); scheduleSave();
    if (typeof Symptoms !== 'undefined') Symptoms.render();
  }

  // ── Display Card ─────────────────────────────────────────────────────────────

  function buildDisplayCard() {
    const s     = Data.getSettings();
    const theme = s.theme        ?? 'system';
    const unit  = s.weather_unit ?? 'auto';

    const card = makeCard(`
      <span class="stg-card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12"   y1="1"     x2="12"   y2="3"/>
          <line x1="12"   y1="21"    x2="12"   y2="23"/>
          <line x1="4.22" y1="4.22"  x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1"    y1="12"    x2="3"    y2="12"/>
          <line x1="21"   y1="12"    x2="23"   y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
        Display
      </span>
    `);

    // Theme row
    const themeRow = document.createElement('div');
    themeRow.className = 'stg-pref-row';
    themeRow.innerHTML = `
      <span class="stg-pref-label">Theme</span>
      <div class="stg-toggle-group" role="group" aria-label="Theme preference">
        ${[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([v, lbl]) =>
          `<button class="stg-toggle-btn${theme === v ? ' stg-toggle-btn--active' : ''}"
                   data-value="${v}" type="button">${escHtml(lbl)}</button>`
        ).join('')}
      </div>
    `;
    themeRow.querySelectorAll('.stg-toggle-btn').forEach(btn =>
      btn.addEventListener('click', () => setTheme(btn.dataset.value))
    );
    card.appendChild(themeRow);

    // Temperature unit row
    const unitRow = document.createElement('div');
    unitRow.className = 'stg-pref-row';
    unitRow.innerHTML = `
      <span class="stg-pref-label">Temperature</span>
      <div class="stg-toggle-group" role="group" aria-label="Temperature unit">
        ${[['auto', 'Auto'], ['c', '°C'], ['f', '°F']].map(([v, lbl]) =>
          `<button class="stg-toggle-btn${unit === v ? ' stg-toggle-btn--active' : ''}"
                   data-value="${v}" type="button">${escHtml(lbl)}</button>`
        ).join('')}
      </div>
    `;
    unitRow.querySelectorAll('.stg-toggle-btn').forEach(btn =>
      btn.addEventListener('click', () => setWeatherUnit(btn.dataset.value))
    );
    card.appendChild(unitRow);

    return card;
  }

  function setTheme(theme) {
    Data.getSettings().theme = theme;
    applyTheme(theme);
    render();
    scheduleSave();
  }

  function applyTheme(theme) {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }

  function setWeatherUnit(unit) {
    Data.getSettings().weather_unit = unit;
    render();
    scheduleSave();
    // Refresh weather chip to pick up new unit
    if (typeof DateNav !== 'undefined') Weather.setDate(DateNav.getDate());
  }

  // ── Account Card ─────────────────────────────────────────────────────────────

  function buildAccountCard() {
    const card = makeCard(`
      <span class="stg-card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        Account
      </span>
    `);

    // Change PIN row
    const pinRow = document.createElement('div');
    pinRow.className = 'stg-action-row';
    pinRow.innerHTML = `
      <div class="stg-action-info">
        <div class="stg-action-title">PIN Lock</div>
        <div class="stg-action-desc">Change your 4-digit unlock PIN</div>
      </div>
      <button class="stg-action-btn" type="button">Change</button>
    `;
    pinRow.querySelector('.stg-action-btn').addEventListener('click', () => PIN.showSetup());
    card.appendChild(pinRow);

    // Sign out row
    const signOutRow = document.createElement('div');
    signOutRow.className = 'stg-action-row';
    signOutRow.innerHTML = `
      <div class="stg-action-info">
        <div class="stg-action-title">Google Account</div>
        <div class="stg-action-desc">Sign out and return to sign-in</div>
      </div>
      <button class="stg-action-btn stg-action-btn--danger" type="button">Sign Out</button>
    `;
    signOutRow.querySelector('.stg-action-btn').addEventListener('click', () => {
      Auth.signOut();
      App.showScreen('screen-auth');
    });
    card.appendChild(signOutRow);

    return card;
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  function scheduleSave() {
    clearTimeout(saveTimer);
    const getEl = () => document.getElementById('stg-save-status');
    const el = getEl();
    if (el) { el.dataset.status = 'pending'; el.textContent = 'Unsaved'; }
    saveTimer = setTimeout(async () => {
      const e = getEl();
      if (e) { e.dataset.status = 'saving'; e.textContent = 'Saving…'; }
      try {
        await Data.save();
        const e2 = getEl();
        if (e2) { e2.dataset.status = 'saved'; e2.textContent = 'Saved'; }
        setTimeout(() => {
          const e3 = getEl();
          if (e3) { e3.dataset.status = ''; e3.textContent = ''; }
        }, 2200);
      } catch (err) {
        console.error('Settings save failed:', err);
        const e4 = getEl();
        if (e4) { e4.dataset.status = 'error'; e4.textContent = 'Save failed'; }
      }
    }, 800);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  return { init, render };

})();
