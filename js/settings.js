/**
 * settings.js — In-app configuration
 *
 * Renders into #settings-content in the Settings tab.
 * Manages: habits, moderation substances, symptom categories,
 *          theme preference, temperature unit, PIN change, sign-out.
 */
const Settings = (() => {

  let saveTimer = null;

  // PRN med form state
  let prnForm        = null;   // null | 'add' | med-id (editing)
  let prnFName       = '';
  let prnFInterval   = '';
  let prnFMaxDoses   = '';
  let prnFDoses      = [];     // string[]
  let prnFDoseInput  = '';

  // Treatment medication form state
  let txMedForm         = null;   // null | 'add' | med-id (editing)
  let txMedFName        = '';
  let txMedFDoses       = [];     // string[]
  let txMedFDoseInput   = '';
  let txMedFDefaultDose = '';     // which dose is the default

  // ── Public entry points ───────────────────────────────────────────────────────

  function init() {
    // Apply stored theme preference immediately on startup
    applyTheme(Data.getSettings().theme ?? 'system');
    // Populate version badge
    const badge = document.getElementById('stg-version-badge');
    if (badge) badge.textContent = `v${APP_VERSION}`;
  }

  function render() {
    const wrap = document.getElementById('settings-content');
    if (!wrap) return;

    wrap.innerHTML = '';
    wrap.appendChild(buildHabitsCard());
    wrap.appendChild(buildSubstancesCard());
    wrap.appendChild(buildPrnMedsCard());
    wrap.appendChild(buildTreatmentMedsCard());
    wrap.appendChild(buildCategoriesCard());
    wrap.appendChild(buildDisplayCard());
    wrap.appendChild(buildAccountCard());
    wrap.appendChild(buildFitbitCard());

    const status = document.createElement('div');
    status.id = 'stg-save-status';
    status.className = 'save-status';
    status.setAttribute('aria-live', 'polite');
    wrap.appendChild(status);
  }

  function focusPrnMeds() {
    const el = document.getElementById('stg-prn-meds-card');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function focusTxMeds() {
    const el = document.getElementById('stg-tx-meds-card');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

    // ── Connected: header buttons ──
    const syncBtn = document.createElement('button');
    syncBtn.className = 'stg-action-btn';
    syncBtn.type = 'button';
    syncBtn.textContent = 'Sync now';
    syncBtn.addEventListener('click', async () => {
      syncBtn.textContent = 'Syncing\u2026';
      syncBtn.disabled = true;
      await Fitbit.sync();
    });
    card.querySelector('.stg-card-header').appendChild(syncBtn);

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
      const syncedEl = document.createElement('span');
      syncedEl.className = 'stg-fitbit-synced';
      syncedEl.textContent = `Last synced: ${lastSync}`;
      statusRow.appendChild(syncedEl);

      if (fitbit?.last_sync) {
        const day = (Data.getData().days ?? {})[fitbit.last_sync];
        const items = [];
        const sl = day?.sleep;
        if (sl?.hours > 0) items.push(`${sl.hours}\u202fh sleep`);
        const stepsN = Number(day?.steps);
        if (day?.steps != null && !isNaN(stepsN)) items.push(`${stepsN.toLocaleString()} steps`);
        if (day?.resting_hr     != null) items.push(`${day.resting_hr} bpm`);
        if (day?.hrv            != null) items.push(`${day.hrv} ms HRV`);
        if (day?.spo2           != null) items.push(`${day.spo2}% SpO\u2082`);
        if (day?.breathing_rate != null) items.push(`${day.breathing_rate} br/min`);
        if (items.length) {
          const dataEl = document.createElement('span');
          dataEl.className = 'stg-fitbit-fields';
          dataEl.textContent = items.join(' · ');
          statusRow.appendChild(dataEl);
        }
      }

      card.appendChild(statusRow);
    }

    return card;
  }

  // ── PRN Medications Card ──────────────────────────────────────────────────

  function buildPrnMedsCard() {
    const card = makeCard(`
      <span class="stg-card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true">
          <path d="M10.5 20H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2v3"/>
          <circle cx="18" cy="18" r="4"/>
          <path d="M15.27 20.73 20.73 15.27"/>
        </svg>
        As-Needed Medications
      </span>
    `);
    card.id = 'stg-prn-meds-card';

    const meds = Object.values(Data.getData().medications ?? {}).filter(m => m.as_needed);
    const list = document.createElement('div');
    list.className = 'stg-list';

    if (meds.length === 0 && prnForm !== 'add') {
      const empty = document.createElement('p');
      empty.className   = 'stg-empty';
      empty.textContent = 'No as-needed medications configured.';
      list.appendChild(empty);
    }

    meds.forEach(med => {
      const isEditing = prnForm === med.id;

      const row = document.createElement('div');
      row.className = 'stg-item-row';

      const metaTags = [
        med.min_interval_hours ? `Every ${med.min_interval_hours}h` : null,
        med.max_daily_doses    ? `Max ${med.max_daily_doses}/day` : null,
        ...(med.doses ?? []),
      ].filter(Boolean);

      row.innerHTML = `
        <div class="stg-item-info">
          <span class="stg-item-name">${escHtml(med.name)}</span>
          <div class="prn-stg-meta">
            ${metaTags.map(t => `<span class="prn-stg-tag">${escHtml(t)}</span>`).join('')}
          </div>
        </div>
        <div style="display:flex;gap:4px">
          <button class="stg-icon-btn prn-edit-btn" type="button" data-id="${escHtml(med.id)}"
                  aria-label="Edit ${escHtml(med.name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="stg-icon-btn stg-icon-btn--danger prn-archive-btn" type="button"
                  data-id="${escHtml(med.id)}" aria-label="Archive ${escHtml(med.name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
            </svg>
          </button>
        </div>
      `;

      row.querySelector('.prn-edit-btn').addEventListener('click', () => startPrnEdit(med));
      row.querySelector('.prn-archive-btn').addEventListener('click', () => archivePrnMed(med.id));
      list.appendChild(row);

      // Inline edit form
      if (isEditing) list.appendChild(buildPrnForm('edit', med));
    });

    // Add form
    if (prnForm === 'add') list.appendChild(buildPrnForm('add'));

    card.appendChild(list);

    // Add button
    if (prnForm !== 'add') {
      const addRow = document.createElement('div');
      addRow.className = 'stg-add-row';
      const addBtn = document.createElement('button');
      addBtn.className   = 'stg-add-btn';
      addBtn.type        = 'button';
      addBtn.textContent = '+ Add medication';
      addBtn.addEventListener('click', () => {
        prnForm       = 'add';
        prnFName      = '';
        prnFInterval  = '';
        prnFMaxDoses  = '';
        prnFDoses     = [];
        prnFDoseInput = '';
        render();
      });
      addRow.appendChild(addBtn);
      card.appendChild(addRow);
    }

    return card;
  }

  function buildPrnForm(mode, med = null) {
    const wrap = document.createElement('div');
    wrap.className = 'prn-stg-form';

    const tagsHtml = prnFDoses.map(d =>
      `<span class="prn-dose-tag">${escHtml(d)}<button class="prn-dose-tag__del" type="button" data-dose="${escHtml(d)}" aria-label="Remove ${escHtml(d)}">×</button></span>`
    ).join('');

    wrap.innerHTML = `
      <div class="prn-stg-form__field">
        <label class="prn-stg-form__label" for="prn-f-name">Name</label>
        <input id="prn-f-name" class="prn-stg-form__input" type="text"
               value="${escHtml(prnFName)}" maxlength="80" placeholder="e.g. Ibuprofen">
      </div>
      <div class="prn-stg-form__field">
        <label class="prn-stg-form__label">Min interval</label>
        <div class="prn-stg-form__row">
          <input id="prn-f-interval" class="prn-stg-form__input prn-stg-form__input--short"
                 type="number" min="0.5" max="72" step="0.5"
                 value="${escHtml(prnFInterval)}" placeholder="8">
          <span class="prn-stg-form__unit">hours</span>
        </div>
      </div>
      <div class="prn-stg-form__field">
        <label class="prn-stg-form__label">Max in 24 hours</label>
        <div class="prn-stg-form__row">
          <input id="prn-f-max" class="prn-stg-form__input prn-stg-form__input--short"
                 type="number" min="1" max="20" step="1"
                 value="${escHtml(prnFMaxDoses)}" placeholder="3">
          <span class="prn-stg-form__unit">doses</span>
        </div>
      </div>
      <div class="prn-stg-form__field">
        <label class="prn-stg-form__label">Available doses <span style="font-size:0.72rem">(type + Enter)</span></label>
        <div class="prn-dose-tags" id="prn-dose-tags">
          ${tagsHtml}
          <input class="prn-dose-tag-input" id="prn-dose-tag-input" type="text"
                 value="${escHtml(prnFDoseInput)}" placeholder="e.g. 400mg" maxlength="20">
        </div>
      </div>
      <div class="prn-stg-form__actions">
        <button class="stg-add-btn" style="background:transparent;border:1px solid var(--clr-border);color:var(--clr-text-2)" type="button" id="prn-f-cancel">Cancel</button>
        <button class="stg-add-btn" type="button" id="prn-f-save">${mode === 'add' ? 'Add' : 'Save'}</button>
      </div>
    `;

    wrap.querySelector('#prn-f-name').addEventListener('input', e => { prnFName = e.target.value; });
    wrap.querySelector('#prn-f-interval').addEventListener('input', e => { prnFInterval = e.target.value; });
    wrap.querySelector('#prn-f-max').addEventListener('input', e => { prnFMaxDoses = e.target.value; });

    const tagInput = wrap.querySelector('#prn-dose-tag-input');
    const addPrnDose = () => {
      const val = tagInput.value.trim();
      if (val && !prnFDoses.includes(val)) {
        prnFDoses = [...prnFDoses, val];
        prnFDoseInput = '';
        render();
      }
    };
    tagInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.keyCode === 13 || e.key === ',') {
        e.preventDefault();
        addPrnDose();
      } else if (e.key === 'Backspace' && tagInput.value === '' && prnFDoses.length > 0) {
        prnFDoses = prnFDoses.slice(0, -1);
        render();
      }
    });
    tagInput.addEventListener('input', e => {
      // Android virtual keyboards fire 'insertLineBreak' instead of keydown Enter
      if (e.inputType === 'insertLineBreak') { addPrnDose(); return; }
      prnFDoseInput = e.target.value;
    });

    wrap.querySelectorAll('.prn-dose-tag__del').forEach(btn => {
      btn.addEventListener('click', () => {
        prnFDoses = prnFDoses.filter(d => d !== btn.dataset.dose);
        render();
      });
    });

    wrap.querySelector('#prn-f-cancel').addEventListener('click', () => {
      prnForm = null;
      render();
    });

    wrap.querySelector('#prn-f-save').addEventListener('click', () => {
      savePrnForm(mode, med?.id);
    });

    return wrap;
  }

  function startPrnEdit(med) {
    prnForm      = med.id;
    prnFName     = med.name ?? '';
    prnFInterval = med.min_interval_hours != null ? String(med.min_interval_hours) : '';
    prnFMaxDoses = med.max_daily_doses    != null ? String(med.max_daily_doses)    : '';
    prnFDoses    = [...(med.doses ?? [])];
    prnFDoseInput = '';
    render();
  }

  function savePrnForm(mode, editId) {
    const name = prnFName.trim();
    if (!name) {
      const el = document.getElementById('prn-f-name');
      if (el) el.classList.add('prn-stg-form__input--error');
      return;
    }
    const interval = parseFloat(prnFInterval) || null;
    const maxDoses = parseInt(prnFMaxDoses, 10) || null;

    if (mode === 'add') {
      const id = crypto.randomUUID();
      Data.getData().medications[id] = {
        id,
        name,
        doses:               [...prnFDoses],
        min_interval_hours:  interval,
        max_daily_doses:     maxDoses,
        as_needed:           true,
        active:              true,
        notes:               '',
      };
    } else {
      const med = Data.getData().medications[editId];
      if (med) {
        med.name               = name;
        med.doses              = [...prnFDoses];
        med.min_interval_hours = interval;
        med.max_daily_doses    = maxDoses;
      }
    }
    prnForm = null;
    render();
    scheduleSave();
    if (typeof Medications !== 'undefined') Medications.render();
  }

  function archivePrnMed(id) {
    const med = Data.getData().medications[id];
    if (med) { med.active = false; }
    prnForm = null;
    render();
    scheduleSave();
    if (typeof Medications !== 'undefined') Medications.render();
  }

  // ── Treatment Medications Card ──────────────────────────────────────────────

  function buildTreatmentMedsCard() {
    const card = makeCard(`
      <span class="stg-card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true">
          <path d="M9 3h6v8l4 8H5l4-8V3z"/>
          <line x1="6" y1="3" x2="18" y2="3"/>
          <line x1="9" y1="12" x2="15" y2="12"/>
        </svg>
        Treatment Medications
      </span>
    `);
    card.id = 'stg-tx-meds-card';

    const meds = Object.values(Data.getData().treatment_medications ?? {}).filter(m => m.active);
    const list = document.createElement('div');
    list.className = 'stg-list';

    if (meds.length === 0 && txMedForm !== 'add') {
      const empty = document.createElement('p');
      empty.className   = 'stg-empty';
      empty.textContent = 'No treatment medications configured.';
      list.appendChild(empty);
    }

    meds.forEach(med => {
      const row = document.createElement('div');
      row.className = 'stg-item-row';

      const doseTags = (med.doses ?? [])
        .map(d => d === med.default_dose
          ? `<span class="prn-stg-tag prn-stg-tag--default">${escHtml(d)} ★</span>`
          : `<span class="prn-stg-tag">${escHtml(d)}</span>`
        )
        .join('');

      row.innerHTML = `
        <div class="stg-item-info">
          <span class="stg-item-name">${escHtml(med.name)}</span>
          <div class="prn-stg-meta">${doseTags}</div>
        </div>
        <div style="display:flex;gap:4px">
          <button class="stg-icon-btn tx-med-edit-btn" type="button" data-id="${escHtml(med.id)}"
                  aria-label="Edit ${escHtml(med.name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="stg-icon-btn stg-icon-btn--danger tx-med-archive-btn" type="button"
                  data-id="${escHtml(med.id)}" aria-label="Archive ${escHtml(med.name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
            </svg>
          </button>
        </div>
      `;

      row.querySelector('.tx-med-edit-btn').addEventListener('click', () => startTxMedEdit(med));
      row.querySelector('.tx-med-archive-btn').addEventListener('click', () => archiveTxMed(med.id));
      list.appendChild(row);

      if (txMedForm === med.id) list.appendChild(buildTxMedForm('edit', med));
    });

    if (txMedForm === 'add') list.appendChild(buildTxMedForm('add'));

    card.appendChild(list);

    if (txMedForm !== 'add') {
      const addRow = document.createElement('div');
      addRow.className = 'stg-add-row';
      const addBtn = document.createElement('button');
      addBtn.className   = 'stg-add-btn';
      addBtn.type        = 'button';
      addBtn.textContent = '+ Add medication';
      addBtn.addEventListener('click', () => {
        txMedForm         = 'add';
        txMedFName        = '';
        txMedFDoses       = [];
        txMedFDoseInput   = '';
        txMedFDefaultDose = '';
        render();
      });
      addRow.appendChild(addBtn);
      card.appendChild(addRow);
    }

    return card;
  }

  function buildTxMedForm(mode, med = null) {
    const wrap = document.createElement('div');
    wrap.className = 'prn-stg-form';

    const tagsHtml = txMedFDoses.map(d =>
      `<span class="prn-dose-tag">${escHtml(d)}<button class="prn-dose-tag__del" type="button" data-dose="${escHtml(d)}" aria-label="Remove ${escHtml(d)}">×</button></span>`
    ).join('');

    const defaultDoseOptions = [
      `<option value="">— None —</option>`,
      ...txMedFDoses.map(d =>
        `<option value="${escHtml(d)}"${d === txMedFDefaultDose ? ' selected' : ''}>${escHtml(d)}</option>`
      ),
    ].join('');

    wrap.innerHTML = `
      <div class="prn-stg-form__field">
        <label class="prn-stg-form__label" for="tx-f-name">Name</label>
        <input id="tx-f-name" class="prn-stg-form__input" type="text"
               value="${escHtml(txMedFName)}" maxlength="80" placeholder="e.g. Ketamine">
      </div>
      <div class="prn-stg-form__field">
        <label class="prn-stg-form__label">Available doses <span style="font-size:0.72rem">(type + Enter)</span></label>
        <div class="prn-dose-tags" id="tx-dose-tags">
          ${tagsHtml}
          <input class="prn-dose-tag-input" id="tx-dose-tag-input" type="text"
                 value="${escHtml(txMedFDoseInput)}" placeholder="e.g. 200mg" maxlength="20">
        </div>
      </div>
      <div class="prn-stg-form__field">
        <label class="prn-stg-form__label">Default dose</label>
        <select class="prn-stg-form__input" id="tx-f-default-dose">${defaultDoseOptions}</select>
      </div>
      <div class="prn-stg-form__actions">
        <button class="stg-add-btn" style="background:transparent;border:1px solid var(--clr-border);color:var(--clr-text-2)" type="button" id="tx-f-cancel">Cancel</button>
        <button class="stg-add-btn" type="button" id="tx-f-save">${mode === 'add' ? 'Add' : 'Save'}</button>
      </div>
    `;

    wrap.querySelector('#tx-f-name').addEventListener('input', e => { txMedFName = e.target.value; });

    const tagInput = wrap.querySelector('#tx-dose-tag-input');
    const addTxDose = () => {
      const val = tagInput.value.trim();
      if (val && !txMedFDoses.includes(val)) {
        txMedFDoses = [...txMedFDoses, val];
        txMedFDoseInput = '';
        render();
      }
    };
    tagInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.keyCode === 13 || e.key === ',') {
        e.preventDefault();
        addTxDose();
      } else if (e.key === 'Backspace' && tagInput.value === '' && txMedFDoses.length > 0) {
        txMedFDoses = txMedFDoses.slice(0, -1);
        render();
      }
    });
    tagInput.addEventListener('input', e => {
      // Android virtual keyboards fire 'insertLineBreak' instead of keydown Enter
      if (e.inputType === 'insertLineBreak') { addTxDose(); return; }
      txMedFDoseInput = e.target.value;
    });

    wrap.querySelector('#tx-f-default-dose')
      ?.addEventListener('change', e => { txMedFDefaultDose = e.target.value; });

    wrap.querySelectorAll('.prn-dose-tag__del').forEach(btn => {
      btn.addEventListener('click', () => {
        txMedFDoses = txMedFDoses.filter(d => d !== btn.dataset.dose);
        render();
      });
    });

    wrap.querySelector('#tx-f-cancel').addEventListener('click', () => {
      txMedForm = null;
      render();
    });

    wrap.querySelector('#tx-f-save').addEventListener('click', () => saveTxMedForm(mode, med?.id));
    return wrap;
  }

  function startTxMedEdit(med) {
    txMedForm         = med.id;
    txMedFName        = med.name          ?? '';
    txMedFDoses       = [...(med.doses    ?? [])];
    txMedFDoseInput   = '';
    txMedFDefaultDose = med.default_dose  ?? '';
    render();
  }

  function saveTxMedForm(mode, editId) {
    const name = txMedFName.trim();
    if (!name) {
      const el = document.getElementById('tx-f-name');
      if (el) el.classList.add('prn-stg-form__input--error');
      return;
    }

    // Auto-include any dose typed in the input but not yet confirmed with Enter
    const pendingDose = txMedFDoseInput.trim();
    if (pendingDose && !txMedFDoses.includes(pendingDose)) {
      txMedFDoses = [...txMedFDoses, pendingDose];
    }
    txMedFDoseInput = '';

    const d = Data.getData();
    if (!d.treatment_medications) d.treatment_medications = {};

    // Only persist a default_dose if it's still in the doses list
    const defaultDose = txMedFDoses.includes(txMedFDefaultDose) ? txMedFDefaultDose : '';

    if (mode === 'add') {
      const id = crypto.randomUUID();
      d.treatment_medications[id] = {
        id,
        name,
        doses:        [...txMedFDoses],
        default_dose: defaultDose,
        active:       true,
        notes:        '',
      };
    } else {
      const med = d.treatment_medications[editId];
      if (med) {
        med.name         = name;
        med.doses        = [...txMedFDoses];
        med.default_dose = defaultDose;
      }
    }

    txMedForm = null;
    render();
    scheduleSave();
  }

  function archiveTxMed(id) {
    const med = (Data.getData().treatment_medications ?? {})[id];
    if (med) med.active = false;
    txMedForm = null;
    render();
    scheduleSave();
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

  return { init, render, focusPrnMeds, focusTxMeds };

})();
