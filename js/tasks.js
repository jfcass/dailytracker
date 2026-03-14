/**
 * tasks.js — Task / To-Do management
 *
 * Data lives at Data.store.tasks (top-level array), NOT inside day objects.
 * Tasks with due_date <= today (and completed: false) surface in the daily
 * Reflections sub-section. All tasks appear on the dedicated Tasks tab.
 */
const Tasks = (() => {

  let currentDate = null;

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function today() { return Data.today(); }

  function getTasks() {
    const d = Data.getData();
    if (!Array.isArray(d.tasks)) d.tasks = [];
    return d.tasks;
  }

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatDueLabel(dueDate) {
    if (!dueDate) return '';
    const d = new Date(dueDate + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function isOverdue(dueDate) {
    if (!dueDate) return false;
    return dueDate < today();
  }

  function getDueTasks(date) {
    return getTasks().filter(t => !t.completed && t.due_date && t.due_date <= date);
  }

  let _saveTimer = null;
  function scheduleSave() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => Data.save(), 1200);
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  function addTask({ text, category = '', due_date = null, notes = '' }) {
    if (!text.trim()) return null;
    const task = {
      id:             crypto.randomUUID(),
      text:           text.trim(),
      category:       category.trim(),
      due_date:       due_date || null,
      completed:      false,
      completed_date: null,
      created_date:   today(),
      notes:          notes.trim(),
    };
    getTasks().push(task);
    scheduleSave();
    return task;
  }

  function toggleComplete(id) {
    const task = getTasks().find(t => t.id === id);
    if (!task) return;
    task.completed      = !task.completed;
    task.completed_date = task.completed ? today() : null;
    scheduleSave();
  }

  function editTask(id, updates) {
    const task = getTasks().find(t => t.id === id);
    if (!task) return;
    if ('text'     in updates) task.text     = updates.text.trim();
    if ('category' in updates) task.category = (updates.category ?? '').trim();
    if ('due_date' in updates) task.due_date = updates.due_date || null;
    if ('notes'    in updates) task.notes    = (updates.notes ?? '').trim();
    scheduleSave();
  }

  function deleteTask(id) {
    const arr = getTasks();
    const idx = arr.findIndex(t => t.id === id);
    if (idx === -1) return;
    arr.splice(idx, 1);
    scheduleSave();
  }

  // ── Render: Daily Reflections sub-section ───────────────────────────────────

  function render(date) {
    currentDate = date;
    const container = document.getElementById('tasks-daily-list');
    if (!container) return;

    const due = getDueTasks(date);
    container.innerHTML = '';

    if (due.length === 0) {
      container.innerHTML = `
        <div class="tasks-empty-row">
          <button class="tasks-add-link" type="button"
                  onclick="Tasks._openDailyForm()">+ Add task</button>
        </div>`;
    } else {
      due.forEach(task => container.appendChild(_buildDailyRow(task)));
      const addRow = document.createElement('div');
      addRow.className = 'tasks-add-row-below';
      addRow.innerHTML = `<button class="tasks-add-link" type="button"
                                  onclick="Tasks._openDailyForm()">+ Add task</button>`;
      container.appendChild(addRow);
    }

    // Update count badge
    const badge = document.getElementById('tasks-daily-count');
    if (badge) badge.textContent = due.length > 0 ? String(due.length) : '';

    // Notify hub to refresh its badge
    if (typeof Hub !== 'undefined' && Hub.refreshReflectionsBadge) {
      Hub.refreshReflectionsBadge();
    }

    // Collapse any open form if date changed
    document.getElementById('tasks-daily-form')?.remove();
  }

  function _buildDailyRow(task) {
    const overdue = isOverdue(task.due_date);
    const dueLbl  = formatDueLabel(task.due_date);
    const catHtml = task.category
      ? `<span class="tasks-cat-pill">${escHtml(task.category)}</span>` : '';
    const dueCls  = overdue ? 'tasks-due--overdue' : 'tasks-due';
    const dueHtml = dueLbl
      ? `<span class="${dueCls}">${escHtml(dueLbl)}${overdue ? ' (overdue)' : ''}</span>` : '';

    const row = document.createElement('div');
    row.className = 'tasks-row';
    row.dataset.id = task.id;
    row.innerHTML = `
      <input type="checkbox" class="tasks-check" aria-label="Complete task"
             ${task.completed ? 'checked' : ''}>
      <span class="tasks-text">${escHtml(task.text)}</span>
      ${catHtml}
      ${dueHtml}
      <button class="tasks-edit-btn" type="button" aria-label="Edit task">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
             width="14" height="14" aria-hidden="true">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>`;

    row.querySelector('.tasks-check').addEventListener('change', () => {
      toggleComplete(task.id);
      render(currentDate);
      _refreshTabIfOpen();
    });
    row.querySelector('.tasks-edit-btn').addEventListener('click', e => {
      e.stopPropagation();
      _openDailyEditForm(task.id);
    });
    return row;
  }

  // ── Due Date custom widget ───────────────────────────────────────────────────

  const _CAL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
    width="16" height="16" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>`;

  const _PENCIL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
    width="13" height="13" aria-hidden="true">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>`;

  function _buildDueDateHtml(inputId, value) {
    return `
      <div class="tasks-due-field">
        <span class="tasks-due-label">Due Date</span>
        <div class="tasks-due-picker-wrap">
          <input type="date" id="${inputId}" class="tasks-due-input-hidden"
                 value="${escHtml(value ?? '')}">
          <button type="button" class="tasks-due-trigger" id="${inputId}-btn"
                  aria-label="Set due date"></button>
        </div>
      </div>`;
  }

  function _initDueDateWidget(inputId) {
    const input = document.getElementById(inputId);
    const btn   = document.getElementById(inputId + '-btn');
    if (!input || !btn) return;

    function updateDisplay() {
      const val = input.value;
      if (!val) {
        btn.innerHTML   = _CAL_ICON;
        btn.className   = 'tasks-due-trigger tasks-due-trigger--empty';
      } else {
        const d  = new Date(val + 'T12:00:00');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const yy = String(d.getFullYear()).slice(-2);
        btn.innerHTML = `<span class="tasks-due-trigger-date">${mm}/${dd}/${yy}</span>${_PENCIL_ICON}`;
        btn.className = 'tasks-due-trigger tasks-due-trigger--set';
      }
    }

    updateDisplay();
    btn.addEventListener('click', () => {
      try { input.showPicker(); } catch { input.click(); }
    });
    input.addEventListener('change', updateDisplay);
  }

  function _attachCatListeners(form, getSelected, setSelected) {
    form.querySelectorAll('.tasks-form-cat-pill:not(.tasks-form-cat-add)').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        setSelected(getSelected() === cat ? '' : cat);
        form.querySelectorAll('.tasks-form-cat-pill').forEach(b =>
          b.classList.toggle('tasks-form-cat-pill--active', b.dataset.cat === getSelected())
        );
      });
    });
  }

  function _buildCatPillsHtml(categories, selectedCat) {
    return categories.map(c => `
      <button class="tasks-form-cat-pill${c === selectedCat ? ' tasks-form-cat-pill--active' : ''}"
              type="button" data-cat="${escHtml(c)}">${escHtml(c)}</button>
    `).join('') + `<button class="tasks-form-cat-pill tasks-form-cat-add" type="button"
                           id="tasks-form-cat-add-btn">+ Category</button>`;
  }

  function _openDailyForm() {
    document.getElementById('tasks-daily-form')?.remove();
    const container = document.getElementById('tasks-daily-list');
    if (!container) return;

    const categories = Data.getSettings().task_categories ?? [];
    let selectedCat  = '';

    const form = document.createElement('div');
    form.id = 'tasks-daily-form';
    form.className = 'tasks-form';
    form.innerHTML = `
      <input id="tasks-form-text" class="tasks-form-input" type="text"
             placeholder="Task description" maxlength="200" autocomplete="off">
      <div class="tasks-form-cats" id="tasks-form-cats">
        ${_buildCatPillsHtml(categories, selectedCat)}
      </div>
      ${_buildDueDateHtml('tasks-form-due', '')}
      <div class="tasks-form-actions">
        <button class="tasks-form-cancel" type="button"
                onclick="Tasks._closeDailyForm()">Cancel</button>
        <button class="tasks-form-save" type="button"
                onclick="Tasks._saveDailyForm()">Add Task</button>
      </div>`;

    form._getSelectedCat = () => selectedCat;
    _attachCatListeners(form, () => selectedCat, v => { selectedCat = v; });

    form.querySelector('#tasks-form-cat-add-btn')?.addEventListener('click', () => {
      const name = prompt('New category name:')?.trim();
      if (!name) return;
      const settings = Data.getSettings();
      if (!settings.task_categories) settings.task_categories = [];
      if (!settings.task_categories.includes(name)) {
        settings.task_categories.push(name);
        scheduleSave();
      }
      selectedCat = name;
      form.querySelector('#tasks-form-cats').innerHTML =
        _buildCatPillsHtml(Data.getSettings().task_categories ?? [], selectedCat);
      _attachCatListeners(form, () => selectedCat, v => { selectedCat = v; });
    });

    form.querySelector('#tasks-form-text').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); _saveDailyForm(); }
    });

    container.appendChild(form);
    _initDueDateWidget('tasks-form-due');
    form.querySelector('#tasks-form-text').focus();
  }

  function _saveDailyForm() {
    const form = document.getElementById('tasks-daily-form');
    if (!form) return;
    const text = form.querySelector('#tasks-form-text')?.value.trim() ?? '';
    const due  = form.querySelector('#tasks-form-due')?.value ?? '';
    const cat  = form._getSelectedCat ? form._getSelectedCat() : '';
    if (!text) { form.querySelector('#tasks-form-text')?.focus(); return; }
    addTask({ text, category: cat, due_date: due || null });
    form.remove();
    render(currentDate);
    _refreshTabIfOpen();
  }

  function _closeDailyForm() {
    document.getElementById('tasks-daily-form')?.remove();
  }

  function _openDailyEditForm(id) {
    const task = getTasks().find(t => t.id === id);
    if (!task) return;
    document.getElementById('tasks-daily-form')?.remove();
    const container = document.getElementById('tasks-daily-list');
    if (!container) return;

    const categories = Data.getSettings().task_categories ?? [];
    let selectedCat  = task.category ?? '';

    const form = document.createElement('div');
    form.id = 'tasks-daily-form';
    form.className = 'tasks-form tasks-form--edit';
    form.innerHTML = `
      <input id="tasks-form-text" class="tasks-form-input" type="text"
             value="${escHtml(task.text)}" maxlength="200" autocomplete="off">
      <div class="tasks-form-cats" id="tasks-form-cats">
        ${_buildCatPillsHtml(categories, selectedCat)}
      </div>
      ${_buildDueDateHtml('tasks-form-due', task.due_date ?? '')}
      <textarea id="tasks-form-notes" class="tasks-form-notes"
                placeholder="Notes (optional)" rows="2">${escHtml(task.notes ?? '')}</textarea>
      <div class="tasks-form-actions">
        <button class="tasks-form-delete" type="button"
                onclick="Tasks._deleteFromDailyForm('${task.id}')">Delete</button>
        <button class="tasks-form-cancel" type="button"
                onclick="Tasks._closeDailyForm()">Cancel</button>
        <button class="tasks-form-save" type="button"
                onclick="Tasks._saveEditForm('${task.id}')">Save</button>
      </div>`;

    form._getSelectedCat = () => selectedCat;
    _attachCatListeners(form, () => selectedCat, v => { selectedCat = v; });
    container.appendChild(form);
    _initDueDateWidget('tasks-form-due');
    form.querySelector('#tasks-form-text').focus();
  }

  function _saveEditForm(id) {
    const form = document.getElementById('tasks-daily-form');
    if (!form) return;
    const text  = form.querySelector('#tasks-form-text')?.value.trim() ?? '';
    const due   = form.querySelector('#tasks-form-due')?.value ?? '';
    const notes = form.querySelector('#tasks-form-notes')?.value.trim() ?? '';
    const cat   = form._getSelectedCat ? form._getSelectedCat() : '';
    if (!text) return;
    editTask(id, { text, category: cat, due_date: due || null, notes });
    form.remove();
    render(currentDate);
    _refreshTabIfOpen();
  }

  function _deleteFromDailyForm(id) {
    if (!confirm('Delete this task?')) return;
    deleteTask(id);
    document.getElementById('tasks-daily-form')?.remove();
    render(currentDate);
    _refreshTabIfOpen();
  }

  // ── Render: Tasks Tab ────────────────────────────────────────────────────────

  let _tabFilter    = 'all';
  let _tabSearch    = '';
  let _tabCollapsed = new Set(
    JSON.parse(localStorage.getItem('ht_tasks_collapsed') ?? '[]')
  );

  function _refreshTabIfOpen() {
    const tabEl = document.getElementById('tab-tasks');
    if (tabEl && !tabEl.hidden) renderTab();
  }

  function renderTab() {
    const wrap = document.getElementById('tasks-tab-content');
    if (!wrap) return;

    const categories = Data.getSettings().task_categories ?? [];
    const allTasks   = getTasks();
    const searchLower = _tabSearch.toLowerCase();

    const filtered = allTasks.filter(t => {
      if (searchLower) {
        const hit = t.text.toLowerCase().includes(searchLower)
          || (t.category ?? '').toLowerCase().includes(searchLower)
          || (t.notes    ?? '').toLowerCase().includes(searchLower);
        if (!hit) return false;
      }
      if (_tabFilter === 'due')       return !t.completed && t.due_date && t.due_date <= today();
      if (_tabFilter === 'completed') return t.completed;
      return true;
    });

    wrap.innerHTML = '';

    // Search bar
    const searchRow = document.createElement('div');
    searchRow.className = 'tasks-search-row';
    searchRow.innerHTML = `<input class="tasks-search-input" type="search"
      placeholder="Search tasks…" value="${escHtml(_tabSearch)}" id="tasks-search-input">`;
    searchRow.querySelector('input').addEventListener('input', e => {
      _tabSearch = e.target.value; renderTab();
    });
    wrap.appendChild(searchRow);

    // Filter pills
    const filterRow = document.createElement('div');
    filterRow.className = 'tasks-filter-row';
    [['all', 'All'], ['due', 'Due / Overdue'], ['completed', 'Completed']].forEach(([val, lbl]) => {
      const btn = document.createElement('button');
      btn.className = 'tasks-filter-pill' + (val === _tabFilter ? ' tasks-filter-pill--active' : '');
      btn.type = 'button';
      btn.textContent = lbl;
      btn.addEventListener('click', () => { _tabFilter = val; renderTab(); });
      filterRow.appendChild(btn);
    });
    wrap.appendChild(filterRow);

    // New Task button
    const newBtn = document.createElement('button');
    newBtn.className = 'tasks-new-btn';
    newBtn.type = 'button';
    newBtn.textContent = '+ New Task';
    newBtn.addEventListener('click', () => _openTabForm(null));
    wrap.appendChild(newBtn);

    // Build category order
    const catOrder  = [...categories];
    const extraCats = [...new Set(allTasks.map(t => t.category ?? ''))].filter(
      c => c && !catOrder.includes(c)
    );
    extraCats.forEach(c => catOrder.push(c));
    if (!catOrder.includes('')) catOrder.push('');

    // Determine which cats have visible tasks
    const catsWithTasks = catOrder.filter(cat =>
      filtered.some(t => (t.category ?? '') === cat)
    );

    catsWithTasks.forEach((cat, visIdx) => {
      const groupTasks = filtered.filter(t => (t.category ?? '') === cat);
      const groupKey   = cat || '__none__';
      const isCollapsed = _tabCollapsed.has(groupKey);
      const groupLabel  = cat || 'Uncategorized';
      const isFirst     = visIdx === 0;
      const isLast      = visIdx === catsWithTasks.length - 1;

      const group = document.createElement('div');
      group.className = 'tasks-group';
      group.dataset.cat = groupKey;

      const header = document.createElement('div');
      header.className = 'tasks-group-header';
      header.innerHTML = `
        <button class="tasks-group-chevron" type="button" aria-label="Toggle group">
          ${isCollapsed ? '▸' : '▾'}
        </button>
        <span class="tasks-group-label">${escHtml(groupLabel)}</span>
        <span class="tasks-group-count">${groupTasks.length}</span>
        <div class="tasks-group-order-btns">
          ${!isFirst ? `<button class="tasks-order-btn" type="button"
                                aria-label="Move up" data-dir="up"
                                data-cat="${escHtml(cat)}">↑</button>` : ''}
          ${!isLast  ? `<button class="tasks-order-btn" type="button"
                                aria-label="Move down" data-dir="down"
                                data-cat="${escHtml(cat)}">↓</button>` : ''}
        </div>`;

      header.querySelector('.tasks-group-chevron').addEventListener('click', () => {
        if (_tabCollapsed.has(groupKey)) _tabCollapsed.delete(groupKey);
        else _tabCollapsed.add(groupKey);
        localStorage.setItem('ht_tasks_collapsed', JSON.stringify([..._tabCollapsed]));
        renderTab();
      });
      header.querySelectorAll('.tasks-order-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          _moveCategoryOrder(btn.dataset.cat, btn.dataset.dir);
        });
      });

      group.appendChild(header);

      if (!isCollapsed) {
        const SHOW_INITIAL = 4;
        const expanded     = group.dataset.expanded === 'true';
        const showAll      = groupTasks.length <= SHOW_INITIAL || expanded;
        const visible      = showAll ? groupTasks : groupTasks.slice(0, SHOW_INITIAL);
        visible.forEach(task => group.appendChild(_buildTabRow(task)));
        if (groupTasks.length > SHOW_INITIAL && !showAll) {
          const more = document.createElement('button');
          more.className = 'tasks-show-more';
          more.type = 'button';
          more.textContent = `Show ${groupTasks.length - SHOW_INITIAL} more`;
          more.addEventListener('click', () => {
            group.dataset.expanded = 'true'; renderTab();
          });
          group.appendChild(more);
        }
      }
      wrap.appendChild(group);
    });

    if (filtered.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'tasks-empty';
      empty.textContent = _tabSearch ? 'No tasks match your search.'
        : _tabFilter === 'due'       ? 'No tasks due or overdue.'
        : _tabFilter === 'completed' ? 'No completed tasks.'
        : 'No tasks yet. Tap "+ New Task" to add one.';
      wrap.appendChild(empty);
    }
  }

  function _buildTabRow(task) {
    const overdue  = isOverdue(task.due_date);
    const dueLbl   = formatDueLabel(task.due_date);
    const catHtml  = task.category
      ? `<span class="tasks-cat-pill">${escHtml(task.category)}</span>` : '';
    const dueCls   = overdue ? 'tasks-due--overdue' : 'tasks-due';
    const noDue    = !task.due_date ? '<span class="tasks-no-due">No due date</span>' : '';
    const dueHtml  = task.due_date
      ? `<span class="${dueCls}">${escHtml(dueLbl)}${overdue ? ' (overdue)' : ''}</span>` : noDue;
    const completedInfo = task.completed && task.completed_date
      ? `<span class="tasks-completed-date">Done ${escHtml(formatDueLabel(task.completed_date))}</span>` : '';

    const row = document.createElement('div');
    row.className = 'tasks-row' + (task.completed ? ' tasks-row--done' : '');
    row.dataset.id = task.id;
    row.innerHTML = `
      <input type="checkbox" class="tasks-check" aria-label="Complete task"
             ${task.completed ? 'checked' : ''}>
      <span class="tasks-text">${escHtml(task.text)}</span>
      ${catHtml}${dueHtml}${completedInfo}
      <button class="tasks-edit-btn" type="button" aria-label="Edit task">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
             width="14" height="14" aria-hidden="true">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>`;

    row.querySelector('.tasks-check').addEventListener('change', () => {
      toggleComplete(task.id);
      renderTab();
      if (currentDate) render(currentDate);
    });
    row.querySelector('.tasks-edit-btn').addEventListener('click', e => {
      e.stopPropagation();
      _openTabForm(task.id);
    });
    return row;
  }

  function _openTabForm(editId) {
    document.getElementById('tasks-tab-form-container')?.remove();
    const task       = editId ? getTasks().find(t => t.id === editId) : null;
    const categories = Data.getSettings().task_categories ?? [];
    let selectedCat  = task?.category ?? '';
    const wrap = document.getElementById('tasks-tab-content');
    if (!wrap) return;

    const container = document.createElement('div');
    container.id = 'tasks-tab-form-container';
    container.className = 'tasks-form tasks-form--tab';
    container.innerHTML = `
      <div class="tasks-form-title">${editId ? 'Edit Task' : 'New Task'}</div>
      <label class="tasks-form-label">Description
        <input id="tasks-form-tab-text" class="tasks-form-input" type="text"
               value="${escHtml(task?.text ?? '')}" maxlength="200" autocomplete="off">
      </label>
      <div class="tasks-form-cats" id="tasks-form-tab-cats">
        ${_buildCatPillsHtml(categories, selectedCat)}
      </div>
      ${_buildDueDateHtml('tasks-form-tab-due', task?.due_date ?? '')}
      <label class="tasks-form-label">Notes
        <textarea id="tasks-form-tab-notes" class="tasks-form-notes"
                  placeholder="Optional notes" rows="2">${escHtml(task?.notes ?? '')}</textarea>
      </label>
      <div class="tasks-form-actions">
        ${editId ? `<button class="tasks-form-delete" type="button"
                            onclick="Tasks._deleteFromTab('${editId}')">Delete</button>` : ''}
        <button class="tasks-form-cancel" type="button"
                onclick="Tasks._closeTabForm()">Cancel</button>
        <button class="tasks-form-save" type="button"
                onclick="Tasks._saveTabForm(${JSON.stringify(editId ?? null)})">
          ${editId ? 'Save' : 'Add Task'}</button>
      </div>`;

    container._getSelectedCat = () => selectedCat;
    _attachCatListeners(container, () => selectedCat, v => { selectedCat = v; });
    wrap.appendChild(container);
    _initDueDateWidget('tasks-form-tab-due');
    container.querySelector('#tasks-form-tab-text').focus();
  }

  function _saveTabForm(editId) {
    const container = document.getElementById('tasks-tab-form-container');
    if (!container) return;
    const text  = container.querySelector('#tasks-form-tab-text')?.value.trim() ?? '';
    const due   = container.querySelector('#tasks-form-tab-due')?.value ?? '';
    const notes = container.querySelector('#tasks-form-tab-notes')?.value.trim() ?? '';
    const cat   = container._getSelectedCat ? container._getSelectedCat() : '';
    if (!text) { container.querySelector('#tasks-form-tab-text')?.focus(); return; }
    if (editId) editTask(editId, { text, category: cat, due_date: due || null, notes });
    else addTask({ text, category: cat, due_date: due || null, notes });
    container.remove();
    renderTab();
    if (currentDate) render(currentDate);
  }

  function _closeTabForm() {
    document.getElementById('tasks-tab-form-container')?.remove();
  }

  function _deleteFromTab(id) {
    if (!confirm('Delete this task?')) return;
    deleteTask(id);
    document.getElementById('tasks-tab-form-container')?.remove();
    renderTab();
    if (currentDate) render(currentDate);
  }

  function _moveCategoryOrder(cat, dir) {
    const settings = Data.getSettings();
    const cats     = settings.task_categories ?? [];
    const idx      = cats.indexOf(cat);
    if (idx === -1) return;
    if (dir === 'up'   && idx > 0)              [cats[idx - 1], cats[idx]] = [cats[idx], cats[idx - 1]];
    if (dir === 'down' && idx < cats.length - 1)[cats[idx], cats[idx + 1]] = [cats[idx + 1], cats[idx]];
    settings.task_categories = cats;
    scheduleSave();
    renderTab();
  }

  // ── Hub badge utility ────────────────────────────────────────────────────────

  function getDueCount(date) {
    return getDueTasks(date).length;
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  function init() {
    currentDate = (typeof DateNav !== 'undefined') ? DateNav.getDate() : Data.today();
    render(currentDate);
    renderTab();
  }

  function setDate(date) {
    currentDate = date;
    render(date);
  }

  return {
    init, setDate, renderTab, getDueCount,
    addTask, toggleComplete, editTask, deleteTask,
    _openDailyForm, _closeDailyForm, _saveDailyForm,
    _openDailyEditForm, _saveEditForm, _deleteFromDailyForm,
    _openTabForm, _saveTabForm, _closeTabForm, _deleteFromTab,
  };
})();
