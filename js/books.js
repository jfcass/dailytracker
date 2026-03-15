/**
 * books.js — Reading Tracker section
 *
 * Features:
 *  - Library panel: add/edit/delete books grouped by status
 *  - Google Books API lookup when adding a new book (cover art, auto-fill)
 *  - Daily section: select active book, log reading sessions (timer or manual)
 *  - Per-book stats: total time, current page, progress bar
 *  - Cover art displayed in library cards and daily reading selector
 */
const Books = (() => {

  // ── State ────────────────────────────────────────────────────────────────────

  let currentDate   = null;
  let showLibrary   = false;
  let addingBook    = false;
  let editingBookId = null;
  let editingSession = null;

  let activeBookId = null;

  // Timer
  let timerStart    = null;
  let timerInterval = null;
  let timerPaused   = false;
  let timerPausedMs = 0;    // accumulated ms before the current running segment

  // Session form fields
  let fMinutes    = '';
  let fPageEnd    = '';
  let fNotes      = '';
  let fDate       = '';
  let fFormBookId = null;

  // Session history toggle
  let sessionHistoryOpen = false;

  // Book form fields
  let fbTitle    = '';
  let fbAuthor   = '';
  let fbPages    = '';
  let fbCoverUrl = '';
  let fbIsbn     = '';

  // Book search state
  let fbSearchQuery    = '';
  let fbSearchResults  = [];
  let fbSearching      = false;
  let fbSearchError    = '';
  let fbSearchDebounce = null;

  let saveTimer = null;

  // Library tab UI state
  let heroBookIdx   = 0;    // which currently-reading book is shown in hero
  let detailBookId  = null; // which book's detail sheet is open
  let coverUrlInput = '';   // URL input for cover update in detail sheet

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtTime(totalMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0) return `${m}m`;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }

  function fmtShortDate(dateStr) {
    if (!dateStr) return '';
    const [y, mo, d] = dateStr.split('-').map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  function fmtLoggedAt(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  }

  function fmtTotalTime(mins) {
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  function getLastSessionDate(bookId) {
    const allDays = Data.getData().days ?? {};
    const dates = Object.keys(allDays)
      .filter(d => (allDays[d]?.reading ?? []).some(s => s.book_id === bookId))
      .sort();
    return dates.length ? dates[dates.length - 1] : null;
  }

  function getReadingStreak() {
    const allDays  = Data.getData().days ?? {};
    const sorted   = Object.keys(allDays).sort().reverse();
    const todayStr = Data.today();
    let streak = 0;
    for (const d of sorted) {
      if (d > todayStr) continue;
      const hasSessions = (allDays[d]?.reading ?? []).length > 0;
      if (hasSessions) { streak++; continue; }
      if (d === todayStr) continue; // today not read yet — don't break streak
      break;
    }
    return streak;
  }

  function getTotalReadMinutes() {
    const allDays = Data.getData().days ?? {};
    let total = 0;
    for (const day of Object.values(allDays)) {
      for (const s of (day.reading ?? [])) total += (s.minutes ?? 0);
    }
    return total;
  }

  function getBookDaysRead(bookId) {
    const allDays = Data.getData().days ?? {};
    const dates = new Set();
    for (const [date, day] of Object.entries(allDays)) {
      if ((day.reading ?? []).some(s => s.book_id === bookId)) dates.add(date);
    }
    return dates.size;
  }

  function scheduleSave() {
    setSaveStatus('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await Data.save();
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, 1200);
  }

  function setSaveStatus(status) {
    const el = document.getElementById('book-save-status');
    if (!el) return;
    const msgs = { saving: 'Saving…', saved: 'Saved', error: 'Save failed' };
    el.textContent = msgs[status] ?? '';
    el.dataset.status = status;
  }

  function getBooks() {
    const d = Data.getData();
    if (!d.books) d.books = {};
    return d.books;
  }

  function getSessions(dateStr) {
    const day = Data.getDay(dateStr);
    if (!day.reading) day.reading = [];
    return day.reading;
  }

  function getLastUsedBookId() {
    const books   = getBooks();
    const allDays = Object.keys(Data.getData().days ?? {}).sort().reverse();
    for (const d of allDays) {
      const sessions = Data.getData().days[d].reading ?? [];
      for (let i = sessions.length - 1; i >= 0; i--) {
        const book = books[sessions[i].book_id];
        if (book && book.status !== 'finished') return book.id;
      }
    }
    const active = Object.values(books).find(b => b.status !== 'finished');
    return active?.id ?? null;
  }

  function getBookStats(bookId) {
    let totalMinutes = 0;
    let currentPage  = 0;
    const days = Object.keys(Data.getData().days ?? {}).sort();
    for (const d of days) {
      for (const s of (Data.getData().days[d].reading ?? [])) {
        if (s.book_id !== bookId) continue;
        totalMinutes += (s.minutes ?? 0);
        if (s.page_end && s.page_end > currentPage) currentPage = s.page_end;
      }
    }
    return { totalMinutes, currentPage };
  }

  function calcPagesRead(sessionId, bookId) {
    const days    = Object.keys(Data.getData().days ?? {}).sort();
    const ordered = [];
    for (const d of days) {
      for (const s of (Data.getData().days[d].reading ?? [])) {
        if (s.book_id === bookId) ordered.push(s);
      }
    }
    const idx = ordered.findIndex(s => s.id === sessionId);
    if (idx < 0) return null;
    const curr = ordered[idx];
    if (!curr.page_end) return null;
    const prevPageEnd = idx > 0 ? (ordered[idx - 1].page_end || 0) : 0;
    const delta = curr.page_end - prevPageEnd;
    return delta > 0 ? delta : null;
  }

  // ── Google Books API search ───────────────────────────────────────────────────

  async function searchGoogleBooks(query) {
    if (!query.trim()) {
      fbSearchResults = [];
      fbSearchError   = '';
      fbSearching     = false;
      updateSearchDOM();
      return;
    }
    try {
      const key = CONFIG.BOOKS_API_KEY ? `&key=${encodeURIComponent(CONFIG.BOOKS_API_KEY)}` : '';
      const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5&printType=books${key}`;
      const res  = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      fbSearchError   = '';
      fbSearchResults = (json.items ?? []).map(item => {
        const info = item.volumeInfo ?? {};
        // Google returns http:// thumbnails — upgrade to https
        const thumb = info.imageLinks?.thumbnail?.replace('http://', 'https://') ?? null;
        const isbn  = (info.industryIdentifiers ?? []).find(x => x.type === 'ISBN_13')?.identifier
                   ?? (info.industryIdentifiers ?? []).find(x => x.type === 'ISBN_10')?.identifier
                   ?? null;
        return {
          title:     info.title ?? '(Unknown title)',
          author:    (info.authors ?? []).join(', '),
          pages:     info.pageCount ?? null,
          cover_url: thumb,
          isbn,
        };
      });
    } catch (err) {
      console.error('Google Books search failed:', err);
      fbSearchResults = [];
      if (err.message.includes('429')) {
        fbSearchError = CONFIG.BOOKS_API_KEY
          ? 'Rate limit reached — try again in a moment.'
          : 'Rate limit reached. Add a Books API key in config.js to fix this.';
      } else {
        fbSearchError = 'Search unavailable — check your connection.';
      }
    }
    fbSearching = false;
    updateSearchDOM();
  }

  function triggerSearch(query) {
    fbSearchQuery = query;
    clearTimeout(fbSearchDebounce);
    if (!query.trim()) {
      fbSearchResults = [];
      fbSearching     = false;
      updateSearchDOM();
      return;
    }
    fbSearchError = '';
    fbSearching   = true;
    updateSearchDOM();   // show spinner without re-rendering the whole form
    fbSearchDebounce = setTimeout(() => searchGoogleBooks(query), 500);
  }

  // Update only the spinner + results list in-place so the search input keeps focus
  function updateSearchDOM() {
    const spinner = document.querySelector('.book-search-spinner');
    if (spinner) {
      spinner.textContent = fbSearching ? 'Searching…' : '';
      spinner.hidden      = !fbSearching;
    }
    const slot = document.querySelector('.book-search-results-slot');
    if (!slot) return;
    if (fbSearchError && !fbSearching) {
      slot.innerHTML = `<p class="book-search-error">${escHtml(fbSearchError)}</p>`;
    } else {
      slot.innerHTML = buildSearchResults();
    }
  }

  function selectSearchResult(idx) {
    const r = fbSearchResults[idx];
    if (!r) return;
    fbTitle         = r.title;
    fbAuthor        = r.author;
    fbPages         = r.pages ? String(r.pages) : fbPages;
    fbCoverUrl      = r.cover_url ?? '';
    fbIsbn          = r.isbn ?? '';
    fbSearchResults = [];
    fbSearchQuery   = '';
    fbSearching     = false;
    renderLibraryTab();
    requestAnimationFrame(() => document.getElementById('book-fb-title')?.focus());
  }

  function buildSearchResults() {
    if (fbSearchResults.length === 0) return '';
    let html = '<div class="book-search-results">';
    fbSearchResults.forEach((r, i) => {
      html += `
        <button class="book-search-result" type="button"
                onclick="Books._fbSelectResult(${i})">
          ${r.cover_url
            ? `<img src="${escHtml(r.cover_url)}" class="book-result-cover" alt="" loading="lazy">`
            : `<div class="book-result-cover book-result-cover--empty"></div>`}
          <div class="book-result-info">
            <div class="book-result-title">${escHtml(r.title)}</div>
            ${r.author ? `<div class="book-result-author">${escHtml(r.author)}</div>` : ''}
            ${r.pages  ? `<div class="book-result-pages">${r.pages} pages</div>` : ''}
          </div>
        </button>`;
    });
    html += '</div>';
    return html;
  }

  // ── Timer ────────────────────────────────────────────────────────────────────

  function startTimer() {
    if (timerInterval || timerPaused) return;
    timerStart    = Date.now();
    timerPausedMs = 0;
    timerPaused   = false;
    timerInterval = setInterval(updateTimerDisplay, 1000);
    autoCheckReadingHabit();
    render();
  }

  function pauseTimer() {
    if (!timerInterval) return;
    clearInterval(timerInterval);
    timerInterval  = null;
    timerPausedMs += Date.now() - timerStart;
    timerStart     = null;
    timerPaused    = true;
    render();
  }

  function resumeTimer() {
    if (!timerPaused || timerInterval) return;
    timerStart    = Date.now();
    timerPaused   = false;
    timerInterval = setInterval(updateTimerDisplay, 1000);
    render();
  }

  function stopTimer() {
    if (!timerInterval && !timerPaused) return;
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    const totalMs  = timerPausedMs + (timerStart ? Date.now() - timerStart : 0);
    const elapsed  = Math.round(totalMs / 60000);
    timerStart     = null;
    timerPaused    = false;
    timerPausedMs  = 0;
    fFormBookId    = activeBookId;
    fMinutes       = String(Math.max(1, elapsed));
    fPageEnd       = '';
    fNotes         = '';
    editingSession = null;
    render();
  }

  function updateTimerDisplay() {
    const totalMs = timerPausedMs + (timerStart ? Date.now() - timerStart : 0);
    const secs = Math.floor(totalMs / 1000);
    const hh   = String(Math.floor(secs / 3600)).padStart(2, '0');
    const mm   = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
    const ss   = String(secs % 60).padStart(2, '0');
    const txt  = `${hh}:${mm}:${ss}`;
    document.querySelectorAll('.book-timer-display').forEach(el => el.textContent = txt);
  }

  // ── Session actions ──────────────────────────────────────────────────────────

  function startLogSession() {
    fFormBookId    = activeBookId;
    fMinutes       = '';
    fPageEnd       = '';
    fNotes         = '';
    editingSession = null;
    render();
  }

  function startEditSession(id) {
    const s = getSessions(currentDate).find(x => x.id === id);
    if (!s) return;
    editingSession = id;
    fFormBookId    = s.book_id;
    fMinutes       = String(s.minutes  ?? '');
    fPageEnd       = String(s.page_end ?? '');
    fNotes         = s.notes ?? '';
    fDate          = s.logged_at
      ? new Date(s.logged_at).toISOString().slice(0, 10)
      : currentDate;
    render();
  }

  function cancelSession() {
    editingSession = null;
    fMinutes = fPageEnd = fNotes = fDate = '';
    fFormBookId = null;
    render();
  }

  function saveSession() {
    const minutes = parseInt(fMinutes, 10);
    if (!fFormBookId || isNaN(minutes) || minutes < 1) return;
    const day = Data.getDay(currentDate);
    if (!day.reading) day.reading = [];
    const pageEnd = parseInt(fPageEnd, 10) || 0;
    if (editingSession) {
      const s = day.reading.find(x => x.id === editingSession);
      if (s) {
        s.minutes  = minutes;
        s.page_end = pageEnd;
        s.notes    = fNotes.trim();
        delete s.pages;
        if (fDate) {
          // Preserve any existing time component; otherwise default to noon
          const existingTime = s.logged_at ? s.logged_at.slice(11) : '12:00:00.000Z';
          s.logged_at = fDate + 'T' + existingTime;
        }
      }
    } else {
      day.reading.push({
        id:        crypto.randomUUID(),
        book_id:   fFormBookId,
        minutes,
        page_end:  pageEnd,
        notes:     fNotes.trim(),
        logged_at: new Date().toISOString(),
      });
    }
    editingSession = null;
    fMinutes = fPageEnd = fNotes = '';
    fFormBookId = null;
    autoCheckReadingHabit();
    scheduleSave();
    render();
  }

  function deleteSession(id) {
    const day = Data.getDay(currentDate);
    if (!day.reading) return;
    day.reading = day.reading.filter(s => s.id !== id);
    scheduleSave();
    render();
  }

  // ── Book actions ─────────────────────────────────────────────────────────────

  function startAddBook() {
    addingBook      = true;
    editingBookId   = null;
    fbTitle         = '';
    fbAuthor        = '';
    fbPages         = '';
    fbCoverUrl      = '';
    fbIsbn          = '';
    fbSearchQuery   = '';
    fbSearchResults = [];
    fbSearching     = false;
    render();
  }

  function startEditBook(id) {
    const book = getBooks()[id];
    if (!book) return;
    editingBookId   = id;
    addingBook      = false;
    fbTitle         = book.title       ?? '';
    fbAuthor        = book.author      ?? '';
    fbPages         = String(book.total_pages ?? '');
    fbCoverUrl      = book.cover_url   ?? '';
    fbIsbn          = book.isbn        ?? '';
    fbSearchQuery   = '';
    fbSearchResults = [];
    fbSearching     = false;
    render();
  }

  function cancelBookEdit() {
    addingBook      = false;
    editingBookId   = null;
    fbTitle         = '';
    fbAuthor        = '';
    fbPages         = '';
    fbCoverUrl      = '';
    fbIsbn          = '';
    fbSearchQuery   = '';
    fbSearchResults = [];
    fbSearching     = false;
    render();
  }

  function saveBook() {
    const title = fbTitle.trim();
    if (!title) return;
    const books      = getBooks();
    const author     = fbAuthor.trim();
    const totalPages = parseInt(fbPages, 10) || null;
    const coverUrl   = fbCoverUrl.trim() || null;
    const isbn       = fbIsbn.trim()     || null;

    if (editingBookId) {
      const b = books[editingBookId];
      if (b) {
        b.title       = title;
        b.author      = author     || null;
        b.total_pages = totalPages;
        b.cover_url   = coverUrl;
        b.isbn        = isbn;
      }
    } else {
      const id = crypto.randomUUID();
      books[id] = {
        id,
        title,
        author:      author     || null,
        total_pages: totalPages,
        cover_url:   coverUrl,
        isbn,
        start_date:  currentDate,
        finish_date: null,
        status:      'reading',
        notes:       '',
      };
      activeBookId = id;
    }

    addingBook      = false;
    editingBookId   = null;
    fbTitle         = '';
    fbAuthor        = '';
    fbPages         = '';
    fbCoverUrl      = '';
    fbIsbn          = '';
    fbSearchQuery   = '';
    fbSearchResults = [];
    fbSearching     = false;
    scheduleSave();
    render();
  }

  function deleteBook(id) {
    const books = getBooks();
    if (!books[id]) return;
    delete books[id];
    if (activeBookId === id) activeBookId = getLastUsedBookId();
    scheduleSave();
    render();
  }

  function markFinished(id) {
    const book = getBooks()[id];
    if (!book) return;
    book.status      = 'finished';
    book.finish_date = currentDate;
    if (activeBookId === id) activeBookId = getLastUsedBookId();
    scheduleSave();
    render();
  }

  function togglePause(id) {
    const book = getBooks()[id];
    if (!book) return;
    book.status = book.status === 'paused' ? 'reading' : 'paused';
    scheduleSave();
    render();
  }

  // ── Auto-check Reading habit ─────────────────────────────────────────────────

  function autoCheckReadingHabit() {
    const habitName = (Data.getSettings().habits ?? []).find(
      h => h.toLowerCase() === 'reading'
    );
    if (!habitName) return;
    if (typeof Habits !== 'undefined' && Habits.markHabitDone) {
      Habits.markHabitDone(habitName);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  function render() {
    renderLibraryTab();
    renderDaily();
  }

  function renderLibraryTab() {
    const panel = document.getElementById('tab-library-content');
    if (!panel) return;

    const books    = getBooks();
    const bookList = Object.values(books);

    // Sort reading: most recently read first
    const reading = bookList
      .filter(b => b.status === 'reading')
      .sort((a, b) => {
        const la = getLastSessionDate(a.id);
        const lb = getLastSessionDate(b.id);
        if (!la && !lb) return 0;
        if (!la) return 1;
        if (!lb) return -1;
        return lb.localeCompare(la);
      });
    const paused   = bookList.filter(b => b.status === 'paused');
    const finished = bookList
      .filter(b => b.status === 'finished')
      .sort((a, b) => (b.finish_date ?? '').localeCompare(a.finish_date ?? ''));

    if (heroBookIdx >= reading.length) heroBookIdx = Math.max(0, reading.length - 1);

    const streak    = getReadingStreak();
    const totalMins = getTotalReadMinutes();
    const totalDisp = fmtTotalTime(totalMins);

    let html = `
      <div class="lib-header">
        <div class="lib-title">Library</div>
        <div class="lib-chips">
          <div class="lib-chip">
            <div class="lib-chip-val">🔥 ${streak}</div>
            <div class="lib-chip-lbl">day streak</div>
          </div>
          <div class="lib-chip">
            <div class="lib-chip-val">${totalDisp}</div>
            <div class="lib-chip-lbl">total read</div>
          </div>
          <div class="lib-chip">
            <div class="lib-chip-val">${finished.length}</div>
            <div class="lib-chip-lbl">books read</div>
          </div>
        </div>
      </div>
      <div class="lib-body">`;

    if (addingBook || editingBookId) {
      html += buildLibBookForm();
    } else {
      // ── Now Reading ──
      html += `<div><div class="lib-section-label">Now Reading</div>`;

      if (reading.length > 0) {
        html += buildHeroCard(reading[heroBookIdx]);
        if (reading.length > 1) {
          html += `<div class="lib-swipe-dots">`;
          reading.forEach((_, i) => {
            html += `<div class="lib-swipe-dot${i === heroBookIdx ? ' lib-swipe-dot--active' : ''}"></div>`;
          });
          html += `</div><div class="lib-swipe-hint">swipe for other books</div>`;
        }
      } else {
        html += `<div class="lib-empty">No books in progress — add one below.</div>`;
      }

      // Session form / history (below hero card)
      if (reading.length > 0) {
        const sessions = getSessions(currentDate);
        if (fFormBookId !== null && !editingSession) {
          html += buildSessionForm(null);
        }
        if (sessions.length > 0) {
          const hasEditingSession = sessions.some(s => s.id === editingSession);
          if (!hasEditingSession) {
            const dateLabel = currentDate === Data.today() ? "today's" : currentDate;
            html += `<button class="book-history-toggle" onclick="Books._toggleSessionHistory()">
              ${sessionHistoryOpen ? '▲' : '▼'} ${dateLabel} log (${sessions.length})
            </button>`;
          }
          if (sessionHistoryOpen || hasEditingSession) {
            html += `<div class="book-sessions-list">`;
            sessions.forEach(s => {
              if (editingSession === s.id) {
                html += buildSessionForm(s.id);
              } else {
                const b         = books[s.book_id];
                const pagesRead = calcPagesRead(s.id, s.book_id);
                const showTitle = bookList.length > 1 && b;
                html += `<div class="book-session-card">
                  <span class="book-session-dot"></span>
                  <div class="book-session-body">
                    <div class="book-session-summary">
                      <strong>${fmtTime(s.minutes ?? 0)}</strong>
                      ${pagesRead  ? ` · ${pagesRead} pages` : ''}
                      ${s.page_end ? ` · up to p.${s.page_end}` : ''}
                      ${showTitle  ? `<span class="book-session-book-tag">${escHtml(b.title)}</span>` : ''}
                    </div>
                    ${s.notes     ? `<div class="book-session-notes">${escHtml(s.notes)}</div>` : ''}
                    ${s.logged_at ? `<div class="book-session-logged-at">Logged ${fmtLoggedAt(s.logged_at)}</div>` : ''}
                  </div>
                  <div class="book-session-actions">
                    <button class="book-sess-edit-btn" onclick="Books._startEditSession('${s.id}')">Edit</button>
                    <button class="book-sess-del-btn"  onclick="Books._deleteSession('${s.id}')">Delete</button>
                  </div>
                </div>`;
              }
            });
            html += `</div>`;
          }
        }
      }

      // Add book button
      html += `<button class="lib-add-btn" onclick="Books._startAddBook()">
        <span class="lib-add-btn-plus">+</span> Add a Book
      </button></div>`;

      // ── Finished ──
      if (finished.length > 0) html += buildCoverGrid('Finished', finished, 'finished');

      // ── Paused / Gave Up ──
      if (paused.length > 0) html += buildCoverGrid('Paused / Gave Up', paused, 'paused');
    }

    html += `</div>`; // /lib-body

    // Detail overlay
    if (detailBookId && books[detailBookId]) {
      html += buildDetailSheet(books[detailBookId]);
    }

    panel.innerHTML = html;
    attachLibrarySwipe();
    if (timerInterval || timerPaused) updateTimerDisplay();
  }

  // ── Library sub-renderers ─────────────────────────────────────────────────────

  function buildHeroCard(book) {
    const stats     = getBookStats(book.id);
    const daysRead  = getBookDaysRead(book.id);
    const pagesLeft = (book.total_pages && stats.currentPage)
      ? Math.max(0, book.total_pages - stats.currentPage) : null;
    const progress  = (book.total_pages && stats.currentPage)
      ? Math.min(100, Math.round((stats.currentPage / book.total_pages) * 100)) : null;
    const isTimerOn = !!timerInterval || timerPaused;
    const isLogging = fFormBookId !== null && !editingSession;
    const isToday   = currentDate === Data.today();

    let html = `<div class="lib-hero-card" id="lib-hero-card">
      <div class="lib-hero-bar"></div>
      <div class="lib-hero-body">`;

    if (book.cover_url) {
      html += `<img src="${escHtml(book.cover_url)}" class="lib-hero-cover" alt="" loading="lazy">`;
    } else {
      html += `<div class="lib-hero-cover lib-hero-cover--empty">📚</div>`;
    }

    html += `<div class="lib-hero-info">
        <div class="lib-hero-title">${escHtml(book.title)}</div>
        ${book.author ? `<div class="lib-hero-author">${escHtml(book.author)}</div>` : ''}
        <div class="lib-hero-stats">
          <div class="lib-hero-stat">
            <div class="lib-hero-stat-val">${daysRead || '—'}</div>
            <div class="lib-hero-stat-lbl">days read</div>
          </div>
          <div class="lib-hero-stat">
            <div class="lib-hero-stat-val">${stats.currentPage ? `p.${stats.currentPage}` : '—'}</div>
            <div class="lib-hero-stat-lbl">last read</div>
          </div>
          <div class="lib-hero-stat">
            <div class="lib-hero-stat-val">${pagesLeft !== null ? pagesLeft : '—'}</div>
            <div class="lib-hero-stat-lbl">pages left</div>
          </div>
          <div class="lib-hero-stat">
            <div class="lib-hero-stat-val">${stats.totalMinutes ? fmtTotalTime(stats.totalMinutes) : '—'}</div>
            <div class="lib-hero-stat-lbl">time read</div>
          </div>
        </div>
      </div>
    </div>`; // /lib-hero-body

    if (progress !== null) {
      html += `<div class="lib-hero-progress-wrap">
        <div class="lib-hero-progress-row">
          <div class="lib-hero-progress-bar">
            <div class="lib-hero-progress-fill" style="width:${progress}%"></div>
          </div>
          <div class="lib-hero-progress-pct">${progress}%</div>
        </div>
      </div>`;
    }

    if (isTimerOn) {
      html += `<div class="lib-hero-timer${timerPaused ? ' lib-hero-timer--paused' : ''}">
        <span class="lib-hero-timer-ico">${timerPaused ? '⏸' : '⏱'}</span>
        <span class="book-timer-display lib-hero-timer-display">00:00:00</span>
        ${timerPaused
          ? `<button class="lib-timer-btn lib-timer-btn--pause" onclick="Books._resumeTimer()">▶ Resume</button>`
          : `<button class="lib-timer-btn lib-timer-btn--pause" onclick="Books._pauseTimer()">⏸ Pause</button>`}
        <button class="lib-timer-btn lib-timer-btn--stop" onclick="Books._stopTimer()">Stop &amp; Log</button>
      </div>`;
    } else if (!isLogging) {
      html += `<div class="lib-hero-actions">
        ${isToday ? `<button class="lib-btn-primary" onclick="Books._startTimer()">▶ Start Timer</button>` : ''}
        <button class="lib-btn-secondary" onclick="Books._startLogSession()">Log Session</button>
      </div>`;
    }

    html += `</div>`; // /lib-hero-card
    return html;
  }

  function buildCoverGrid(label, bookList, prefix) {
    const pages = [];
    for (let i = 0; i < bookList.length; i += 3) pages.push(bookList.slice(i, i + 3));

    let html = `<div class="lib-cover-section">
      <div class="lib-section-label">${escHtml(label)}<span class="lib-count-badge">${bookList.length}</span></div>
      <div class="lib-cover-strip-wrap" id="lib-${prefix}-wrap">
        <div class="lib-cover-strip" id="lib-${prefix}-strip">`;

    pages.forEach(page => {
      html += `<div class="lib-cover-page">`;
      for (let i = 0; i < 3; i++) {
        const b = page[i];
        if (!b) { html += `<div class="lib-cover-thumb lib-cover-thumb--empty"></div>`; continue; }
        html += `<div class="lib-cover-thumb" onclick="Books._openDetail('${escHtml(b.id)}')">`;
        if (b.cover_url) {
          html += `<img src="${escHtml(b.cover_url)}" alt="${escHtml(b.title)}" loading="lazy">`;
        } else {
          html += `<div class="lib-cover-thumb-placeholder">
            <span class="lib-cover-thumb-ico">📚</span>
            <span class="lib-cover-thumb-lbl">${escHtml(b.title)}</span>
          </div>`;
        }
        html += `</div>`;
      }
      html += `</div>`; // /lib-cover-page
    });

    html += `</div></div>`; // /strip, /strip-wrap

    if (pages.length > 1) {
      html += `<div class="lib-swipe-dots" id="lib-${prefix}-dots">`;
      pages.forEach((_, i) => {
        html += `<div class="lib-swipe-dot${i === 0 ? ' lib-swipe-dot--active' : ''}"></div>`;
      });
      html += `</div>`;
    }

    html += `</div>`; // /lib-cover-section
    return html;
  }

  function buildDetailSheet(book) {
    const stats    = getBookStats(book.id);
    const daysRead = getBookDaysRead(book.id);
    const allSessions = Object.values(Data.getData().days ?? {})
      .flatMap(d => (d.reading ?? []).filter(s => s.book_id === book.id));
    const dateInfo = book.status === 'finished'
      ? `${fmtShortDate(book.start_date)} → ${fmtShortDate(book.finish_date)}`
      : `Started ${fmtShortDate(book.start_date)}`;

    return `<div class="lib-detail-overlay" id="lib-detail-overlay" onclick="Books._closeDetail(event)">
      <div class="lib-detail-sheet" onclick="event.stopPropagation()">
        <div class="lib-detail-handle"></div>
        <div class="lib-detail-header">
          ${book.cover_url
            ? `<img src="${escHtml(book.cover_url)}" class="lib-detail-cover" alt="" loading="lazy">`
            : `<div class="lib-detail-cover lib-detail-cover--empty">📚</div>`}
          <div class="lib-detail-info">
            <div class="lib-detail-title">${escHtml(book.title)}</div>
            ${book.author ? `<div class="lib-detail-author">${escHtml(book.author)}</div>` : ''}
            <div class="lib-detail-meta">${escHtml(dateInfo)}${book.total_pages ? ` · ${book.total_pages} pages` : ''}</div>
          </div>
        </div>
        <div class="lib-detail-body">
          <div class="lib-detail-stats">
            <div class="lib-detail-stat">
              <div class="lib-detail-stat-val">${allSessions.length}</div>
              <div class="lib-detail-stat-lbl">sessions</div>
            </div>
            <div class="lib-detail-stat">
              <div class="lib-detail-stat-val">${stats.totalMinutes ? fmtTotalTime(stats.totalMinutes) : '—'}</div>
              <div class="lib-detail-stat-lbl">time read</div>
            </div>
            <div class="lib-detail-stat">
              <div class="lib-detail-stat-val">${daysRead}</div>
              <div class="lib-detail-stat-lbl">days read</div>
            </div>
          </div>
          <div class="lib-detail-divider"></div>
          <div class="lib-detail-cover-update">
            <div class="lib-detail-cover-label">Update Cover</div>
            <div class="lib-detail-cover-row">
              <input class="lib-detail-cover-input" type="text"
                     placeholder="Paste image URL…"
                     value="${escHtml(coverUrlInput)}"
                     oninput="Books._coverUrlChange(this.value)">
              <button class="lib-detail-btn lib-detail-btn--accent"
                      onclick="Books._updateCover('${escHtml(book.id)}')">Save</button>
            </div>
          </div>
          <div class="lib-detail-divider"></div>
          <div class="lib-detail-actions">
            ${book.status === 'finished'
              ? `<button class="lib-detail-btn" onclick="Books._markReading('${escHtml(book.id)}')">Move to Reading</button>`
              : `<button class="lib-detail-btn lib-detail-btn--accent" onclick="Books._closeDetailAndFinish('${escHtml(book.id)}')">Mark Finished</button>`}
            <button class="lib-detail-btn" onclick="Books._closeDetailAndEdit('${escHtml(book.id)}')">Edit Details</button>
            <button class="lib-detail-btn lib-detail-btn--danger" onclick="Books._deleteBook('${escHtml(book.id)}')">Delete</button>
          </div>
        </div>
        <div class="lib-detail-close-row">
          <button class="lib-detail-close-btn" onclick="Books._closeDetail()">Close</button>
        </div>
      </div>
    </div>`;
  }

  function buildLibBookForm() {
    const isEditing = !!editingBookId;
    let html = `<div class="lib-book-form">
      <p class="book-form-heading">${isEditing ? 'Edit Book' : 'Add Book'}</p>`;
    if (!isEditing) {
      html += `<div class="book-form-field">
        <label class="book-form-label">Search for a book</label>
        <div class="book-search-wrap">
          <input class="book-form-input book-search-input" type="text"
                 placeholder="Search by title, author, or ISBN…"
                 value="${escHtml(fbSearchQuery)}"
                 oninput="Books._fbSearch(this.value)"
                 autocomplete="off">
          <span class="book-search-spinner" ${fbSearching ? '' : 'hidden'}>${fbSearching ? 'Searching…' : ''}</span>
        </div>
      </div>
      <div class="book-search-results-slot">${buildSearchResults()}</div>`;
    }
    if (fbCoverUrl) {
      html += `<div class="book-cover-preview">
        <img src="${escHtml(fbCoverUrl)}" alt="Book cover" class="book-cover-preview-img">
        <button class="book-cover-clear-btn" type="button" onclick="Books._fbClearCover()">✕ Remove cover</button>
      </div>`;
    }
    html += `
      <div class="book-form-field">
        <label class="book-form-label" for="book-fb-title">Title <span class="book-form-required">*</span></label>
        <input id="book-fb-title" class="book-form-input" type="text"
               placeholder="Book title" value="${escHtml(fbTitle)}"
               oninput="Books._fbField('fbTitle', this.value)">
      </div>
      <div class="book-form-field">
        <label class="book-form-label" for="book-fb-author">Author <span class="book-form-optional">(optional)</span></label>
        <input id="book-fb-author" class="book-form-input" type="text"
               placeholder="Author name" value="${escHtml(fbAuthor)}"
               oninput="Books._fbField('fbAuthor', this.value)">
      </div>
      <div class="book-form-field">
        <label class="book-form-label" for="book-fb-pages">Total pages <span class="book-form-optional">(optional)</span></label>
        <input id="book-fb-pages" class="book-form-input book-narrow-input"
               type="number" min="1" placeholder="e.g. 320"
               value="${escHtml(fbPages)}"
               oninput="Books._fbField('fbPages', this.value)">
      </div>
      <div class="book-form-actions">
        <button class="book-form-cancel-btn" onclick="Books._cancelBookEdit()">Cancel</button>
        <button class="book-form-save-btn"   onclick="Books._saveBook()">Save Book</button>
      </div>
    </div>`;
    return html;
  }

  function attachLibrarySwipe() {
    const heroCard = document.getElementById('lib-hero-card');
    if (heroCard) {
      let startX = 0;
      heroCard.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
      heroCard.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) < 40) return;
        const readingBooks = Object.values(getBooks()).filter(b => b.status === 'reading');
        if (dx < 0 && heroBookIdx < readingBooks.length - 1) { heroBookIdx++; renderLibraryTab(); }
        else if (dx > 0 && heroBookIdx > 0) { heroBookIdx--; renderLibraryTab(); }
      }, { passive: true });
    }
    setupCoverGridSwipe('lib-finished-strip', 'lib-finished-dots', 'lib-finished-wrap');
    setupCoverGridSwipe('lib-paused-strip',   'lib-paused-dots',   'lib-paused-wrap');
  }

  function setupCoverGridSwipe(stripId, dotsId, wrapId) {
    const wrap  = document.getElementById(wrapId);
    const strip = document.getElementById(stripId);
    if (!wrap || !strip) return;
    const pages = strip.querySelectorAll('.lib-cover-page');
    let cur = 0, startX = 0;
    const goTo = idx => {
      cur = Math.max(0, Math.min(idx, pages.length - 1));
      strip.style.transform = `translateX(calc(-${cur * 100}%))`;
      const dots = document.querySelectorAll(`#${dotsId} .lib-swipe-dot`);
      dots.forEach((d, i) => d.classList.toggle('lib-swipe-dot--active', i === cur));
    };
    wrap.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    wrap.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) < 40) return;
      goTo(dx < 0 ? cur + 1 : cur - 1);
    }, { passive: true });
  }

  function renderInlineHabits() {
    const el = document.getElementById('book-habits-inline');
    if (!el) return;
    _renderDailyInto(el);
  }

  function renderDaily() {
    _renderDailyInto(document.getElementById('book-daily'));
    const inline = document.getElementById('book-habits-inline');
    if (inline) _renderDailyInto(inline);
  }

  function _renderDailyInto(el) {
    if (!el) return;

    const books    = getBooks();
    const sessions = getSessions(currentDate);
    const bookList = Object.values(books);
    const isToday  = currentDate === Data.today();

    if (activeBookId && !books[activeBookId]) activeBookId = null;
    if (!activeBookId) activeBookId = getLastUsedBookId();

    // On past dates: only show books that were actually read that day
    const readingBooks = isToday
      ? bookList.filter(b => b.status !== 'finished')
      : bookList.filter(b => sessions.some(s => s.book_id === b.id));

    const isLogging    = fFormBookId !== null || editingSession !== null;
    const isTimerOn    = !!timerInterval || timerPaused;

    let html = '';

    // ── Book selector ──
    if (readingBooks.length === 0) {
      if (isToday) {
        html += `<p class="book-empty-daily">
          No books in progress. Open <strong>My Books</strong> to add one.
        </p>`;
      }
      // Past date with no sessions: show nothing
    } else {
      if (!activeBookId || !readingBooks.find(b => b.id === activeBookId)) {
        activeBookId = readingBooks[0].id;
      }
      const currentBook = books[activeBookId];
      const stats       = getBookStats(currentBook.id);
      const progress    = (currentBook.total_pages && stats.currentPage)
        ? Math.min(100, Math.round((stats.currentPage / currentBook.total_pages) * 100))
        : null;

      html += `<div class="book-selector-wrap">`;

      // Cover art
      if (currentBook.cover_url) {
        html += `<img src="${escHtml(currentBook.cover_url)}"
                      class="book-sel-cover" alt="" loading="lazy">`;
      }

      html += `<div class="book-sel-info">`;

      if (readingBooks.length > 1) {
        html += `<select class="book-active-select" aria-label="Active book"
                         onchange="Books._setActiveBook(this.value)">`;
        readingBooks.forEach(b => {
          html += `<option value="${escHtml(b.id)}" ${b.id === activeBookId ? 'selected' : ''}>
            ${escHtml(b.title)}${b.status === 'paused' ? ' (paused)' : ''}
          </option>`;
        });
        html += `</select>`;
      } else {
        html += `<div class="book-sel-title">${escHtml(currentBook.title)}</div>`;
      }

      if (currentBook.author) {
        html += `<div class="book-sel-author">${escHtml(currentBook.author)}</div>`;
      }

      const metaParts = [];
      if (stats.totalMinutes) metaParts.push(`${fmtTime(stats.totalMinutes)} read total`);
      if (stats.currentPage)  metaParts.push(`currently on p.${stats.currentPage}`);
      if (metaParts.length) {
        html += `<div class="book-sel-meta">${metaParts.join(' · ')}</div>`;
      }

      if (progress !== null) {
        html += `<div class="book-sel-progress">
          <div class="book-sel-progress-bar">
            <div class="book-sel-progress-fill" style="width:${progress}%"></div>
          </div>
          <span class="book-sel-progress-text">${progress}%</span>
        </div>`;
      }

      html += `</div></div>`;  // close .book-sel-info and .book-selector-wrap
    }

    // ── Session list (collapsible) ──
    if (sessions.length > 0) {
      const hasEditingSession = sessions.some(s => s.id === editingSession);
      if (!hasEditingSession) {
        const dateLabel = currentDate === Data.today() ? "today's" : currentDate;
        const label = sessionHistoryOpen
          ? `▲ Hide ${dateLabel} log (${sessions.length})`
          : `▼ Show ${dateLabel} log (${sessions.length})`;
        html += `<button class="book-history-toggle" onclick="Books._toggleSessionHistory()">${label}</button>`;
      }

      if (sessionHistoryOpen || hasEditingSession || !isToday) {
        html += `<div class="book-sessions-list">`;
        sessions.forEach(s => {
          const b         = books[s.book_id];
          const isEditing = editingSession === s.id;
          if (isEditing) {
            html += buildSessionForm(s.id);
          } else {
            const showTitle = bookList.length > 1 && b;
            const pagesRead = calcPagesRead(s.id, s.book_id);
            html += `<div class="book-session-card">
              <span class="book-session-dot"></span>
              <div class="book-session-body">
                <div class="book-session-summary">
                  <strong>${fmtTime(s.minutes ?? 0)}</strong>
                  ${pagesRead   ? ` · ${pagesRead} pages` : ''}
                  ${s.page_end  ? ` · up to p.${s.page_end}` : ''}
                  ${showTitle   ? `<span class="book-session-book-tag">${escHtml(b.title)}</span>` : ''}
                </div>
                ${s.notes ? `<div class="book-session-notes">${escHtml(s.notes)}</div>` : ''}
                ${s.logged_at ? `<div class="book-session-logged-at">Logged ${fmtLoggedAt(s.logged_at)}</div>` : ''}
              </div>
              <div class="book-session-actions">
                <button class="book-sess-edit-btn" onclick="Books._startEditSession('${s.id}')">Edit</button>
                <button class="book-sess-del-btn"  onclick="Books._deleteSession('${s.id}')">Delete</button>
              </div>
            </div>`;
          }
        });
        html += `</div>`;
      }
    }

    // ── New session form ──
    if (fFormBookId !== null && !editingSession) {
      html += buildSessionForm(null);
    }

    // ── Timer bar ──
    if (isTimerOn) {
      html += `<div class="book-timer-running${timerPaused ? ' book-timer-running--paused' : ''}">
        <span class="book-timer-icon">${timerPaused ? '⏸' : '⏱'}</span>
        <span class="book-timer-display">00:00:00</span>
        ${timerPaused
          ? `<button class="book-timer-pause-btn" onclick="Books._resumeTimer()">▶ Resume</button>`
          : `<button class="book-timer-pause-btn" onclick="Books._pauseTimer()">⏸ Pause</button>`}
        <button class="book-timer-stop-btn" onclick="Books._stopTimer()">Stop &amp; Log</button>
      </div>`;
    }

    // ── Action buttons ──
    if (!isLogging && !isTimerOn && readingBooks.length > 0) {
      html += `<div class="book-action-area">
        ${isToday ? `<button class="book-start-timer-btn" onclick="Books._startTimer()">⏱ Start Timer</button>` : ''}
        <button class="book-log-manual-btn" onclick="Books._startLogSession()">Log Session</button>
      </div>`;
    }

    el.innerHTML = html;

    if (isTimerOn) updateTimerDisplay();
  }

  function buildSessionForm(editId) {
    const readingBooks = Object.values(getBooks()).filter(b => b.status !== 'finished');
    const selectedBook = fFormBookId;

    let html = `<div class="book-session-form">
      <div class="book-form-row">
        <div class="book-form-field">
          <span class="book-form-label">Minutes <span class="book-form-required">*</span></span>
          <input class="book-form-input book-narrow-input" type="number" min="1"
                 aria-label="Minutes" placeholder="e.g. 30"
                 value="${escHtml(fMinutes)}"
                 oninput="Books._fField('fMinutes', this.value)">
        </div>
        <div class="book-form-field">
          <span class="book-form-label">Stopped at p.</span>
          <input class="book-form-input book-narrow-input" type="number" min="0"
                 aria-label="Stopped at page" placeholder="e.g. 142"
                 value="${escHtml(fPageEnd)}"
                 oninput="Books._fField('fPageEnd', this.value)">
        </div>
      </div>`;

    if (readingBooks.length > 1) {
      html += `<div class="book-form-field">
        <span class="book-form-label">Book</span>
        <select class="book-form-select" aria-label="Book"
                onchange="Books._fField('fFormBookId', this.value)">`;
      readingBooks.forEach(b => {
        html += `<option value="${escHtml(b.id)}" ${b.id === selectedBook ? 'selected' : ''}>
          ${escHtml(b.title)}
        </option>`;
      });
      html += `</select></div>`;
    }

    html += `<div class="book-form-field">
        <span class="book-form-label">Notes</span>
        <input class="book-form-input" type="text" aria-label="Notes"
               placeholder="Optional notes…" value="${escHtml(fNotes)}"
               oninput="Books._fField('fNotes', this.value)">
      </div>`;

    if (editId) {
      html += `<div class="book-form-field">
        <span class="book-form-label">Date</span>
        <input class="book-form-input book-narrow-input" type="date" aria-label="Session date"
               value="${escHtml(fDate)}"
               oninput="Books._fField('fDate', this.value)">
      </div>`;
    }

    html += `<div class="book-form-actions">
        <button class="book-form-cancel-btn" onclick="Books._cancelSession()">Cancel</button>
        <button class="book-form-save-btn"   onclick="Books._saveSession()">Save Session</button>
      </div>
    </div>`;

    return html;
  }

  // ── Public bridge handlers ────────────────────────────────────────────────────

  function _setActiveBook(id)       { activeBookId = id; render(); }
  function _closeLibrary()          { App.switchTab('today'); }
  function _startAddBook()          { startAddBook(); }
  function _cancelBookEdit()        { cancelBookEdit(); }
  function _saveBook()              { saveBook(); }
  function _startEditBook(id)       { startEditBook(id); }
  function _deleteBook(id)          { deleteBook(id); }
  function _markFinished(id)        { markFinished(id); }
  function _togglePause(id)         { togglePause(id); }
  function _startTimer()            { startTimer(); }
  function _pauseTimer()            { pauseTimer(); }
  function _resumeTimer()           { resumeTimer(); }
  function _stopTimer()             { stopTimer(); }
  function _startLogSession()       { startLogSession(); }
  function _startEditSession(id)    { startEditSession(id); }
  function _cancelSession()         { cancelSession(); }
  function _saveSession()           { saveSession(); }
  function _deleteSession(id)       { deleteSession(id); }

  function _fbSearch(query)         { triggerSearch(query); }
  function _fbSelectResult(idx)     { selectSearchResult(idx); }
  function _fbClearCover()          { fbCoverUrl = ''; renderLibraryTab(); }

  function _fField(field, val) {
    if (field === 'fMinutes')    fMinutes    = val;
    if (field === 'fPageEnd')    fPageEnd    = val;
    if (field === 'fNotes')      fNotes      = val;
    if (field === 'fDate')       fDate       = val;
    if (field === 'fFormBookId') fFormBookId = val;
  }

  function _toggleSessionHistory() {
    sessionHistoryOpen = !sessionHistoryOpen;
    render();
  }

  function _fbField(field, val) {
    if (field === 'fbTitle')  fbTitle  = val;
    if (field === 'fbAuthor') fbAuthor = val;
    if (field === 'fbPages')  fbPages  = val;
  }

  function _openDetail(id)    { detailBookId = id; coverUrlInput = ''; renderLibraryTab(); }
  function _closeDetail(e)    {
    if (e && e.target?.id !== 'lib-detail-overlay') return;
    detailBookId = null; coverUrlInput = ''; renderLibraryTab();
  }
  function _coverUrlChange(val) { coverUrlInput = val; }
  function _updateCover(id) {
    const url  = coverUrlInput.trim();
    const book = getBooks()[id];
    if (!url || !book) return;
    book.cover_url = url;
    coverUrlInput  = '';
    scheduleSave();
    renderLibraryTab();
  }
  function _markReading(id) {
    const book = getBooks()[id];
    if (!book) return;
    book.status      = 'reading';
    book.finish_date = null;
    detailBookId     = null;
    scheduleSave();
    render();
  }
  function _closeDetailAndEdit(id)   { detailBookId = null; startEditBook(id); }
  function _closeDetailAndFinish(id) { detailBookId = null; markFinished(id); }

  // ── Init / setDate ───────────────────────────────────────────────────────────

  function init() {
    currentDate  = DateNav.getDate();
    activeBookId = getLastUsedBookId();

    render();
  }

  function setDate(date) {
    if (timerInterval || timerPaused) stopTimer();
    currentDate        = date;
    showLibrary        = false;
    editingSession     = null;
    sessionHistoryOpen = false;
    heroBookIdx        = 0;
    detailBookId       = null;
    coverUrlInput      = '';
    fMinutes = fPageEnd = fNotes = fDate = '';
    fFormBookId = null;
    render();
  }


  // ── Public API ────────────────────────────────────────────────────────────────

  return {
    init, render, setDate, renderInlineHabits, renderLibraryTab,
    _setActiveBook, _closeLibrary,
    _startAddBook, _cancelBookEdit, _saveBook, _startEditBook, _deleteBook,
    _markFinished, _togglePause,
    _startTimer, _pauseTimer, _resumeTimer, _stopTimer,
    _startLogSession, _startEditSession, _cancelSession, _saveSession, _deleteSession,
    _toggleSessionHistory,
    _fbSearch, _fbSelectResult, _fbClearCover,
    _fField, _fbField,
    _openDetail, _closeDetail, _coverUrlChange, _updateCover,
    _markReading, _closeDetailAndEdit, _closeDetailAndFinish,
  };
})();
