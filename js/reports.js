/**
 * reports.js — Reports & Charts section
 *
 * Renders into #tab-reports:
 *   #rpt-period-wrap  — sticky period/range selector (built once in init)
 *   #reports-content  — chart sections (rebuilt on each render)
 *
 * Uses Chart.js 4.x for line/bar charts.
 * Sections: Habits · Health · Moderation · Medications · Reading
 */
const Reports = (() => {

  let period      = '30d';
  let customStart = null;   // 'YYYY-MM-DD'
  let customEnd   = null;   // 'YYYY-MM-DD'
  const chartRegistry = new Map();

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function toDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function getDatesInPeriod() {
    const today    = new Date();
    const todayStr = toDateStr(today);

    if (period === 'custom' && customStart && customEnd) {
      const dates = [];
      const end   = customEnd > todayStr ? todayStr : customEnd;
      for (let d = new Date(customStart); toDateStr(d) <= end; d.setDate(d.getDate() + 1)) {
        dates.push(toDateStr(new Date(d)));
      }
      return dates.length ? dates : [todayStr];
    }

    if (period === 'all') {
      const allDays = Object.keys(Data.getData().days ?? {}).sort();
      if (!allDays.length) return [todayStr];
      const dates = [];
      for (let d = new Date(allDays[0]); toDateStr(d) <= todayStr; d.setDate(d.getDate() + 1)) {
        dates.push(toDateStr(new Date(d)));
      }
      return dates;
    }

    const count = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const dates = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dates.push(toDateStr(d));
    }
    return dates;
  }

  function fmtMinutes(mins) {
    if (!mins) return '0m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    return m === 0 ? `${h}h` : `${h}h\u00a0${m}m`;
  }

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Weekday-based Monday for a date string
  function weekStart(dateStr) {
    const d   = new Date(dateStr);
    const dow = d.getDay(); // 0=Sun
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    return toDateStr(d);
  }

  // CSS var values for Chart.js axis colours (resolved at render time)
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // ── Chart registry ────────────────────────────────────────────────────────────

  function createChart(id, config) {
    if (typeof Chart === 'undefined') return;
    if (chartRegistry.has(id)) {
      chartRegistry.get(id).destroy();
      chartRegistry.delete(id);
    }
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const chart = new Chart(canvas, config);
    chartRegistry.set(id, chart);
    return chart;
  }

  // ── Period selector ───────────────────────────────────────────────────────────

  function buildPeriodBar() {
    const opts = [
      { val: '7d',  label: '7 days'   },
      { val: '30d', label: '30 days'  },
      { val: '90d', label: '90 days'  },
      { val: 'all', label: 'All time' },
    ];
    const today = toDateStr(new Date());
    return `<div class="report-period-bar">
      <div class="rpt-period-btns">
        ${opts.map(o => `
          <button class="rpt-period-btn${period === o.val ? ' rpt-period-btn--active' : ''}"
                  data-period="${o.val}"
                  onclick="Reports.setPeriod('${o.val}')">${o.label}</button>
        `).join('')}
        <button class="rpt-period-btn${period === 'custom' ? ' rpt-period-btn--active' : ''}"
                data-period="custom"
                onclick="Reports.toggleCustomPicker()">Custom…</button>
      </div>
      <div class="rpt-custom-picker" id="rpt-custom-picker"${period === 'custom' ? '' : ' hidden'}>
        <label class="rpt-custom-label">
          <span>From</span>
          <input type="date" id="rpt-custom-start"
                 value="${customStart ?? ''}" max="${today}">
        </label>
        <label class="rpt-custom-label">
          <span>To</span>
          <input type="date" id="rpt-custom-end"
                 value="${customEnd ?? today}" max="${today}">
        </label>
        <button class="rpt-custom-apply" onclick="Reports.applyCustomRange()">Apply</button>
      </div>
    </div>`;
  }

  // Update only button active states (no full rebuild)
  function updatePeriodBtns() {
    document.querySelectorAll('.rpt-period-btn[data-period]').forEach(btn => {
      btn.classList.toggle('rpt-period-btn--active', btn.dataset.period === period);
    });
  }

  function toggleCustomPicker() {
    const picker = document.getElementById('rpt-custom-picker');
    if (picker) picker.hidden = !picker.hidden;
  }

  function applyCustomRange() {
    const start = document.getElementById('rpt-custom-start')?.value;
    const end   = document.getElementById('rpt-custom-end')?.value;
    if (!start || !end || start > end) return;
    customStart = start;
    customEnd   = end;
    period = 'custom';
    const picker = document.getElementById('rpt-custom-picker');
    if (picker) picker.hidden = true;
    updatePeriodBtns();
    render();
  }

  // ── Habits section ────────────────────────────────────────────────────────────

  function buildHabitsSection(dates) {
    const habits   = Data.getSettings().habits ?? [];
    const daysData = Data.getData().days ?? {};

    if (!habits.length) {
      return rptSection('Habits', habitIcon(), `<p class="rpt-empty">No habits configured yet.</p>`);
    }

    // ── Heatmap (max 90 most-recent days) ──
    const heatDates = dates.length > 90 ? dates.slice(-90) : dates;
    const heatCells = heatDates.map(date => {
      const day   = daysData[date];
      const total = habits.length;
      const done  = habits.filter(h => day?.habits?.[h] === true).length;
      const pct   = total > 0 ? done / total : 0;
      let cls = 'rpt-heatmap-cell';
      if (pct === 1)    cls += ' rpt-heatmap-cell--full';
      else if (pct > 0) cls += ' rpt-heatmap-cell--partial';
      const dateLabel = date.slice(5).replace('-', '/');
      return `<div class="${cls}" title="${dateLabel}: ${done}/${total}"></div>`;
    }).join('');

    // ── Per-habit rows: completion % + current streak ──
    const today    = new Date();
    const habitRows = habits.map(h => {
      const total = dates.length;
      const done  = dates.filter(d => daysData[d]?.habits?.[h] === true).length;
      const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

      // Current streak (count backwards from today)
      let streak = 0;
      for (let i = 0; i < 366; i++) {
        const d  = new Date(today);
        d.setDate(d.getDate() - i);
        const ds = toDateStr(d);
        if (daysData[ds]?.habits?.[h] === true) {
          streak++;
        } else if (i === 0) {
          // today not filled yet — keep going
        } else {
          break;
        }
      }

      let barColor = 'var(--clr-error)';
      if (pct >= 80)      barColor = 'var(--clr-accent)';
      else if (pct >= 50) barColor = '#8bc34a';
      else if (pct >= 25) barColor = '#ffc107';

      return `<div class="rpt-habit-row">
        <span class="rpt-habit-name">${escHtml(h)}</span>
        <div class="rpt-bar-wrap">
          <div class="rpt-bar-fill" style="width:${pct}%;background:${barColor}"></div>
        </div>
        <span class="rpt-pct-label">${pct}%</span>
        <span class="rpt-streak-label">${streak > 0 ? `🔥\u00a0${streak}d` : ''}</span>
      </div>`;
    }).join('');

    const body = `
      <p class="rpt-section-label">Activity — last ${heatDates.length} days</p>
      <div class="rpt-heatmap">${heatCells}</div>
      <div class="rpt-habit-bars">${habitRows}</div>`;

    return rptSection('Habits', habitIcon(), body);
  }

  // ── Health section ────────────────────────────────────────────────────────────

  function buildHealthSection(dates) {
    const issues   = Data.getData().issues ?? {};
    const daysData = Data.getData().days ?? {};
    const active   = Object.values(issues).filter(i => !i.resolved);

    if (!active.length) {
      return rptSection('Health', healthIcon(), `<p class="rpt-empty">No active health issues tracked.</p>`);
    }

    const issueBlocks = active.map(issue => {
      const logsInPeriod = dates.flatMap(date => {
        const log = (daysData[date]?.issue_logs ?? []).find(l => l.issue_id === issue.id);
        return log ? [{ date, severity: log.severity ?? 0 }] : [];
      });

      const chartOrEmpty = logsInPeriod.length > 0
        ? `<div class="rpt-chart-wrap"><canvas id="rpt-health-${issue.id}"></canvas></div>`
        : `<p class="rpt-empty" style="padding:6px 0 2px">No logs in this period</p>`;

      return `<div class="rpt-health-issue">
        <div class="rpt-issue-name">${escHtml(issue.title)}</div>
        <div class="rpt-issue-meta">
          <span class="rpt-issue-cat">${escHtml(issue.category)}</span>
          <span>·</span>
          <span>${logsInPeriod.length} log${logsInPeriod.length !== 1 ? 's' : ''} in period</span>
        </div>
        ${chartOrEmpty}
      </div>`;
    }).join('');

    return rptSection('Health', healthIcon(), issueBlocks, false);
  }

  function renderHealthCharts(dates) {
    const issues   = Data.getData().issues ?? {};
    const daysData = Data.getData().days ?? {};

    Object.values(issues).filter(i => !i.resolved).forEach(issue => {
      const points = dates.flatMap(date => {
        const log = (daysData[date]?.issue_logs ?? []).find(l => l.issue_id === issue.id);
        return log ? [{ date, severity: log.severity ?? 0 }] : [];
      });
      if (!points.length) return;

      let display = points;
      if (points.length > 30) {
        const step = Math.ceil(points.length / 30);
        display = points.filter((_, i) => i % step === 0 || i === points.length - 1);
      }

      const sevColors = ['', '#4caf50', '#8bc34a', '#ffc107', '#ff5722', '#f44336'];
      const textClr   = cssVar('--clr-text-2');
      const gridClr   = cssVar('--clr-border');

      createChart(`rpt-health-${issue.id}`, {
        type: 'line',
        data: {
          labels: display.map(p => p.date.slice(5).replace('-', '/')),
          datasets: [{
            data:               display.map(p => p.severity),
            borderColor:        cssVar('--clr-accent'),
            backgroundColor:    'rgba(76,175,80,0.12)',
            pointBackgroundColor: display.map(p => sevColors[p.severity] || '#7a967a'),
            pointRadius:        4,
            tension:            0.3,
            fill:               true,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              min: 1, max: 5,
              ticks: {
                stepSize: 1, color: textClr,
                callback: v => ({ 1:'Mild', 2:'Low', 3:'Mod', 4:'High', 5:'Severe' }[v] || ''),
              },
              grid: { color: gridClr },
            },
            x: {
              ticks: { color: textClr, maxTicksLimit: 8 },
              grid: { display: false },
            },
          },
        },
      });
    });
  }

  // ── Moderation section ────────────────────────────────────────────────────────

  function buildModerationSection(dates) {
    const substances = Data.getSettings().moderation_substances ?? [];
    const daysData   = Data.getData().days ?? {};

    if (!substances.length) {
      return rptSection('Moderation', modIcon(), `<p class="rpt-empty">No substances configured.</p>`);
    }

    const statsRows = substances.map(sub => {
      let daysLogged = 0, totalQty = 0;
      dates.forEach(date => {
        const entry = daysData[date]?.moderation?.[sub.id];
        if (entry) { daysLogged++; totalQty += (entry.quantity ?? 0); }
      });
      return `<div class="rpt-mod-stat-row">
        <span class="rpt-mod-name">${escHtml(sub.name)}</span>
        <span class="rpt-mod-val">${daysLogged} day${daysLogged !== 1 ? 's' : ''} · ${totalQty} ${escHtml(sub.default_unit ?? 'units')}</span>
      </div>`;
    }).join('');

    const body = `
      <div class="rpt-chart-wrap"><canvas id="rpt-mod-chart"></canvas></div>
      <div class="rpt-mod-stats">${statsRows}</div>`;

    return rptSection('Moderation', modIcon(), body);
  }

  function renderModerationChart(dates) {
    if (!document.getElementById('rpt-mod-chart')) return;
    const substances = Data.getSettings().moderation_substances ?? [];
    const daysData   = Data.getData().days ?? {};
    if (!substances.length) return;

    const weekMap = new Map();
    dates.forEach(date => {
      const wk = weekStart(date);
      if (!weekMap.has(wk)) {
        const d = new Date(wk);
        weekMap.set(wk, { label: `${d.getMonth() + 1}/${d.getDate()}`, subs: {} });
      }
      const bucket = weekMap.get(wk);
      substances.forEach(sub => {
        const entry = daysData[date]?.moderation?.[sub.id];
        if (entry) bucket.subs[sub.id] = (bucket.subs[sub.id] ?? 0) + (entry.quantity ?? 0);
      });
    });

    const sorted   = [...weekMap.entries()].sort(([a], [b]) => a < b ? -1 : 1);
    const labels   = sorted.map(([, w]) => w.label);
    const palettes = [
      'rgba(76,175,80,0.8)', 'rgba(33,150,243,0.8)',
      'rgba(255,193,7,0.8)', 'rgba(244,67,54,0.8)',
    ];
    const textClr  = cssVar('--clr-text-2');
    const gridClr  = cssVar('--clr-border');

    createChart('rpt-mod-chart', {
      type: 'bar',
      data: {
        labels,
        datasets: substances.map((sub, i) => ({
          label:           sub.name,
          data:            sorted.map(([, w]) => w.subs[sub.id] ?? 0),
          backgroundColor: palettes[i % palettes.length],
          borderRadius:    4,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textClr, boxWidth: 12, font: { size: 11 } } } },
        scales: {
          y: { beginAtZero: true, ticks: { color: textClr }, grid: { color: gridClr } },
          x: { ticks: { color: textClr }, grid: { display: false } },
        },
      },
    });
  }

  // ── Medications section ───────────────────────────────────────────────────────

  function buildMedicationsSection(dates) {
    const meds     = Data.getData().medications ?? {};
    const daysData = Data.getData().days ?? {};
    const active   = Object.values(meds).filter(m => m.active && !m.as_needed);

    if (!active.length) {
      return rptSection('Medications', medIcon(), `<p class="rpt-empty">No scheduled medications.</p>`);
    }

    const rows = active.map(med => {
      let taken = 0, expected = 0;
      dates.forEach(date => {
        if (med.start_date && date < med.start_date) return;
        if (med.end_date   && date > med.end_date)   return;
        expected++;
        const record = (daysData[date]?.medications_taken ?? []).find(r => r.medication_id === med.id);
        if (record?.taken) taken++;
      });
      const pct = expected > 0 ? Math.round((taken / expected) * 100) : 0;
      let barColor = 'var(--clr-error)';
      if (pct >= 90)      barColor = 'var(--clr-accent)';
      else if (pct >= 70) barColor = '#8bc34a';
      else if (pct >= 50) barColor = '#ffc107';

      return `<div class="rpt-med-row">
        <div class="rpt-med-name">${escHtml(med.name)}${med.dose ? ` <span class="rpt-med-dose">${escHtml(med.dose)}</span>` : ''}</div>
        <div class="rpt-med-adherence">
          <div class="rpt-bar-wrap">
            <div class="rpt-bar-fill" style="width:${pct}%;background:${barColor}"></div>
          </div>
          <span class="rpt-adhere-pct">${pct}%</span>
          <span class="rpt-adhere-detail">${taken}/${expected}d</span>
        </div>
      </div>`;
    }).join('');

    return rptSection('Medications', medIcon(), rows);
  }

  // ── Reading section ───────────────────────────────────────────────────────────

  function buildReadingSection(dates) {
    const books    = Data.getData().books ?? {};
    const daysData = Data.getData().days ?? {};

    let totalMinutes = 0, totalSessions = 0;
    const bookMinutes = {};

    dates.forEach(date => {
      (daysData[date]?.reading ?? []).forEach(s => {
        totalMinutes += s.minutes ?? 0;
        totalSessions++;
        bookMinutes[s.book_id] = (bookMinutes[s.book_id] ?? 0) + (s.minutes ?? 0);
      });
    });

    const avgSession = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;

    const statsGrid = `<div class="rpt-stats-grid">
      <div class="rpt-stat">
        <span class="rpt-stat-value">${fmtMinutes(totalMinutes)}</span>
        <span class="rpt-stat-label">Total time</span>
      </div>
      <div class="rpt-stat">
        <span class="rpt-stat-value">${totalSessions}</span>
        <span class="rpt-stat-label">Sessions</span>
      </div>
      <div class="rpt-stat">
        <span class="rpt-stat-value">${avgSession ? fmtMinutes(avgSession) : '—'}</span>
        <span class="rpt-stat-label">Avg session</span>
      </div>
    </div>`;

    const bookRows = Object.entries(bookMinutes)
      .sort(([, a], [, b]) => b - a)
      .map(([bookId, mins]) => {
        const b = books[bookId];
        if (!b) return '';
        return `<div class="rpt-book-progress">
          ${b.cover_url ? `<img src="${escHtml(b.cover_url)}" class="rpt-book-cover" alt="" loading="lazy">` : ''}
          <div class="rpt-book-info">
            <div class="rpt-book-title">${escHtml(b.title)}</div>
            <div class="rpt-book-time">${fmtMinutes(mins)} read</div>
          </div>
        </div>`;
      }).join('');

    if (!totalMinutes) {
      return rptSection('Reading', bookIcon(), statsGrid + `<p class="rpt-empty">No reading sessions logged in this period.</p>`);
    }

    const body = statsGrid
      + `<div class="rpt-chart-wrap"><canvas id="rpt-reading-chart"></canvas></div>`
      + (bookRows ? `<div class="rpt-books-in-period">${bookRows}</div>` : '');

    return rptSection('Reading', bookIcon(), body);
  }

  function renderReadingChart(dates) {
    if (!document.getElementById('rpt-reading-chart')) return;
    const daysData = Data.getData().days ?? {};

    const weekMap = new Map();
    dates.forEach(date => {
      const wk = weekStart(date);
      if (!weekMap.has(wk)) {
        const d = new Date(wk);
        weekMap.set(wk, { label: `${d.getMonth() + 1}/${d.getDate()}`, minutes: 0 });
      }
      const dayMins = (daysData[date]?.reading ?? []).reduce((s, r) => s + (r.minutes ?? 0), 0);
      weekMap.get(wk).minutes += dayMins;
    });

    const sorted  = [...weekMap.entries()].sort(([a], [b]) => a < b ? -1 : 1);
    const textClr = cssVar('--clr-text-2');
    const gridClr = cssVar('--clr-border');

    createChart('rpt-reading-chart', {
      type: 'bar',
      data: {
        labels:   sorted.map(([, w]) => w.label),
        datasets: [{
          label:           'Minutes read',
          data:            sorted.map(([, w]) => w.minutes),
          backgroundColor: 'rgba(76,175,80,0.78)',
          borderRadius:    4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              color: textClr,
              callback: v => v >= 60 ? `${Math.floor(v / 60)}h${v % 60 ? ` ${v % 60}m` : ''}` : `${v}m`,
            },
            grid: { color: gridClr },
          },
          x: { ticks: { color: textClr }, grid: { display: false } },
        },
      },
    });
  }

  // ── Section shell helper ──────────────────────────────────────────────────────

  function rptSection(title, icon, bodyHtml, padBody = true) {
    return `<div class="report-section">
      <div class="report-section-header">
        <h2 class="report-section-title">${icon}${escHtml(title)}</h2>
      </div>
      <div class="${padBody ? 'report-section-body' : ''}">${bodyHtml}</div>
    </div>`;
  }

  // ── SVG icons ─────────────────────────────────────────────────────────────────

  function svgIcon(path) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        width="16" height="16" aria-hidden="true">${path}</svg>`;
  }

  function habitIcon() {
    return svgIcon('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>');
  }
  function healthIcon() {
    return svgIcon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>');
  }
  function modIcon() {
    return svgIcon('<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>');
  }
  function medIcon() {
    return svgIcon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>');
  }
  function bookIcon() {
    return svgIcon('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>');
  }

  // ── Main render ───────────────────────────────────────────────────────────────

  // Renders only the chart sections — period bar is persistent (built in init)
  function render() {
    const el = document.getElementById('reports-content');
    if (!el) return;

    const dates = getDatesInPeriod();

    el.innerHTML = buildHabitsSection(dates)
      + buildHealthSection(dates)
      + buildModerationSection(dates)
      + buildMedicationsSection(dates)
      + buildReadingSection(dates);

    // Charts need the canvas elements to exist in DOM first
    requestAnimationFrame(() => {
      renderHealthCharts(dates);
      renderModerationChart(dates);
      renderReadingChart(dates);
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  function setPeriod(p) {
    period = p;
    if (p !== 'custom') {
      const picker = document.getElementById('rpt-custom-picker');
      if (picker) picker.hidden = true;
    }
    updatePeriodBtns();
    render();
  }

  function init() {
    const wrap = document.getElementById('rpt-period-wrap');
    if (!wrap) return;

    // Build the period bar once — it persists across renders
    wrap.innerHTML = buildPeriodBar();

    // Stick just below the app header
    const headerH = document.querySelector('.app-header')?.offsetHeight ?? 0;
    wrap.style.top = headerH + 'px';
  }

  return { init, render, setPeriod, toggleCustomPicker, applyCustomRange };

})();
