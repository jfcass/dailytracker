/**
 * settings.js — In-app configuration
 *
 * Renders into #settings-content in the Settings tab.
 * Manages: habits, moderation substances, symptom categories,
 *          theme preference, temperature unit, PIN change, sign-out.
 */
const Settings = (() => {

  let saveTimer = null;

  // Which settings cards are expanded? (all collapsed by default)
  let expandedCards = new Set();

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
    wrap.appendChild(buildMedicationsLinkCard());
    wrap.appendChild(buildTreatmentMedsCard());
    wrap.appendChild(buildCategoriesCard());
    wrap.appendChild(buildNoteTagsCard());
    wrap.appendChild(buildVisibilityCard());
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
    expandedCards.add('prn');
    render();
    requestAnimationFrame(() => {
      const el = document.getElementById('stg-prn-meds-card');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function focusTxMeds() {
    expandedCards.add('tx');
    render();
    requestAnimationFrame(() => {
      const el = document.getElementById('stg-tx-meds-card');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ── Card builder ─────────────────────────────────────────────────────────────

  function makeCard(titleHtml, key) {
    const card = document.createElement('div');
    card.className = 'stg-card';

    const header = document.createElement('div');
    header.className = 'stg-card-header';
    header.innerHTML = titleHtml;

    const body = document.createElement('div');
    body.className = 'stg-card-body';

    if (key) {
      const isExpanded = expandedCards.has(key);
      body.hidden = !isExpanded;
      card.classList.toggle('stg-card--collapsed', !isExpanded);

      const chevron = document.createElement('span');
      chevron.className = 'stg-card-chevron' + (isExpanded ? ' stg-card-chevron--open' : '');
      chevron.setAttribute('aria-hidden', 'true');
      chevron.textContent = '▾';
      header.classList.add('stg-card-header--toggle');
      header.setAttribute('role', 'button');
      header.setAttribute('tabindex', '0');
      header.appendChild(chevron);
      header.addEventListener('click', () => {
        if (expandedCards.has(key)) expandedCards.delete(key);
        else expandedCards.add(key);
        render();
      });
      header.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); header.click(); }
      });
    }

    card.appendChild(header);
    card.appendChild(body);
    return { card, body };
  }

  // ── Habit config helpers ──────────────────────────────────────────────────────

  function freqMax(frequency) {
    return { weekly: 7, monthly: 28, quarterly: 90, custom: 999 }[frequency] ?? 1;
  }

  function freqLabel(frequency) {
    return { weekly: 'times/wk', monthly: 'times/mo', quarterly: 'times/qtr', custom: 'times' }[frequency] ?? '';
  }

  function getHabitCfg(name) {
    const s = Data.getSettings();
    return {
      frequency: 'daily', freq_count: 1, freq_period_days: 7, reminder: false,
      ...(s.habit_configs?.[name] ?? {}),
    };
  }

  function saveHabitCfg(name, cfg) {
    const s = Data.getSettings();
    if (!s.habit_configs) s.habit_configs = {};
    s.habit_configs[name] = cfg;
    scheduleSave();
  }

  // ── Habits Card ──────────────────────────────────────────────────────────────

  function buildHabitsCard() {
    const { card, body } = makeCard(`
      <span class="stg-card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true">
          <path d="M9 11l3 3L22 4"/>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
        Habits
      </span>
    `, 'habits');

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
      const cfg = getHabitCfg(name);
      const wrap = document.createElement('div');
      wrap.className = 'stg-habit-wrap';

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

      const freqRow = document.createElement('div');
      freqRow.className = 'habit-freq-row';
      freqRow.innerHTML = `
        <select class="habit-freq-select" data-habit="${escHtml(name)}">
          <option value="daily"     ${cfg.frequency === 'daily'     ? 'selected' : ''}>Daily</option>
          <option value="weekly"    ${cfg.frequency === 'weekly'    ? 'selected' : ''}>Weekly</option>
          <option value="monthly"   ${cfg.frequency === 'monthly'   ? 'selected' : ''}>Monthly</option>
          <option value="quarterly" ${cfg.frequency === 'quarterly' ? 'selected' : ''}>Quarterly</option>
          <option value="custom"    ${cfg.frequency === 'custom'    ? 'selected' : ''}>Custom</option>
        </select>
        ${cfg.frequency !== 'daily' ? `
          <input class="habit-freq-count" type="number" min="1" max="${freqMax(cfg.frequency)}"
                 value="${cfg.freq_count}" data-habit="${escHtml(name)}">
          <span class="habit-freq-label">${freqLabel(cfg.frequency)}</span>
        ` : ''}
        ${cfg.frequency === 'custom' ? `
          <span class="habit-freq-sep">every</span>
          <input class="habit-freq-days" type="number" min="2" max="365"
                 value="${cfg.freq_period_days}" data-habit="${escHtml(name)}">
          <span class="habit-freq-label">days</span>
        ` : ''}
        <label class="habit-reminder-toggle">
          <input type="checkbox" class="habit-reminder-cb" data-habit="${escHtml(name)}"
                 ${cfg.reminder ? 'checked' : ''}>
          <span>Remind me</span>
        </label>
      `;

      wrap.appendChild(row);
      wrap.appendChild(freqRow);
      list.appendChild(wrap);
    });

    // Event delegation for freq/reminder controls (one change + one input handler)
    list.addEventListener('change', e => {
      const sel = e.target.closest('.habit-freq-select');
      if (sel) {
        const name = sel.dataset.habit;
        const cfg  = getHabitCfg(name);
        cfg.frequency = sel.value;
        if (sel.value === 'daily') cfg.freq_count = 1;
        saveHabitCfg(name, cfg);
        render();
        return;
      }
      const cb = e.target.closest('.habit-reminder-cb');
      if (cb) {
        const name = cb.dataset.habit;
        const cfg  = getHabitCfg(name);
        cfg.reminder = cb.checked;
        saveHabitCfg(name, cfg);
      }
    });

    list.addEventListener('input', e => {
      const countInp = e.target.closest('.habit-freq-count');
      if (countInp) {
        const name = countInp.dataset.habit;
        const cfg  = getHabitCfg(name);
        cfg.freq_count = Math.max(1, parseInt(countInp.value) || 1);
        saveHabitCfg(name, cfg);
        return;
      }
      const daysInp = e.target.closest('.habit-freq-days');
      if (daysInp) {
        const name = daysInp.dataset.habit;
        const cfg  = getHabitCfg(name);
        cfg.freq_period_days = Math.max(2, parseInt(daysInp.value) || 7);
        saveHabitCfg(name, cfg);
      }
    });

    body.appendChild(list);

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
    body.appendChild(addRow);

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
    const { card, body } = makeCard(`
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
    `, 'substances');

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

    body.appendChild(list);

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
    body.appendChild(addRow);

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
    const { card, body } = makeCard(`
      <span class="stg-card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8"    x2="12"   y2="12"/>
          <line x1="12" y1="16"   x2="12.01" y2="16"/>
        </svg>
        Health Categories
      </span>
    `, 'categories');

    body.appendChild(buildCategorySection('Symptom Categories', 'symptom'));
    body.appendChild(buildCategorySection('Issue Categories', 'issue'));

    return card;
  }

  function buildCategorySection(title, type) {
    const settings = Data.getSettings();
    const cats = (type === 'issue' ? settings.issue_categories : settings.symptom_categories) ?? [];

    const section = document.createElement('div');
    section.className = 'stg-cat-section';

    const heading = document.createElement('p');
    heading.className = 'stg-cat-section-title';
    heading.textContent = title;
    section.appendChild(heading);

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
        tag.querySelector('.stg-tag-remove').addEventListener('click', () => removeCategory(cat, type));
        tagsWrap.appendChild(tag);
      });
    }
    section.appendChild(tagsWrap);

    const addRow = document.createElement('div');
    addRow.className = 'stg-add-row';
    addRow.innerHTML = `
      <input class="stg-text-input" type="text" placeholder="New category"
             maxlength="30" aria-label="New ${escHtml(title.toLowerCase())}">
      <button class="stg-add-btn" type="button">Add</button>
    `;
    const inp   = addRow.querySelector('input');
    const doAdd = () => { if (addCategory(inp.value.trim(), type)) { inp.value = ''; } inp.focus(); };
    addRow.querySelector('.stg-add-btn').addEventListener('click', doAdd);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
    section.appendChild(addRow);

    return section;
  }

  function addCategory(name, type = 'symptom') {
    if (!name) return false;
    const settings = Data.getSettings();
    const cats = type === 'issue' ? settings.issue_categories : settings.symptom_categories;
    if (cats.includes(name)) return false;
    cats.push(name);
    render(); scheduleSave();
    if (typeof Symptoms !== 'undefined') Symptoms.render();
    return true;
  }

  function removeCategory(name, type = 'symptom') {
    const settings = Data.getSettings();
    const cats = type === 'issue' ? settings.issue_categories : settings.symptom_categories;
    const idx  = cats.indexOf(name);
    if (idx === -1) return;
    cats.splice(idx, 1);
    render(); scheduleSave();
    if (typeof Symptoms !== 'undefined') Symptoms.render();
  }

  // ── Note Tags Card ───────────────────────────────────────────────────────────

  function buildNoteTagsCard() {
    const { card, body } = makeCard(`
      <span class="stg-card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
          <line x1="7" y1="7" x2="7.01" y2="7"/>
        </svg>
        Note Tags
      </span>
    `, 'note-tags');

    const tags = Data.getSettings().note_tags ?? [];
    const tagsWrap = document.createElement('div');
    tagsWrap.className = 'stg-tags';

    if (tags.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'stg-empty';
      empty.textContent = 'No tags yet. Add one below.';
      tagsWrap.appendChild(empty);
    } else {
      tags.forEach(tag => {
        const el = document.createElement('span');
        el.className = 'stg-tag';
        el.innerHTML = `${escHtml(tag)}<button class="stg-tag-remove" type="button" aria-label="Remove ${escHtml(tag)}">×</button>`;
        el.querySelector('.stg-tag-remove').addEventListener('click', () => removeNoteTag(tag));
        tagsWrap.appendChild(el);
      });
    }
    body.appendChild(tagsWrap);

    const addRow = document.createElement('div');
    addRow.className = 'stg-add-row';
    addRow.innerHTML = `
      <input class="stg-text-input" type="text" placeholder="New tag" maxlength="30" aria-label="New note tag">
      <button class="stg-add-btn" type="button">Add</button>
    `;
    const inp   = addRow.querySelector('input');
    const doAdd = () => { if (addNoteTag(inp.value.trim())) { inp.value = ''; } inp.focus(); };
    addRow.querySelector('.stg-add-btn').addEventListener('click', doAdd);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
    body.appendChild(addRow);

    return card;
  }

  function addNoteTag(name) {
    if (!name) return false;
    const settings = Data.getSettings();
    if (!settings.note_tags) settings.note_tags = [];
    if (settings.note_tags.includes(name)) return false;
    settings.note_tags.push(name);
    render(); scheduleSave();
    if (typeof Mood !== 'undefined') Mood.setDate && Mood._renderTags && Mood._renderTags();
    return true;
  }

  function removeNoteTag(name) {
    const settings = Data.getSettings();
    if (!settings.note_tags) return;
    const idx = settings.note_tags.indexOf(name);
    if (idx === -1) return;
    settings.note_tags.splice(idx, 1);
    // Remove this tag from all days that had it selected
    Object.values(Data.getData().days ?? {}).forEach(day => {
      if (!day.tags) return;
      const i = day.tags.indexOf(name);
      if (i !== -1) day.tags.splice(i, 1);
    });
    render(); scheduleSave();
  }

  // ── Visibility Card ───────────────────────────────────────────────────────────

  function buildVisibilityCard() {
    const s      = Data.getSettings();
    const hidden = new Set(s.hidden_sections ?? []);

    const { card, body } = makeCard(`
      <span class="stg-card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        Sections
      </span>
    `, 'visibility');

    function makeRow(key, label) {
      const isHidden = hidden.has(key);
      const row = document.createElement('div');
      row.className = 'stg-pref-row';
      row.innerHTML = `
        <span class="stg-pref-label">${escHtml(label)}</span>
        <div class="stg-toggle-group" role="group" aria-label="${escHtml(label)} visibility">
          <button class="stg-toggle-btn${!isHidden ? ' stg-toggle-btn--active' : ''}"
                  data-act="show" type="button">Show</button>
          <button class="stg-toggle-btn${isHidden  ? ' stg-toggle-btn--active' : ''}"
                  data-act="hide" type="button">Hide</button>
        </div>
      `;
      row.querySelectorAll('.stg-toggle-btn').forEach(btn =>
        btn.addEventListener('click', () => toggleSectionVis(key, btn.dataset.act === 'hide'))
      );
      return row;
    }

    function makeGroupLabel(text) {
      const el = document.createElement('p');
      el.className = 'stg-group-label';
      el.textContent = text;
      return el;
    }

    body.appendChild(makeGroupLabel('Today Tab'));
    [
      ['habits',     'Habits'],
      ['mood',       'Mood & Energy'],
      ['symptoms',   'Symptoms'],
      ['moderation', 'Moderation'],
      ['bowel',      'Bowel'],
      ['gratitudes', 'Gratitudes'],
      ['note',       'Daily Note'],
      ['vitals',     'Vitals'],
    ].forEach(([k, l]) => body.appendChild(makeRow(k, l)));

    body.appendChild(makeGroupLabel('Other Tabs'));
    [
      ['tab-health-log',  'Health Log'],
      ['tab-treatments',  'Treatments'],
      ['tab-library',     'Library'],
      ['tab-reports',     'Reports'],
    ].forEach(([k, l]) => body.appendChild(makeRow(k, l)));

    return card;
  }

  function toggleSectionVis(key, hide) {
    const s      = Data.getSettings();
    const hidden = new Set(s.hidden_sections ?? []);
    if (hide) hidden.add(key); else hidden.delete(key);
    s.hidden_sections = [...hidden];
    scheduleSave();
    App.applyVisibility();
    render();
  }

  // ── Display Card ─────────────────────────────────────────────────────────────

  function buildDisplayCard() {
    const s     = Data.getSettings();
    const theme = s.theme        ?? 'system';
    const unit  = s.weather_unit ?? 'auto';

    const { card, body } = makeCard(`
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
    `, 'display');

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
    body.appendChild(themeRow);

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
    body.appendChild(unitRow);

    // Default report period row
    const rptPeriod = Data.getSettings().default_report_period ?? '7d';
    const rptRow = document.createElement('div');
    rptRow.className = 'stg-pref-row';
    rptRow.innerHTML = `
      <span class="stg-pref-label">Default period</span>
      <div class="stg-toggle-group" role="group" aria-label="Default report period">
        ${[['7d', '7d'], ['30d', '30d'], ['90d', '90d'], ['all', 'All']].map(([v, lbl]) =>
          `<button class="stg-toggle-btn${rptPeriod === v ? ' stg-toggle-btn--active' : ''}"
                   data-value="${v}" type="button">${escHtml(lbl)}</button>`
        ).join('')}
      </div>
    `;
    rptRow.querySelectorAll('.stg-toggle-btn').forEach(btn =>
      btn.addEventListener('click', () => {
        Data.getSettings().default_report_period = btn.dataset.value;
        scheduleSave();
        render();
      })
    );
    body.appendChild(rptRow);

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
    const { card, body } = makeCard(`
      <span class="stg-card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        Account
      </span>
    `, 'account');

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
    body.appendChild(pinRow);

    // ── Layout row ──────────────────────────────────────────────
    const layoutRow = document.createElement('div');
    layoutRow.className = 'stg-action-row';
    const currentLayout = Data.getSettings().today_layout ?? 'accordion';
    layoutRow.innerHTML = `
      <div class="stg-action-info">
        <div class="stg-action-title">Today layout</div>
        <div class="stg-action-desc">How sections appear on the Today tab</div>
      </div>
      <div class="stg-toggle-group" role="group" aria-label="Today layout">
        <button class="stg-toggle-btn${currentLayout === 'accordion' ? ' stg-toggle-btn--active' : ''}"
                data-value="accordion" type="button">Stack</button>
        <button class="stg-toggle-btn${currentLayout === 'hub' ? ' stg-toggle-btn--active' : ''}"
                data-value="hub" type="button">Hub</button>
      </div>
    `;
    layoutRow.querySelectorAll('.stg-toggle-btn').forEach(btn =>
      btn.addEventListener('click', () => {
        Data.getSettings().today_layout = btn.dataset.value;
        render();
        scheduleSave();
        // Re-render the Today tab immediately if it's visible
        if (typeof Hub !== 'undefined') Hub.applyLayout();
      })
    );
    body.appendChild(layoutRow);
    // ── (existing accordion row follows) ──────────────────────

    // Accordion sections toggle
    const accordionRow = document.createElement('div');
    accordionRow.className = 'stg-action-row';
    const accordionOn = !!(Data.getSettings().today_accordion);
    accordionRow.innerHTML = `
      <div class="stg-action-info">
        <div class="stg-action-title">Accordion sections</div>
        <div class="stg-action-desc">One section open at a time</div>
      </div>
      <div class="stg-toggle-group" role="group" aria-label="Accordion mode">
        <button class="stg-toggle-btn${accordionOn ? ' stg-toggle-btn--active' : ''}"
                data-value="on" type="button">On</button>
        <button class="stg-toggle-btn${!accordionOn ? ' stg-toggle-btn--active' : ''}"
                data-value="off" type="button">Off</button>
      </div>
    `;
    accordionRow.querySelectorAll('.stg-toggle-btn').forEach(btn =>
      btn.addEventListener('click', () => {
        Data.getSettings().today_accordion = (btn.dataset.value === 'on');
        render();
        scheduleSave();
      })
    );
    body.appendChild(accordionRow);

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
    body.appendChild(signOutRow);

    return card;
  }

  // ── Fitbit Card ───────────────────────────────────────────────────────────────

  function buildFitbitCard() {
    const { card, body } = makeCard(`
      <span class="stg-card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        Fitbit
      </span>
    `, 'fitbit');

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
      body.appendChild(row);
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
      body.appendChild(errRow);
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

      body.appendChild(statusRow);
    }

    return card;
  }

  // ── PRN Medications Card ──────────────────────────────────────────────────

  function buildMedicationsLinkCard() {
    const count = Object.values(Data.getData().medications ?? {}).filter(m => m.active).length;
    const countLabel = count > 0 ? ` <span class="stg-card-count">${count} active</span>` : '';

    // Single-action card: clicking anywhere on the header opens MedsManage directly.
    // No expand/collapse — there's nothing to expand into.
    const { card } = makeCard(`
      <span class="stg-card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true">
          <path d="M12 22a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"/>
          <path d="M8 12h8M12 8v8"/>
        </svg>
        Medications${countLabel}
      </span>
    `);  // no key → no collapse behaviour

    // Grab the header element makeCard() created
    const header = card.querySelector('.stg-card-header');

    // Make the header itself the tap target
    header.classList.add('stg-card-header--toggle');
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');

    // Append a "→" chevron so it looks tappable
    const arrow = document.createElement('span');
    arrow.className = 'stg-card-chevron';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    header.appendChild(arrow);

    header.addEventListener('click', () => {
      if (typeof MedsManage !== 'undefined') MedsManage.open('settings');
    });
    header.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (typeof MedsManage !== 'undefined') MedsManage.open('settings');
      }
    });

    return card;
  }

  // ── Treatment Medications Card ──────────────────────────────────────────────

  function buildTreatmentMedsCard() {
    const { card, body } = makeCard(`
      <span class="stg-card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true">
          <path d="M9 3h6v8l4 8H5l4-8V3z"/>
          <line x1="6" y1="3" x2="18" y2="3"/>
          <line x1="9" y1="12" x2="15" y2="12"/>
        </svg>
        Treatment Medications
      </span>
    `, 'tx');
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

    body.appendChild(list);

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
      body.appendChild(addRow);
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
        <label class="prn-stg-form__label">Available doses</label>
        <div class="prn-dose-tags" id="tx-dose-tags">
          ${tagsHtml}
          <input class="prn-dose-tag-input" id="tx-dose-tag-input" type="text"
                 value="${escHtml(txMedFDoseInput)}" placeholder="e.g. 200mg" maxlength="20">
          <button class="prn-dose-add-btn" id="tx-dose-add-btn" type="button" aria-label="Add dose">+</button>
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
      if (!val || txMedFDoses.includes(val)) return;
      txMedFDoses = [...txMedFDoses, val];
      txMedFDoseInput = '';
      // Targeted DOM update — avoids full render() which dismisses the mobile keyboard
      const tagsContainer = wrap.querySelector('#tx-dose-tags');
      const tag = document.createElement('span');
      tag.className = 'prn-dose-tag';
      tag.innerHTML = `${escHtml(val)}<button class="prn-dose-tag__del" type="button" data-dose="${escHtml(val)}" aria-label="Remove ${escHtml(val)}">×</button>`;
      tag.querySelector('.prn-dose-tag__del').addEventListener('click', () => {
        txMedFDoses = txMedFDoses.filter(d => d !== val);
        render();
      });
      tagsContainer.insertBefore(tag, tagInput);
      tagInput.value = '';
      tagInput.focus();
      // Also update the default-dose <select> in-place so the new dose is immediately selectable
      const defaultSelect = wrap.querySelector('#tx-f-default-dose');
      if (defaultSelect) {
        const current = txMedFDefaultDose;
        defaultSelect.innerHTML = [
          `<option value="">— None —</option>`,
          ...txMedFDoses.map(d =>
            `<option value="${escHtml(d)}"${d === current ? ' selected' : ''}>${escHtml(d)}</option>`
          ),
        ].join('');
      }
    };
    wrap.querySelector('#tx-dose-add-btn').addEventListener('click', () => addTxDose());
    tagInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.keyCode === 13 || e.key === ',') {
        e.preventDefault();
        addTxDose();
      } else if (e.key === 'Backspace' && tagInput.value === '' && txMedFDoses.length > 0) {
        txMedFDoses = txMedFDoses.slice(0, -1);
        render();
      }
    });
    tagInput.addEventListener('keyup', e => {
      if (e.key === 'Enter' || e.keyCode === 13) addTxDose();
    });
    tagInput.addEventListener('input', e => {
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
