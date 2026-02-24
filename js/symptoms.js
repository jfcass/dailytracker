/**
 * symptoms.js — Health section
 *
 * Issue-based health tracking:
 *   - Log a new issue (name, category, symptoms, severity, optional note, ongoing?)
 *   - Ongoing issues appear every day with a check-in prompt
 *   - Each check-in logs today's symptoms (fresh), severity, note
 *   - Issues can be resolved at any time
 *   - Click an ongoing issue to view full history + severity chart
 *   - Categories are configurable via the gear button
 */
const Symptoms = (() => {

  // ── Constants ─────────────────────────────────────────────────────────────

  const COMMON_SYMPTOMS = [
    'Headache',    'Fatigue',     'Nausea',              'Fever',       'Chills',
    'Cough',       'Congestion',  'Runny nose',          'Sneezing',    'Post-nasal drip',
    'Sore throat', 'Body aches',  'Shortness of breath', 'Diarrhea',    'Vomiting',
  ];

  const CAT_COLORS = {
    'Eyes':       '#3b82f6',
    'Body Pain':  '#f97316',
    'GI':         '#f59e0b',
    'Headaches':  '#8b5cf6',
    'Other':      '#6b7280',
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

  // ── State ─────────────────────────────────────────────────────────────────

  let currentDate = null;
  let saveTimer   = null;

  // Form modes: null | 'new' | 'checkin' | 'edit'
  let formMode    = null;
  let formIssueId = null;
  let formLogId   = null;

  // Form fields (shared across modes)
  let fName     = '';
  let fCat      = '';
  let fSymptoms = [];
  let fSev      = 3;
  let fNote     = '';
  let fOngoing  = false;

  // Detail view state
  let detailIssueId = null;
  let detailEditing = false;
  let fEditName     = '';
  let fEditCat      = '';

  // Category manager state
  let managingCategories = false;
  let editingCatIdx      = -1;
  let fCatEditName       = '';

  // ── Data accessors ────────────────────────────────────────────────────────

  function getIssues() {
    const d = Data.getData();
    if (!d.issues) d.issues = {};
    return d.issues;
  }

  function getLogs(dateStr) {
    const day = Data.getDay(dateStr);
    if (!day.issue_logs) day.issue_logs = [];
    return day.issue_logs;
  }

  function getLastSeverity(issueId) {
    const days = Object.keys(Data.getData().days ?? {}).sort().reverse();
    for (const d of days) {
      const log = (Data.getData().days[d].issue_logs ?? []).find(l => l.issue_id === issueId);
      if (log?.severity) return log.severity;
    }
    return null;
  }

  // All logged entries for an issue, sorted chronologically
  function getAllLogsForIssue(issueId) {
    const allDays = Data.getData().days ?? {};
    const result  = [];
    Object.keys(allDays).sort().forEach(date => {
      const log = (allDays[date].issue_logs ?? []).find(l => l.issue_id === issueId);
      if (log) result.push({ date, log });
    });
    return result;
  }

  // Symptoms from the most recent past log for this issue (for ordering hint)
  function getPrevSymptoms(issueId) {
    const allDays = Data.getData().days ?? {};
    const sorted  = Object.keys(allDays).sort().reverse();
    for (const d of sorted) {
      if (d >= currentDate) continue;
      const log = (allDays[d].issue_logs ?? []).find(l => l.issue_id === issueId);
      if (log?.symptoms?.length) return log.symptoms;
    }
    return [];
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    currentDate = DateNav.getDate();
    document.getElementById('symp-cat-toggle').addEventListener('click', toggleCatManager);
    render();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  function render() {
    const issues        = getIssues();
    const logs          = getLogs(currentDate);
    const activeOngoing = Object.values(issues).filter(i => i.ongoing && !i.resolved);

    const badge = document.getElementById('symp-today-badge');
    if (badge) {
      if (activeOngoing.length > 0 && logs.length === 0) {
        badge.textContent = `${activeOngoing.length} ongoing`;
      } else if (logs.length > 0) {
        badge.textContent = `${logs.length} logged`;
      } else {
        badge.textContent = '';
      }
    }

    renderCatPanel();
    renderContent();
  }

  function renderContent() {
    const el = document.getElementById('symp-entries');
    if (!el) return;

    // ── Detail view ──
    if (detailIssueId) {
      const issue = getIssues()[detailIssueId];
      el.innerHTML = issue
        ? buildDetailView(issue)
        : '<p class="section-empty">Issue not found.</p>';
      if (detailEditing) {
        requestAnimationFrame(() => {
          const inp = el.querySelector('.health-detail-edit .health-text-input');
          if (inp) inp.focus();
        });
      }
      return;
    }

    const issues       = getIssues();
    const logs         = getLogs(currentDate);
    const activeOngoing = Object.values(issues)
      .filter(i => i.ongoing && !i.resolved)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));

    const todayOneLogs = logs.filter(l => {
      const iss = issues[l.issue_id];
      return iss && !iss.ongoing;
    });

    let html = '';

    // ── Ongoing issues ──
    if (activeOngoing.length > 0) {
      html += `<div class="health-section"><p class="health-section-label">Ongoing</p>`;
      activeOngoing.forEach(issue => {
        const todayLog = logs.find(l => l.issue_id === issue.id);
        if (formMode === 'checkin' && formIssueId === issue.id) {
          html += buildCheckInForm(issue);
        } else if (formMode === 'edit' && formIssueId === issue.id) {
          html += buildEditForm(todayLog, issue);
        } else {
          html += buildOngoingCard(issue, todayLog);
        }
      });
      html += `</div>`;
    }

    // ── New issue form ──
    if (formMode === 'new') {
      html += buildNewIssueForm();
    }

    // ── Today's one-off logs ──
    if (todayOneLogs.length > 0) {
      html += `<div class="health-section">`;
      if (activeOngoing.length > 0 || formMode === 'new') {
        html += `<p class="health-section-label">Today's Issues</p>`;
      }
      todayOneLogs.forEach(log => {
        const iss = issues[log.issue_id];
        if (!iss) return;
        if (formMode === 'edit' && formLogId === log.id) {
          html += buildEditForm(log, iss);
        } else {
          html += buildLogCard(log, iss);
        }
      });
      html += `</div>`;
    }

    // ── Empty state ──
    if (activeOngoing.length === 0 && todayOneLogs.length === 0 && formMode === null) {
      html += `<p class="section-empty">Nothing logged yet today.</p>`;
    }

    // ── Add button ──
    if (formMode === null) {
      html += `<button class="health-add-btn" onclick="Symptoms._startNew()">+ Log New Issue</button>`;
    }

    el.innerHTML = html;
  }

  // ── Card builders ─────────────────────────────────────────────────────────

  function buildOngoingCard(issue, todayLog) {
    const color = catColor(issue.category);

    if (todayLog) {
      const [bg, clr] = SEV_STYLES[todayLog.severity] ?? SEV_STYLES[3];
      const chips = (todayLog.symptoms ?? [])
        .map(s => `<span class="health-symp-chip">${escHtml(s)}</span>`).join('');
      return `
        <div class="health-issue-card health-issue-card--checked">
          <button class="health-issue-detail-trigger"
                  onclick="Symptoms._openDetail('${issue.id}')"
                  aria-label="View details for ${escHtml(issue.name)}">
            <div class="health-issue-header">
              <span class="health-issue-dot" style="background:${color}"></span>
              <div class="health-issue-meta">
                <span class="health-issue-name">${escHtml(issue.name)}</span>
                <span class="health-issue-cat">${escHtml(issue.category)}</span>
              </div>
              <span class="health-sev-badge" style="--sev-bg:${bg};--sev-clr:${clr}">
                ${todayLog.severity} <span class="health-sev-label">${SEV_LABELS[todayLog.severity]}</span>
              </span>
              <svg class="health-detail-chevron" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2" stroke-linecap="round"
                   stroke-linejoin="round" width="14" height="14" aria-hidden="true">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          </button>
          ${chips ? `<div class="health-symp-chips">${chips}</div>` : ''}
          ${todayLog.note ? `<p class="health-log-note">${escHtml(todayLog.note)}</p>` : ''}
          <div class="health-card-actions">
            <button class="health-edit-btn"
                    onclick="Symptoms._startEditLog('${issue.id}','${todayLog.id}')">Edit today</button>
            <button class="health-resolve-btn"
                    onclick="Symptoms._resolve('${issue.id}')">Resolve</button>
          </div>
        </div>`;
    }

    // Not yet checked in today
    const lastSev    = getLastSeverity(issue.id);
    const lastBadge  = lastSev
      ? (() => { const [bg, clr] = SEV_STYLES[lastSev]; return `<span class="health-sev-badge health-sev-badge--last" style="--sev-bg:${bg};--sev-clr:${clr}">last: ${lastSev}</span>`; })()
      : '';

    return `
      <div class="health-issue-card health-issue-card--pending">
        <button class="health-issue-detail-trigger"
                onclick="Symptoms._openDetail('${issue.id}')"
                aria-label="View details for ${escHtml(issue.name)}">
          <div class="health-issue-header">
            <span class="health-issue-dot" style="background:${color}"></span>
            <div class="health-issue-meta">
              <span class="health-issue-name">${escHtml(issue.name)}</span>
              <span class="health-issue-cat">${escHtml(issue.category)}
                · <span class="health-issue-since">since ${fmtDate(issue.start_date)}</span>
              </span>
            </div>
            ${lastBadge}
            <svg class="health-detail-chevron" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round"
                 stroke-linejoin="round" width="14" height="14" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        </button>
        <div class="health-card-actions">
          <button class="health-checkin-btn"
                  onclick="Symptoms._startCheckIn('${issue.id}')">Log today</button>
          <button class="health-resolve-btn"
                  onclick="Symptoms._resolve('${issue.id}')">Resolve</button>
        </div>
      </div>`;
  }

  function buildLogCard(log, issue) {
    const color       = catColor(issue.category);
    const [bg, clr]   = SEV_STYLES[log.severity] ?? SEV_STYLES[3];
    const chips       = (log.symptoms ?? [])
      .map(s => `<span class="health-symp-chip">${escHtml(s)}</span>`).join('');
    return `
      <div class="health-issue-card">
        <div class="health-issue-header">
          <span class="health-issue-dot" style="background:${color}"></span>
          <div class="health-issue-meta">
            <span class="health-issue-name">${escHtml(issue.name)}</span>
            <span class="health-issue-cat">${escHtml(issue.category)}</span>
          </div>
          <span class="health-sev-badge" style="--sev-bg:${bg};--sev-clr:${clr}">
            ${log.severity} <span class="health-sev-label">${SEV_LABELS[log.severity]}</span>
          </span>
        </div>
        ${chips ? `<div class="health-symp-chips">${chips}</div>` : ''}
        ${log.note ? `<p class="health-log-note">${escHtml(log.note)}</p>` : ''}
        <div class="health-card-actions">
          <button class="health-edit-btn"
                  onclick="Symptoms._startEditLog('${issue.id}','${log.id}')">Edit</button>
          <button class="health-delete-btn"
                  onclick="Symptoms._deleteLog('${log.id}')">Delete</button>
        </div>
      </div>`;
  }

  // ── Detail view ───────────────────────────────────────────────────────────

  function buildDetailView(issue) {
    const color = catColor(issue.category);
    const logs  = getAllLogsForIssue(issue.id);

    let editSection;
    if (detailEditing) {
      const cats = Data.getSettings().symptom_categories ?? Object.keys(CAT_COLORS);
      editSection = `
        <div class="health-detail-edit">
          <div class="health-form-field">
            <span class="health-form-label">Name</span>
            <input class="health-text-input" type="text"
                   value="${escHtml(fEditName)}" maxlength="100"
                   aria-label="Issue name"
                   oninput="Symptoms._setEditName(this.value)">
          </div>
          <div class="health-form-field">
            <span class="health-form-label">Category</span>
            <div class="health-form-cats">${buildDetailCatPills(cats, fEditCat)}</div>
          </div>
          <div class="health-form-actions">
            <button class="health-save-btn"
                    onclick="Symptoms._saveIssueEdit('${issue.id}')">Save Changes</button>
            <button class="health-resolve-form-btn"
                    onclick="Symptoms._cancelIssueEdit()">Cancel</button>
          </div>
        </div>`;
    } else {
      editSection = `
        <button class="health-detail-edit-btn"
                onclick="Symptoms._editIssue('${issue.id}')">Edit Issue</button>`;
    }

    const historyRows = logs.slice().reverse().map(({ date, log }) => {
      const [bg, clr] = SEV_STYLES[log.severity] ?? SEV_STYLES[3];
      const chips     = (log.symptoms ?? [])
        .map(s => `<span class="health-symp-chip">${escHtml(s)}</span>`).join('');
      const label     = date === currentDate ? 'Today' : fmtDate(date);
      return `
        <div class="health-detail-log-row">
          <div class="health-detail-log-top">
            <span class="health-detail-log-date">${label}</span>
            <span class="health-sev-badge" style="--sev-bg:${bg};--sev-clr:${clr}">
              ${log.severity} <span class="health-sev-label">${SEV_LABELS[log.severity]}</span>
            </span>
          </div>
          ${chips ? `<div class="health-symp-chips">${chips}</div>` : ''}
          ${log.note ? `<p class="health-log-note">${escHtml(log.note)}</p>` : ''}
        </div>`;
    }).join('');

    return `
      <div class="health-detail">
        <div class="health-detail-header">
          <button class="health-detail-back"
                  onclick="Symptoms._closeDetail()">← Back</button>
          <div class="health-detail-title">
            <span class="health-issue-dot" style="background:${color}"></span>
            <div>
              <div class="health-detail-name">${escHtml(issue.name)}</div>
              <div class="health-detail-meta">${escHtml(issue.category)} · Since ${fmtDate(issue.start_date)}</div>
            </div>
          </div>
        </div>

        ${editSection}

        ${logs.length > 0 ? `
          <div class="health-detail-section">
            <p class="health-section-label">Severity over time</p>
            ${buildSeverityChart(logs)}
          </div>
          <div class="health-detail-section">
            <p class="health-section-label">Log history</p>
            <div class="health-detail-logs">${historyRows}</div>
          </div>` : '<p class="section-empty" style="margin-top:12px">No logs yet.</p>'}
      </div>`;
  }

  function buildDetailCatPills(cats, current) {
    return cats.map(cat => {
      const color  = catColor(cat);
      const active = cat === current ? ' health-detail-cat--active' : '';
      return `<button class="health-detail-cat${active}" type="button"
                      data-cat="${escHtml(cat)}" style="--cat-color:${color}"
                      onclick="Symptoms._setEditCat('${escHtml(cat)}')"
                      aria-pressed="${cat === current}">${escHtml(cat)}</button>`;
    }).join('');
  }

  function buildSeverityChart(logs) {
    if (logs.length === 0) return '';
    const data   = logs.slice(-60);
    const barW   = 28;
    const barGap = 5;
    const chartH = 80;
    const labelH = 22;
    const padX   = 6;
    const totalW = padX * 2 + data.length * (barW + barGap) - barGap;
    const svgH   = chartH + labelH;

    let bars   = '';
    let labels = '';

    data.forEach(({ date, log }, i) => {
      const x           = padX + i * (barW + barGap);
      const sev         = log.severity;
      const [, clr]     = SEV_STYLES[sev];
      const barH        = Math.max(6, Math.round((sev / 5) * chartH));
      const y           = chartH - barH;
      const numY        = Math.max(y - 3, 10);

      bars += `
        <rect x="${x}" y="${y}" width="${barW}" height="${barH}"
              rx="4" fill="${clr}" opacity="0.85"/>
        <text x="${x + barW / 2}" y="${numY}"
              text-anchor="middle" font-size="11" font-weight="700"
              fill="${clr}">${sev}</text>`;

      labels += `
        <text x="${x + barW / 2}" y="${chartH + 16}"
              text-anchor="middle" font-size="9"
              fill="var(--clr-text-2)">${fmtDate(date)}</text>`;
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

  // ── Form builders ─────────────────────────────────────────────────────────

  function buildSympPills(selected, prevSymptoms = []) {
    const prev = prevSymptoms.filter(s => COMMON_SYMPTOMS.includes(s));
    const rest = COMMON_SYMPTOMS.filter(s => !prev.includes(s));

    function pill(s, isPrev) {
      const active = selected.includes(s);
      return `<button class="health-symp-btn${active ? ' health-symp-btn--active' : ''}${isPrev ? ' health-symp-btn--prev' : ''}"
                      data-symptom="${escHtml(s)}"
                      onclick="Symptoms._toggleSymptom('${escHtml(s)}')"
                      aria-pressed="${active}">${escHtml(s)}</button>`;
    }

    if (prev.length === 0) {
      return `<div class="health-symp-grid">${COMMON_SYMPTOMS.map(s => pill(s, false)).join('')}</div>`;
    }

    return `
      <p class="health-symp-group-label">From last time</p>
      <div class="health-symp-grid">${prev.map(s => pill(s, true)).join('')}</div>
      <p class="health-symp-group-label">Other symptoms</p>
      <div class="health-symp-grid">${rest.map(s => pill(s, false)).join('')}</div>`;
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

  function buildNewIssueForm() {
    const cats = Data.getSettings().symptom_categories ?? Object.keys(CAT_COLORS);
    return `
      <div class="health-form">
        <div class="health-form-top">
          <span class="health-form-title">New Issue</span>
          <button class="health-cancel-btn" onclick="Symptoms._cancel()">Cancel</button>
        </div>
        <div class="health-form-field">
          <span class="health-form-label">Name <span class="health-req">*</span></span>
          <input class="health-text-input" type="text" aria-label="Issue name"
                 placeholder="e.g. Sinus congestion" maxlength="100"
                 value="${escHtml(fName)}"
                 oninput="Symptoms._setName(this.value)">
        </div>
        <div class="health-form-field">
          <span class="health-form-label">Category</span>
          <div class="health-form-cats">${buildCatPills(cats, fCat)}</div>
        </div>
        <div class="health-form-field">
          <span class="health-form-label">Symptoms <span class="health-opt">(optional)</span></span>
          ${buildSympPills(fSymptoms)}
        </div>
        <div class="health-form-field">
          <span class="health-form-label">Severity</span>
          <div class="health-form-sevs">${buildSevButtons(fSev)}</div>
        </div>
        <div class="health-form-field">
          <span class="health-form-label">Note <span class="health-opt">(optional)</span></span>
          <input class="health-text-input" type="text" aria-label="Note"
                 placeholder="Optional note…" maxlength="300"
                 value="${escHtml(fNote)}"
                 oninput="Symptoms._setNote(this.value)">
        </div>
        <label class="health-ongoing-row">
          <input type="checkbox" class="health-ongoing-check"
                 ${fOngoing ? 'checked' : ''}
                 onchange="Symptoms._setOngoing(this.checked)">
          <span>Mark as ongoing — will appear daily until resolved</span>
        </label>
        <div class="health-form-actions">
          <button class="health-save-btn" onclick="Symptoms._saveNew()">Save Issue</button>
        </div>
      </div>`;
  }

  function buildCheckInForm(issue) {
    const color        = catColor(issue.category);
    const prevSymptoms = getPrevSymptoms(issue.id);
    return `
      <div class="health-form health-form--checkin">
        <div class="health-form-top">
          <div class="health-form-issue-label">
            <span class="health-issue-dot" style="background:${color}"></span>
            <span>${escHtml(issue.name)}</span>
          </div>
          <button class="health-cancel-btn" onclick="Symptoms._cancel()">Cancel</button>
        </div>
        <div class="health-form-field">
          <span class="health-form-label">Symptoms today <span class="health-opt">(optional)</span></span>
          ${buildSympPills(fSymptoms, prevSymptoms)}
        </div>
        <div class="health-form-field">
          <span class="health-form-label">Severity</span>
          <div class="health-form-sevs">${buildSevButtons(fSev)}</div>
        </div>
        <div class="health-form-field">
          <span class="health-form-label">Note <span class="health-opt">(optional)</span></span>
          <input class="health-text-input" type="text" aria-label="Note"
                 placeholder="Optional note…" maxlength="300"
                 value="${escHtml(fNote)}"
                 oninput="Symptoms._setNote(this.value)">
        </div>
        <div class="health-form-actions health-form-actions--checkin">
          <button class="health-save-btn health-save-keep"
                  onclick="Symptoms._saveCheckIn('${issue.id}')">Save &amp; Keep Active</button>
          <button class="health-resolve-form-btn"
                  onclick="Symptoms._saveAndResolve('${issue.id}')">Save &amp; Resolve</button>
        </div>
      </div>`;
  }

  function buildEditForm(log, issue) {
    const color     = catColor(issue.category);
    const isOngoing = issue.ongoing;
    return `
      <div class="health-form health-form--edit">
        <div class="health-form-top">
          <div class="health-form-issue-label">
            <span class="health-issue-dot" style="background:${color}"></span>
            <span>Edit: ${escHtml(issue.name)}</span>
          </div>
          <button class="health-cancel-btn" onclick="Symptoms._cancel()">Cancel</button>
        </div>
        <div class="health-form-field">
          <span class="health-form-label">Symptoms <span class="health-opt">(optional)</span></span>
          ${buildSympPills(fSymptoms)}
        </div>
        <div class="health-form-field">
          <span class="health-form-label">Severity</span>
          <div class="health-form-sevs">${buildSevButtons(fSev)}</div>
        </div>
        <div class="health-form-field">
          <span class="health-form-label">Note <span class="health-opt">(optional)</span></span>
          <input class="health-text-input" type="text" aria-label="Note"
                 placeholder="Optional note…" maxlength="300"
                 value="${escHtml(fNote)}"
                 oninput="Symptoms._setNote(this.value)">
        </div>
        <div class="health-form-actions">
          <button class="health-save-btn"
                  onclick="Symptoms._saveEdit('${log.id}')">Update</button>
          ${isOngoing ? `<button class="health-resolve-form-btn"
                  onclick="Symptoms._resolve('${issue.id}')">Resolve Issue</button>` : ''}
        </div>
      </div>`;
  }

  // ── Form state transitions ────────────────────────────────────────────────

  function startNew() {
    const cats  = Data.getSettings().symptom_categories ?? Object.keys(CAT_COLORS);
    formMode    = 'new';
    formIssueId = null;
    formLogId   = null;
    fName       = '';
    fCat        = cats[0] ?? 'Other';
    fSymptoms   = [];
    fSev        = 3;
    fNote       = '';
    fOngoing    = false;
    render();
  }

  function startCheckIn(issueId) {
    formMode    = 'checkin';
    formIssueId = issueId;
    formLogId   = null;
    fSymptoms   = [];
    fSev        = getLastSeverity(issueId) ?? 3;
    fNote       = '';
    render();
  }

  function startEditLog(issueId, logId) {
    const log = getLogs(currentDate).find(l => l.id === logId);
    if (!log) return;
    formMode    = 'edit';
    formIssueId = issueId;
    formLogId   = logId;
    fSymptoms   = [...(log.symptoms ?? [])];
    fSev        = log.severity ?? 3;
    fNote       = log.note ?? '';
    render();
  }

  function cancel() {
    formMode    = null;
    formIssueId = null;
    formLogId   = null;
    render();
  }

  // ── Detail view transitions ───────────────────────────────────────────────

  function openDetail(issueId) {
    detailIssueId = issueId;
    detailEditing = false;
    formMode      = null;
    renderContent();
  }

  function closeDetail() {
    detailIssueId = null;
    detailEditing = false;
    renderContent();
  }

  function editIssue(issueId) {
    const issue = getIssues()[issueId];
    if (!issue) return;
    detailEditing = true;
    fEditName     = issue.name;
    fEditCat      = issue.category;
    renderContent();
  }

  function cancelIssueEdit() {
    detailEditing = false;
    renderContent();
  }

  function saveIssueEdit(issueId) {
    const name = fEditName.trim();
    if (!name) {
      const inp = document.querySelector('.health-detail-edit .health-text-input');
      if (inp) inp.classList.add('input--error');
      return;
    }
    const issue = getIssues()[issueId];
    if (!issue) return;
    issue.name     = name;
    issue.category = fEditCat;
    detailEditing  = false;
    scheduleSave();
    renderContent();
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  function saveNew() {
    const name = fName.trim();
    if (!name) {
      document.querySelector('.health-text-input')?.classList.add('input--error');
      return;
    }
    const issues  = getIssues();
    const issueId = crypto.randomUUID();
    issues[issueId] = {
      id:         issueId,
      name,
      category:   fCat,
      start_date: currentDate,
      end_date:   null,
      resolved:   false,
      ongoing:    fOngoing,
    };
    const day = Data.getDay(currentDate);
    if (!day.issue_logs) day.issue_logs = [];
    day.issue_logs.push({
      id:       crypto.randomUUID(),
      issue_id: issueId,
      symptoms: [...fSymptoms],
      severity: fSev,
      note:     fNote.trim(),
    });
    formMode = null;
    scheduleSave();
    render();
  }

  function saveCheckIn(issueId) {
    const day = Data.getDay(currentDate);
    if (!day.issue_logs) day.issue_logs = [];
    day.issue_logs.push({
      id:       crypto.randomUUID(),
      issue_id: issueId,
      symptoms: [...fSymptoms],
      severity: fSev,
      note:     fNote.trim(),
    });
    formMode    = null;
    formIssueId = null;
    scheduleSave();
    render();
  }

  function saveAndResolve(issueId) {
    const day = Data.getDay(currentDate);
    if (!day.issue_logs) day.issue_logs = [];
    day.issue_logs.push({
      id:       crypto.randomUUID(),
      issue_id: issueId,
      symptoms: [...fSymptoms],
      severity: fSev,
      note:     fNote.trim(),
    });
    const issue = getIssues()[issueId];
    if (issue) { issue.resolved = true; issue.end_date = currentDate; }
    formMode    = null;
    formIssueId = null;
    scheduleSave();
    render();
  }

  function saveEdit(logId) {
    const log = getLogs(currentDate).find(l => l.id === logId);
    if (log) {
      log.symptoms = [...fSymptoms];
      log.severity = fSev;
      log.note     = fNote.trim();
    }
    formMode  = null;
    formLogId = null;
    scheduleSave();
    render();
  }

  function deleteLog(logId) {
    const day = Data.getDay(currentDate);
    if (!day.issue_logs) return;
    day.issue_logs = day.issue_logs.filter(l => l.id !== logId);
    scheduleSave();
    render();
  }

  function resolveIssue(issueId) {
    const issue = getIssues()[issueId];
    if (!issue) return;
    issue.resolved = true;
    issue.end_date = currentDate;
    formMode    = null;
    formIssueId = null;
    scheduleSave();
    render();
  }

  // ── Inline onclick bridges ────────────────────────────────────────────────

  function _startNew()              { startNew(); }
  function _startCheckIn(id)        { startCheckIn(id); }
  function _startEditLog(iid, lid)  { startEditLog(iid, lid); }
  function _cancel()                { cancel(); }
  function _saveNew()               { saveNew(); }
  function _saveCheckIn(id)         { saveCheckIn(id); }
  function _saveAndResolve(id)      { saveAndResolve(id); }
  function _saveEdit(lid)           { saveEdit(lid); }
  function _deleteLog(lid)          { deleteLog(lid); }
  function _resolve(id)             { resolveIssue(id); }

  function _setName(v)    { fName = v; }
  function _setNote(v)    { fNote = v; }
  function _setOngoing(v) { fOngoing = v; }

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

  function _toggleSymptom(s) {
    const idx = fSymptoms.indexOf(s);
    if (idx >= 0) fSymptoms.splice(idx, 1);
    else          fSymptoms.push(s);
    document.querySelectorAll('.health-symp-btn').forEach(b => {
      const on = fSymptoms.includes(b.dataset.symptom);
      b.classList.toggle('health-symp-btn--active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  // Detail view bridges
  function _openDetail(id)        { openDetail(id); }
  function _closeDetail()         { closeDetail(); }
  function _editIssue(id)         { editIssue(id); }
  function _cancelIssueEdit()     { cancelIssueEdit(); }
  function _saveIssueEdit(id)     { saveIssueEdit(id); }
  function _setEditName(v)        { fEditName = v; }
  function _setEditCat(v) {
    fEditCat = v;
    document.querySelectorAll('.health-detail-cat').forEach(b => {
      const on = b.dataset.cat === v;
      b.classList.toggle('health-detail-cat--active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  // ── Category manager ──────────────────────────────────────────────────────

  function toggleCatManager() {
    managingCategories = !managingCategories;
    editingCatIdx = -1;
    fCatEditName  = '';
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
        <span>Categories</span>
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
      Object.values(Data.getData().days).forEach(day => {
        (day.issue_logs ?? []).forEach(log => {
          const iss = Data.getData().issues?.[log.issue_id];
          if (iss && iss.category === oldName) iss.category = newName;
        });
      });
      Object.values(Data.getData().issues ?? {}).forEach(iss => {
        if (iss.category === oldName) iss.category = newName;
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
    formMode           = null;
    formIssueId        = null;
    formLogId          = null;
    managingCategories = false;
    editingCatIdx      = -1;
    detailIssueId      = null;
    detailEditing      = false;
    currentDate        = date;
    render();
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
        console.error('Health save failed:', err);
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

  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    init, render, setDate,
    _startNew, _startCheckIn, _startEditLog, _cancel,
    _saveNew, _saveCheckIn, _saveAndResolve, _saveEdit, _deleteLog, _resolve,
    _setName, _setNote, _setOngoing, _setCat, _setSev, _toggleSymptom,
    _openDetail, _closeDetail, _editIssue, _cancelIssueEdit, _saveIssueEdit,
    _setEditName, _setEditCat,
  };
})();
