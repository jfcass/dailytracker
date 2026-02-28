# Health Vitals Bar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show sleep and Fitbit vitals at the top of the Health section on Today, hidden when no data exists for the current date.

**Architecture:** A `renderVitalsBar(date)` function added to `symptoms.js` renders into a new static `<div id="symp-vitals-bar">` in `index.html`. Called from `render()` so it updates whenever the Health section refreshes (date change, symptom add/edit, etc.). No new files.

**Tech Stack:** Vanilla JS, CSS custom properties, existing `Data.getData()` store.

---

## Task 1: Add container div to index.html

**Files:**
- Modify: `index.html`

**Step 1: Add the vitals bar div**

In `index.html`, find this line (around line 372):
```html
        <!-- Category manager panel — populated by symptoms.js -->
        <div id="symp-cat-panel" class="symp-cat-panel" hidden></div>
```

Insert this div immediately before it:
```html
        <!-- Vitals bar — sleep + Fitbit stats, rendered by symptoms.js -->
        <div id="symp-vitals-bar"></div>
```

**Step 2: Commit**

```bash
git add index.html
git commit -m "feat(vitals): add symp-vitals-bar container to Health section"
```

---

## Task 2: Add renderVitalsBar() to symptoms.js

**Files:**
- Modify: `js/symptoms.js`

**Step 1: Add the function**

In `js/symptoms.js`, find the `renderContent()` function (around line 168). Add this new function directly before it:

```js
  function renderVitalsBar(date) {
    const el = document.getElementById('symp-vitals-bar');
    if (!el) return;

    const day = (Data.getData().days ?? {})[date];
    if (!day) { el.innerHTML = ''; return; }

    let html = '';

    // ── Sleep block ─────────────────────────────────────────────────────────
    const sl = day.sleep;
    if (sl?.hours > 0) {
      const parts = [`<span class="symp-vitals-sleep-val">${sl.hours}\u202fh</span>`];
      if (sl.bedtime)   parts.push(`<span class="symp-vitals-meta">Bed\u00a0${sl.bedtime}</span>`);
      if (sl.wake_time) parts.push(`<span class="symp-vitals-meta">Wake\u00a0${sl.wake_time}</span>`);
      html += `<div class="symp-vitals-row">
        <span class="symp-vitals-label">Sleep</span>
        <div class="symp-vitals-sleep-stats">${parts.join('')}</div>
      </div>`;
    }

    // ── Vitals chips ─────────────────────────────────────────────────────────
    const chips = [];
    if (day.steps          != null) chips.push(`${day.steps.toLocaleString()}\u00a0steps`);
    if (day.resting_hr     != null) chips.push(`${day.resting_hr}\u00a0bpm`);
    if (day.hrv            != null) chips.push(`${day.hrv}\u00a0ms HRV`);
    if (day.spo2           != null) chips.push(`${day.spo2}%\u00a0SpO\u2082`);
    if (day.breathing_rate != null) chips.push(`${day.breathing_rate}\u00a0br/min`);

    if (chips.length) {
      html += `<div class="symp-vitals-row">
        <span class="symp-vitals-label">Vitals</span>
        <div class="symp-vitals-chips-row">
          ${chips.map(c => `<span class="symp-vitals-chip">${c}</span>`).join('')}
        </div>
      </div>`;
    }

    el.innerHTML = html;
  }
```

**Step 2: Call renderVitalsBar from render()**

In `render()` (around line 146), add a call to `renderVitalsBar` at the end of the function, just before the closing `}`:

Current end of `render()`:
```js
    renderIssuePanel();
    renderCatPanel();
    renderContent();
  }
```

Replace with:
```js
    renderIssuePanel();
    renderCatPanel();
    renderContent();
    renderVitalsBar(currentDate);
  }
```

**Step 3: Verify render() still calls all 4 sub-renders**

Read the `render()` function and confirm it now ends with:
```
renderIssuePanel();
renderCatPanel();
renderContent();
renderVitalsBar(currentDate);
```

**Step 4: Commit**

```bash
git add js/symptoms.js
git commit -m "feat(vitals): renderVitalsBar — sleep + vitals chips in Health section"
```

---

## Task 3: Add CSS styles

**Files:**
- Modify: `css/styles.css`

**Step 1: Find the insertion point**

Search for `.symp-issues-toggle-btn` in `css/styles.css` — this is the first rule in the `symp-` redesign block. Add the new vitals rules directly before it:

```css
/* ── Health section: vitals bar ─────────────────────────────────────────── */

#symp-vitals-bar:empty { display: none; }

.symp-vitals-row {
  display:     flex;
  align-items: center;
  flex-wrap:   wrap;
  gap:         6px;
  padding:     6px 16px;
}
.symp-vitals-row + .symp-vitals-row {
  padding-top: 2px;
}
#symp-vitals-bar {
  padding-bottom: 6px;
  border-bottom:  1px solid var(--clr-border);
  margin-bottom:  4px;
}
.symp-vitals-label {
  font-size:      0.7rem;
  font-weight:    700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color:          var(--clr-text-2);
  min-width:      36px;
}
.symp-vitals-sleep-stats {
  display:     flex;
  align-items: center;
  flex-wrap:   wrap;
  gap:         10px;
}
.symp-vitals-sleep-val {
  font-size:   0.9rem;
  font-weight: 700;
  color:       var(--clr-accent);
}
.symp-vitals-meta {
  font-size: 0.82rem;
  color:     var(--clr-text-2);
}
.symp-vitals-chips-row {
  display:  flex;
  flex-wrap: wrap;
  gap:       5px;
}
.symp-vitals-chip {
  font-size:     0.78rem;
  padding:       3px 9px;
  border-radius: 20px;
  background:    var(--clr-surface-2);
  color:         var(--clr-text);
  white-space:   nowrap;
}
```

**Step 2: Commit**

```bash
git add css/styles.css
git commit -m "feat(vitals): CSS for sleep + vitals bar in Health section"
```

---

## Verification

1. Open Today tab → Health section — no vitals bar visible (Fitbit not connected / no data yet)
2. In browser DevTools console, manually inject data and re-render:
   ```js
   const day = Data.getDay(Data.today());
   day.sleep = { hours: 7.5, bedtime: '23:15', wake_time: '06:45', quality: null };
   day.steps = 8204; day.resting_hr = 58; day.hrv = 42.3; day.spo2 = 96.1; day.breathing_rate = 14.2;
   Symptoms.render();
   ```
3. Sleep row appears: `Sleep   7.5 h   Bed 23:15   Wake 06:45`
4. Vitals row appears: `Vitals   8,204 steps   58 bpm   42.3 ms HRV   96.1% SpO₂   14.2 br/min`
5. Set `day.hrv = null; Symptoms.render()` — HRV chip disappears, others remain
6. Set `day.sleep.hours = 0; Symptoms.render()` — Sleep row disappears
7. Navigate to a different date (no data) → bar empties / hides
