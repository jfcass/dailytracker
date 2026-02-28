const CACHE = 'daily-tracker-v3';
const SHELL = [
  './index.html',
  './css/styles.css',
  './js/config.js', './js/auth.js', './js/data.js',
  './js/pin.js', './js/app.js', './js/datenav.js',
  './js/habits.js', './js/mood.js', './js/moderation.js',
  './js/symptoms.js', './js/medications.js', './js/weather.js',
  './js/books.js', './js/reports.js', './js/settings.js',
];

self.addEventListener('install', e =>
  e.waitUntil(
    caches.open(CACHE)
      // allSettled: a single 404 won't abort the SW install
      .then(c => Promise.allSettled(SHELL.map(url => c.add(url))))
      .then(() => self.skipWaiting())
  )
);

self.addEventListener('activate', e =>
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => clients.claim())
  )
);

self.addEventListener('fetch', e => {
  // Pass through Google API / OAuth / CDN requests — never cache these
  const url = e.request.url;
  if (url.includes('googleapis.com') || url.includes('accounts.google.com') ||
      url.includes('fonts.') || url.includes('chart.js') ||
      url.includes('fitbit.com')) return;

  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
