/**
 * symptoms.js — Symptom tracking (symptoms-first model)
 *
 * Symptoms are primary daily entries; issues are optional grouping labels.
 *   - Log a symptom quickly with category, severity, description, time
 *   - Optionally link to a chronic issue
 *   - Issues with remind_daily:true appear as daily prompts
 *   - Link/unlink works both from the symptom and from the issue detail view
 *   - Issue detail shows history, stats, severity chart, and "find related" unlinked symptoms
 *   - Categories configurable via the gear button
 */
const Symptoms = (() => {

  // ── Constants ─────────────────────────────────────────────────────────────

  const CAT_COLORS = {
    'Headache':  '#8b5cf6',
    'Fever':     '#ef4444',
    'Fatigue':   '#f97316',
    'Nausea':    '#f59e0b',
    'Diarrhea':  '#10b981',
    'Other':     '#6b7280',
  };

  const PALETTE = [
    '#3b82f6', '#f97316', '#f59e0b', '#8b5cf6', '#6b7280',
    '#ec4899', '#10b981', '#ef4444', '#06b6d4', '#84cc16',
  ];

  const SEV_STYLES = [
    null,
    ['#e8f5e9', '#2e7d32'],
    ['#f1f8e9', '#558b2f'],
    ['#fff8e1', '#f57f17'],
    ['#fbe9e7', '#bf360c'],
    ['#ffebee', '#c62828'],
  ];

  const SEV_LABELS = ['', 'Mild', 'Low', 'Moderate', 'High', 'Severe'];

  const SEV_CHART_COLORS = { 1: '#4caf50', 2: '#8bc34a', 3: '#ffc107', 4: '#ff5722', 5: '#f44336' };

  // ── State ─────────────────────────────────────────────────────────────────

  let currentDate = null;
  let saveTimer   = null;

  // Form modes: null | 'add' | 'edit'
  let formMode       = null;
  let formSymptomId  = null; // symptom being edited

  // Add/edit form fields
  let fCat         = '';
  let fSev         = 3;
  let fDesc        = '';
  let fTime        = '';
  let fIssueId     = null; // selected issue to link (or null)

  // Issue management panel
  let managingIssues    = false;
  let issueDetailId     = null; // if set, show detail for this issue
  let issuePanelNewForm = false;
  let fIssName          = '';
  let fIssRemind        = false;

  // Cross-date edit / cross-date issue open (from health-log)
  let pendingEditFromDetail   = null;
  let pendingOpenIssueDetail  = null; // issue id to open after date nav

  // Issue edit state
  let editingIssueId  = null;
  let fIssEditName    = '';
  let fIssEditRemind  = false;
  let fIssEditNotes   = '';

  // Category manager state
  let managingCategories = false;
  let editingCatIdx      = -1;
  let fCatEditName       = '';

  // ── Data helpers ──────────────────────────────────────────────────────────

  function getSymptoms(dateStr) {
    const day = Data.getDay(dateStr);
    if (!day.symptoms) day.symptoms = [];
    return day.symptoms;
  }

  function getIssues() {
    const d = Data.getData();
    if (!d.issues) d.issues = {};
    return d.issues;
  }

  function getActiveIssues() {
    return Object.values(getIssues()).filter(i => !i.resolved);
  }

  function getSymptomsByIssue(issueId) {
    const allDays = Data.getData().days ?? {};
    const result  = [];
    Object.keys(allDays).sort().forEach(date => {
      (allDays[date].symptoms ?? []).forEach(s => {
        if (s.issue_id === issueId) result.push({ date, symptom: s });
      });
    });
    return result;
  }

  function getUnlinkedSymptoms() {
    const allDays = Data.getData().days ?? {};
    const result  = [];
    Object.keys(allDays).sort().reverse().forEach(date => {
      (allDays[date].symptoms ?? []).forEach(s => {
        if (!s.issue_id) result.push({ date, symptom: s });
      });
    });
    return result.slice(0, 20); // cap at 20 to avoid overwhelming the list
  }

  function getTodaySymptomForIssue(issueId, dateStr) {
    return getSymptoms(dateStr).find(s => s.issue_id === issueId) ?? null;
  }

  function getLastSeverity(issueId) {
    const allDays = Data.getData().days ?? {};
    const dates   = Object.keys(allDays).sort().reverse();
    for (const d of dates) {
      const found = (allDays[d].symptoms ?? []).find(s => s.issue_id === issueId);
      if (found?.severity) return found.severity;
    }
    return null;
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    currentDate = DateNav.getDate();
    document.getElementById('symp-cat-toggle').addEventListener('click', toggleCatManager);
    document.getElementById('symp-issues-btn').addEventListener('click', toggleIssuePanel);
    render();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  function render() {
    const symptoms     = getSymptoms(currentDate);
    const issues       = getIssues();
    const remindIssues = getActiveIssues().filter(i => i.remind_daily);

    const badge = document.getElementById('symp-today-badge');
    if (badge) {
      const unlogged = remindIssues.filter(i => !getTodaySymptomForIssue(i.id, currentDate));
      if (unlogged.length > 0) {
        badge.textContent = `${unlogged.length} pending`;
      } else if (symptoms.length > 0) {
        badge.textContent = `${symptoms.length} logged`;
      } else {
        badge.textContent = '';
      }
    }

    renderIssuePanel();
    renderCatPanel();
    renderContent();
    renderVitalsBar(currentDate);
  }

  function renderVitalsBar(date) {
    const el = document.getElementById('symp-vitals-bar');
    if (!el) return;

    const day = (Data.getData().days ?? {})[date];
    if (!day) { el.innerHTML = ''; return; }

    let html = '';

    // ── Sleep block ─────────────────────────────────────────────────────────
    const sl = day.sleep;
    if (sl?.hours > 0) {
      const parts = [`<span class="symp-vitals-sleep-val">${sl.hours}\u202fh</span>`];
      if (sl.bedtime)   parts.push(`<span class="symp-vitals-meta">Bed\u00a0${sl.bedtime}</span>`);
      if (sl.wake_time) parts.push(`<span class="symp-vitals-meta">Wake\u00a0${sl.wake_time}</span>`);
      html += `<div class="symp-vitals-row">
        <span class="symp-vitals-label">Sleep</span>
        <div class="symp-vitals-sleep-stats">${parts.join('')}</div>
      </div>`;
    }

    // ── Vitals chips ─────────────────────────────────────────────────────────
    const chips = [];
    const steps = Number(day.steps);
    if (day.steps          != null && !isNaN(steps)) chips.push(`${steps.toLocaleString()}\u00a0steps`);
    if (day.resting_hr     != null) chips.push(`${day.resting_hr}\u00a0bpm`);
    if (day.hrv            != null) chips.push(`${day.hrv}\u00a0ms HRV`);
    if (day.spo2           != null) chips.push(`${day.spo2}%\u00a0SpO\u2082`);
    if (day.breathing_rate != null) chips.push(`${day.breathing_rate}\u00a0br/min`);

    if (chips.length) {
      html += `<div class="symp-vitals-row">
        <span class="symp-vitals-label">Vitals</span>
        <div class="symp-vitals-chips-row">
          ${chips.map(c => `<span class="symp-vitals-chip">${c}</span>`).join('')}
        </div>
      </div>`;
    }

    el.innerHTML = html;
  }

  function renderContent() {
    const el = document.getElementById('symp-entries');
    if (!el) return;

    const symptoms     = getSymptoms(currentDate);
    const issues       = getIssues();
    const remindIssues = getActiveIssues()
      .filter(i => i.remind_daily)
      .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''));

    // Symptoms linked to remind-daily issues surface on their cards, not in the standalone list
    const remindIssueIds     = new Set(remindIssues.map(i => i.id));
    const standaloneSymptoms = symptoms.filter(s => !s.issue_id || !remindIssueIds.has(s.issue_id));

    let html = '';

    // ── Remind-daily prompts ──
    if (remindIssues.length > 0) {
      html += `<div class="health-section">`;
      html += `<p class="health-section-label">Daily Check-ins</p>`;
      remindIssues.forEach(issue => {
        const issueSymptoms = symptoms.filter(s => s.issue_id === issue.id);
        html += buildPromptCard(issue, issueSymptoms);
      });
      html += `</div>`;
    }

    // ── Add symptom form ──
    if (formMode === 'add') {
      html += buildAddForm();
    }

    // ── Today's symptoms list (standalone — not linked to a remind-daily issue) ──
    if (standaloneSymptoms.length > 0) {
      const label = remindIssues.length > 0 || formMode === 'add' ? `<p class="health-section-label">Today's Symptoms</p>` : '';
      html += `<div class="health-section">${label}`;
      standaloneSymptoms.forEach(s => {
        if (formMode === 'edit' && formSymptomId === s.id) {
          html += buildEditForm(s);
        } else if (pendingLinkSymptomId === s.id) {
          html += buildLinkForm(s);
        } else {
          html += buildSymptomCard(s);
        }
      });
      html += `</div>`;
    }

    // ── Empty state ──
    if (remindIssues.length === 0 && standaloneSymptoms.length === 0 && formMode === null && !pendingLinkSymptomId) {
      html += `<p class="section-empty">Nothing logged yet today.</p>`;
    }

    // ── Add button ──
    if (formMode === null && !pendingLinkSymptomId) {
      html += `<button class="health-add-btn" onclick="Symptoms._startAdd()">+ Add Symptom</button>`;
    }

    el.innerHTML = html;
  }

  // ── Card builders ─────────────────────────────────────────────────────────

  function buildPromptCard(issue, issueSymptoms) {
    const color   = catColor(issue.name);
    const lastSev = getLastSeverity(issue.id);

    if (issueSymptoms.length > 0) {
      const chipsHtml = issueSymptoms.map(s => {
        // When this symptom is being edited, show the edit form inline
        if (formMode === 'edit' && formSymptomId === s.id) {
          return buildEditForm(s);
        }
        const [bg, clr] = SEV_STYLES[s.severity] ?? SEV_STYLES[3];
        const catLabel  = escHtml(s.category || '');
        return `
          <button class="symp-prompt-symptom-chip" onclick="Symptoms._startEdit('${s.id}')">
            ${catLabel ? `<span class="symp-prompt-chip-cat">${catLabel}</span>` : ''}
            <span class="health-sev-badge" style="--sev-bg:${bg};--sev-clr:${clr}">${s.severity}</span>
          </button>`;
      }).join('');

      return `
        <div class="symp-prompt-card symp-prompt-card--logged">
          <div class="symp-prompt-header">
            <span class="health-issue-dot" style="background:${color}"></span>
            <span class="symp-prompt-name">${escHtml(issue.name)}</span>
          </div>
          <div class="symp-prompt-symptom-chips">${chipsHtml}</div>
          <div class="symp-prompt-logged-actions">
            <button class="symp-prompt-view-btn"
                    onclick="Symptoms._openIssueDetail('${issue.id}')">View</button>
            <button class="symp-prompt-add-btn"
                    onclick="Symptoms._startAddForIssue('${issue.id}')">+</button>
          </div>
        </div>`;
    }

    const lastBadge = lastSev
      ? (() => { const [bg, clr] = SEV_STYLES[lastSev]; return `<span class="health-sev-badge health-sev-badge--last" style="--sev-bg:${bg};--sev-clr:${clr}">last: ${lastSev}</span>`; })()
      : '';

    return `
      <div class="symp-prompt-card symp-prompt-card--pending">
        <div class="symp-prompt-header">
          <span class="health-issue-dot" style="background:${color}"></span>
          <div class="symp-prompt-meta">
            <span class="symp-prompt-name">${escHtml(issue.name)}</span>
          </div>
          ${lastBadge}
        </div>
        <button class="symp-prompt-log-btn"
                onclick="Symptoms._startAddForIssue('${issue.id}')">Log today</button>
      </div>`;
  }

  function buildSymptomCard(s) {
    const color     = catColor(s.category);
    const [bg, clr] = SEV_STYLES[s.severity] ?? SEV_STYLES[3];
    const issues    = getIssues();
    const linked    = s.issue_id ? issues[s.issue_id] : null;
    const issueBadge = linked
      ? `<span class="symp-issue-badge" style="--badge-color:${catColor(linked.category)}">${escHtml(linked.name)}</span>`
      : '';
    const timeBadge  = s.time ? `<span class="symp-time-badge">${escHtml(s.time)}</span>` : '';

    return `
      <div class="health-issue-card">
        <div class="health-issue-header">
          <span class="health-issue-dot" style="background:${color}"></span>
          <div class="health-issue-meta">
            <span class="health-issue-name">${escHtml(s.category)}</span>
            ${s.description ? `<span class="health-issue-cat symp-card-desc">${escHtml(truncate(s.description, 60))}</span>` : ''}
          </div>
          ${timeBadge}
          <span class="health-sev-badge" style="--sev-bg:${bg};--sev-clr:${clr}">
            ${s.severity} <span class="health-sev-label">${SEV_LABELS[s.severity]}</span>
          </span>
        </div>
        ${issueBadge ? `<div class="symp-issue-badge-row">${issueBadge}</div>` : ''}
        <div class="health-card-actions">
          <button class="health-edit-btn"
                  onclick="Symptoms._startEdit('${s.id}')">Edit</button>
          <button class="health-edit-btn"
                  onclick="Symptoms._startLink('${s.id}')">Link</button>
          <button class="health-delete-btn"
                  onclick="Symptoms._deleteSymptom('${s.id}')">Delete</button>
        </div>
      </div>`;
  }

  // ── Form builders ─────────────────────────────────────────────────────────

  function buildCatPills(cats, current) {
    return cats.map(cat => {
      const color  = catColor(cat);
      const active = cat === current ? ' health-form-cat--active' : '';
      return `<button class="health-form-cat${active}" type="button"
                      data-cat="${escHtml(cat)}" style="--cat-color:${color}"
                      onclick="Symptoms._setCat('${escHtml(cat)}')"
                      aria-pressed="${cat === current}">${escHtml(cat)}</button>`;
    }).join('');
  }

  function buildSevButtons(current) {
    return [1, 2, 3, 4, 5].map(n => {
      const [bg, clr] = SEV_STYLES[n];
      const active    = n === current ? ' health-form-sev--active' : '';
      return `<button class="health-form-sev${active}" type="button"
                      data-sev="${n}" style="--sev-bg:${bg};--sev-clr:${clr}"
                      onclick="Symptoms._setSev(${n})"
                      aria-pressed="${n === current}">${n}<span>${SEV_LABELS[n]}</span></button>`;
    }).join('');
  }

  function buildIssueDropdown(currentIssueId) {
    const active = getActiveIssues().sort((a, b) => a.name.localeCompare(b.name));
    const opts   = [`<option value="">— None (unlinked) —</option>`];
    active.forEach(i => {
      const sel = i.id === currentIssueId ? ' selected' : '';
      opts.push(`<option value="${escHtml(i.id)}"${sel}>${escHtml(i.name)} (${escHtml(i.category)})</option>`);
    });
    return `<select class="symp-issue-select" onchange="Symptoms._setIssueLink(this.value)" aria-label="Link to issue">${opts.join('')}</select>`;
  }

  function buildAddForm(prefillIssueId) {
    const cats = Data.getSettings().symptom_categories ?? Object.keys(CAT_COLORS);
    return `
      <div class="health-form">
        <div class="health-form-top">
          <span class="health-form-title">Add Symptom</span>
          <button class="health-cancel-btn" onclick="Symptoms._cancel()">Cancel</button>
        </div>
        <div class="health-form-field">
          <span class="health-form-label">Symptom</span>
          <div class="health-form-cats">${buildCatPills(cats, fCat)}</div>
        </div>
        <div class="health-form-field">
          <span class="health-form-label">Severity</span>
          <div class="health-form-sevs">${buildSevButtons(fSev)}</div>
        </div>
        <div class="health-form-field">
          <span class="health-form-label">Description <span class="health-opt">(optional)</span></span>
          <textarea class="health-text-input symp-desc-input" rows="2"
                    aria-label="Description" placeholder="What are you experiencing?"
                    maxlength="500"
                    oninput="Symptoms._setDesc(this.value)">${escHtml(fDesc)}</textarea>
        </div>
        <div class="health-form-field">
          <span class="health-form-label">Time <span class="health-opt">(optional)</span></span>
          <input class="health-text-input symp-time-input" type="time" aria-label="Time"
                 value="${escHtml(fTime)}"
                 onchange="Symptoms._setTime(this.value)">
        </div>
        <div class="health-form-field">
          <span class="health-form-label">Link to issue <span class="health-opt">(optional)</span></span>
          ${buildIssueDropdown(fIssueId)}
        </div>
        <div class="health-form-actions">
          <button class="health-save-btn" onclick="Symptoms._saveAdd()">Save Symptom</button>
        </div>
      </div>`;
  }

  function buildEditForm(s) {
    const cats = Data.getSettings().symptom_categories ?? Object.keys(CAT_COLORS);
    return `
      <div class="health-form health-form--edit">
        <div class="health-form-top">
          <span class="health-form-title">Edit Symptom</span>
          <button class="health-cancel-btn" onclick="Symptoms._cancel()">Cancel</button>
        </div>
        <div class="health-form-field">
          <span class="health-form-label">Symptom</span>
          <div class="health-form-cats">${buildCatPills(cats, fCat)}</div>
        </div>
        <div class="health-form-field">
          <span class="health-form-label">Severity</span>
          <div class="health-form-sevs">${buildSevButtons(fSev)}</div>
        </div>
        <div class="health-form-field">
          <span class="health-form-label">Description <span class="health-opt">(optional)</span></span>
          <textarea class="health-text-input symp-desc-input" rows="2"
                    aria-label="Description" placeholder="What are you experiencing?"
                    maxlength="500"
                    oninput="Symptoms._setDesc(this.value)">${escHtml(fDesc)}</textarea>
        </div>
        <div class="health-form-field">
          <span class="health-form-label">Time <span class="health-opt">(optional)</span></span>
          <input class="health-text-input symp-time-input" type="time" aria-label="Time"
                 value="${escHtml(fTime)}"
                 onchange="Symptoms._setTime(this.value)">
        </div>
        <div class="health-form-field">
          <span class="health-form-label">Link to issue <span class="health-opt">(optional)</span></span>
          ${buildIssueDropdown(fIssueId)}
        </div>
        <div class="health-form-actions">
          <button class="health-save-btn" onclick="Symptoms._saveEdit()">Update</button>
        </div>
      </div>`;
  }

  // Link inline form: small dropdown shown inline in card
  function buildLinkForm(s) {
    return `
      <div class="health-issue-card symp-link-form">
        <div class="health-form-top" style="margin-bottom:8px">
          <span class="health-form-title">Link to Issue</span>
          <button class="health-cancel-btn" onclick="Symptoms._cancelLink('${s.id}')">Cancel</button>
        </div>
        ${buildIssueDropdownForLink(s.id, s.issue_id)}
        <div class="health-form-actions" style="margin-top:8px">
          <button class="health-save-btn" onclick="Symptoms._saveLink('${s.id}')">Save Link</button>
        </div>
      </div>`;
  }

  function buildIssueDropdownForLink(symptomId, currentIssueId) {
    const active = getActiveIssues().sort((a, b) => a.name.localeCompare(b.name));
    const opts   = [`<option value="">— None (unlinked) —</option>`];
    active.forEach(i => {
      const sel = i.id === currentIssueId ? ' selected' : '';
      opts.push(`<option value="${escHtml(i.id)}"${sel}>${escHtml(i.name)} (${escHtml(i.category)})</option>`);
    });
    return `<select id="symp-link-select-${escHtml(symptomId)}" class="symp-issue-select" aria-label="Link to issue">${opts.join('')}</select>`;
  }

  // ── Issue management panel ────────────────────────────────────────────────

  function toggleIssuePanel() {
    managingIssues    = !managingIssues;
    issueDetailId     = null;
    issuePanelNewForm = false;
    fIssName = ''; fIssRemind = false;
    const btn = document.getElementById('symp-issues-btn');
    if (btn) btn.setAttribute('aria-expanded', String(managingIssues));
    renderIssuePanel();
  }

  function renderIssuePanel() {
    const panel = document.getElementById('symp-issues-panel');
    if (!panel) return;
    if (!managingIssues) { panel.hidden = true; panel.innerHTML = ''; return; }
    panel.hidden = false;

    if (issueDetailId) {
      panel.innerHTML = buildIssueDetail(issueDetailId);
      return;
    }

    const issues  = getIssues();
    const active  = Object.values(issues).filter(i => !i.resolved)
                          .sort((a, b) => a.name.localeCompare(b.name));
    const resolved = Object.values(issues).filter(i => i.resolved)
                           .sort((a, b) => a.name.localeCompare(b.name));

    function issueRow(issue) {
      if (editingIssueId === issue.id) {
        return `
          <div class="symp-issue-row symp-issue-row--editing">
            <div class="symp-iss-edit-form">
              <div class="health-form-field">
                <span class="health-form-label">Name <span class="health-req">*</span></span>
                <input class="health-text-input" type="text" id="symp-iss-edit-name-${issue.id}"
                       value="${escHtml(fIssEditName)}" maxlength="100"
                       oninput="Symptoms._setIssEditName(this.value)"
                       aria-label="Issue name">
              </div>
              <label class="health-ongoing-row">
                <input type="checkbox" class="health-ongoing-check"
                       ${fIssEditRemind ? 'checked' : ''}
                       onchange="Symptoms._setIssEditRemind(this.checked)">
                <span>Remind daily — show as check-in prompt each day</span>
              </label>
              <div class="health-form-field">
                <span class="health-form-label">Notes <span class="health-opt">(optional)</span></span>
                <textarea class="health-text-input" rows="2"
                          aria-label="Notes" maxlength="500"
                          oninput="Symptoms._setIssEditNotes(this.value)">${escHtml(fIssEditNotes)}</textarea>
              </div>
              <div class="health-form-actions">
                <button class="health-save-btn" onclick="Symptoms._saveIssEdit('${issue.id}')">Save</button>
                <button class="health-cancel-btn" onclick="Symptoms._cancelIssEdit()">Cancel</button>
              </div>
            </div>
          </div>`;
      }
      const color = catColor(issue.name);
      const remindChecked = issue.remind_daily ? ' checked' : '';
      return `
        <div class="symp-issue-row">
          <span class="health-issue-dot" style="background:${color}"></span>
          <div class="symp-issue-row-meta">
            <button class="symp-issue-row-name"
                    onclick="Symptoms._openIssueDetail('${issue.id}')">${escHtml(issue.name)}</button>
          </div>
          <label class="symp-remind-toggle" title="Remind daily">
            <input type="checkbox"${remindChecked}
                   onchange="Symptoms._toggleRemindDaily('${issue.id}', this.checked)">
            <span class="symp-remind-label">Daily</span>
          </label>
          ${!issue.resolved
            ? `<button class="symp-resolve-btn" onclick="Symptoms._resolveIssue('${issue.id}')">Resolve</button>`
            : `<span class="symp-resolved-tag">Resolved</span>`}
          <button class="symp-iss-edit-btn" onclick="Symptoms._startIssEdit('${issue.id}')">Edit</button>
          <button class="symp-iss-del-btn"  onclick="Symptoms._deleteIssue('${issue.id}')">Delete</button>
        </div>`;
    }

    let newForm = '';
    if (issuePanelNewForm) {
      newForm = `
        <div class="health-form symp-new-issue-form">
          <div class="health-form-top">
            <span class="health-form-title">New Issue</span>
            <button class="health-cancel-btn" onclick="Symptoms._cancelNewIssue()">Cancel</button>
          </div>
          <div class="health-form-field">
            <span class="health-form-label">Name <span class="health-req">*</span></span>
            <input class="health-text-input" type="text" id="symp-new-issue-name"
                   aria-label="Issue name" placeholder="e.g. Recurring headaches" maxlength="100"
                   value="${escHtml(fIssName)}"
                   oninput="Symptoms._setIssName(this.value)">
          </div>
          <label class="health-ongoing-row">
            <input type="checkbox" class="health-ongoing-check"
                   ${fIssRemind ? 'checked' : ''}
                   onchange="Symptoms._setIssRemind(this.checked)">
            <span>Remind daily — show as check-in prompt each day</span>
          </label>
          <div class="health-form-actions">
            <button class="health-save-btn" onclick="Symptoms._saveNewIssue()">Create Issue</button>
          </div>
        </div>`;
    }

    panel.innerHTML = `
      <div class="symp-issues-panel-header">
        <span>Issues</span>
        <button class="symp-cat-done-btn" type="button" onclick="Symptoms._closeIssuePanel()">Done</button>
      </div>
      ${active.length > 0 ? `
        <p class="health-section-label" style="padding:0 12px;margin:8px 0 4px">Active</p>
        <div class="symp-issue-list">${active.map(issueRow).join('')}</div>` : ''}
      ${resolved.length > 0 ? `
        <p class="health-section-label" style="padding:0 12px;margin:8px 0 4px">Resolved</p>
        <div class="symp-issue-list">${resolved.map(issueRow).join('')}</div>` : ''}
      ${active.length === 0 && resolved.length === 0
        ? `<p class="section-empty" style="margin:12px">No issues yet.</p>` : ''}
      ${newForm}
      ${!issuePanelNewForm
        ? `<button class="health-add-btn symp-new-issue-btn" onclick="Symptoms._startNewIssue()">+ New Issue</button>`
        : ''}
    `;
  }

  function buildIssCatPills(cats, current) {
    return cats.map(cat => {
      const color  = catColor(cat);
      const active = cat === current ? ' health-form-cat--active' : '';
      return `<button class="health-form-cat${active}" type="button"
                      data-cat="${escHtml(cat)}" style="--cat-color:${color}"
                      onclick="Symptoms._setIssCat('${escHtml(cat)}')"
                      aria-pressed="${cat === current}">${escHtml(cat)}</button>`;
    }).join('');
  }

  // ── Issue detail view ─────────────────────────────────────────────────────

  function buildIssueDetail(issueId) {
    const issue = getIssues()[issueId];
    if (!issue) return '<p class="section-empty">Issue not found.</p>';

    const color   = catColor(issue.name);
    const allSymp = getSymptomsByIssue(issueId);
    const unlinked = getUnlinkedSymptoms();

    // Stats
    const total   = allSymp.length;
    const avgSev  = total > 0
      ? (allSymp.reduce((s, e) => s + (e.symptom.severity ?? 0), 0) / total).toFixed(1)
      : '—';
    const firstSeen = total > 0 ? fmtDate(allSymp[0].date) : '—';
    const lastSeen  = total > 0 ? fmtDate(allSymp[allSymp.length - 1].date) : '—';

    // History rows — grouped by date, most recent first
    const byDate = new Map();
    allSymp.slice().reverse().forEach(({ date, symptom: s }) => {
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(s);
    });

    const histRows = [...byDate.entries()].map(([date, syms]) => {
      const label = date === currentDate ? 'Today' : fmtDate(date);
      const chips = syms.map(s => {
        const [bg, clr] = SEV_STYLES[s.severity] ?? SEV_STYLES[3];
        const color     = catColor(s.category);
        const tip       = s.description ? escHtml(truncate(s.description, 60)) : '';
        return `
          <div class="symp-hist-chip">
            <button class="symp-hist-chip-body"
                    title="${tip}"
                    onclick="Symptoms._startEditFromDetail('${s.id}','${date}')">
              <span class="health-issue-dot" style="background:${color}"></span>
              <span class="symp-hist-chip-cat">${escHtml(s.category)}</span>
              <span class="health-sev-badge" style="--sev-bg:${bg};--sev-clr:${clr}; font-size:0.72rem; padding:2px 6px">
                ${s.severity}
              </span>
              ${s.time ? `<span class="symp-hist-chip-time">${escHtml(s.time)}</span>` : ''}
            </button>
            <button class="symp-hist-chip-del"
                    title="Delete this entry"
                    onclick="Symptoms._deleteSymptomByDate('${s.id}','${date}')">×</button>
          </div>`;
      }).join('');

      return `
        <div class="symp-hist-day">
          <span class="symp-hist-day-label">${label}</span>
          <div class="symp-hist-chips">${chips}</div>
        </div>`;
    }).join('');

    // Find related
    const relatedRows = unlinked.map(({ date, symptom: s }) => {
      const [bg, clr] = SEV_STYLES[s.severity] ?? SEV_STYLES[3];
      const label     = date === currentDate ? 'Today' : fmtDate(date);
      return `
        <div class="symp-find-related-row">
          <div class="symp-find-related-info">
            <span class="health-detail-log-date">${label}${s.time ? ` · ${s.time}` : ''}</span>
            <span class="health-sev-badge" style="--sev-bg:${bg};--sev-clr:${clr}; font-size:11px; padding:2px 6px">${s.severity}</span>
            ${s.description ? `<span class="symp-find-related-desc">${escHtml(truncate(s.description, 50))}</span>` : ''}
          </div>
          <button class="symp-assign-btn" onclick="Symptoms._assignToIssue('${s.id}','${issueId}','${date}')">Assign</button>
        </div>`;
    }).join('');

    return `
      <div class="health-detail">
        <div class="health-detail-header">
          <button class="health-detail-back" onclick="Symptoms._closeIssueDetail()">← Back</button>
          <div class="health-detail-title">
            <span class="health-issue-dot" style="background:${color}"></span>
            <div>
              <div class="health-detail-name">${escHtml(issue.name)}</div>
              ${issue.start_date ? `<div class="health-detail-meta">Since ${fmtDate(issue.start_date)}</div>` : ''}
            </div>
          </div>
          ${!issue.resolved
            ? `<button class="health-resolve-btn" onclick="Symptoms._resolveIssue('${issueId}')">Resolve</button>`
            : `<span class="symp-resolved-tag">Resolved</span>`}
        </div>

        <div class="symp-detail-stats">
          <div class="symp-detail-stat"><span class="symp-detail-stat-val">${total}</span><span class="symp-detail-stat-lbl">total</span></div>
          <div class="symp-detail-stat"><span class="symp-detail-stat-val">${avgSev}</span><span class="symp-detail-stat-lbl">avg sev</span></div>
          <div class="symp-detail-stat"><span class="symp-detail-stat-val">${firstSeen}</span><span class="symp-detail-stat-lbl">first</span></div>
          <div class="symp-detail-stat"><span class="symp-detail-stat-val">${lastSeen}</span><span class="symp-detail-stat-lbl">last</span></div>
        </div>

        ${allSymp.length > 0 ? `
          <div class="health-detail-section">
            <p class="health-section-label">Severity over time</p>
            ${buildSeverityChart(allSymp)}
          </div>
          <div class="health-detail-section">
            <p class="health-section-label">History</p>
            <div class="health-detail-logs">${histRows}</div>
          </div>` : '<p class="section-empty" style="margin-top:12px">No symptoms logged yet.</p>'}

        ${unlinked.length > 0 ? `
          <div class="health-detail-section symp-find-related">
            <p class="health-section-label">Unlinked ${escHtml(issue.category)} symptoms</p>
            <p class="symp-find-related-hint">Assign past unlinked symptoms from the same category to this issue.</p>
            <div class="symp-find-related-list">${relatedRows}</div>
          </div>` : ''}
      </div>`;
  }

  function buildSeverityChart(entries) {
    if (entries.length === 0) return '';

    // Group by date
    const byDate = new Map();
    entries.forEach(({ date, symptom: s }) => {
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(s);
    });

    // Sort dates ascending, take last 60 unique dates
    const dates  = [...byDate.keys()].sort().slice(-60);
    const barW   = 28;
    const barGap = 5;
    const chartH = 80;
    const labelH = 22;
    const padX   = 6;
    const totalW = padX * 2 + dates.length * (barW + barGap) - barGap;
    const svgH   = chartH + labelH;

    let bars = '', labels = '';
    dates.forEach((date, i) => {
      const syms      = byDate.get(date);
      const x         = padX + i * (barW + barGap);
      const avgSev    = syms.reduce((acc, s) => acc + (s.severity ?? 3), 0) / syms.length;
      const totalBarH = Math.max(6, Math.round((avgSev / 5) * chartH));
      const totalSev  = syms.reduce((acc, s) => acc + (s.severity ?? 3), 0);

      // Stack segments bottom-to-top, each proportional to sev share of bar height
      let stackY = chartH;
      syms.forEach(s => {
        const sev   = s.severity ?? 3;
        const segH  = Math.max(2, Math.round((sev / totalSev) * totalBarH));
        stackY     -= segH;
        const color = SEV_CHART_COLORS[sev] ?? '#6b7280';
        const tip   = `${fmtDate(date)}${s.time ? ' · ' + s.time : ''}\nSeverity: ${sev} (${SEV_LABELS[sev]})${s.description ? '\n' + s.description : ''}`;
        bars += `<rect x="${x}" y="${stackY}" width="${barW}" height="${segH}" fill="${color}" opacity="0.88"><title>${escHtml(tip)}</title></rect>`;
      });

      // Transparent rounded overlay for hit-testing the whole bar
      const tipAll = `${fmtDate(date)} — ${syms.length} entr${syms.length === 1 ? 'y' : 'ies'}, avg severity ${avgSev.toFixed(1)}`;
      bars += `<rect x="${x}" y="${chartH - totalBarH}" width="${barW}" height="${totalBarH}" rx="4" fill="transparent"><title>${escHtml(tipAll)}</title></rect>`;

      labels += `<text x="${x + barW / 2}" y="${chartH + 16}" text-anchor="middle" font-size="9" fill="var(--clr-text-2)">${fmtDate(date)}</text>`;
    });

    return `
      <div class="health-chart-scroll">
        <svg class="health-chart-svg"
             viewBox="0 0 ${totalW} ${svgH}"
             width="${totalW}" height="${svgH}"
             xmlns="http://www.w3.org/2000/svg">
          ${bars}${labels}
        </svg>
      </div>`;
  }

  // ── Form state transitions ────────────────────────────────────────────────

  function startAdd(prefillIssueId) {
    const cats  = Data.getSettings().symptom_categories ?? Object.keys(CAT_COLORS);
    formMode      = 'add';
    formSymptomId = null;
    fCat          = cats[0] ?? 'Other';
    fSev          = 3;
    fDesc         = '';
    fTime         = '';
    fIssueId      = prefillIssueId ?? null;
    renderContent();
  }

  function startEdit(symptomId) {
    const s = getSymptoms(currentDate).find(x => x.id === symptomId);
    if (!s) return;
    formMode      = 'edit';
    formSymptomId = symptomId;
    fCat          = s.category ?? '';
    fSev          = s.severity ?? 3;
    fDesc         = s.description ?? '';
    fTime         = s.time ?? '';
    fIssueId      = s.issue_id ?? null;
    renderContent();
  }

  function cancel() {
    formMode      = null;
    formSymptomId = null;
    renderContent();
  }

  // ── Save / mutate ─────────────────────────────────────────────────────────

  function saveAdd() {
    const day = Data.getDay(currentDate);
    if (!day.symptoms) day.symptoms = [];
    day.symptoms.push({
      id:          crypto.randomUUID(),
      category:    fCat,
      severity:    fSev,
      description: fDesc.trim(),
      time:        fTime || null,
      issue_id:    fIssueId || null,
    });
    formMode = null;
    scheduleSave();
    render();
  }

  function saveEdit() {
    const symptoms = getSymptoms(currentDate);
    const s        = symptoms.find(x => x.id === formSymptomId);
    if (s) {
      s.category    = fCat;
      s.severity    = fSev;
      s.description = fDesc.trim();
      s.time        = fTime || null;
      s.issue_id    = fIssueId || null;
    }
    formMode      = null;
    formSymptomId = null;
    scheduleSave();
    render();
  }

  function deleteSymptom(symptomId) {
    const day = Data.getDay(currentDate);
    if (!day.symptoms) return;
    day.symptoms = day.symptoms.filter(s => s.id !== symptomId);
    scheduleSave();
    render();
  }

  function deleteSymptomByDate(symptomId, date) {
    const day = Data.getDay(date);
    if (!day.symptoms) return;
    day.symptoms = day.symptoms.filter(s => s.id !== symptomId);
    scheduleSave();
    render();
    renderIssuePanel();
  }

  function startEditFromDetail(symptomId, date) {
    pendingEditFromDetail = symptomId;
    DateNav.setDate(date); // fires onChange → Symptoms.setDate(date) → startEdit(symptomId)
  }

  // Link a symptom to an issue from a quick inline form
  let pendingLinkSymptomId = null;

  function startLink(symptomId) {
    pendingLinkSymptomId = symptomId;
    // Re-render the symptom card as a link form
    render();
  }

  function cancelLink() {
    pendingLinkSymptomId = null;
    render();
  }

  function saveLink(symptomId, selectId) {
    const el  = document.getElementById(`symp-link-select-${symptomId}`);
    const val = el ? el.value : null;
    const symptoms = getSymptoms(currentDate);
    const s        = symptoms.find(x => x.id === symptomId);
    if (s) s.issue_id = val || null;
    pendingLinkSymptomId = null;
    scheduleSave();
    render();
  }

  function toggleRemindDaily(issueId, value) {
    const issue = getIssues()[issueId];
    if (!issue) return;
    issue.remind_daily = !!value;
    scheduleSave();
    render();
  }

  function resolveIssue(issueId) {
    const issue = getIssues()[issueId];
    if (!issue) return;
    issue.resolved = true;
    issue.end_date = currentDate;
    if (issueDetailId === issueId) issueDetailId = null;
    scheduleSave();
    render();
    renderIssuePanel();
  }

  // Assign an unlinked symptom (on any date) to an issue from the detail view
  function assignToIssue(symptomId, issueId, dateStr) {
    const day = Data.getDay(dateStr);
    const s   = (day.symptoms ?? []).find(x => x.id === symptomId);
    if (s) s.issue_id = issueId;
    scheduleSave();
    renderIssuePanel(); // re-render detail to update find-related list
  }

  // ── Issue CRUD ────────────────────────────────────────────────────────────

  function startNewIssue() {
    issuePanelNewForm = true;
    fIssName          = '';
    fIssRemind        = false;
    renderIssuePanel();
    requestAnimationFrame(() => {
      const inp = document.getElementById('symp-new-issue-name');
      if (inp) inp.focus();
    });
  }

  function cancelNewIssue() {
    issuePanelNewForm = false;
    renderIssuePanel();
  }

  function saveNewIssue() {
    const name = fIssName.trim();
    if (!name) {
      const inp = document.getElementById('symp-new-issue-name');
      if (inp) inp.classList.add('input--error');
      return;
    }
    const issues  = getIssues();
    const issueId = crypto.randomUUID();
    issues[issueId] = {
      id:           issueId,
      name,
      remind_daily: fIssRemind,
      start_date:   currentDate,
      end_date:     null,
      resolved:     false,
      notes:        '',
    };
    issuePanelNewForm = false;
    scheduleSave();
    render();
    renderIssuePanel();
  }

  function openIssueDetail(issueId) {
    managingIssues = true;
    issueDetailId  = issueId;
    const btn = document.getElementById('symp-issues-btn');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    renderIssuePanel();
  }

  function openIssueFromHealthLog(issueId, date) {
    pendingOpenIssueDetail = issueId;
    DateNav.setDate(date);
    App.switchTab('today');
  }

  function closeIssueDetail() {
    issueDetailId  = null;
    managingIssues = false;
    render();
  }

  function closeIssuePanel() {
    managingIssues    = false;
    issueDetailId     = null;
    issuePanelNewForm = false;
    const btn = document.getElementById('symp-issues-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    renderIssuePanel();
    render();
  }

  function startIssEdit(issueId) {
    const issue = getIssues()[issueId];
    if (!issue) return;
    editingIssueId = issueId;
    fIssEditName   = issue.name ?? '';
    fIssEditRemind = !!issue.remind_daily;
    fIssEditNotes  = issue.notes ?? '';
    renderIssuePanel();
    requestAnimationFrame(() => {
      const inp = document.getElementById(`symp-iss-edit-name-${issueId}`);
      if (inp) inp.focus();
    });
  }

  function cancelIssEdit() {
    editingIssueId = null;
    fIssEditName   = '';
    fIssEditRemind = false;
    fIssEditNotes  = '';
    renderIssuePanel();
  }

  function saveIssEdit(issueId) {
    const name = fIssEditName.trim();
    if (!name) return;
    const issue = getIssues()[issueId];
    if (!issue) return;
    issue.name         = name;
    issue.remind_daily = fIssEditRemind;
    issue.notes        = fIssEditNotes;
    editingIssueId     = null;
    fIssEditName       = '';
    fIssEditRemind     = false;
    fIssEditNotes      = '';
    scheduleSave();
    render();
    renderIssuePanel();
  }

  function deleteIssue(issueId) {
    if (!confirm('Delete this issue? Its symptoms will be unlinked but not deleted.')) return;
    const issues = getIssues();
    const d      = Data.getData();
    Object.values(d.days ?? {}).forEach(day => {
      (day.symptoms ?? []).forEach(s => {
        if (s.issue_id === issueId) s.issue_id = null;
      });
    });
    delete issues[issueId];
    if (issueDetailId === issueId) issueDetailId = null;
    scheduleSave();
    render();
    renderIssuePanel();
  }

  // ── Inline onclick bridges ────────────────────────────────────────────────

  function _startAdd()                   { startAdd(); }
  function _startAddForIssue(id)         { startAdd(id); }
  function _startEdit(id)                { startEdit(id); }
  function _cancel()                     { cancel(); }
  function _saveAdd()                    { saveAdd(); }
  function _saveEdit()                   { saveEdit(); }
  function _deleteSymptom(id)            { deleteSymptom(id); }
  function _startLink(id)                { startLink(id); }
  function _cancelLink(id)               { cancelLink(); }
  function _saveLink(id)                 { saveLink(id); }
  function _toggleRemindDaily(id, v)     { toggleRemindDaily(id, v); }
  function _resolveIssue(id)             { resolveIssue(id); }
  function _assignToIssue(sid, iid, dt)  { assignToIssue(sid, iid, dt); }
  function _startNewIssue()              { startNewIssue(); }
  function _cancelNewIssue()             { cancelNewIssue(); }
  function _saveNewIssue()               { saveNewIssue(); }
  function _openIssueDetail(id)          { openIssueDetail(id); }
  function _closeIssueDetail()           { closeIssueDetail(); }
  function _closeIssuePanel()            { closeIssuePanel(); }
  function _startEditFromDetail(id, dt)    { startEditFromDetail(id, dt); }
  function _deleteSymptomByDate(id, dt)    { deleteSymptomByDate(id, dt); }
  function _openIssueFromHealthLog(id, dt) { openIssueFromHealthLog(id, dt); }
  function _startIssEdit(id)             { startIssEdit(id); }
  function _cancelIssEdit()              { cancelIssEdit(); }
  function _saveIssEdit(id)              { saveIssEdit(id); }
  function _deleteIssue(id)              { deleteIssue(id); }
  function _setIssEditName(v)            { fIssEditName = v; }
  function _setIssEditRemind(v)          { fIssEditRemind = !!v; }
  function _setIssEditNotes(v)           { fIssEditNotes = v; }

  function _setCat(v) {
    fCat = v;
    document.querySelectorAll('.health-form-cat').forEach(b => {
      const on = b.dataset.cat === v;
      b.classList.toggle('health-form-cat--active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function _setSev(n) {
    fSev = n;
    document.querySelectorAll('.health-form-sev').forEach(b => {
      const on = parseInt(b.dataset.sev, 10) === n;
      b.classList.toggle('health-form-sev--active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function _setDesc(v)       { fDesc = v; }
  function _setTime(v)       { fTime = v; }
  function _setIssueLink(v)  { fIssueId = v || null; }
  function _setIssName(v)    { fIssName = v; }
  function _setIssRemind(v)  { fIssRemind = !!v; }

  // ── Category manager ──────────────────────────────────────────────────────

  function toggleCatManager() {
    managingCategories = !managingCategories;
    editingCatIdx      = -1;
    fCatEditName       = '';
    const btn = document.getElementById('symp-cat-toggle');
    if (btn) btn.setAttribute('aria-expanded', String(managingCategories));
    renderCatPanel();
  }

  function renderCatPanel() {
    const panel = document.getElementById('symp-cat-panel');
    if (!panel) return;
    if (!managingCategories) { panel.hidden = true; panel.innerHTML = ''; return; }
    panel.hidden = false;
    const cats = Data.getSettings().symptom_categories ?? [];

    const rows = cats.map((cat, idx) => {
      const color = catColor(cat);
      if (editingCatIdx === idx) {
        return `
          <li class="symp-cat-item">
            <span class="symp-cat-item-dot" style="background:${color}" aria-hidden="true"></span>
            <input class="symp-cat-name-input" id="symp-cat-rename-input"
                   value="${escHtml(fCatEditName)}" maxlength="40" aria-label="Rename category">
            <button class="symp-cat-save-btn" type="button" data-idx="${idx}" aria-label="Save">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
                   width="13" height="13"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
            <button class="symp-cat-item-cancel-btn" type="button" aria-label="Cancel">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                   width="13" height="13">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6"  y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </li>`;
      }
      return `
        <li class="symp-cat-item">
          <span class="symp-cat-item-dot" style="background:${color}" aria-hidden="true"></span>
          <span class="symp-cat-item-name">${escHtml(cat)}</span>
          <button class="symp-cat-edit-btn" type="button" data-idx="${idx}" aria-label="Rename ${escHtml(cat)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                 width="13" height="13">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="symp-cat-del-btn" type="button" data-idx="${idx}" aria-label="Delete ${escHtml(cat)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                 width="13" height="13">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        </li>`;
    }).join('');

    panel.innerHTML = `
      <div class="symp-cat-panel-header">
        <span>Symptoms</span>
        <button class="symp-cat-done-btn" type="button">Done</button>
      </div>
      <ul class="symp-cat-list">${rows}</ul>
      <div class="symp-cat-add-row">
        <input id="symp-new-cat-input" class="symp-cat-add-input"
               type="text" maxlength="40" placeholder="New category…" aria-label="New category name">
        <button class="symp-cat-add-confirm-btn" type="button">Add</button>
      </div>
    `;

    panel.querySelector('.symp-cat-done-btn').addEventListener('click', toggleCatManager);

    panel.querySelectorAll('.symp-cat-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        editingCatIdx = parseInt(btn.dataset.idx, 10);
        fCatEditName  = cats[editingCatIdx];
        renderCatPanel();
        requestAnimationFrame(() => {
          const inp = document.getElementById('symp-cat-rename-input');
          if (inp) { inp.focus(); inp.select(); }
        });
      });
    });

    panel.querySelectorAll('.symp-cat-del-btn').forEach(btn => {
      btn.addEventListener('click', () => removeCategory(parseInt(btn.dataset.idx, 10)));
    });

    panel.querySelector('.symp-cat-save-btn')?.addEventListener('click', () => {
      const inp = document.getElementById('symp-cat-rename-input');
      fCatEditName = inp?.value ?? fCatEditName;
      saveCatEdit();
    });

    panel.querySelector('.symp-cat-item-cancel-btn')?.addEventListener('click', () => {
      editingCatIdx = -1; fCatEditName = ''; renderCatPanel();
    });

    const renameInp = document.getElementById('symp-cat-rename-input');
    if (renameInp) {
      renameInp.addEventListener('input', e => { fCatEditName = e.target.value; });
      renameInp.addEventListener('keydown', e => {
        if (e.key === 'Enter')  saveCatEdit();
        if (e.key === 'Escape') { editingCatIdx = -1; fCatEditName = ''; renderCatPanel(); }
      });
    }

    const addInp = panel.querySelector('#symp-new-cat-input');
    panel.querySelector('.symp-cat-add-confirm-btn').addEventListener('click', () => addCategoryFromInput(addInp));
    addInp?.addEventListener('keydown', e => { if (e.key === 'Enter') addCategoryFromInput(addInp); });
  }

  function saveCatEdit() {
    const cats    = Data.getSettings().symptom_categories;
    const oldName = cats[editingCatIdx];
    const newName = fCatEditName.trim();
    if (newName && newName !== oldName) {
      cats[editingCatIdx] = newName;
      // Rename category on all symptoms and issues
      Object.values(Data.getData().days ?? {}).forEach(day => {
        (day.symptoms ?? []).forEach(s => {
          if (s.category === oldName) s.category = newName;
        });
      });
      if (fCat === oldName) fCat = newName;
      scheduleSave();
    }
    editingCatIdx = -1; fCatEditName = '';
    renderCatPanel();
  }

  function removeCategory(idx) {
    const cats    = Data.getSettings().symptom_categories;
    const removed = cats[idx];
    cats.splice(idx, 1);
    if (fCat === removed) fCat = cats[0] ?? '';
    editingCatIdx = -1;
    renderCatPanel();
    scheduleSave();
  }

  function addCategoryFromInput(inp) {
    const name = (inp?.value ?? '').trim();
    if (!name) return;
    const cats = Data.getSettings().symptom_categories;
    if (cats.includes(name)) { inp.classList.add('input--error'); return; }
    inp.classList.remove('input--error');
    cats.push(name);
    inp.value = '';
    renderCatPanel();
    scheduleSave();
  }

  // ── Date sync ─────────────────────────────────────────────────────────────

  function setDate(date) {
    const pendingEdit      = pendingEditFromDetail;
    const pendingIssueOpen = pendingOpenIssueDetail;
    formMode               = null;
    formSymptomId          = null;
    managingCategories     = false;
    managingIssues         = false;
    issueDetailId          = null;
    editingCatIdx          = -1;
    pendingLinkSymptomId   = null;
    editingIssueId         = null;
    pendingEditFromDetail  = null;
    pendingOpenIssueDetail = null;
    currentDate            = date;
    if (pendingEdit) {
      startEdit(pendingEdit);
    } else if (pendingIssueOpen) {
      openIssueDetail(pendingIssueOpen);
    } else {
      render();
    }
  }

  // ── Debounced save ────────────────────────────────────────────────────────

  function scheduleSave() {
    setSaveStatus('pending');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await Data.save();
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus(''), 2200);
      } catch (err) {
        console.error('Symptoms save failed:', err);
        setSaveStatus('error');
      }
    }, 1200);
  }

  function setSaveStatus(s) {
    const el = document.getElementById('symp-save-status');
    if (!el) return;
    el.dataset.status = s;
    const labels = { pending: 'Unsaved', saving: 'Saving…', saved: 'Saved', error: 'Save failed', '': '' };
    el.textContent = labels[s] ?? '';
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function catColor(cat) {
    if (CAT_COLORS[cat]) return CAT_COLORS[cat];
    let h = 0;
    for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) | 0;
    return PALETTE[Math.abs(h) % PALETTE.length];
  }

  function fmtDate(dateStr) {
    if (!dateStr) return '';
    const [y, mo, d] = dateStr.split('-').map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function truncate(s, max) {
    if (!s) return '';
    return s.length > max ? s.slice(0, max) + '…' : s;
  }

  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    init, render, setDate,
    _startAdd, _startAddForIssue, _startEdit, _cancel,
    _saveAdd, _saveEdit, _deleteSymptom,
    _startLink, _cancelLink, _saveLink,
    _toggleRemindDaily, _resolveIssue, _assignToIssue,
    _startNewIssue, _cancelNewIssue, _saveNewIssue,
    _openIssueDetail, _closeIssueDetail, _closeIssuePanel,
    _startEditFromDetail, _deleteSymptomByDate, _openIssueFromHealthLog,
    _startIssEdit, _cancelIssEdit, _saveIssEdit, _deleteIssue,
    _setIssEditName, _setIssEditRemind, _setIssEditNotes,
    _setCat, _setSev, _setDesc, _setTime, _setIssueLink,
    _setIssName, _setIssRemind,
  };
})();
