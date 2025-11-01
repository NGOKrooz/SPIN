const DB_TYPE = process.env.DATABASE_URL ? 'postgres' : (process.env.DB_TYPE || 'sqlite');
const db = require('./init').getDatabase();
const isPostgres = DB_TYPE === 'postgres';

// Helper to convert SQLite queries to PostgreSQL and execute them
class QueryHelper {
  constructor(database) {
    this.db = database;
    this.isPostgres = isPostgres;
  }

  // Convert SQLite parameter placeholders (?) to PostgreSQL ($1, $2, etc.)
  convertParams(query, params = []) {
    if (!this.isPostgres) return { query, params };
    
    let paramIndex = 1;
    const convertedParams = [];
    const convertedQuery = query.replace(/\?/g, () => {
      const param = params[paramIndex - 1];
      convertedParams.push(param);
      return `$${paramIndex++}`;
    });
    
    return { query: convertedQuery, params: convertedParams };
  }

  // Convert SQLite functions to PostgreSQL
  convertQuery(query) {
    if (!this.isPostgres) return query;
    
    return query
      .replace(/date\('now'\)/gi, 'CURRENT_DATE')
      .replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP')
      .replace(/CURRENT_TIMESTAMP/gi, 'CURRENT_TIMESTAMP')
      .replace(/GROUP_CONCAT\(([^,]+),\s*'\|'\)/gi, "STRING_AGG($1, '|')")
      .replace(/GROUP_CONCAT\(([^,]+),\s*',\s*'\)/gi, "STRING_AGG($1, ', ')")
      .replace(/GROUP_CONCAT\(([^,]+),\s*',\s*'\)/gi, "STRING_AGG($1, ', ')");
  }

  // Run a query (INSERT, UPDATE, DELETE) - returns {lastID, changes}
  run(query, params = []) {
    const { query: convertedQuery, params: convertedParams } = this.convertParams(this.convertQuery(query), params);
    
    if (this.isPostgres) {
      return this.db.query(convertedQuery, convertedParams)
        .then(result => {
          // PostgreSQL returns different structure
          const lastID = result.rows[0]?.id || result.insertId || null;
          return { lastID, changes: result.rowCount || 0 };
        })
        .catch(err => {
          console.error('PostgreSQL query error:', err);
          throw err;
        });
    } else {
      return new Promise((resolve, reject) => {
        this.db.run(convertedQuery, convertedParams, function(err) {
          if (err) {
            console.error('SQLite query error:', err);
            reject(err);
          } else {
            resolve({ lastID: this.lastID, changes: this.changes });
          }
        });
      });
    }
  }

  // Get a single row
  get(query, params = []) {
    const { query: convertedQuery, params: convertedParams } = this.convertParams(this.convertQuery(query), params);
    
    if (this.isPostgres) {
      return this.db.query(convertedQuery, convertedParams)
        .then(result => result.rows[0] || null)
        .catch(err => {
          console.error('PostgreSQL query error:', err);
          throw err;
        });
    } else {
      return new Promise((resolve, reject) => {
        this.db.get(convertedQuery, convertedParams, (err, row) => {
          if (err) {
            console.error('SQLite query error:', err);
            reject(err);
          } else {
            resolve(row || null);
          }
        });
      });
    }
  }

  // Get all rows
  all(query, params = []) {
    const { query: convertedQuery, params: convertedParams } = this.convertParams(this.convertQuery(query), params);
    
    if (this.isPostgres) {
      return this.db.query(convertedQuery, convertedParams)
        .then(result => result.rows || [])
        .catch(err => {
          console.error('PostgreSQL query error:', err);
          throw err;
        });
    } else {
      return new Promise((resolve, reject) => {
        this.db.all(convertedQuery, convertedParams, (err, rows) => {
          if (err) {
            console.error('SQLite query error:', err);
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      });
    }
  }

  // Prepare statement (returns a prepared statement interface)
  prepare(query) {
    const { query: convertedQuery } = this.convertParams(this.convertQuery(query), []);
    
    if (this.isPostgres) {
      // PostgreSQL doesn't have prepare in the same way, return a wrapper
      return {
        run: (params) => this.run(convertedQuery, params),
        finalize: (callback) => {
          if (callback) callback(null);
        }
      };
    } else {
      const stmt = this.db.prepare(convertedQuery);
      return {
        run: (params) => new Promise((resolve, reject) => {
          stmt.run(params, function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
          });
        }),
        finalize: (callback) => {
          stmt.finalize(callback);
        }
      };
    }
  }

  // Serialize queries (for transactions)
  serialize(callback) {
    if (this.isPostgres) {
      // PostgreSQL uses transactions differently
      return this.db.query('BEGIN')
        .then(() => {
          try {
            const result = callback(this);
            return Promise.resolve(result);
          } catch (err) {
            return this.db.query('ROLLBACK').then(() => Promise.reject(err));
          }
        })
        .then(() => this.db.query('COMMIT'))
        .catch(err => {
          return this.db.query('ROLLBACK').then(() => Promise.reject(err));
        });
    } else {
      return new Promise((resolve, reject) => {
        this.db.serialize(() => {
          try {
            callback(this);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      });
    }
  }
}

module.exports = new QueryHelper(db);

