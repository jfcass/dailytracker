/**
 * vitals.js — Vitals section for the Today tab.
 *
 * Renders a stats row (steps / calories / floors) and a vitals bar
 * (sleep detail, HR, HRV, SpO2, breathing rate) from day data.
 * Works in both accordion and Hub bucket layouts.
 */
const Vitals = (() => {

  let currentDate = '';

  // ── Public API ────────────────────────────────────────────────────────────

  function init() {
    currentDate = Data.today();
    render();
  }

  function setDate(date) {
    currentDate = date;
    render();
  }

  function render() {
    _renderStatsRow();
    _renderVitalsBar();
  }

  // ── Stats row (steps / calories / floors) ─────────────────────────────────

  function _renderStatsRow() {
    const el = document.getElementById('vitals-stats-row');
    if (!el) return;
    const day = Data.getDay(currentDate);
    const stats = [
      { ico: '👣', val: day?.steps    != null ? day.steps.toLocaleString()    : null, lbl: 'steps'    },
      { ico: '🔥', val: day?.calories != null ? day.calories.toLocaleString() : null, lbl: 'calories' },
      { ico: '🏢', val: day?.floors   != null && day.floors > 0 ? String(day.floors) : null, lbl: 'floors'   },
    ];
    el.innerHTML = `<div class="vitals-stats-row">${
      stats.map(s => `
        <div class="vitals-stat">
          <span class="vitals-stat__ico">${s.ico}</span>
          <span class="vitals-stat__val">${s.val ?? '—'}</span>
          <span class="vitals-stat__lbl">${s.lbl}</span>
        </div>`).join('')
    }</div>`;
  }

  // ── Vitals bar (sleep detail + HR / HRV / SpO2 / breathing) ──────────────

  function _renderVitalsBar() {
    const el = document.getElementById('vitals-bar');
    if (!el) return;
    const day = Data.getDay(currentDate);
    if (!day) { el.innerHTML = ''; return; }

    let html = '';

    // Sleep block — only if hours logged
    const sl = day.sleep;
    if (sl?.hours > 0) {
      let sleepHtml = `<span class="vitals-sleep-val">${sl.hours}\u202fh</span>`;

      if (day.sleep_efficiency != null) {
        const effCls = day.sleep_efficiency >= 85 ? 'good'
                     : day.sleep_efficiency >= 75 ? 'ok' : 'low';
        sleepHtml += `<span class="vitals-sleep-eff vitals-sleep-eff--${effCls}">${day.sleep_efficiency}%</span>`;
      }

      const deep  = day.sleep_deep  ?? 0;
      const light = day.sleep_light ?? 0;
      const rem   = day.sleep_rem   ?? 0;
      const awake = day.sleep_awake ?? 0;
      const total = deep + light + rem + awake;
      if (total > 0) {
        const pct = v => ((v / total) * 100).toFixed(1);
        sleepHtml += `
          <div class="vitals-sleep-stages"
               title="Deep ${deep}m \u00b7 REM ${rem}m \u00b7 Light ${light}m \u00b7 Awake ${awake}m">
            <span class="vitals-sleep-seg vitals-sleep-seg--deep"  style="width:${pct(deep)}%"></span>
            <span class="vitals-sleep-seg vitals-sleep-seg--rem"   style="width:${pct(rem)}%"></span>
            <span class="vitals-sleep-seg vitals-sleep-seg--light" style="width:${pct(light)}%"></span>
            <span class="vitals-sleep-seg vitals-sleep-seg--awake" style="width:${pct(awake)}%"></span>
          </div>
          <span class="vitals-sleep-stages-label">Deep\u00a0${deep}m \u00b7 REM\u00a0${rem}m \u00b7 Light\u00a0${light}m</span>`;
      }

      html += `<div class="vitals-row">
        <span class="vitals-label">Sleep</span>
        <div class="vitals-sleep-stats">${sleepHtml}</div>
      </div>`;
    }

    // Vitals chips — steps/calories/floors excluded (shown in stats row above)
    const chips = [];
    if (day.resting_hr     != null) chips.push(`${day.resting_hr}\u00a0bpm`);
    if (day.hrv            != null) chips.push(`${day.hrv}\u00a0ms HRV`);
    if (day.spo2           != null) chips.push(`${day.spo2}%\u00a0SpO\u2082`);
    if (day.breathing_rate != null) chips.push(`${day.breathing_rate}\u00a0br/min`);
    if (day.active_minutes != null) chips.push(`${day.active_minutes}\u00a0active\u00a0min`);

    if (chips.length) {
      html += `<div class="vitals-row">
        <span class="vitals-label">Vitals</span>
        <div class="vitals-chips-row">${
          chips.map(c => `<span class="vitals-chip">${c}</span>`).join('')
        }</div>
      </div>`;
    }

    el.innerHTML = html;
  }

  return { init, render, setDate };
})();
