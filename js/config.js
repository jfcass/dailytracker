const APP_VERSION = '2026.03.02';

const CONFIG = Object.freeze({
  CLIENT_ID:      '145577028186-85gl257hjuqbuu6qs80l5l8mueopam4q.apps.googleusercontent.com',
  SCOPES:         'https://www.googleapis.com/auth/drive.file',
  DATA_FILE_NAME: 'health-tracker-data.json',
  PIN_LENGTH:     4,
  PIN_SALT:       'ht-v1-',          // prefix for SHA-256 hashing
  DRIVE_API:      'https://www.googleapis.com/drive/v3',
  DRIVE_UPLOAD:   'https://www.googleapis.com/upload/drive/v3',
  // Google Books API key — prevents rate-limit (429) errors on book search.
  // Get one free at: Google Cloud Console → APIs & Services → Credentials → Create API Key
  // (Enable "Books API" in the same project first.)
  BOOKS_API_KEY:  'AIzaSyC_W1zuUVRMDgXrbbMSuwDkABjTZsLxamY',
  FITBIT_CLIENT_ID: '23V34Q',
  FITBIT_API:       'https://fitbit-proxy.jfcass.workers.dev/1/user/-',
  FITBIT_TOKEN_URL: 'https://api.fitbit.com/oauth2/token',
  FITBIT_AUTH_URL:  'https://www.fitbit.com/oauth2/authorize',
});
