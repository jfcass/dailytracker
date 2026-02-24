const CONFIG = Object.freeze({
  CLIENT_ID:      '145577028186-85gl257hjuqbuu6qs80l5l8mueopam4q.apps.googleusercontent.com',
  SCOPES:         'https://www.googleapis.com/auth/drive.file',
  DATA_FILE_NAME: 'health-tracker-data.json',
  PIN_LENGTH:     4,
  PIN_SALT:       'ht-v1-',          // prefix for SHA-256 hashing
  DRIVE_API:      'https://www.googleapis.com/drive/v3',
  DRIVE_UPLOAD:   'https://www.googleapis.com/upload/drive/v3',
});
