# Hub Reminder — Smart Next-Med Banner

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the static `getReminderText()` in `hub.js` with a time-aware, actionable banner that shows the single most relevant upcoming medication task based on the prior day's logged times. Users can tap the banner text to navigate to Medications, or tap a ✓ button to log it instantly.

**Architecture:** The banner becomes data-driven — `getNextPendingItem()` returns a structured object `{ text, type, slot?, medId? }` instead of a plain string. Items are sorted by their inferred expected time (from yesterday's log), interleaving slots and reminder meds chronologically. Two public functions (`logSlot`, `logReminder`) are exposed from `Medications` so hub.js can save without duplicating logic.

**Tech Stack:** Vanilla JS, existing `Data.getDay()` / `Data.getData()` API, `Medications` module (new public API), `hub.js` (replace `getReminderText` + update banner render)

---

## Design Decisions

### Interleaved chronological ordering

Items are sorted by their **expected time** derived from yesterday's data:
- Slot expected time → `dayYest.med_slots[slot].time` (e.g., AM: 6:15am, Afternoon: 1:00pm)
- Reminder med expected time → `dayYest.med_reminders[medId]` (e.g., 11:15am)
- Fallback defaults: AM=08:00, Afternoon=12:00, PM=20:00, reminder=09:00

With the example (AM 6:15am, reminder med 11:15am, Afternoon 1:00pm), the sorted order is:
1. AM meds → due at 6:15am → shown until logged
2. Reminder med → due at 11:15am → shown once AM is done
3. Afternoon meds → due at 1:00pm → shown once reminder med is done

A pending item is "due" when `currentTime >= expectedTime − 30 min`. Items not yet due are skipped.

### Two-zone banner UX

```
╔══════════════════════════════════════════╗
║ • AM meds due          [✓]              ║
╚══════════════════════════════════════════╝
  ^tap text → opens Meds    ^tap ✓ → logs now
```

- **Tap text / dot area** → `Hub.openSection('section-meds')`
- **Tap ✓ button** → logs with current time, hub re-renders (banner advances or disappears)
- **Habits reminder** (fallback, no time threshold): text-only, no ✓ button — tapping opens Routine bucket

---

### Task 1: Expose `logSlot` and `logReminder` as public API on `Medications`

**Files:**
- Modify: `js/medications.js` — the `return` statement at the bottom of the IIFE

**Current return (approximate):**
```javascript
return { render, init, setDate, startTick };
```

**New return:**
```javascript
return { render, init, setDate, startTick, logSlot, logReminder };
```

**Step 1: Find the return statement**

Search for `return {` near the end of the `Medications` IIFE (around line 1014+). Confirm `logSlot` and `logReminder` are the private functions at lines ~801 and ~1001.

**Step 2: Add them to the return**

Edit the return statement to include `logSlot` and `logReminder`.

Note: `logSlot` internally uses `currentDate` (the module's date state) and calls `scheduleSave()` + `render()`. When called from hub.js:
- `currentDate` will be whatever date Medications last rendered (today, since meds are today-only)
- `scheduleSave()` will save to Drive (correct)
- `render()` will re-render the hidden `#meds-content` (harmless — it won't be visible)

**Step 3: Commit**

```bash
git add js/medications.js
git commit -m "feat: expose logSlot and logReminder on Medications public API"
```

---

### Task 2: Replace `getReminderText()` with `getNextPendingItem()` in `hub.js`

**Files:**
- Modify: `js/hub.js:116-140`

**Step 1: Read lines 116–140 to confirm current function boundaries**

**Step 2: Replace with the new function**

```javascript
/**
 * Returns the next actionable pending item, or null if nothing due.
 * Result: { text, type, slot?, medId? }
 *   type = 'slot' | 'reminder' | 'habits'
 *
 * Items are sorted by inferred expected time (from yesterday's log),
 * interleaving scheduled slots and reminder meds chronologically.
 * An item is "due" when currentTime >= expectedTime − 30 min.
 */
function getNextPendingItem() {
  const today    = Data.today();
  const dayToday = Data.getDay(today);

  // Yesterday's date string
  const d = new Date(today + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  const yesterday = d.toISOString().slice(0, 10);
  const dayYest   = Data.getDay(yesterday) ?? {};

  const allMeds  = Object.values(Data.getData().medications ?? {}).filter(m => m.active);
  const medSlots = dayToday.med_slots    ?? {};
  const medRems  = dayToday.med_reminders ?? {};

  const now         = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();

  // Parse "HH:MM" → minutes since midnight (returns null if invalid)
  function parseMins(hhmm) {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(':').map(Number);
    return isNaN(h) || isNaN(m) ? null : h * 60 + m;
  }

  const SLOT_DEFAULTS = { am: 8 * 60, afternoon: 12 * 60, pm: 20 * 60 };
  const SLOT_LABELS   = { am: 'AM',   afternoon: 'Afternoon', pm: 'PM'  };

  // Build candidate list: all pending items with their expected time
  const candidates = [];

  // Scheduled slots
  for (const slot of ['am', 'afternoon', 'pm']) {
    const slotMeds = allMeds.filter(m => !m.as_needed && !m.med_reminder && (m.slots ?? []).includes(slot));
    if (!slotMeds.length) continue;
    if (medSlots[slot]?.time) continue;   // already logged

    const expectedMins = parseMins(dayYest?.med_slots?.[slot]?.time) ?? SLOT_DEFAULTS[slot];
    candidates.push({
      expectedMins,
      text: `${SLOT_LABELS[slot]} meds due`,
      type: 'slot',
      slot,
    });
  }

  // Reminder meds
  allMeds.filter(m => m.med_reminder && !medRems[m.id]).forEach(m => {
    const expectedMins = parseMins(dayYest?.med_reminders?.[m.id]) ?? 9 * 60; // 9am default
    candidates.push({
      expectedMins,
      text: `${m.name} reminder`,
      type: 'reminder',
      medId: m.id,
    });
  });

  // Sort by expected time
  candidates.sort((a, b) => a.expectedMins - b.expectedMins);

  // Return the first item that is due (within 30 min window or overdue)
  for (const item of candidates) {
    if (currentMins >= item.expectedMins - 30) return item;
  }

  // Habits fallback — only after 6pm
  if (now.getHours() >= 18) {
    const habits  = Data.getSettings().habits ?? [];
    const dayHabs = dayToday.habits ?? {};
    const undone  = habits.filter(h => !dayHabs[h]);
    if (undone.length > 0) {
      return {
        text: `${undone.length} habit${undone.length > 1 ? 's' : ''} left`,
        type: 'habits',
      };
    }
  }

  return null;
}
```

**Step 3: Commit**

```bash
git add js/hub.js
git commit -m "feat: getNextPendingItem — chronological interleaving of slots and reminder meds"
```

---

### Task 3: Update banner render in `renderHome()` to use structured item + ✓ button

**Files:**
- Modify: `js/hub.js` — the banner-building block inside `renderHome()` (lines ~722–735)

**Step 1: Read the current banner block**

Locate in `renderHome()`:
```javascript
const reminderText = getReminderText();
if (reminderText) {
  const banner = document.createElement('div');
  banner.className = 'hub-reminder';
  banner.innerHTML = `
    <div class="hub-reminder__dot"></div>
    <div class="hub-reminder__text">${reminderText}</div>`;
  container.insertBefore(banner, home);
}
```

**Step 2: Replace with actionable banner**

```javascript
const pending = getNextPendingItem();
if (pending) {
  const banner = document.createElement('div');
  banner.className = 'hub-reminder';
  const isLoggable = pending.type === 'slot' || pending.type === 'reminder';
  banner.innerHTML = `
    <div class="hub-reminder__dot"></div>
    <div class="hub-reminder__text">${pending.text}</div>
    ${isLoggable ? `<button class="hub-reminder__check" aria-label="Mark done" type="button">✓</button>` : ''}`;

  // Tap text → navigate to Medications (or Routine for habits)
  banner.querySelector('.hub-reminder__text')?.addEventListener('click', () => {
    if (pending.type === 'habits') {
      openSection('section-habits');
    } else {
      openSection('section-meds');
    }
  });
  banner.querySelector('.hub-reminder__dot')?.addEventListener('click', () => {
    if (pending.type === 'habits') {
      openSection('section-habits');
    } else {
      openSection('section-meds');
    }
  });

  // Tap ✓ → log immediately, re-render hub
  if (isLoggable) {
    banner.querySelector('.hub-reminder__check')?.addEventListener('click', e => {
      e.stopPropagation();
      if (pending.type === 'slot') {
        Medications.logSlot(pending.slot);
      } else if (pending.type === 'reminder') {
        Medications.logReminder(pending.medId);
      }
      renderHome();   // advance to next pending item (or hide banner)
    });
  }

  container.insertBefore(banner, home);
}
```

**Step 3: Commit**

```bash
git add js/hub.js
git commit -m "feat: hub reminder banner — actionable ✓ button logs slot/reminder in-place"
```

---

### Task 4: Style the ✓ button in `css/styles.css`

**Files:**
- Modify: `css/styles.css` — append after `.hub-reminder__text` block

**Step 1: Find the existing `.hub-reminder__text` rule**

It ends around line 8592. After it, append:

```css
.hub-reminder__check {
  margin-left: auto;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1.5px solid var(--hub-amber);
  background: transparent;
  color: var(--hub-amber);
  font-size: 14px;
  font-family: var(--hub-font);
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
  -webkit-tap-highlight-color: transparent;
}

.hub-reminder__check:active {
  background: var(--hub-amber);
  color: #000;
}
```

**Step 2: Commit**

```bash
git add css/styles.css
git commit -m "style: hub reminder check button — amber circle ✓"
```

---

### Task 5: Verify edge cases

**Manual test checklist:**

1. **No meds configured** — banner is absent (no crash)
2. **All meds logged for the day** — banner is absent
3. **First day of use (no yesterday data)** — falls back to defaults (AM reminder appears at 7:30am+, Afternoon at 11:30am+, PM at 7:30pm+)
4. **Reminder med expected at 11:15am, Afternoon at 1:00pm** — at 11:15am, reminder med shows; after tapping ✓, banner advances to Afternoon (or hides if not yet 12:30pm)
5. **Tap ✓ on slot** — slot logged, banner updates immediately, no navigation required
6. **Tap ✓ on reminder med** — med logged, banner updates immediately
7. **Tap text on slot banner** — opens Health bucket, scrolls to Medications section
8. **After 6pm with no meds pending** — habits fallback shows (no ✓ button)

No code changes needed after verification — just confirm expected behavior.

---

## Summary

| Task | File | Change |
|------|------|--------|
| 1 | `medications.js` | Expose `logSlot`, `logReminder` publicly |
| 2 | `hub.js` | Replace `getReminderText()` with `getNextPendingItem()` — chronological interleaving |
| 3 | `hub.js` | Update banner render to use structured item + ✓ button with event handlers |
| 4 | `styles.css` | Style the ✓ button |
| 5 | — | Manual verification |

The result: the hub banner shows the **single next task** in your real-world order (learned from yesterday), and one tap marks it done without leaving the hub.
