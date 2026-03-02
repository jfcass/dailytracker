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

  // Parse 'YYYY-MM-DD' as LOCAL midnight, not UTC midnight.
  // new Date('YYYY-MM-DD') is UTC midnight, which shifts to the previous day
  // for any timezone west of UTC (e.g. US Eastern = UTC-5).
  function parseLocalDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function getDatesInPeriod() {
    const today    = new Date();
    const todayStr = toDateStr(today);

    if (period === 'custom' && customStart && customEnd) {
      const dates = [];
      const end   = customEnd > todayStr ? todayStr : customEnd;
      for (let d = parseLocalDate(customStart); toDateStr(d) <= end; d.setDate(d.getDate() + 1)) {
        dates.push(toDateStr(new Date(d)));
      }
      return dates.length ? dates : [todayStr];
    }

    if (period === 'all') {
      const allDays = Object.keys(Data.getData().days ?? {}).sort();
      if (!allDays.length) return [todayStr];
      const dates = [];
      for (let d = parseLocalDate(allDays[0]); toDateStr(d) <= todayStr; d.setDate(d.getDate() + 1)) {
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
    const d   = parseLocalDate(dateStr);
    const dow = d.getDay(); // 0=Sun
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    return toDateStr(d);
  }

  // CSS var values for Chart.js axis colours (resolved at render time)
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function avg(arr) {
    const vals = arr.filter(v => v != null);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
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
    // Selecting "Custom" shows the picker; switching away hides it (handled by setPeriod).
    const picker = document.getElementById('rpt-custom-picker');
    if (picker) picker.hidden = false;
    period = 'custom';
    updatePeriodBtns();
  }

  function applyCustomRange() {
    const start = document.getElementById('rpt-custom-start')?.value;
    const end   = document.getElementById('rpt-custom-end')?.value;
    if (!start || !end || start > end) return;
    customStart = start;
    customEnd   = end;
    period = 'custom';
    // Keep picker visible — it stays shown as long as Custom is the active period.
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

  // ── Mood & Energy section ─────────────────────────────────────────────────────

  function buildMoodSection(dates) {
    const daysData = Data.getData().days ?? {};

    const points = dates.flatMap(date => {
      const m = daysData[date]?.mood;
      if (!m || (m.mood == null && m.energy == null)) return [];
      return [{ date, mood: m.mood ?? null, energy: m.energy ?? null }];
    });

    if (!points.length) {
      return rptSection('Mood & Energy', moodIcon(), `<p class="rpt-empty">No mood or energy logged in this period.</p>`);
    }

    const moodVals   = points.map(p => p.mood).filter(v => v != null);
    const energyVals = points.map(p => p.energy).filter(v => v != null);
    const avgMood    = moodVals.length   ? (moodVals.reduce((a, b) => a + b, 0) / moodVals.length).toFixed(1)   : '—';
    const avgEnergy  = energyVals.length ? (energyVals.reduce((a, b) => a + b, 0) / energyVals.length).toFixed(1) : '—';
    const LABELS     = { 1: 'Very low', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Great' };
    const moodLbl    = moodVals.length   ? (LABELS[Math.round(parseFloat(avgMood))]   ?? '') : '';
    const energyLbl  = energyVals.length ? (LABELS[Math.round(parseFloat(avgEnergy))] ?? '') : '';

    const statsGrid = `<div class="rpt-stats-grid">
      <div class="rpt-stat">
        <span class="rpt-stat-value">${avgMood}</span>
        <span class="rpt-stat-label">Avg mood${moodLbl ? ` · ${moodLbl}` : ''}</span>
      </div>
      <div class="rpt-stat">
        <span class="rpt-stat-value">${avgEnergy}</span>
        <span class="rpt-stat-label">Avg energy${energyLbl ? ` · ${energyLbl}` : ''}</span>
      </div>
      <div class="rpt-stat">
        <span class="rpt-stat-value">${points.length}</span>
        <span class="rpt-stat-label">Days logged</span>
      </div>
    </div>`;

    return rptSection('Mood & Energy', moodIcon(),
      statsGrid + `<div class="rpt-chart-wrap"><canvas id="rpt-mood-chart"></canvas></div>`);
  }

  function renderMoodChart(dates) {
    if (!document.getElementById('rpt-mood-chart')) return;
    const daysData = Data.getData().days ?? {};

    const points = dates.flatMap(date => {
      const m = daysData[date]?.mood;
      if (!m || (m.mood == null && m.energy == null)) return [];
      return [{ date, mood: m.mood ?? null, energy: m.energy ?? null }];
    });
    if (!points.length) return;

    let display = points;
    if (points.length > 45) {
      const step = Math.ceil(points.length / 45);
      display = points.filter((_, i) => i % step === 0 || i === points.length - 1);
    }

    const textClr  = cssVar('--clr-text-2');
    const gridClr  = cssVar('--clr-border');
    const moodTick = { 1: 'Very low', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Great' };

    createChart('rpt-mood-chart', {
      type: 'line',
      data: {
        labels: display.map(p => p.date.slice(5).replace('-', '/')),
        datasets: [
          {
            label:              'Mood',
            data:               display.map(p => p.mood),
            borderColor:        '#1ABEA5',
            backgroundColor:    'rgba(26,190,165,0.10)',
            pointBackgroundColor: '#1ABEA5',
            pointRadius:        3,
            tension:            0.3,
            fill:               false,
            spanGaps:           true,
          },
          {
            label:              'Energy',
            data:               display.map(p => p.energy),
            borderColor:        '#F4A800',
            backgroundColor:    'rgba(244,168,0,0.10)',
            pointBackgroundColor: '#F4A800',
            pointRadius:        3,
            tension:            0.3,
            fill:               false,
            spanGaps:           true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: textClr, boxWidth: 12, font: { size: 11 } } },
        },
        scales: {
          y: {
            min: 1, max: 5,
            ticks: { stepSize: 1, color: textClr, callback: v => moodTick[v] ?? '' },
            grid:  { color: gridClr },
          },
          x: {
            ticks: { color: textClr, maxTicksLimit: 8 },
            grid:  { display: false },
          },
        },
      },
    });
  }

  // ── Digestion (bowel) section ─────────────────────────────────────────────────

  function buildBowelSection(dates) {
    const daysData       = Data.getData().days ?? {};
    const QUALITY_LABELS = ['', 'Hard', 'Firm', 'Normal', 'Soft', 'Watery'];

    let totalMovements = 0, daysWithMovements = 0;
    const qualityCounts = [0, 0, 0, 0, 0, 0];

    dates.forEach(date => {
      const entries = daysData[date]?.bowel ?? [];
      if (entries.length) { daysWithMovements++; totalMovements += entries.length; }
      entries.forEach(e => { if (e.quality >= 1 && e.quality <= 5) qualityCounts[e.quality]++; });
    });

    if (!totalMovements) {
      return rptSection('Digestion', bowelIcon(), `<p class="rpt-empty">No bowel movements logged in this period.</p>`);
    }

    const avgPerDay       = (totalMovements / daysWithMovements).toFixed(1);
    const maxCount        = Math.max(...qualityCounts.slice(1));
    const mostCommonIdx   = qualityCounts.indexOf(maxCount);
    const mostCommonLabel = QUALITY_LABELS[mostCommonIdx] ?? '—';

    const statsGrid = `<div class="rpt-stats-grid">
      <div class="rpt-stat">
        <span class="rpt-stat-value">${totalMovements}</span>
        <span class="rpt-stat-label">Total logged</span>
      </div>
      <div class="rpt-stat">
        <span class="rpt-stat-value">${avgPerDay}</span>
        <span class="rpt-stat-label">Avg per day</span>
      </div>
      <div class="rpt-stat">
        <span class="rpt-stat-value">${mostCommonLabel}</span>
        <span class="rpt-stat-label">Most common</span>
      </div>
    </div>`;

    const showFreq = dates.length >= 7;
    const body = statsGrid
      + `<p class="rpt-section-label">Quality distribution</p>`
      + `<div class="rpt-chart-wrap rpt-chart-wrap--short"><canvas id="rpt-bowel-dist-chart"></canvas></div>`
      + (showFreq
        ? `<p class="rpt-section-label">Frequency per week</p><div class="rpt-chart-wrap rpt-chart-wrap--short"><canvas id="rpt-bowel-freq-chart"></canvas></div>`
        : '');

    return rptSection('Digestion', bowelIcon(), body);
  }

  function renderBowelCharts(dates) {
    const daysData       = Data.getData().days ?? {};
    const QUALITY_LABELS = ['', 'Hard', 'Firm', 'Normal', 'Soft', 'Watery'];
    const QUALITY_COLORS = ['', '#8B6240', '#C09040', '#1ABEA5', '#E89020', '#E05030'];
    const textClr        = cssVar('--clr-text-2');
    const gridClr        = cssVar('--clr-border');

    // Distribution chart (Watery→Hard to match log form order)
    if (document.getElementById('rpt-bowel-dist-chart')) {
      const qualityCounts = [0, 0, 0, 0, 0, 0];
      dates.forEach(date =>
        (daysData[date]?.bowel ?? []).forEach(e => {
          if (e.quality >= 1 && e.quality <= 5) qualityCounts[e.quality]++;
        })
      );
      const order  = [5, 4, 3, 2, 1];
      createChart('rpt-bowel-dist-chart', {
        type: 'bar',
        data: {
          labels:   order.map(v => QUALITY_LABELS[v]),
          datasets: [{
            data:            order.map(v => qualityCounts[v]),
            backgroundColor: order.map(v => QUALITY_COLORS[v]),
            borderRadius:    4,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1, color: textClr }, grid: { color: gridClr } },
            x: { ticks: { color: textClr }, grid: { display: false } },
          },
        },
      });
    }

    // Weekly frequency chart
    if (document.getElementById('rpt-bowel-freq-chart')) {
      const weekMap = new Map();
      dates.forEach(date => {
        const wk = weekStart(date);
        if (!weekMap.has(wk)) {
          const d = parseLocalDate(wk);
          weekMap.set(wk, { label: `${d.getMonth() + 1}/${d.getDate()}`, count: 0 });
        }
        weekMap.get(wk).count += (daysData[date]?.bowel ?? []).length;
      });
      const sorted = [...weekMap.entries()].sort(([a], [b]) => a < b ? -1 : 1);
      createChart('rpt-bowel-freq-chart', {
        type: 'bar',
        data: {
          labels:   sorted.map(([, w]) => w.label),
          datasets: [{
            data:            sorted.map(([, w]) => w.count),
            backgroundColor: 'rgba(26,190,165,0.78)',
            borderRadius:    4,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1, color: textClr }, grid: { color: gridClr } },
            x: { ticks: { color: textClr }, grid: { display: false } },
          },
        },
      });
    }
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
        const d = parseLocalDate(wk);
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

  // ── Gratitudes section ───────────────────────────────────────────────────────

  function buildGratitudeStreak(dates) {
    // Current streak: consecutive days from most recent backwards with ≥1 gratitude
    let streak = 0;
    for (let i = dates.length - 1; i >= 0; i--) {
      const day     = Data.getData().days?.[dates[i]];
      const entries = (day?.gratitudes ?? []).filter(g => g.trim());
      if (entries.length > 0) { streak++; } else { break; }
    }
    // Total days with gratitudes in the period
    const totalDays = dates.filter(d => {
      const day = Data.getData().days?.[d];
      return (day?.gratitudes ?? []).filter(g => g.trim()).length > 0;
    }).length;
    return { streak, totalDays };
  }

  function buildGratitudesSection(dates) {
    const { streak, totalDays } = buildGratitudeStreak(dates);
    return `<div class="rpt-section">
      <h3 class="rpt-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
             width="16" height="16" aria-hidden="true">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        Gratitudes
      </h3>
      <div class="rpt-stat-row">
        <div class="rpt-stat-card">
          <div class="rpt-stat-value">${streak}</div>
          <div class="rpt-stat-label">day streak</div>
        </div>
        <div class="rpt-stat-card">
          <div class="rpt-stat-value">${totalDays}</div>
          <div class="rpt-stat-label">days logged this period</div>
        </div>
      </div>
    </div>`;
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
        const d = parseLocalDate(wk);
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
  function moodIcon() {
    return svgIcon('<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>');
  }
  function bowelIcon() {
    return svgIcon('<path d="M12 2C6 8 4 12.5 4 15a8 8 0 0 0 16 0c0-2.5-2-7-8-13z"/>');
  }
  function sleepIcon() {
    return svgIcon('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>');
  }
  function activityIcon() {
    return svgIcon('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>');
  }
  function biometricsIcon() {
    return svgIcon('<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>');
  }

  // ── Sleep section ─────────────────────────────────────────────────────────────

  function buildSleepSection(dates) {
    const daysData = Data.getData().days ?? {};

    const points = dates.flatMap(date => {
      const d     = daysData[date];
      const deep  = d?.sleep_deep       ?? null;
      const light = d?.sleep_light      ?? null;
      const rem   = d?.sleep_rem        ?? null;
      const awake = d?.sleep_awake      ?? null;
      const eff   = d?.sleep_efficiency ?? null;
      // Derive true sleep time from stages (deep+light+rem, no awake) to match Fitbit app.
      // Fall back to stored hours only when stage data is absent.
      const stageMin = (deep != null && light != null && rem != null) ? deep + light + rem : null;
      const hours = stageMin != null ? +(stageMin / 60).toFixed(2) : (d?.sleep?.hours ?? null);
      if (hours == null && eff == null && deep == null) return [];
      return [{ date, hours, eff, deep, light, rem, awake }];
    });

    if (!points.length)
      return rptSection('Sleep', sleepIcon(), `<p class="rpt-empty">No sleep data in this period.</p>`);

    const avgHours = avg(points.map(p => p.hours));
    const avgEff   = avg(points.map(p => p.eff));
    const avgDeep  = avg(points.map(p => p.deep));
    const avgREM   = avg(points.map(p => p.rem));
    const hasStages = points.some(p => p.deep != null || p.rem != null || p.light != null);

    const body = `
      <div class="rpt-stats-grid rpt-stats-grid--4col">
        <div class="rpt-stat"><span class="rpt-stat-value">${avgHours != null ? avgHours.toFixed(1) + 'h' : '—'}</span><span class="rpt-stat-label">Avg sleep</span></div>
        <div class="rpt-stat"><span class="rpt-stat-value">${avgEff   != null ? Math.round(avgEff) + '%' : '—'}</span><span class="rpt-stat-label">Avg efficiency</span></div>
        <div class="rpt-stat"><span class="rpt-stat-value">${avgDeep  != null ? fmtMinutes(Math.round(avgDeep)) : '—'}</span><span class="rpt-stat-label">Avg deep</span></div>
        <div class="rpt-stat"><span class="rpt-stat-value">${avgREM   != null ? fmtMinutes(Math.round(avgREM))  : '—'}</span><span class="rpt-stat-label">Avg REM</span></div>
      </div>
      ${hasStages
        ? `<p class="rpt-section-label">Sleep stages</p>
           <div class="rpt-chart-wrap rpt-chart-wrap--tall"><canvas id="rpt-sleep-stages-chart"></canvas></div>`
        : `<p class="rpt-section-label">Sleep hours</p>
           <div class="rpt-chart-wrap"><canvas id="rpt-sleep-hours-chart"></canvas></div>`
      }`;

    return rptSection('Sleep', sleepIcon(), body);
  }

  function renderSleepCharts(dates) {
    const daysData = Data.getData().days ?? {};
    const textClr  = cssVar('--clr-text-2');
    const gridClr  = cssVar('--clr-border');
    const fmtMins  = v => { const h = Math.floor(v / 60), m = Math.round(v % 60); return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`; };

    // Hours — line chart (fallback when no stage data)
    if (document.getElementById('rpt-sleep-hours-chart')) {
      let pts = dates.flatMap(date => {
        const d = daysData[date];
        const deep = d?.sleep_deep ?? null, light = d?.sleep_light ?? null, rem = d?.sleep_rem ?? null;
        const stageMin = (deep != null && light != null && rem != null) ? deep + light + rem : null;
        const h = stageMin != null ? +(stageMin / 60).toFixed(2) : (d?.sleep?.hours ?? null);
        return h != null ? [{ date, h }] : [];
      });
      if (pts.length > 45) { const s = Math.ceil(pts.length / 45); pts = pts.filter((_, i) => i % s === 0 || i === pts.length - 1); }
      if (pts.length) createChart('rpt-sleep-hours-chart', {
        type: 'line',
        data: {
          labels:   pts.map(p => p.date.slice(5).replace('-', '/')),
          datasets: [{ label: 'Sleep', data: pts.map(p => p.h),
            borderColor: '#3f51b5', backgroundColor: 'rgba(63,81,181,0.10)',
            pointBackgroundColor: '#3f51b5', pointRadius: 3, tension: 0.3, fill: true, spanGaps: true }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: false, suggestedMin: 4, suggestedMax: 10,
                 ticks: { color: textClr, callback: v => `${v}h` }, grid: { color: gridClr } },
            x: { ticks: { color: textClr, maxTicksLimit: 8 }, grid: { display: false } },
          },
        },
      });
    }

    // Stages — stacked bar chart (deep / rem / light / awake)
    if (document.getElementById('rpt-sleep-stages-chart')) {
      let pts = dates.flatMap(date => {
        const d = daysData[date];
        const deep = d?.sleep_deep ?? null, light = d?.sleep_light ?? null,
              rem  = d?.sleep_rem  ?? null, awake = d?.sleep_awake ?? null;
        if (deep == null && rem == null && light == null) return [];
        return [{ date, deep: deep ?? 0, rem: rem ?? 0, light: light ?? 0, awake: awake ?? 0 }];
      });
      if (pts.length > 45) { const s = Math.ceil(pts.length / 45); pts = pts.filter((_, i) => i % s === 0 || i === pts.length - 1); }
      if (pts.length) createChart('rpt-sleep-stages-chart', {
        type: 'bar',
        data: {
          labels: pts.map(p => p.date.slice(5).replace('-', '/')),
          datasets: [
            { label: 'Deep',  data: pts.map(p => p.deep),  backgroundColor: '#3f51b5', stack: 'sleep' },
            { label: 'REM',   data: pts.map(p => p.rem),   backgroundColor: '#9c27b0', stack: 'sleep' },
            { label: 'Light', data: pts.map(p => p.light), backgroundColor: '#03a9f4', stack: 'sleep' },
            { label: 'Awake', data: pts.map(p => p.awake), backgroundColor: 'rgba(255,152,0,0.75)', stack: 'sleep' },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: textClr, boxWidth: 10, font: { size: 10 } } },
            tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmtMins(Math.round(ctx.parsed.y))}` } },
          },
          scales: {
            x: { stacked: true, ticks: { color: textClr, maxTicksLimit: 8 }, grid: { display: false } },
            y: { stacked: true,
                 ticks: { color: textClr, callback: v => v >= 60 ? Math.round(v / 60) + 'h' : v + 'm' },
                 grid: { color: gridClr } },
          },
        },
      });
    }
  }

  // ── Activity section ──────────────────────────────────────────────────────────

  function buildActivitySection(dates) {
    const daysData = Data.getData().days ?? {};

    const points = dates.flatMap(date => {
      const d = daysData[date];
      const steps  = d?.steps          ?? null;
      const active = d?.active_minutes ?? null;
      const cals   = d?.calories       ?? null;
      const floors = d?.floors         ?? null;
      if (steps == null && active == null && cals == null && floors == null) return [];
      return [{ date, steps, active, cals, floors }];
    });

    if (!points.length)
      return rptSection('Activity', activityIcon(), `<p class="rpt-empty">No activity data in this period.</p>`);

    const avgSteps  = avg(points.map(p => p.steps));
    const avgActive = avg(points.map(p => p.active));
    const avgCals   = avg(points.map(p => p.cals));
    const avgFloors = avg(points.map(p => p.floors));
    const hasFloors = points.some(p => p.floors != null);

    const statItems = [
      { v: avgSteps  != null ? Math.round(avgSteps).toLocaleString() : '—',   l: 'Avg steps'      },
      { v: avgActive != null ? Math.round(avgActive) + '\u202fmin'   : '—',   l: 'Active min/day' },
      { v: avgCals   != null ? Math.round(avgCals).toLocaleString()  : '—',   l: 'Avg calories'   },
      ...(hasFloors ? [{ v: avgFloors != null ? Math.round(avgFloors).toLocaleString() : '—', l: 'Avg floors' }] : []),
    ];

    const gridCls = statItems.length === 4 ? 'rpt-stats-grid rpt-stats-grid--4col' : 'rpt-stats-grid';

    const body = `
      <div class="${gridCls}">
        ${statItems.map(s => `<div class="rpt-stat"><span class="rpt-stat-value">${escHtml(s.v)}</span><span class="rpt-stat-label">${escHtml(s.l)}</span></div>`).join('')}
      </div>
      <p class="rpt-section-label">Daily steps</p>
      <div class="rpt-chart-wrap"><canvas id="rpt-activity-steps-chart"></canvas></div>
      <p class="rpt-section-label">Active minutes</p>
      <div class="rpt-chart-wrap rpt-chart-wrap--short"><canvas id="rpt-activity-active-chart"></canvas></div>`;

    return rptSection('Activity', activityIcon(), body);
  }

  function renderActivityCharts(dates) {
    const daysData = Data.getData().days ?? {};
    const textClr  = cssVar('--clr-text-2');
    const gridClr  = cssVar('--clr-border');

    if (document.getElementById('rpt-activity-steps-chart')) {
      let pts = dates.flatMap(date => {
        const s = daysData[date]?.steps ?? null;
        return s != null ? [{ date, s }] : [];
      });
      if (pts.length > 45) { const step = Math.ceil(pts.length / 45); pts = pts.filter((_, i) => i % step === 0 || i === pts.length - 1); }
      if (pts.length) createChart('rpt-activity-steps-chart', {
        type: 'bar',
        data: {
          labels: pts.map(p => p.date.slice(5).replace('-', '/')),
          datasets: [{ label: 'Steps', data: pts.map(p => p.s),
            backgroundColor: cssVar('--clr-accent') + '99',
            borderRadius: 4 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true,
                 ticks: { color: textClr, callback: v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v },
                 grid: { color: gridClr } },
            x: { ticks: { color: textClr, maxTicksLimit: 8 }, grid: { display: false } },
          },
        },
      });
    }

    if (document.getElementById('rpt-activity-active-chart')) {
      let pts = dates.flatMap(date => {
        const a = daysData[date]?.active_minutes ?? null;
        return a != null ? [{ date, a }] : [];
      });
      if (pts.length > 45) { const step = Math.ceil(pts.length / 45); pts = pts.filter((_, i) => i % step === 0 || i === pts.length - 1); }
      if (pts.length) createChart('rpt-activity-active-chart', {
        type: 'bar',
        data: {
          labels: pts.map(p => p.date.slice(5).replace('-', '/')),
          datasets: [{ label: 'Active min', data: pts.map(p => p.a),
            backgroundColor: 'rgba(255,152,0,0.75)',
            borderRadius: 4 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { color: textClr }, grid: { color: gridClr } },
            x: { ticks: { color: textClr, maxTicksLimit: 8 }, grid: { display: false } },
          },
        },
      });
    }
  }

  // ── Biometrics section ────────────────────────────────────────────────────────

  function buildBiometricsSection(dates) {
    const daysData = Data.getData().days ?? {};

    const points = dates.flatMap(date => {
      const d  = daysData[date];
      const hr = d?.resting_hr     ?? null;
      const hv = d?.hrv            ?? null;
      const sp = d?.spo2           ?? null;
      const br = d?.breathing_rate ?? null;
      if (hr == null && hv == null && sp == null && br == null) return [];
      return [{ date, hr, hv, sp, br }];
    });

    if (!points.length)
      return rptSection('Biometrics', biometricsIcon(), `<p class="rpt-empty">No biometric data in this period.</p>`);

    const avgHR = avg(points.map(p => p.hr));
    const avgHV = avg(points.map(p => p.hv));
    const avgSp = avg(points.map(p => p.sp));
    const avgBR = avg(points.map(p => p.br));

    const body = `
      <div class="rpt-stats-grid rpt-stats-grid--4col">
        <div class="rpt-stat"><span class="rpt-stat-value">${avgHR != null ? Math.round(avgHR) : '—'}</span><span class="rpt-stat-label">Resting HR (bpm)</span></div>
        <div class="rpt-stat"><span class="rpt-stat-value">${avgHV != null ? avgHV.toFixed(1)  : '—'}</span><span class="rpt-stat-label">HRV (ms)</span></div>
        <div class="rpt-stat"><span class="rpt-stat-value">${avgSp != null ? avgSp.toFixed(1) + '%' : '—'}</span><span class="rpt-stat-label">SpO2</span></div>
        <div class="rpt-stat"><span class="rpt-stat-value">${avgBR != null ? avgBR.toFixed(1)  : '—'}</span><span class="rpt-stat-label">Breathing (br/min)</span></div>
      </div>
      <div class="rpt-chart-wrap rpt-chart-wrap--tall"><canvas id="rpt-biometrics-chart"></canvas></div>`;

    return rptSection('Biometrics', biometricsIcon(), body);
  }

  function renderBiometricsChart(dates) {
    if (!document.getElementById('rpt-biometrics-chart')) return;
    const daysData = Data.getData().days ?? {};

    let pts = dates.flatMap(date => {
      const d  = daysData[date];
      const hr = d?.resting_hr ?? null;
      const hv = d?.hrv        ?? null;
      if (hr == null && hv == null) return [];
      return [{ date, hr, hv }];
    });
    if (!pts.length) return;
    if (pts.length > 45) { const s = Math.ceil(pts.length / 45); pts = pts.filter((_, i) => i % s === 0 || i === pts.length - 1); }

    const textClr = cssVar('--clr-text-2');
    const gridClr = cssVar('--clr-border');
    const hasHR   = pts.some(p => p.hr != null);
    const hasHV   = pts.some(p => p.hv != null);

    const datasets = [];
    if (hasHR) datasets.push({
      label: 'Resting HR (bpm)', data: pts.map(p => p.hr), yAxisID: 'y',
      borderColor: '#f44336', backgroundColor: 'rgba(244,67,54,0.08)',
      pointBackgroundColor: '#f44336', pointRadius: 3, tension: 0.3, fill: false, spanGaps: true,
    });
    if (hasHV) datasets.push({
      label: 'HRV (ms)', data: pts.map(p => p.hv), yAxisID: 'y1',
      borderColor: '#9c27b0', backgroundColor: 'rgba(156,39,176,0.08)',
      pointBackgroundColor: '#9c27b0', pointRadius: 3, tension: 0.3, fill: false, spanGaps: true,
    });

    createChart('rpt-biometrics-chart', {
      type: 'line',
      data: { labels: pts.map(p => p.date.slice(5).replace('-', '/')), datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textClr, boxWidth: 12, font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: textClr, maxTicksLimit: 8 }, grid: { display: false } },
          y:  { type: 'linear', position: 'left',  display: hasHR, title: { display: true, text: 'bpm', color: textClr, font: { size: 10 } },
                ticks: { color: '#f44336' }, grid: { color: gridClr } },
          y1: { type: 'linear', position: 'right', display: hasHV, title: { display: true, text: 'ms', color: textClr, font: { size: 10 } },
                ticks: { color: '#9c27b0' }, grid: { drawOnChartArea: false } },
        },
      },
    });
  }

  // ── Main render ───────────────────────────────────────────────────────────────

  // Renders only the chart sections — period bar is persistent (built in init)
  function render() {
    const el = document.getElementById('reports-content');
    if (!el) return;

    const dates = getDatesInPeriod();

    el.innerHTML =
        buildSleepSection(dates)
      + buildActivitySection(dates)
      + buildBiometricsSection(dates)
      + buildMoodSection(dates)
      + buildHabitsSection(dates)
      + buildHealthSection(dates)
      + buildModerationSection(dates)
      + buildMedicationsSection(dates)
      + buildBowelSection(dates)
      + buildReadingSection(dates)
      + buildGratitudesSection(dates);

    // Charts need the canvas elements to exist in DOM first
    requestAnimationFrame(() => {
      renderSleepCharts(dates);
      renderActivityCharts(dates);
      renderBiometricsChart(dates);
      renderMoodChart(dates);
      renderHealthCharts(dates);
      renderModerationChart(dates);
      renderBowelCharts(dates);
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
