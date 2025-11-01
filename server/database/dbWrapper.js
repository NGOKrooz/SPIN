const DB_TYPE = process.env.DATABASE_URL ? 'postgres' : (process.env.DB_TYPE || 'sqlite');
const { getDatabase } = require('./init');
const queryHelper = require('./queryHelper');

const db = getDatabase();
const isPostgres = DB_TYPE === 'postgres';

// Create a wrapper that provides SQLite-compatible callback interface
// but works with both SQLite and PostgreSQL
const dbWrapper = {
  // Convert SQLite query to PostgreSQL if needed
  _convertQuery: function(query) {
    if (!isPostgres) return query;
    
    let converted = query;
    
    // Convert date functions first
    converted = converted.replace(/date\('now'\)/gi, 'CURRENT_DATE');
    converted = converted.replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP');
    
    // Convert string concatenation operator (|| works in PostgreSQL too, but ensure it's handled)
    // PostgreSQL supports || for string concatenation, so this should be fine
    
    // Convert GROUP_CONCAT with CASE statements (most complex, do first)
    // Need to handle multiline CASE statements with nested content
    // Pattern: GROUP_CONCAT(CASE ... END, 'separator')
    // Use a more robust regex that handles multiline and nested content
    // Match across newlines with [\s\S] instead of . for better compatibility
    converted = converted.replace(/GROUP_CONCAT\s*\(\s*(CASE[\s\S]*?END)\s*,\s*'([^']+)'\s*\)/gi, (match, caseExpr, separator) => {
      // Clean up the CASE expression (remove extra whitespace/newlines, but preserve structure)
      const cleanCase = caseExpr.replace(/\s+/g, ' ').trim();
      // For PostgreSQL, STRING_AGG with CASE needs proper NULL handling
      return `STRING_AGG((${cleanCase})::text, '${separator}') FILTER (WHERE (${cleanCase}) IS NOT NULL)`;
    });
    
    // Convert simple GROUP_CONCAT calls (pipe separator)
    converted = converted.replace(/GROUP_CONCAT\s*\(([^,()]+)\s*,\s*'\|'\s*\)/gi, "STRING_AGG($1::text, '|')");
    
    // Convert simple GROUP_CONCAT calls (comma separator)
    converted = converted.replace(/GROUP_CONCAT\s*\(([^,()]+)\s*,\s*',\s*'\s*\)/gi, "STRING_AGG($1::text, ', ')");
    
    // Final fallback: if any GROUP_CONCAT still remains (shouldn't happen, but just in case)
    if (converted.includes('GROUP_CONCAT')) {
      console.warn('Warning: Found remaining GROUP_CONCAT that may need manual conversion');
      // Try to convert remaining ones generically
      converted = converted.replace(/GROUP_CONCAT\s*\(/gi, 'STRING_AGG(');
    }
    
    // Convert PRAGMA table_info
    converted = converted.replace(/PRAGMA\s+table_info\((\w+)\)/gi, (match, tableName) => {
      return `
        SELECT 
          ordinal_position as cid,
          column_name as name,
          data_type as type,
          CASE WHEN is_nullable = 'NO' THEN 1 ELSE 0 END as notnull,
          column_default as dflt_value,
          CASE WHEN column_name = (SELECT column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name WHERE tc.table_name = '${tableName}' AND tc.constraint_type = 'PRIMARY KEY' LIMIT 1) THEN 1 ELSE 0 END as pk
        FROM information_schema.columns
        WHERE table_name = '${tableName}'
        ORDER BY ordinal_position
      `;
    });
    
    return converted;
  },

  // Convert params array to PostgreSQL format
  _convertParams: function(query, params) {
    if (!isPostgres) return { query, params };
    
    // If query already uses $1, $2 format, don't convert
    if (query.includes('$1')) {
      return { query, params };
    }
    
    let paramIndex = 1;
    const convertedParams = [];
    const convertedQuery = query.replace(/\?/g, () => {
      const param = params[paramIndex - 1];
      convertedParams.push(param);
      return `$${paramIndex++}`;
    });
    
    return { query: convertedQuery, params: convertedParams };
  },

  // db.run() - callback style
  run: function(query, params, callback) {
    // Handle different argument patterns
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    if (!params) params = [];
    
    let convertedQuery = this._convertQuery(query);
    const { query: finalQuery, params: finalParams } = this._convertParams(convertedQuery, params);
    
    if (isPostgres) {
      // For INSERT queries, add RETURNING id to get the lastID
      let queryToRun = finalQuery;
      if (query.trim().toUpperCase().startsWith('INSERT') && !query.includes('RETURNING') && !query.toUpperCase().includes('RETURNING')) {
        queryToRun = finalQuery + ' RETURNING id';
      }
      
      db.query(queryToRun, finalParams)
        .then(result => {
          // PostgreSQL structure
          const lastID = result.rows[0]?.id || null;
          const changes = result.rowCount || 0;
          if (callback) {
            callback.call({ lastID, changes }, null);
          }
        })
        .catch(err => {
          console.error('PostgreSQL query error in db.run:', err);
          console.error('Query:', queryToRun);
          console.error('Params:', finalParams);
          if (callback) callback.call({ lastID: null, changes: 0 }, err);
        });
    } else {
      db.run(finalQuery, finalParams, function(err) {
        if (err) {
          console.error('SQLite query error in db.run:', err);
          console.error('Query:', finalQuery);
          console.error('Params:', finalParams);
        }
        if (callback) callback.call(this, err);
      });
    }
  },

  // db.get() - callback style
  get: function(query, params, callback) {
    // Handle different argument patterns
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    if (!params) params = [];
    
    const convertedQuery = this._convertQuery(query);
    const { query: finalQuery, params: finalParams } = this._convertParams(convertedQuery, params);
    
    if (isPostgres) {
      db.query(finalQuery, finalParams)
        .then(result => {
          const row = result.rows[0] || null;
          if (callback) callback(null, row);
        })
        .catch(err => {
          console.error('PostgreSQL query error in db.get:', err);
          console.error('Query:', finalQuery);
          console.error('Params:', finalParams);
          if (callback) callback(err, null);
        });
    } else {
      db.get(finalQuery, finalParams, (err, row) => {
        if (err) {
          console.error('SQLite query error in db.get:', err);
          console.error('Query:', finalQuery);
          console.error('Params:', finalParams);
        }
        if (callback) callback(err, row);
      });
    }
  },

  // db.all() - callback style
  all: function(query, params, callback) {
    // Handle different argument patterns
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    if (!params) params = [];
    
    const convertedQuery = this._convertQuery(query);
    const { query: finalQuery, params: finalParams } = this._convertParams(convertedQuery, params);
    
    if (isPostgres) {
      db.query(finalQuery, finalParams)
        .then(result => {
          const rows = result.rows || [];
          if (callback) callback(null, rows);
        })
        .catch(err => {
          console.error('PostgreSQL query error in db.all:', err);
          console.error('Query:', finalQuery);
          console.error('Params:', finalParams);
          if (callback) callback(err, null);
        });
    } else {
      db.all(finalQuery, finalParams, (err, rows) => {
        if (err) {
          console.error('SQLite query error in db.all:', err);
          console.error('Query:', finalQuery);
          console.error('Params:', finalParams);
        }
        if (callback) callback(err, rows);
      });
    }
  },

  // db.serialize() - for transactions
  serialize: function(callback) {
    if (isPostgres) {
      // PostgreSQL uses explicit transactions
      db.query('BEGIN')
        .then(() => {
          try {
            callback(this);
            return db.query('COMMIT');
          } catch (err) {
            return db.query('ROLLBACK').then(() => Promise.reject(err));
          }
        })
        .catch(err => {
          console.error('Transaction error:', err);
          return db.query('ROLLBACK');
        });
    } else {
      db.serialize(() => {
        callback(this);
      });
    }
  },

  // db.prepare() - for prepared statements
  prepare: function(query) {
    const convertedQuery = this._convertQuery(query);
    
    if (isPostgres) {
      // Return a wrapper that works like SQLite's prepared statement
      return {
        run: (params, callback) => {
          if (typeof params === 'function') {
            callback = params;
            params = [];
          }
          const { query: finalQuery, params: finalParams } = this._convertParams(convertedQuery, params || []);
          db.query(finalQuery, finalParams)
            .then(result => {
              if (callback) callback.call({ lastID: result.rows[0]?.id || null, changes: result.rowCount || 0 }, null);
            })
            .catch(err => {
              if (callback) callback.call({ lastID: null, changes: 0 }, err);
            });
        },
        finalize: (callback) => {
          if (callback) callback(null);
        }
      };
    } else {
      return db.prepare(convertedQuery);
    }
  }
};

module.exports = dbWrapper;

