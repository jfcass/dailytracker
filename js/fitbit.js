/**
 * fitbit.js — Fitbit data sync
 *
 * Called from app.js showMain() after data loads.
 * Fetches today + yesterday from Fitbit and writes into Data.getDay().
 * Overwrites any manually entered values.
 */
const Fitbit = (() => {

  // ── API helper ────────────────────────────────────────────────────────────────

  async function apiFetch(path) {
    const token = FitbitAuth.getAccessToken();
    const res   = await fetch(`${CONFIG.FITBIT_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('Token expired — please reconnect Fitbit');
      throw new Error(`Fitbit API error ${res.status}: ${path}`);
    }
    return res.json();
  }

  // ── Date helper ───────────────────────────────────────────────────────────────

  function yesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y  = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dy = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${dy}`;
  }

  // ── Sync a single date ────────────────────────────────────────────────────────

  async function syncDate(date) {
    const [sleepRes, actRes, hrvRes, spo2Res, brRes] = await Promise.allSettled([
      apiFetch(`/sleep/date/${date}.json`),
      apiFetch(`/activities/date/${date}.json`),
      apiFetch(`/hrv/date/${date}.json`),
      apiFetch(`/spo2/date/${date}.json`),
      apiFetch(`/br/date/${date}.json`),
    ]);

    const day = Data.getDay(date);

    // Sleep: duration, bedtime, wake time, stages, efficiency
    if (sleepRes.status === 'fulfilled') {
      const main = (sleepRes.value.sleep ?? []).find(s => s.isMainSleep)
                ?? sleepRes.value.sleep?.[0];
      if (main) {
        if (!day.sleep) day.sleep = {};

        // Read stage data (modern devices have deep/light/rem/wake; older = asleep/restless/awake)
        const lvl = main.levels?.summary;
        const deep  = lvl?.deep?.minutes    ?? null;
        const light = lvl?.light?.minutes   ?? lvl?.restless?.minutes ?? null;
        const rem   = lvl?.rem?.minutes     ?? null;
        const awake = lvl?.wake?.minutes    ?? lvl?.awake?.minutes    ?? null;

        // Sleep hours: prefer deep+light+rem (matches Fitbit app "Sleep Duration").
        // Falls back to minutesAsleep for older devices without stage data.
        const stageTotal = (deep != null && light != null && rem != null)
          ? deep + light + rem
          : null;
        day.sleep.hours     = +(( stageTotal ?? main.minutesAsleep ) / 60).toFixed(1);
        // Fitbit times include date: "2026-02-27T23:15:00.000" → take HH:MM
        day.sleep.bedtime   = (main.startTime ?? '').slice(11, 16);
        day.sleep.wake_time = (main.endTime   ?? '').slice(11, 16);

        // Extra sleep fields
        day.sleep_efficiency = main.efficiency ?? null;
        day.sleep_deep  = deep;
        day.sleep_light = light;
        day.sleep_rem   = rem;
        day.sleep_awake = awake;
      }
    }

    // Steps + resting heart rate (both come from activities summary)
    if (actRes.status === 'fulfilled') {
      const summary = actRes.value.summary ?? {};
      if (summary.steps != null)       day.steps      = summary.steps;
      if (summary.restingHeartRate)    day.resting_hr = summary.restingHeartRate;
      if (summary.activityCalories != null) day.calories       = summary.activityCalories;
      const activeMin = (summary.fairlyActiveMinutes ?? 0) + (summary.veryActiveMinutes ?? 0);
      if (activeMin > 0)                    day.active_minutes = activeMin;
      if (summary.floors != null)           day.floors         = summary.floors;
    }

    // HRV — daily RMSSD in milliseconds
    if (hrvRes.status === 'fulfilled') {
      const rmssd = hrvRes.value.hrv?.[0]?.value?.dailyRmssd;
      if (rmssd != null) day.hrv = +rmssd.toFixed(1);
    }

    // SpO2 — average blood oxygen during sleep
    if (spo2Res.status === 'fulfilled') {
      const avg = spo2Res.value.value?.avg;
      if (avg != null) day.spo2 = +avg.toFixed(1);
    }

    // Breathing rate during sleep
    if (brRes.status === 'fulfilled') {
      const br = brRes.value.br?.[0]?.value?.breathingRate;
      if (br != null) day.breathing_rate = +br.toFixed(1);
    }
  }

  // ── Main sync entry point ─────────────────────────────────────────────────────

  async function sync() {
    if (!FitbitAuth.isConnected()) return;

    const d = Data.getData();

    try {
      await FitbitAuth.refreshIfNeeded();

      const today = Data.today();
      const yest  = yesterday();

      // Sync both days in parallel
      await Promise.all([syncDate(today), syncDate(yest)]);

      d.fitbit.last_sync  = today;
      d.fitbit.sync_error = null;
      await Data.save();

    } catch (err) {
      console.error('Fitbit sync error:', err);
      d.fitbit          = d.fitbit ?? {};
      d.fitbit.sync_error = err.message ?? 'Sync failed';
      await Data.save();
    }

    // Re-render Settings if it's the active tab (shows error/last-sync update)
    if (typeof Settings !== 'undefined') Settings.render();
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  return { sync };
})();
