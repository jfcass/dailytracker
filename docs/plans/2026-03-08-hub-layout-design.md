# Hub Layout — Design Document

**Date:** 2026-03-08
**Status:** Approved — ready for implementation

---

## Goal

Replace the Today tab's single scrolling accordion with a **2×2 tile hub** that organises all tracking sections into four meaningful buckets. Users get an at-a-glance summary of their day and can tap into any bucket to log or review. The existing Accordion Stack layout is preserved as an alternative the user can toggle in Settings.

---

## Layout Name

| Name | Description |
|---|---|
| **Accordion Stack** | Existing layout — scrollable column of collapsible sections |
| **Hub View** | New layout — 2×2 tile grid with bucket navigation |

The user chooses their layout in **Settings → Account**. Default remains Accordion Stack (no breaking change for existing users).

---

## The Four Buckets

| Position | Bucket | Sections it contains | Button type |
|---|---|---|---|
| Top-left | **Routine** | Habits · Moderation | Simple "Log" |
| Top-right | **Wellbeing** | Sleep · Mood/Energy | Simple "Log" |
| Bottom-left | **Health** | Symptoms · Medications · Digestion · Treatments | Swipeable |
| Bottom-right | **Reflections** | Gratitudes · Note | Swipeable |

**Treatments** is removed from the bottom nav and lives exclusively inside the Health bucket.

---

## Hub Screen Layout

```
┌──────────────────────────────────────┐
│ [notch]                              │
│ 9:41                         🔋 WiFi │
├──────────────────────────────────────┤
│ Saturday, Mar 7              [avatar]│
│ Good evening, J.                     │
│ ┌──────────┬──────────┬──────────┐   │
│ │ ☀️ 74°F  │🌬️ Good  │🌲 Med    │   │
│ │ Sunny    │ AQI 42  │ Pollen   │   │
│ └──────────┴──────────┴──────────┘   │
├──────────────────────────────────────┤
│ ● Metformin due · 2 habits remaining │  ← amber reminder strip (if any)
├──────────────────────────────────────┤
│ ┌──────────────┐  ┌──────────────┐   │
│ │▔▔▔▔▔▔▔▔▔▔▔▔▔▔│  │▔▔▔▔▔▔▔▔▔▔▔▔▔▔│  ← green gradient bar
│ │ Routine      │  │ Wellbeing    │   │
│ │              │  │              │   │
│ │ Reading      │  │ Mood         │   │
│ │ 14 day streak│  │ 😊 Good      │   │
│ │ 🔥           │  │ Energy High  │   │
│ │ ● ● ● ○      │  │              │   │
│ │ [   Log    ] │  │ [   Log    ] │   │
│ └──────────────┘  └──────────────┘   │
│ ┌──────────────┐  ┌──────────────┐   │
│ │▔▔▔▔▔▔▔▔▔▔▔▔▔▔│  │▔▔▔▔▔▔▔▔▔▔▔▔▔▔│   │
│ │ Health       │  │ Reflections  │   │
│ │              │  │              │   │
│ │ 💤           │  │ 6  🔥        │   │
│ │ 7.5          │  │ day gratitude│   │
│ │ Sleep tonight│  │ streak       │   │
│ │ ● ● ○        │  │              │   │
│ │‹ Log Symptom›│  │‹Log Gratitud›│   │
│ └──────────────┘  └──────────────┘   │
├──────────────────────────────────────┤
│  🏠 Today  📚 Library  📊 Reports  📋│
└──────────────────────────────────────┘
```

---

## Tile Anatomy

Each tile is a `186px min-height` card with:

1. **3px top bar** — sage green gradient, uniform across all four tiles
2. **Tile name** — 14px / weight 800 / `--text` colour. No emoji, no uppercase.
3. **Content area** — bucket-specific, see below
4. **Log button** — 48px fixed height, uniform across all four tiles

---

## Tile Content Specs

### Routine tile
- **Streak carousel** — rotates through all habits that have an active streak
  - One streak shown at a time: descriptor label (11.5px w500) → big number (32px w800 amber) + "day streak" unit (11px w400 text-3) + 🔥
  - Navigation dots below (tap to jump, swipe to advance)
  - Auto-advances every 5 seconds; randomises starting streak on each load/tab switch
  - If no active streaks: shows "Start your next streak" in 11.5px text-3
- **Button**: Simple centred "Log" — taps into Routine bucket detail screen

### Wellbeing tile
- **Rating display** — same 3-level hierarchy as streaks:
  - Descriptor: "Mood" (11.5px w500 text-2)
  - Value: emoji + word e.g. "😊 Good" (emoji 20px, word 28px w800 green)
  - Sub-label: "Energy · High · Sleep 7.5h" (11px w400 text-3)
  - If not yet rated today: shows "Rate your day" CTA in place of value
- **Button**: Simple centred "Log" — taps into Wellbeing bucket detail screen

### Health tile
- **Stats carousel** — rotates through: Sleep (hours), Steps (count), Calories (burned)
  - Same carousel pattern as Routine: descriptor label → 32px w800 amber value → 11px unit label
  - Navigation dots; auto-advances every 4.5 seconds; randomised start
  - Values pulled from today's data; shows "—" if not available
- **Button**: Swipeable `‹ Log Symptom ›`
  - Cycles: Log Symptom → Log Medication → Log Digestion → Log Treatment
  - 36px drag threshold to distinguish swipe from tap
  - Tapping navigates directly into that specific section within Health

### Reflections tile
- **Streak display** — gratitude streak:
  - Big number (32px w800 amber) + 🔥 + "day gratitude streak" label (11px w400 text-3)
  - If no streak: "Start your next streak"
- **Button**: Swipeable `‹ Log Gratitude ›`
  - Cycles: Log Gratitude → Add Note
  - Tapping navigates into that specific section within Reflections

---

## Navigation Model

```
Today Hub
  ↓ tap tile
Bucket Detail Screen
  ↓ tap section
Section Detail (existing section UI, unchanged)
  ↓ back button (‹ Bucket Name)
Bucket Detail Screen
  ↓ back button (‹ Today)
Today Hub
```

- Bucket detail screen shows the bucket's sections as navigable rows (or mini-cards)
- Section content UI is identical to the existing accordion-expanded content — no rebuild required
- Slide animation (translate X) for hub → bucket → section transitions
- Back button in header; swipe-right gesture also navigates back

### Swipeable log button navigation
- Tapping the log button body (not a chevron) navigates directly to that section
- Chevrons only cycle the label; they do not navigate

---

## Bottom Nav Change

Remove **Treatments** tab. Nav becomes 4 items:

| Icon | Label | Tab |
|---|---|---|
| 🏠 | Today | today |
| 📚 | Library | library |
| 📊 | Reports | reports |
| 📋 | Log | health-log |

Treatments content is accessed via Today Hub → Health → Treatments.

---

## Visual Design Tokens

### Typography
- **Font family**: Outfit (Google Fonts) — loaded alongside existing Figtree
- Hub View screens use Outfit; existing screens keep Figtree
- Flag for future: consider migrating whole app to Outfit in a separate pass

### Colour palette (Hub View)

| Token | Value | Usage |
|---|---|---|
| `--green` | `#5eb88a` | All log buttons, top bars, active nav, progress dots active |
| `--green-dim` | `rgba(94,184,138,0.13)` | Button backgrounds |
| `--green-bd` | `rgba(94,184,138,0.28)` | Button borders |
| `--amber` | `#d4965a` | Primary values (numbers, streaks), reminder banner, pollen chip |
| `--amber-dim` | `rgba(212,150,90,0.12)` | Reminder background |
| `--amber-bd` | `rgba(212,150,90,0.26)` | Reminder border |

### Text hierarchy (Hub tiles)

| Level | Size | Weight | Colour | Examples |
|---|---|---|---|---|
| Tile name | 14px | 800 | `--text` | "Routine", "Health" |
| Descriptor label | 11.5px | 500 | `--text-2` | "Reading", "Mood" |
| Primary value — number | 32px | 800 | `--amber` | "14", "7.5" |
| Primary value — word | 28px | 800 | `--green` | "Good" |
| Unit / sub-label | 11px | 400 | `--text-3` | "day streak", "Energy · High" |
| Log button label | 12.5–13px | 600 | `--green` | "Log", "Log Symptom" |

### Surfaces (dark / light)

| Token | Dark | Light |
|---|---|---|
| `--bg` | `#090c10` | `#eceee9` |
| `--surf` | `#111419` | `#f5f6f2` |
| `--surf-2` | `#181c23` | `#eaece6` |
| `--surf-3` | `#1e2229` | `#e0e3db` |
| `--border` | `rgba(255,255,255,0.065)` | `rgba(0,0,0,0.075)` |

---

## Reminder Banner

- Shows only when there is something actionable: pending medication, or evening approaching with incomplete habits
- Amber left-border strip with pulsing dot
- Text example: "Metformin due · 2 evening habits remaining"
- Hidden if nothing is pending

---

## Setting: Layout Toggle

Location: **Settings → Account card** (alongside the existing Accordion toggle)

```
Today Layout
  [ Hub View ]  [ Accordion ]
```

- Stored as `settings.today_layout: 'hub' | 'accordion'`
- Default: `'accordion'` (no change for existing users)
- Switching takes effect immediately on the Today tab

---

## Data Connections Required

| Tile | Data needed |
|---|---|
| Routine carousel | Per-habit streak lengths from `days[date].habits` history |
| Wellbeing display | `days[today].mood.mood`, `.energy`, `.sleep.hours` |
| Health carousel | `days[today].sleep.hours`, step/calorie data (placeholder if not available) |
| Reflections streak | Consecutive days with ≥1 gratitude entry |
| Reminder banner | Pending medications from `medications_taken`, habit completion vs time of day |

---

## Out of Scope

- Redesigning the section detail screens (existing UI unchanged)
- Adding step/calorie tracking (Health carousel shows "—" for unavailable data)
- Migrating font app-wide (Hub View only for now)
- Changing any data schema beyond adding `today_layout` to settings
