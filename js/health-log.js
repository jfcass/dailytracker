/**
 * health-log.js — Health Log tab
 *
 * Renders into #health-log-content.
 * Shows all ongoing_issues grouped by active/resolved.
 * Clicking an issue → detail view with symptom history, edit, resolve, delete.
 */
const HealthLog = (() => {

  // null = list view; string = issue id currently open in detail view
  let detailId        = null;
  let showResolveForm = false;
  let showEditForm    = false;

  // ── Helpers ─────────────────────────────────────────────────────────────────────────────

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(dateStr) {
    if (!dateStr) return '';
    const [y, mo, d] = dateStr.split('-').map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  function today() { return Data.today(); }

  const SEV_STYLES = [
    null,
    ['#e8f5e9', '#2e7d32'],
    ['#f1f8e9', '#558b2f'],
    ['#fff8e1', '#f57f17'],
    ['#fbe9e7', '#bf360c'],
    ['#ffebee', '#c62828'],
  ];
  const SEV_LABELS = ['', 'Mild', 'Low', 'Moderate', 'High', 'Severe'];

  function getIssues() {
    return Object.values(Data.getData().issues ?? {});
  }

  function getSymptomsForIssue(issueId) {
    const days = Data.getData().days ?? {};
    const results = [];
    Object.entries(days).forEach(([date, day]) => {
      (day.issue_logs ?? []).forEach(l => {
        if (l.issue_id === issueId) results.push({ ...l, date });
      });
    });
    results.sort((a, b) => b.date.localeCompare(a.date));
    return results;
  }

  function countSymptoms(issueId) {
    return getSymptomsForIssue(issueId).length;
  }

  function buildSeverityChart(symptoms) {
    if (!symptoms.length) return '';
    // symptoms is newest-first; chart shows oldest→newest, capped at 60
    const data   = symptoms.slice().reverse().slice(-60);
    const barW   = 28;
    const barGap = 5;
    const chartH = 80;
    const labelH = 22;
    const padX   = 6;
    const totalW = padX * 2 + data.length * (barW + barGap) - barGap;
    const svgH   = chartH + labelH;

    let bars   = '';
    let labels = '';

    data.forEach((s, i) => {
      const x       = padX + i * (barW + barGap);
      const sev     = s.severity;
      const [, clr] = SEV_STYLES[sev] ?? SEV_STYLES[3];
      const barH    = Math.max(6, Math.round((sev / 5) * chartH));
      const y       = chartH - barH;
      const numY    = Math.max(y - 3, 10);

      bars += `
        <rect x="${x}" y="${y}" width="${barW}" height="${barH}"
              rx="4" fill="${clr}" opacity="0.85"/>
        <text x="${x + barW / 2}" y="${numY}"
              text-anchor="middle" font-size="11" font-weight="700"
              fill="${clr}">${sev}</text>`;

      labels += `
        <text x="${x + barW / 2}" y="${chartH + 16}"
              text-anchor="middle" font-size="9"
              fill="var(--clr-text-2)">${fmtDate(s.date)}</text>`;
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

  // ── Rendering ─────────────────────────────────────────────────────────────────────────────

  function init() { render(); }

  function render() {
    const container = document.getElementById('health-log-content');
    if (!container) return;
    container.innerHTML = detailId ? renderDetail(detailId) : renderList();
  }

  function renderList() {
    const issues   = getIssues();
    const active   = issues.filter(i => !i.resolved)
                           .sort((a, b) => b.start_date.localeCompare(a.start_date));
    const resolved = issues.filter(i =>  i.resolved)
                           .sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? ''));

    let html = `<div class="hl-tab-header"><h2 class="hl-tab-title">Health Log</h2></div>`;

    if (!issues.length) {
      return html + `<p class="hl-empty">No ongoing issues yet. Add one from the Health section on Today.</p>`;
    }
    if (active.length) {
      html += `<p class="hl-group-label">Active</p>`;
      html += active.map(issueRow).join('');
    }
    if (resolved.length) {
      html += `<p class="hl-group-label">Resolved</p>`;
      html += resolved.map(issueRow).join('');
    }
    return html;
  }

  function issueRow(issue) {
    const count     = countSymptoms(issue.id);
    const dateRange = issue.resolved
      ? `${fmtDate(issue.start_date)} → ${fmtDate(issue.end_date)}`
      : `Since ${fmtDate(issue.start_date)}`;
    return `<div class="hl-issue-row" onclick="HealthLog._openDetail('${issue.id}')">
      <span class="hl-cat-badge">${escHtml(issue.category)}</span>
      <span class="hl-issue-title">${escHtml(issue.name)}</span>
      <span class="hl-issue-meta">${dateRange}<br>${count} entr${count === 1 ? 'y' : 'ies'}</span>
    </div>`;
  }

  function renderDetail(issueId) {
    const issue = (Data.getData().issues ?? {})[issueId];
    if (!issue) { detailId = null; return renderList(); }

    const symptoms   = getSymptomsForIssue(issueId);
    const dateRange  = issue.resolved
      ? `${fmtDate(issue.start_date)} → ${fmtDate(issue.end_date)}`
      : `Since ${fmtDate(issue.start_date)}`;
    const categories = Data.getSettings().symptom_categories ?? [];

    let html = `<div class="hl-detail">
      <button class="hl-detail-back" onclick="HealthLog._back()">← Back to Health Log</button>
      <div class="hl-detail-header">
        <p class="hl-detail-sub">${escHtml(issue.category)}</p>
        <h2 class="hl-detail-title">${escHtml(issue.name)}</h2>
        <p class="hl-detail-sub">${dateRange} · ${symptoms.length} symptom entr${symptoms.length === 1 ? 'y' : 'ies'}</p>
      </div>`;

    if (showEditForm) {
      html += `<div class="hl-edit-form">
        <div><label class="hl-edit-label">Name</label>
          <input id="hl-edit-title" class="hl-edit-input" type="text" value="${escHtml(issue.name)}"></div>
        <div><label class="hl-edit-label">Category</label>
          <select id="hl-edit-cat" class="hl-edit-select">
            ${categories.map(c => `<option value="${escHtml(c)}"${c === issue.category ? ' selected' : ''}>${escHtml(c)}</option>`).join('')}
          </select></div>
        <div><label class="hl-edit-label">Start Date</label>
          <input id="hl-edit-start" class="hl-edit-input" type="date" value="${escHtml(issue.start_date ?? '')}"></div>
        <div class="hl-edit-actions">
          <button class="hl-edit-save-btn" onclick="HealthLog._saveEdit('${issueId}')">Save</button>
          <button class="hl-edit-cancel-btn" onclick="HealthLog._cancelEdit()">Cancel</button>
        </div>
      </div>`;
    } else if (showResolveForm) {
      html += `<div class="hl-resolve-form">
        <span style="font-size:0.85rem;color:var(--clr-text-2)">Resolved on:</span>
        <input id="hl-resolve-date" class="hl-resolve-date-input" type="date" value="${today()}">
        <button class="hl-resolve-confirm-btn" onclick="HealthLog._confirmResolve('${issueId}')">Confirm</button>
        <button class="hl-resolve-cancel-btn" onclick="HealthLog._cancelResolve()">Cancel</button>
      </div>`;
    } else {
      html += `<div class="hl-detail-actions">
        <button onclick="HealthLog._startEdit('${issueId}')">Edit</button>
        ${issue.resolved
          ? `<button onclick="HealthLog._reopen('${issueId}')">Reopen</button>`
          : `<button class="hl-resolve-btn" onclick="HealthLog._startResolve()">Mark Resolved</button>`}
        <button class="hl-delete-btn" onclick="HealthLog._deleteIssue('${issueId}')">Delete</button>
      </div>`;
    }

    if (!symptoms.length) {
      html += `<p class="hl-history-heading">Symptom History</p>
               <p class="hl-no-history">No symptoms logged against this issue yet.</p>`;
    } else {
      const historyRows = symptoms.map(s => {
        const [bg, clr] = SEV_STYLES[s.severity] ?? SEV_STYLES[3];
        const label     = s.date === today() ? 'Today' : fmtDate(s.date);
        const chips     = (s.symptoms ?? [])
          .map(sym => `<span class="health-symp-chip">${escHtml(sym)}</span>`).join('');
        return `
          <div class="health-detail-log-row">
            <div class="health-detail-log-top">
              <span class="health-detail-log-date">${label}</span>
              <span class="health-sev-badge" style="--sev-bg:${bg};--sev-clr:${clr}">
                ${s.severity} <span class="health-sev-label">${SEV_LABELS[s.severity]}</span>
              </span>
            </div>
            ${chips ? `<div class="health-symp-chips">${chips}</div>` : ''}
            ${s.note ? `<p class="health-log-note">${escHtml(s.note)}</p>` : ''}
          </div>`;
      }).join('');

      html += `
        <div class="health-detail-section">
          <p class="health-section-label">Severity over time</p>
          ${buildSeverityChart(symptoms)}
        </div>
        <div class="health-detail-section">
          <p class="health-section-label">Log history</p>
          <div class="health-detail-logs">${historyRows}</div>
        </div>`;
    }

    html += `</div>`;
    return html;
  }

  // ── Public bridge handlers ─────────────────────────────────────────────────────────────────────

  function _openDetail(id)  { detailId = id; showResolveForm = false; showEditForm = false; render(); }
  function _back()          { detailId = null; showResolveForm = false; showEditForm = false; render(); }
  function _startResolve()  { showResolveForm = true;  showEditForm = false; render(); }
  function _cancelResolve() { showResolveForm = false; render(); }
  function _startEdit()     { showEditForm = true;  showResolveForm = false; render(); }
  function _cancelEdit()    { showEditForm = false; render(); }

  async function _confirmResolve(issueId) {
    const dateInput = document.getElementById('hl-resolve-date');
    const endDate   = dateInput?.value ?? today();
    const issue     = (Data.getData().issues ?? {})[issueId];
    if (!issue) return;
    issue.end_date  = endDate;
    issue.resolved  = true;
    showResolveForm = false;
    await Data.save();
    render();
  }

  async function _reopen(issueId) {
    const issue = (Data.getData().issues ?? {})[issueId];
    if (!issue) return;
    issue.end_date = null;
    issue.resolved = false;
    await Data.save();
    render();
  }

  async function _saveEdit(issueId) {
    const issue    = (Data.getData().issues ?? {})[issueId];
    if (!issue) return;
    const name     = document.getElementById('hl-edit-title')?.value.trim();
    const category = document.getElementById('hl-edit-cat')?.value;
    const start    = document.getElementById('hl-edit-start')?.value;
    if (name)     issue.name       = name;
    if (category) issue.category   = category;
    if (start)    issue.start_date = start;
    showEditForm = false;
    await Data.save();
    render();
  }

  async function _deleteIssue(issueId) {
    if (!confirm('Delete this issue? Its log entries will remain but will no longer be linked.')) return;
    delete (Data.getData().issues ?? {})[issueId];
    detailId = null;
    await Data.save();
    render();
  }

  // ── Public API ─────────────────────────────────────────────────────────────────────────────

  return {
    init, render,
    _openDetail, _back,
    _startResolve, _cancelResolve, _confirmResolve,
    _reopen,
    _startEdit, _cancelEdit, _saveEdit,
    _deleteIssue,
  };
})();
