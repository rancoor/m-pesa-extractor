// Database abstraction layer - works with SQLite locally and Postgres on Vercel
const isVercel = process.env.VERCEL === '1' || process.env.DATABASE_URL;

let db;
let initialized = false;

if (isVercel && process.env.DATABASE_URL) {
  // Use Neon (Postgres) on Vercel
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);
  
  const ensureTable = async () => {
    if (!initialized) {
      try {
        await sql`
          CREATE TABLE IF NOT EXISTS statements (
            id SERIAL PRIMARY KEY,
            statementID BIGINT NOT NULL,
            bankAccount TEXT NOT NULL,
            currency TEXT NOT NULL,
            openingBalance REAL NOT NULL,
            closingBalance REAL NOT NULL,
            fromDate TEXT NOT NULL,
            toDate TEXT NOT NULL,
            processedDate TEXT NOT NULL,
            totalTransactions INTEGER NOT NULL,
            fileName TEXT
          )
        `;
        initialized = true;
        console.log('Neon database table ready');
      } catch (err) {
        console.error('Database init error:', err);
        throw err;
      }
    }
  };
  
  db = {
    async init() {
      await ensureTable();
    },
    
    async insert(statementID, bankAccount, currency, openingBalance, closingBalance, fromDate, toDate, processedDate, totalTransactions, fileName) {
      try {
        await ensureTable();
        await sql`
          INSERT INTO statements (statementID, bankAccount, currency, openingBalance, closingBalance, fromDate, toDate, processedDate, totalTransactions, fileName)
          VALUES (${statementID}, ${bankAccount}, ${currency}, ${openingBalance}, ${closingBalance}, ${fromDate}, ${toDate}, ${processedDate}, ${totalTransactions}, ${fileName})
        `;
      } catch (err) {
        console.error('Database insert error:', err);
        throw err;
      }
    },
    
    async query(fromDate, toDate, statementID) {
      try {
        await ensureTable();
        let rows = await sql`SELECT * FROM statements ORDER BY processedDate DESC`;
        
        // Manual filtering
        if (fromDate || toDate || statementID) {
          rows = rows.filter(row => {
            if (fromDate && new Date(row.fromdate) < new Date(fromDate)) return false;
            if (toDate && new Date(row.todate) > new Date(toDate)) return false;
            if (statementID && row.statementid != statementID) return false;
            return true;
          });
        }
        
        return rows;
      } catch (err) {
        console.error('Database query error:', err);
        throw err;
      }
    }
  };
} else if (!isVercel) {
  // Use SQLite locally (not on Vercel)
  let sqlite3, sqliteDb;
  try {
    sqlite3 = require('sqlite3').verbose();
    sqliteDb = new sqlite3.Database('./mpesa_statements.db', (err) => {
      if (err) console.error('Database connection error:', err);
      else console.log('Connected to SQLite database');
    });
  } catch (err) {
    console.error('SQLite not available:', err);
    // Fallback to in-memory only mode if SQLite fails
    db = {
      async init() { console.log('Running without database (in-memory only)'); },
      async insert() { console.log('Database insert skipped (no DB available)'); },
      async query() { return []; }
    };
    module.exports = db;
    return;
  }
  
  db = {
    async init() {
      return new Promise((resolve, reject) => {
        sqliteDb.run(`
          CREATE TABLE IF NOT EXISTS statements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            statementID INTEGER NOT NULL,
            bankAccount TEXT NOT NULL,
            currency TEXT NOT NULL,
            openingBalance REAL NOT NULL,
            closingBalance REAL NOT NULL,
            fromDate TEXT NOT NULL,
            toDate TEXT NOT NULL,
            processedDate TEXT NOT NULL,
            totalTransactions INTEGER NOT NULL,
            fileName TEXT
          )
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
    
    async insert(statementID, bankAccount, currency, openingBalance, closingBalance, fromDate, toDate, processedDate, totalTransactions, fileName) {
      return new Promise((resolve, reject) => {
        sqliteDb.run(
          `INSERT INTO statements (statementID, bankAccount, currency, openingBalance, closingBalance, fromDate, toDate, processedDate, totalTransactions, fileName) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [statementID, bankAccount, currency, openingBalance, closingBalance, fromDate, toDate, processedDate, totalTransactions, fileName],
          (err) => {
            if (err) {
              console.error('Database insert error:', err);
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });
    },
    
    async query(fromDate, toDate, statementID) {
      return new Promise((resolve, reject) => {
        let query = 'SELECT * FROM statements WHERE 1=1';
        const params = [];
        
        if (fromDate) {
          query += ' AND DATE(fromDate) >= DATE(?)';
          params.push(fromDate);
        }
        if (toDate) {
          query += ' AND DATE(toDate) <= DATE(?)';
          params.push(toDate);
        }
        if (statementID) {
          query += ' AND statementID = ?';
          params.push(statementID);
        }
        
        query += ' ORDER BY processedDate DESC';
        
        sqliteDb.all(query, params, (err, rows) => {
          if (err) {
            console.error('Database query error:', err);
            reject(err);
          } else {
            resolve(rows);
          }
        });
      });
    }
  };
} else {
  // Vercel without DATABASE_URL - run without database
  console.warn('Running on Vercel without DATABASE_URL - database features disabled');
  db = {
    async init() { console.log('No database configured'); },
    async insert() { console.log('Database insert skipped (no DB configured)'); },
    async query() { return []; }
  };
}

// Initialize database on load
db.init().catch(err => console.error('Failed to initialize database:', err));

module.exports = db;
