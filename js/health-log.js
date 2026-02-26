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

  const SEV_COLORS = ['', '#4caf50', '#8bc34a', '#ffc107', '#ff5722', '#f44336'];
  const SEV_LABELS = ['', 'Mild', 'Low', 'Moderate', 'High', 'Severe'];

  function getIssues() {
    return Object.values(Data.getData().ongoing_issues ?? {});
  }

  function getSymptomsForIssue(issueId) {
    const days = Data.getData().days ?? {};
    const results = [];
    Object.entries(days).forEach(([date, day]) => {
      (day.symptoms ?? []).forEach(s => {
        if (s.issue_id === issueId) results.push({ ...s, date });
      });
    });
    results.sort((a, b) => b.date.localeCompare(a.date));
    return results;
  }

  function countSymptoms(issueId) {
    return getSymptomsForIssue(issueId).length;
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
      <span class="hl-issue-title">${escHtml(issue.title)}</span>
      <span class="hl-issue-meta">${dateRange}<br>${count} entr${count === 1 ? 'y' : 'ies'}</span>
    </div>`;
  }

  function renderDetail(issueId) {
    const issue = (Data.getData().ongoing_issues ?? {})[issueId];
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
        <h2 class="hl-detail-title">${escHtml(issue.title)}</h2>
        <p class="hl-detail-sub">${dateRange} · ${symptoms.length} symptom entr${symptoms.length === 1 ? 'y' : 'ies'}</p>
        ${issue.notes ? `<p class="hl-detail-sub" style="margin-top:6px">${escHtml(issue.notes)}</p>` : ''}
      </div>`;

    if (showEditForm) {
      html += `<div class="hl-edit-form">
        <div><label class="hl-edit-label">Title</label>
          <input id="hl-edit-title" class="hl-edit-input" type="text" value="${escHtml(issue.title)}"></div>
        <div><label class="hl-edit-label">Category</label>
          <select id="hl-edit-cat" class="hl-edit-select">
            ${categories.map(c => `<option value="${escHtml(c)}"${c === issue.category ? ' selected' : ''}>${escHtml(c)}</option>`).join('')}
          </select></div>
        <div><label class="hl-edit-label">Start Date</label>
          <input id="hl-edit-start" class="hl-edit-input" type="date" value="${escHtml(issue.start_date ?? '')}"></div>
        <div><label class="hl-edit-label">Notes</label>
          <input id="hl-edit-notes" class="hl-edit-input" type="text" value="${escHtml(issue.notes ?? '')}"></div>
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

    html += `<p class="hl-history-heading">Symptom History</p>`;
    if (!symptoms.length) {
      html += `<p class="hl-no-history">No symptoms logged against this issue yet.</p>`;
    } else {
      html += symptoms.map(s => {
        const color   = SEV_COLORS[s.severity] ?? '#ccc';
        const label   = SEV_LABELS[s.severity] ?? '';
        const timeStr = s.time ? ` · ${s.time}` : '';
        return `<div class="hl-symptom-row">
          <div class="hl-sev-dot" style="background:${color}"></div>
          <div class="hl-symptom-body">
            <div class="hl-symptom-date">${fmtDate(s.date)}${timeStr}</div>
            ${s.description ? `<div class="hl-symptom-desc">${escHtml(s.description)}</div>` : ''}
            <div class="hl-symptom-sev-label">Severity ${s.severity} — ${label}</div>
          </div>
        </div>`;
      }).join('');
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
    const issue     = (Data.getData().ongoing_issues ?? {})[issueId];
    if (!issue) return;
    issue.end_date  = endDate;
    issue.resolved  = true;
    showResolveForm = false;
    await Data.save();
    render();
  }

  async function _reopen(issueId) {
    const issue = (Data.getData().ongoing_issues ?? {})[issueId];
    if (!issue) return;
    issue.end_date = null;
    issue.resolved = false;
    await Data.save();
    render();
  }

  async function _saveEdit(issueId) {
    const issue    = (Data.getData().ongoing_issues ?? {})[issueId];
    if (!issue) return;
    const title    = document.getElementById('hl-edit-title')?.value.trim();
    const category = document.getElementById('hl-edit-cat')?.value;
    const start    = document.getElementById('hl-edit-start')?.value;
    const notes    = document.getElementById('hl-edit-notes')?.value.trim();
    if (title)    issue.title      = title;
    if (category) issue.category   = category;
    if (start)    issue.start_date = start;
    issue.notes  = notes ?? '';
    showEditForm = false;
    await Data.save();
    render();
  }

  async function _deleteIssue(issueId) {
    if (!confirm('Delete this issue? Its symptom entries will remain but will no longer be linked.')) return;
    delete (Data.getData().ongoing_issues ?? {})[issueId];
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
