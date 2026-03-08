/**
 * bucket-datenav.js — Per-bucket date navigation
 *
 * Manages independent date state for each bucket (Health, Routine, Wellbeing, Reflections).
 * Persists date to localStorage so user's date context is restored when returning to a bucket.
 */
const BucketDateNav = (() => {

  let currentBucketId = null;
  let currentDate = null;
  let onChange = null;  // (dateStr) => void

  // ── Public ────────────────────────────────────────────────────────────────

  function init(bucketId, onChangeCb) {
    currentBucketId = bucketId;
    onChange = onChangeCb;

    // Read persisted date from localStorage, fall back to today
    const key = `ht_bucket_date_${bucketId}`;
    const stored = localStorage.getItem(key);
    currentDate = stored && isValidDate(stored) ? stored : Data.today();

    // Don't fire onChange on init—caller will render based on currentDate
  }

  function getDate() {
    return currentDate;
  }

  function getDateLabel() {
    if (!currentDate) return '';
    const today = Data.today();
    if (currentDate === today) return 'Today';
    if (currentDate === shiftDate(today, -1)) return 'Yesterday';
    return new Date(currentDate + 'T12:00:00').toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  }

  function isToday() {
    return currentDate === Data.today();
  }

  function navigate(delta) {
    const candidate = shiftDate(currentDate, delta);
    const today = Data.today();

    // Don't allow future dates
    if (candidate > today) return;

    // TODO: In Task 5, add earliest-data boundary check
    // For now, allow navigation to any past date

    setDate(candidate);
  }

  function setDate(dateStr) {
    if (!isValidDate(dateStr)) return;
    currentDate = dateStr;
    persistDate();
    if (onChange) onChange(currentDate);
  }

  function goToday() {
    setDate(Data.today());
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  function persistDate() {
    if (currentBucketId) {
      localStorage.setItem(`ht_bucket_date_${currentBucketId}`, currentDate);
    }
  }

  function isValidDate(dateStr) {
    return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(Date.parse(dateStr));
  }

  function shiftDate(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return { init, getDate, getDateLabel, isToday, navigate, setDate, goToday };
})();
