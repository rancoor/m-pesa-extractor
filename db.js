// Database abstraction layer - works with SQLite locally and Postgres on Vercel
const isVercel = process.env.VERCEL === '1';

let db;

if (isVercel) {
  // Use Neon (Postgres) on Vercel
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);
  
  db = {
    async init() {
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
        console.log('Connected to Neon database');
      } catch (err) {
        console.error('Database init error:', err);
      }
    },
    
    async insert(statementID, bankAccount, currency, openingBalance, closingBalance, fromDate, toDate, processedDate, totalTransactions, fileName) {
      try {
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
        let conditions = [];
        
        if (fromDate) {
          conditions.push(sql`DATE(fromDate) >= DATE(${fromDate})`);
        }
        if (toDate) {
          conditions.push(sql`DATE(toDate) <= DATE(${toDate})`);
        }
        if (statementID) {
          conditions.push(sql`statementID = ${statementID}`);
        }
        
        let rows;
        if (conditions.length > 0) {
          // Build dynamic query - simplified for now, fetch all and filter
          rows = await sql`SELECT * FROM statements ORDER BY processedDate DESC`;
          // Manual filtering for simplicity
          rows = rows.filter(row => {
            if (fromDate && new Date(row.fromDate) < new Date(fromDate)) return false;
            if (toDate && new Date(row.toDate) > new Date(toDate)) return false;
            if (statementID && row.statementID != statementID) return false;
            return true;
          });
        } else {
          rows = await sql`SELECT * FROM statements ORDER BY processedDate DESC`;
        }
        
        return rows;
      } catch (err) {
        console.error('Database query error:', err);
        throw err;
      }
    }
  };
} else {
  // Use SQLite locally
  const sqlite3 = require('sqlite3').verbose();
  const sqliteDb = new sqlite3.Database('./mpesa_statements.db', (err) => {
    if (err) console.error('Database connection error:', err);
    else console.log('Connected to SQLite database');
  });
  
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
}

// Initialize database on load
db.init().catch(err => console.error('Failed to initialize database:', err));

module.exports = db;
