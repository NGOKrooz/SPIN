const db = require('./dbWrapper');

function getState(key, defaultValue = null) {
  return new Promise((resolve, reject) => {
    db.get('SELECT value FROM system_state WHERE key = ?', [key], (err, row) => {
      if (err) return reject(err);
      if (!row || row.value === undefined || row.value === null) {
        return resolve(defaultValue);
      }
      resolve(row.value);
    });
  });
}

function setState(key, value, description = '') {
  const valueStr = value === undefined || value === null ? '' : String(value);
  const query = `
    INSERT INTO system_state (key, value, description, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (key)
    DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = CURRENT_TIMESTAMP
  `;

  return new Promise((resolve, reject) => {
    db.run(query, [key, valueStr, description], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

module.exports = {
  getState,
  setState,
};
