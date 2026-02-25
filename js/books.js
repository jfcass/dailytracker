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

  // Session form fields
  let fMinutes    = '';
  let fPageEnd    = '';
  let fNotes      = '';
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
    if (timerInterval) return;
    timerStart    = Date.now();
    timerInterval = setInterval(updateTimerDisplay, 1000);
    autoCheckReadingHabit();
    render();
  }

  function stopTimer() {
    if (!timerInterval) return;
    clearInterval(timerInterval);
    timerInterval = null;
    const elapsed = Math.round((Date.now() - timerStart) / 60000);
    timerStart    = null;
    fFormBookId   = activeBookId;
    fMinutes      = String(Math.max(1, elapsed));
    fPageEnd      = '';
    fNotes        = '';
    editingSession = null;
    render();
  }

  function updateTimerDisplay() {
    if (!timerStart) return;
    const secs = Math.floor((Date.now() - timerStart) / 1000);
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
    render();
  }

  function cancelSession() {
    editingSession = null;
    fMinutes = fPageEnd = fNotes = '';
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
      }
    } else {
      day.reading.push({
        id:       crypto.randomUUID(),
        book_id:  fFormBookId,
        minutes,
        page_end: pageEnd,
        notes:    fNotes.trim(),
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
    const reading  = bookList.filter(b => b.status === 'reading');
    const paused   = bookList.filter(b => b.status === 'paused');
    const finished = bookList.filter(b => b.status === 'finished');

    let html = `<div class="book-lib-header">
      <h3 class="book-lib-title">My Books</h3>
      <button class="book-lib-done-btn" onclick="App.switchTab('today')">← Today</button>
    </div>`;

    if (addingBook || editingBookId) {
      const isEditing = !!editingBookId;
      const heading   = isEditing ? 'Edit Book' : 'Add Book';

      html += `<div class="book-add-form">
        <p class="book-form-heading">${heading}</p>`;

      // ── Search (new books only) ──
      if (!isEditing) {
        html += `
        <div class="book-form-field">
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

      // ── Cover preview ──
      if (fbCoverUrl) {
        html += `
        <div class="book-cover-preview">
          <img src="${escHtml(fbCoverUrl)}" alt="Book cover" class="book-cover-preview-img">
          <button class="book-cover-clear-btn" type="button"
                  onclick="Books._fbClearCover()">✕ Remove cover</button>
        </div>`;
      }

      // ── Manual fields ──
      html += `
        <div class="book-form-field">
          <label class="book-form-label" for="book-fb-title">
            Title <span class="book-form-required">*</span>
          </label>
          <input id="book-fb-title" class="book-form-input" type="text"
                 placeholder="Book title" value="${escHtml(fbTitle)}"
                 oninput="Books._fbField('fbTitle', this.value)">
        </div>
        <div class="book-form-field">
          <label class="book-form-label" for="book-fb-author">
            Author <span class="book-form-optional">(optional)</span>
          </label>
          <input id="book-fb-author" class="book-form-input" type="text"
                 placeholder="Author name" value="${escHtml(fbAuthor)}"
                 oninput="Books._fbField('fbAuthor', this.value)">
        </div>
        <div class="book-form-field">
          <label class="book-form-label" for="book-fb-pages">
            Total pages <span class="book-form-optional">(optional)</span>
          </label>
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

    } else {
      html += `<button class="book-add-book-btn" onclick="Books._startAddBook()">+ Add Book</button>`;
    }

    const renderGroup = (label, list) => {
      if (!list.length) return '';
      let g = `<div class="book-group"><p class="book-group-title">${label}</p>`;
      list.forEach(b => {
        const stats    = getBookStats(b.id);
        const progress = (b.total_pages && stats.currentPage)
          ? Math.min(100, Math.round((stats.currentPage / b.total_pages) * 100))
          : null;
        const dateInfo = b.status === 'finished'
          ? `${fmtShortDate(b.start_date)} → ${fmtShortDate(b.finish_date)}`
          : `Started ${fmtShortDate(b.start_date)}`;

        g += `<div class="book-card">
          ${b.cover_url ? `<img src="${escHtml(b.cover_url)}" class="book-card-cover" alt="" loading="lazy">` : ''}
          <div class="book-card-main">
            <div class="book-card-info">
              <div class="book-card-title">${escHtml(b.title)}</div>
              ${b.author ? `<div class="book-card-author">${escHtml(b.author)}</div>` : ''}
              <div class="book-card-stats">
                ${stats.totalMinutes ? fmtTime(stats.totalMinutes) + ' read' : 'No sessions yet'}
                ${stats.currentPage  ? ` · p.${stats.currentPage}` : ''}
                ${b.total_pages      ? ` / ${b.total_pages}` : ''}
              </div>
              <div class="book-card-date">${dateInfo}</div>
            </div>
            ${progress !== null ? `
            <div class="book-card-progress">
              <div class="book-card-progress-bar">
                <div class="book-card-progress-fill" style="width:${progress}%"></div>
              </div>
              <div class="book-card-progress-pct">${progress}%</div>
            </div>` : ''}
          </div>
          <div class="book-card-actions">
            ${b.status !== 'finished' ? `
            <button class="book-card-finish-btn" onclick="Books._markFinished('${b.id}')">Mark Finished</button>
            <button class="book-card-pause-btn"  onclick="Books._togglePause('${b.id}')">
              ${b.status === 'paused' ? 'Resume' : 'Pause'}
            </button>` : ''}
            <button class="book-card-edit-btn" onclick="Books._startEditBook('${b.id}')">Edit</button>
            <button class="book-card-del-btn"  onclick="Books._deleteBook('${b.id}')">Delete</button>
          </div>
        </div>`;
      });
      g += '</div>';
      return g;
    };

    html += renderGroup('Currently Reading', reading);
    html += renderGroup('Paused', paused);
    html += renderGroup('Finished', finished);

    if (!bookList.length && !addingBook) {
      html += `<p class="book-empty">No books yet. Add your first book above!</p>`;
    }

    panel.innerHTML = html;
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

    if (activeBookId && !books[activeBookId]) activeBookId = null;
    if (!activeBookId) activeBookId = getLastUsedBookId();

    const readingBooks = bookList.filter(b => b.status !== 'finished');
    const isLogging    = fFormBookId !== null || editingSession !== null;
    const isTimerOn    = !!timerInterval;

    let html = '';

    // ── Book selector ──
    if (readingBooks.length === 0) {
      html += `<p class="book-empty-daily">
        No books in progress. Open <strong>My Books</strong> to add one.
      </p>`;
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

      if (sessionHistoryOpen || hasEditingSession) {
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
      html += `<div class="book-timer-running">
        <span class="book-timer-icon">⏱</span>
        <span class="book-timer-display">00:00:00</span>
        <button class="book-timer-stop-btn" onclick="Books._stopTimer()">Stop &amp; Log</button>
      </div>`;
    }

    // ── Action buttons ──
    if (!isLogging && !isTimerOn && readingBooks.length > 0) {
      html += `<div class="book-action-area">
        <button class="book-start-timer-btn" onclick="Books._startTimer()">⏱ Start Timer</button>
        <button class="book-log-manual-btn"  onclick="Books._startLogSession()">Log Session</button>
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
      </div>
      <div class="book-form-actions">
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

  // ── Init / setDate ───────────────────────────────────────────────────────────

  function init() {
    currentDate  = DateNav.getDate();
    activeBookId = getLastUsedBookId();

    render();
  }

  function setDate(date) {
    if (timerInterval) stopTimer();
    currentDate        = date;
    showLibrary        = false;
    editingSession     = null;
    sessionHistoryOpen = false;
    fMinutes = fPageEnd = fNotes = '';
    fFormBookId = null;
    render();
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  return {
    init, render, setDate, renderInlineHabits, renderLibraryTab,
    _setActiveBook, _closeLibrary,
    _startAddBook, _cancelBookEdit, _saveBook, _startEditBook, _deleteBook,
    _markFinished, _togglePause,
    _startTimer, _stopTimer,
    _startLogSession, _startEditSession, _cancelSession, _saveSession, _deleteSession,
    _toggleSessionHistory,
    _fbSearch, _fbSelectResult, _fbClearCover,
    _fField, _fbField,
  };
})();
