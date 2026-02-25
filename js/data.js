/**
 * data.js — Google Drive file I/O + in-memory data store
 *
 * All data lives in a single JSON file on Google Drive.
 * The schema is versioned; new fields are merged in on load.
 */
const Data = (() => {

  // ── Schema defaults ─────────────────────────────────────────────────────────

  const SCHEMA_DEFAULTS = {
    version: '1.1',
    settings: {
      pin_hash: null,
      habits: ['Reading', 'Gym', 'Photo Stroll'],
      moderation_substances: [
        { id: 'alcohol',  name: 'Alcohol',  default_unit: 'drinks'   },
        { id: 'cannabis', name: 'Cannabis', default_unit: 'sessions' },
        { id: 'coffee',   name: 'Coffee',   default_unit: 'cups'     },
      ],
      symptom_categories: ['Eyes', 'Body Pain', 'GI', 'Headaches', 'Other'],
      theme: 'system',
      weather_unit: 'auto',
    },
    days:            {},
    ongoing_issues:  {},
    medications:     {},
    books:           {},
    issues:          {},
  };

  // ── State ───────────────────────────────────────────────────────────────────

  let fileId = null;
  let data   = null;

  // ── Drive helpers ────────────────────────────────────────────────────────────

  async function driveGet(path, params = {}) {
    const token = Auth.getToken();
    if (!token) throw new Error('Not authenticated');

    const url = new URL(`${CONFIG.DRIVE_API}${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Drive API ${res.status}: ${path}`);
    return res;
  }

  async function findFile() {
    const res  = await driveGet('/files', {
      q:      `name='${CONFIG.DATA_FILE_NAME}' and trashed=false`,
      fields: 'files(id)',
      spaces: 'drive',
    });
    const json = await res.json();
    return json.files?.[0]?.id ?? null;
  }

  async function readFile(id) {
    const res = await driveGet(`/files/${id}`, { alt: 'media' });
    return res.json();
  }

  async function writeFile(content) {
    const token = Auth.getToken();
    if (!token) throw new Error('Not authenticated');

    const body     = JSON.stringify(content, null, 2);
    const metadata = JSON.stringify({
      name:     CONFIG.DATA_FILE_NAME,
      mimeType: 'application/json',
    });

    const form = new FormData();
    form.append('metadata', new Blob([metadata], { type: 'application/json' }));
    form.append('media',    new Blob([body],     { type: 'application/json' }));

    if (!fileId) {
      // Create new file
      const res = await fetch(
        `${CONFIG.DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
      );
      if (!res.ok) throw new Error(`Drive create failed: ${res.status}`);
      const json = await res.json();
      fileId = json.id;
    } else {
      // Update existing file
      const res = await fetch(
        `${CONFIG.DRIVE_UPLOAD}/files/${fileId}?uploadType=multipart`,
        { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: form }
      );
      if (!res.ok) throw new Error(`Drive update failed: ${res.status}`);
    }
  }

  // ── Schema migration / merge ─────────────────────────────────────────────────

  function mergeWithDefaults(loaded) {
    return {
      ...SCHEMA_DEFAULTS,
      ...loaded,
      settings: {
        ...SCHEMA_DEFAULTS.settings,
        ...(loaded.settings ?? {}),
      },
    };
  }

  function migrateData(d) {
    const habits = d.settings?.habits ?? [];

    // Rename "Long Walk" → "Photo Stroll" everywhere
    const lwIdx = habits.indexOf('Long Walk');
    if (lwIdx !== -1) {
      habits[lwIdx] = 'Photo Stroll';
      Object.values(d.days ?? {}).forEach(day => {
        if (day.habits && 'Long Walk' in day.habits) {
          day.habits['Photo Stroll'] = day.habits['Long Walk'];
          delete day.habits['Long Walk'];
        }
      });
    }

    // Add Coffee to moderation substances if missing
    const subs = d.settings?.moderation_substances ?? [];
    if (!subs.find(s => s.id === 'coffee')) {
      subs.push({ id: 'coffee', name: 'Coffee', default_unit: 'cups' });
      d.settings.moderation_substances = subs;
    }

    return d;
  }

  // ── Public: load / save ──────────────────────────────────────────────────────

  async function load() {
    fileId = await findFile();
    if (fileId) {
      const loaded = await readFile(fileId);
      data = migrateData(mergeWithDefaults(loaded));
    } else {
      // Brand-new user — start with defaults
      data = structuredClone(SCHEMA_DEFAULTS);
    }
    return data;
  }

  async function save() {
    if (!data) return;
    await writeFile(data);
  }

  // ── PIN helpers ──────────────────────────────────────────────────────────────

  async function hashPIN(pin) {
    const enc    = new TextEncoder();
    const buf    = await crypto.subtle.digest('SHA-256', enc.encode(CONFIG.PIN_SALT + pin));
    return Array.from(new Uint8Array(buf))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
  }

  async function verifyPIN(pin) {
    if (!data?.settings?.pin_hash) return false;
    return (await hashPIN(pin)) === data.settings.pin_hash;
  }

  async function setPIN(pin) {
    data.settings.pin_hash = await hashPIN(pin);
    await save();
  }

  function hasPIN() {
    return !!data?.settings?.pin_hash;
  }

  // ── Day helpers ───────────────────────────────────────────────────────────────

  function today() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function getDay(dateStr) {
    if (!data.days[dateStr]) {
      data.days[dateStr] = {
        habits:            {},
        moderation:        {},
        issue_logs:        [],
        sleep:             null,
        mood:              null,
        food:              { notes: '', entries: [] },
        medications_taken: [],
        social:            [],
        reading:           [],
        gym:               { muscle_groups: [] },
        note:              '',
      };
    }
    return data.days[dateStr];
  }

  function getData()      { return data; }
  function getSettings()  { return data?.settings; }

  return {
    load, save,
    hashPIN, verifyPIN, setPIN, hasPIN,
    getData, getSettings, getDay, today,
  };
})();
