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

  // Blood Pressure form
  let bpFormMode = null;   // null | 'add' | 'edit'
  let bpEditId   = null;
  let fBpDate    = '';
  let fBpTime    = '';
  let fBpSys     = '';
  let fBpDia     = '';
  let fBpPulse   = '';
  let fBpCtx     = 'At Rest';
  let fBpNotes   = '';

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
  const SEV_CHART_COLORS = { 1: '#4caf50', 2: '#8bc34a', 3: '#ffc107', 4: '#ff5722', 5: '#f44336' };

  const CAT_COLORS = {
    'Headache': '#8b5cf6', 'Fever': '#ef4444', 'Fatigue': '#f97316',
    'Nausea': '#f59e0b',   'Diarrhea': '#10b981', 'Other': '#6b7280',
    'Eyes': '#3b82f6', 'Body Pain': '#f97316', 'GI': '#f59e0b', 'Headaches': '#8b5cf6',
  };
  const PALETTE = ['#3b82f6','#f97316','#f59e0b','#8b5cf6','#6b7280','#ec4899','#10b981','#ef4444','#06b6d4','#84cc16'];
  function catColor(cat) {
    if (!cat) return '#6b7280';
    if (CAT_COLORS[cat]) return CAT_COLORS[cat];
    let h = 0;
    for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) | 0;
    return PALETTE[Math.abs(h) % PALETTE.length];
  }

  function getIssues() {
    return Object.values(Data.getData().issues ?? {});
  }

  function getSymptomsForIssue(issueId) {
    const days = Data.getData().days ?? {};
    const results = [];

    Object.entries(days).forEach(([date, day]) => {
      // Modern schema: day.issue_logs — { issue_id, symptoms[], severity, note }
      (day.issue_logs ?? []).forEach(l => {
        if (l.issue_id !== issueId) return;
        results.push({
          id:       null,
          source:   'issue_logs',
          date,
          severity: l.severity,
          chips:    l.symptoms ?? [],
          note:     l.note ?? '',
          time:     null,
        });
      });

      // Legacy schema: day.symptoms — { id, issue_id, category, severity, description, time }
      (day.symptoms ?? []).forEach(s => {
        if (s.issue_id !== issueId) return;
        results.push({
          id:       s.id ?? null,
          source:   'symptoms',
          date,
          severity: s.severity,
          chips:    s.category ? [s.category] : [],
          note:     s.description ?? '',
          time:     s.time ?? null,
        });
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

    // Group by date (symptoms is newest-first; we want oldest→newest)
    const byDate = new Map();
    symptoms.slice().reverse().forEach(entry => {
      if (!byDate.has(entry.date)) byDate.set(entry.date, []);
      byDate.get(entry.date).push(entry);
    });

    // Take last 60 unique dates (already ascending after reverse)
    const dates  = [...byDate.keys()].slice(-60);
    const barW   = 28;
    const barGap = 5;
    const chartH = 80;
    const labelH = 22;
    const padX   = 6;
    const totalW = padX * 2 + dates.length * (barW + barGap) - barGap;
    const svgH   = chartH + labelH;

    let bars = '', labels = '';

    dates.forEach((date, i) => {
      const entries   = byDate.get(date);
      const x         = padX + i * (barW + barGap);
      const totalSev  = entries.reduce((acc, e) => acc + (e.severity ?? 3), 0);
      const avgSev    = totalSev / entries.length;
      const totalBarH = Math.max(6, Math.round((avgSev / 5) * chartH));

      // Stack segments bottom-to-top, each proportional to its sev share
      let stackY = chartH;
      entries.forEach(e => {
        const sev   = e.severity ?? 3;
        const segH  = Math.max(2, Math.round((sev / totalSev) * totalBarH));
        stackY     -= segH;
        const color = SEV_CHART_COLORS[sev] ?? '#6b7280';
        const cat   = e.chips[0] ?? '';
        const tip   = `${fmtDate(date)}${e.time ? ' · ' + e.time : ''}\nSeverity: ${sev} (${SEV_LABELS[sev]})${cat ? '\n' + cat : ''}${e.note ? '\n' + e.note : ''}`;
        bars += `<rect x="${x}" y="${stackY}" width="${barW}" height="${segH}" fill="${color}" opacity="0.88"><title>${escHtml(tip)}</title></rect>`;
      });

      // Transparent rounded overlay for the full bar (summary tooltip on hover)
      const tipAll = `${fmtDate(date)} — ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}, avg severity ${avgSev.toFixed(1)}`;
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

  // ── Rendering ─────────────────────────────────────────────────────────────────────────────

  function init() { render(); }

  function render() {
    const container = document.getElementById('health-log-content');
    if (!container) return;
    container.innerHTML = detailId ? renderDetail(detailId) : renderList();
  }

  function renderList() {
    return `<div class="hl-tab-header"><h2 class="hl-tab-title">Health Log</h2></div>`
      + renderBPSection()
      + renderDigestionSection()
      + renderIssuesSection();
  }

  // ── Section: Blood Pressure ───────────────────────────────────────────────────────────────

  const BP_CTX_OPTIONS = ['At Rest', 'Mid-Treatment', 'Post-Treatment'];
  const BP_CTX_COLORS  = {
    'At Rest':         'var(--clr-accent)',
    'Mid-Treatment':   '#f57f17',
    'Post-Treatment':  '#1565c0',
  };

  function renderBPSection() {
    const bpEntries = (Data.getData().blood_pressure ?? [])
      .slice()
      .sort((a, b) => {
        const dc = b.date.localeCompare(a.date);
        return dc !== 0 ? dc : (b.time ?? '').localeCompare(a.time ?? '');
      });

    let formHtml = '';
    if (bpFormMode) {
      const title = bpFormMode === 'edit' ? 'Edit Reading' : 'Add Reading';
      formHtml = `
        <div class="hl-bp-form">
          <div class="hl-bp-form-row">
            <div class="hl-bp-form-field">
              <label class="hl-edit-label">Date</label>
              <input class="hl-edit-input" type="date" value="${escHtml(fBpDate)}"
                     oninput="HealthLog._setBpDate(this.value)">
            </div>
            <div class="hl-bp-form-field">
              <label class="hl-edit-label">Time (optional)</label>
              <input class="hl-edit-input" type="time" value="${escHtml(fBpTime)}"
                     oninput="HealthLog._setBpTime(this.value)">
            </div>
          </div>
          <div class="hl-bp-form-row">
            <div class="hl-bp-form-field">
              <label class="hl-edit-label">Systolic</label>
              <input class="hl-edit-input" type="number" placeholder="120"
                     value="${escHtml(fBpSys)}" oninput="HealthLog._setBpSys(this.value)">
            </div>
            <div class="hl-bp-form-field">
              <label class="hl-edit-label">Diastolic</label>
              <input class="hl-edit-input" type="number" placeholder="80"
                     value="${escHtml(fBpDia)}" oninput="HealthLog._setBpDia(this.value)">
            </div>
            <div class="hl-bp-form-field">
              <label class="hl-edit-label">Pulse (optional)</label>
              <input class="hl-edit-input" type="number" placeholder="72"
                     value="${escHtml(fBpPulse)}" oninput="HealthLog._setBpPulse(this.value)">
            </div>
          </div>
          <div>
            <label class="hl-edit-label">Context</label>
            <select class="hl-edit-select" onchange="HealthLog._setBpCtx(this.value)">
              ${BP_CTX_OPTIONS.map(opt =>
                `<option value="${escHtml(opt)}"${fBpCtx === opt ? ' selected' : ''}>${escHtml(opt)}</option>`
              ).join('')}
            </select>
          </div>
          <div>
            <label class="hl-edit-label">Notes (optional)</label>
            <input class="hl-edit-input" type="text" placeholder="e.g. after morning walk"
                   value="${escHtml(fBpNotes)}" oninput="HealthLog._setBpNotes(this.value)">
          </div>
          <div class="hl-edit-actions">
            <button class="hl-edit-save-btn" onclick="HealthLog._saveBP()">${title === 'Edit Reading' ? 'Save' : 'Add'}</button>
            <button class="hl-edit-cancel-btn" onclick="HealthLog._cancelBP()">Cancel</button>
          </div>
        </div>`;
    }

    let listHtml = '';
    if (bpEntries.length) {
      listHtml = bpEntries.map(e => {
        const ctxColor = BP_CTX_COLORS[e.context] ?? 'var(--clr-text-2)';
        return `<div class="hl-bp-entry">
          <span class="hl-bp-date">${fmtDate(e.date)}</span>
          ${e.time ? `<span class="hl-bp-time">${escHtml(e.time)}</span>` : ''}
          <span class="hl-bp-reading">${escHtml(String(e.systolic))}/${escHtml(String(e.diastolic))}</span>
          ${e.pulse != null && e.pulse !== '' ? `<span class="hl-bp-pulse">${escHtml(String(e.pulse))} bpm</span>` : ''}
          <span class="hl-bp-ctx-badge" style="--ctx-clr:${ctxColor}">${escHtml(e.context ?? '')}</span>
          ${e.notes ? `<span class="hl-bp-notes">${escHtml(e.notes)}</span>` : ''}
          <span class="hl-bp-actions">
            <button class="hl-bp-edit-btn" onclick="HealthLog._editBP('${e.id}')">Edit</button>
            <button class="hl-bp-del-btn" onclick="HealthLog._deleteBP('${e.id}')">Delete</button>
          </span>
        </div>`;
      }).join('');
    } else if (!bpFormMode) {
      listHtml = `<p class="hl-empty" style="margin-top:8px">No blood pressure readings yet.</p>`;
    }

    return `<div class="hl-bp-section">
      <div class="hl-section-header">
        <span class="hl-section-title">Blood Pressure</span>
        ${!bpFormMode ? `<button class="hl-section-add-btn" onclick="HealthLog._addBP()">+ Add</button>` : ''}
      </div>
      ${formHtml}
      <div class="hl-bp-list">${listHtml}</div>
    </div>`;
  }

  // ── BP CRUD ───────────────────────────────────────────────────────────────────────────────

  function startAddBP() {
    bpFormMode = 'add';
    bpEditId   = null;
    const now  = new Date();
    fBpDate    = today();
    fBpTime    = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    fBpSys     = '120';
    fBpDia     = '80';
    fBpPulse   = '72';
    fBpCtx     = 'At Rest';
    fBpNotes   = '';
    render();
  }

  function startEditBP(id) {
    const entry = (Data.getData().blood_pressure ?? []).find(e => e.id === id);
    if (!entry) return;
    bpFormMode = 'edit';
    bpEditId   = id;
    fBpDate    = entry.date    ?? today();
    fBpTime    = entry.time    ?? '';
    fBpSys     = String(entry.systolic  ?? '');
    fBpDia     = String(entry.diastolic ?? '');
    fBpPulse   = entry.pulse != null ? String(entry.pulse) : '';
    fBpCtx     = entry.context ?? 'At Rest';
    fBpNotes   = entry.notes   ?? '';
    render();
  }

  function cancelBP() {
    bpFormMode = null;
    bpEditId   = null;
    render();
  }

  async function saveBP() {
    const sys = parseInt(fBpSys, 10);
    const dia = parseInt(fBpDia, 10);
    if (!fBpSys || !fBpDia || isNaN(sys) || isNaN(dia)) {
      alert('Systolic and diastolic readings are required.');
      return;
    }
    const d = Data.getData();
    if (!Array.isArray(d.blood_pressure)) d.blood_pressure = [];

    if (bpFormMode === 'edit') {
      const idx = d.blood_pressure.findIndex(e => e.id === bpEditId);
      if (idx !== -1) {
        d.blood_pressure[idx] = {
          ...d.blood_pressure[idx],
          date:      fBpDate || today(),
          time:      fBpTime  || null,
          systolic:  sys,
          diastolic: dia,
          pulse:     fBpPulse !== '' ? parseInt(fBpPulse, 10) : null,
          context:   fBpCtx,
          notes:     fBpNotes,
        };
      }
    } else {
      d.blood_pressure.push({
        id:        crypto.randomUUID(),
        date:      fBpDate || today(),
        time:      fBpTime  || null,
        systolic:  sys,
        diastolic: dia,
        pulse:     fBpPulse !== '' ? parseInt(fBpPulse, 10) : null,
        context:   fBpCtx,
        notes:     fBpNotes,
      });
    }

    bpFormMode = null;
    bpEditId   = null;
    await Data.save();
    render();
  }

  async function deleteBP(id) {
    if (!confirm('Delete this blood pressure reading?')) return;
    const d = Data.getData();
    d.blood_pressure = (d.blood_pressure ?? []).filter(e => e.id !== id);
    await Data.save();
    render();
  }

  // ── BP bridge functions ────────────────────────────────────────────────────────────────────

  function _addBP()              { startAddBP(); }
  function _editBP(id)           { startEditBP(id); }
  function _cancelBP()           { cancelBP(); }
  async function _saveBP()       { await saveBP(); }
  async function _deleteBP(id)   { await deleteBP(id); }
  function _setBpDate(v)         { fBpDate  = v; }
  function _setBpTime(v)         { fBpTime  = v; }
  function _setBpSys(v)          { fBpSys   = v; }
  function _setBpDia(v)          { fBpDia   = v; }
  function _setBpPulse(v)        { fBpPulse = v; }
  function _setBpCtx(v)          { fBpCtx   = v; }
  function _setBpNotes(v)        { fBpNotes = v; }

  // ── Section: Issues ───────────────────────────────────────────────────────────────────────

  function renderIssuesSection() {
    const issues   = getIssues();
    const active   = issues.filter(i => !i.resolved)
                           .sort((a, b) => b.start_date.localeCompare(a.start_date));
    const resolved = issues.filter(i =>  i.resolved)
                           .sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? ''));

    let html = `<div class="hl-issues-section">
      <div class="hl-section-header"><span class="hl-section-title">Issues</span></div>`;

    if (!issues.length) {
      html += `<p class="hl-empty">No ongoing issues yet. Add one from the Health section on Today.</p>`;
    } else {
      if (active.length) {
        html += `<p class="hl-group-label">Active</p>`;
        html += active.map(issueRow).join('');
      }
      if (resolved.length) {
        html += `<p class="hl-group-label">Resolved</p>`;
        html += resolved.map(issueRow).join('');
      }
    }
    html += `</div>`;
    return html;
  }

  // ── Section: Digestion ─────────────────────────────────────────────────────────────────────

  const BWL_COLORS = { 1: '#8B6240', 2: '#C09040', 3: '#1ABEA5', 4: '#E89020', 5: '#E05030' };
  const BWL_LABELS = { 1: 'Hard', 2: 'Firm', 3: 'Normal', 4: 'Soft', 5: 'Watery' };

  function renderDigestionSection() {
    const allDays = Data.getData().days ?? {};
    const entries = [];
    Object.entries(allDays).forEach(([date, day]) => {
      (day.bowel ?? []).forEach(e => entries.push({ ...e, date }));
    });
    entries.sort((a, b) => {
      const dc = b.date.localeCompare(a.date);
      if (dc !== 0) return dc;
      return (b.time ?? '').localeCompare(a.time ?? '');
    });

    const cutoff  = new Date();
    cutoff.setDate(cutoff.getDate() - 6);
    const cutStr  = cutoff.toISOString().slice(0, 10);
    const recent  = entries.filter(e => e.date >= cutStr).length;
    const lastEntry = entries[0];

    let summary = `${recent} entr${recent === 1 ? 'y' : 'ies'} in the last 7 days`;
    if (lastEntry) {
      const qLabel = BWL_LABELS[lastEntry.quality] ?? '';
      summary += ` · Last: ${fmtDate(lastEntry.date)}${qLabel ? ' ' + qLabel : ''}`;
    }

    let rows = '';
    if (entries.length) {
      rows = entries.map(e => {
        const color  = BWL_COLORS[e.quality] ?? '#6b7280';
        const label  = BWL_LABELS[e.quality] ?? '';
        return `<div class="hl-dig-entry">
          <span class="hl-dig-date">${fmtDate(e.date)}</span>
          ${e.time ? `<span class="hl-dig-time">${escHtml(e.time)}</span>` : ''}
          <span class="hl-dig-quality-chip" style="--q-clr:${color}">${escHtml(label)}</span>
          ${e.notes ? `<span class="hl-dig-notes">${escHtml(e.notes)}</span>` : ''}
        </div>`;
      }).join('');
    } else {
      rows = `<p class="hl-empty" style="margin-top:8px">No digestion entries yet.</p>`;
    }

    return `<div class="hl-dig-section">
      <div class="hl-section-header"><span class="hl-section-title">Digestion</span></div>
      <p class="hl-dig-summary">${escHtml(summary)}</p>
      <div class="hl-dig-list">${rows}</div>
    </div>`;
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

    const symptoms  = getSymptomsForIssue(issueId);
    const dateRange = issue.resolved
      ? `${fmtDate(issue.start_date)} → ${fmtDate(issue.end_date)}`
      : `Since ${fmtDate(issue.start_date)}`;

    let html = `<div class="hl-detail">
      <button class="hl-detail-back" onclick="HealthLog._back()">← Back to Health Log</button>
      <div class="hl-detail-header">
        <h2 class="hl-detail-title">${escHtml(issue.name)}</h2>
        <p class="hl-detail-sub">${dateRange} · ${symptoms.length} symptom entr${symptoms.length === 1 ? 'y' : 'ies'}</p>
      </div>`;

    if (showEditForm) {
      html += `<div class="hl-edit-form">
        <div><label class="hl-edit-label">Name</label>
          <input id="hl-edit-title" class="hl-edit-input" type="text" value="${escHtml(issue.name)}"></div>
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
      // Group by date (symptoms already sorted newest-first)
      const byDate = new Map();
      symptoms.forEach(s => {
        if (!byDate.has(s.date)) byDate.set(s.date, []);
        byDate.get(s.date).push(s);
      });

      const historyRows = [...byDate.entries()].map(([date, entries]) => {
        const label = date === today() ? 'Today' : fmtDate(date);
        const chips = entries.map(s => {
          const [bg, clr] = SEV_STYLES[s.severity] ?? SEV_STYLES[3];
          const cat   = s.chips[0] ?? '';
          const color = catColor(cat);
          const tip   = s.note ? escHtml(s.note.slice(0, 60)) : '';
          const canEdit = s.source === 'symptoms' && s.id;
          const canNav  = s.source === 'issue_logs';
          const editBtn = canEdit
            ? `<button class="symp-hist-chip-body" title="${tip}"
                       onclick="Symptoms._startEditFromDetail('${s.id}','${date}')">
                 <span class="health-issue-dot" style="background:${color}"></span>
                 <span class="symp-hist-chip-cat">${escHtml(cat)}</span>
                 <span class="health-sev-badge" style="--sev-bg:${bg};--sev-clr:${clr}; font-size:0.72rem; padding:2px 6px">${s.severity}</span>
                 ${s.time ? `<span class="symp-hist-chip-time">${escHtml(s.time)}</span>` : ''}
               </button>`
            : canNav
            ? `<button class="symp-hist-chip-body" title="${tip}"
                       onclick="Symptoms._openIssueFromHealthLog('${issueId}','${date}')">
                 <span class="health-issue-dot" style="background:${color}"></span>
                 <span class="symp-hist-chip-cat">${escHtml(cat)}</span>
                 <span class="health-sev-badge" style="--sev-bg:${bg};--sev-clr:${clr}; font-size:0.72rem; padding:2px 6px">${s.severity}</span>
               </button>`
            : `<span class="symp-hist-chip-body symp-hist-chip-body--static" title="${tip}">
                 <span class="health-issue-dot" style="background:${color}"></span>
                 <span class="symp-hist-chip-cat">${escHtml(cat)}</span>
                 <span class="health-sev-badge" style="--sev-bg:${bg};--sev-clr:${clr}; font-size:0.72rem; padding:2px 6px">${s.severity}</span>
               </span>`;
          const delBtn = canEdit
            ? `<button class="symp-hist-chip-del" title="Delete"
                       onclick="Symptoms._deleteSymptomByDate('${s.id}','${date}')">×</button>`
            : canNav
            ? `<button class="symp-hist-chip-del" title="Delete"
                       onclick="HealthLog._deleteIssueLog('${issueId}','${date}')">×</button>`
            : '';
          return `<div class="symp-hist-chip">${editBtn}${delBtn}</div>`;
        }).join('');

        return `
          <div class="symp-hist-day">
            <span class="symp-hist-day-label">${label}</span>
            <div class="symp-hist-chips">${chips}</div>
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
  function _back()          { detailId = null; showResolveForm = false; showEditForm = false; bpFormMode = null; bpEditId = null; render(); }
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
    const name  = document.getElementById('hl-edit-title')?.value.trim();
    const start = document.getElementById('hl-edit-start')?.value;
    if (name)  issue.name       = name;
    if (start) issue.start_date = start;
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

  async function _deleteIssueLog(issueId, date) {
    const day = (Data.getData().days ?? {})[date];
    if (!day?.issue_logs) return;
    day.issue_logs = day.issue_logs.filter(l => l.issue_id !== issueId);
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
    _deleteIssue, _deleteIssueLog,
    // Blood Pressure
    _addBP, _editBP, _cancelBP, _saveBP, _deleteBP,
    _setBpDate, _setBpTime, _setBpSys, _setBpDia,
    _setBpPulse, _setBpCtx, _setBpNotes,
  };
})();
