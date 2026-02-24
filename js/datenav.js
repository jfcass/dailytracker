/**
 * datenav.js — Shared date navigator
 *
 * Renders the single date bar at the top of the main app view.
 * All sections read their date from DateNav.getDate() and receive
 * updates via the onChange callback passed to init().
 */
const DateNav = (() => {

  let currentDate = null;
  let onChange    = null;   // (dateStr) => void

  // ── Public ────────────────────────────────────────────────────────────────

  function init(onChangeCb) {
    onChange    = onChangeCb;
    currentDate = Data.today();

    document.getElementById('app-prev-day')
      .addEventListener('click', () => navigate(-1));
    document.getElementById('app-next-day')
      .addEventListener('click', () => navigate(+1));
    document.getElementById('app-today-btn')
      .addEventListener('click', goToday);

    // Calendar button triggers the hidden date input
    const calBtn = document.getElementById('app-cal-btn');
    const picker = document.getElementById('app-date-picker');

    picker.max = Data.today();   // disallow future dates

    calBtn.addEventListener('click', () => {
      picker.value = currentDate;
      try { picker.showPicker(); } catch { picker.click(); }
    });

    picker.addEventListener('change', e => {
      const val = e.target.value;
      if (val && val <= Data.today()) setDate(val);
    });

    render();
  }

  function getDate() { return currentDate; }

  // ── Internal ──────────────────────────────────────────────────────────────

  function navigate(delta) {
    const candidate = shiftDate(currentDate, delta);
    if (delta > 0 && candidate > Data.today()) return;
    setDate(candidate);
  }

  function goToday() {
    setDate(Data.today());
  }

  function setDate(date) {
    currentDate = date;
    render();
    if (onChange) onChange(currentDate);
  }

  function render() {
    const isToday = currentDate === Data.today();

    document.getElementById('app-date-label').textContent = fmtDateLabel(currentDate);
    document.getElementById('app-next-day').disabled = isToday;

    const todayBtn = document.getElementById('app-today-btn');
    if (todayBtn) todayBtn.hidden = isToday;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function fmtDateLabel(dateStr) {
    const today = Data.today();
    if (dateStr === today)                return 'Today';
    if (dateStr === shiftDate(today, -1)) return 'Yesterday';
    return new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  }

  function shiftDate(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return { init, getDate };
})();
