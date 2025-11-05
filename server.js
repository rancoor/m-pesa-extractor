const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Initialize database
const db = new sqlite3.Database("./mpesa_statements.db", (err) => {
  if (err) console.error("Database connection error:", err);
  else console.log("Connected to SQLite database");
});

// Create statements table
db.run(`
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
`);

app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

// --- Helpers ---
const parseAmount = (val) => {
  if (val === undefined || val === null) return 0;
  let str = String(val).replace(/\s/g, "").replace(/,/g, "");
  if (!str) return 0;
  let isNegative = false;
  if (str.startsWith("(") && str.endsWith(")")) {
    isNegative = true;
    str = str.slice(1, -1);
  }
  const num = parseFloat(str);
  if (isNaN(num)) return 0;
  return isNegative ? -num : num;
};

const formatDate = (val) => {
  if (!val) return "";
  
  // Handle Excel serial date numbers
  let d;
  if (typeof val === 'number') {
    // Excel date serial number (days since 1900-01-01)
    d = new Date((val - 25569) * 86400 * 1000);
  } else {
    d = new Date(val);
  }
  
  if (isNaN(d.getTime())) return String(val);
  
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
};

// --- Upload route ---
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // Get opening balance from request
    const openingBalance = parseFloat(req.body.openingBalance) || 0;

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const ws = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Generate unique statement ID based on timestamp
    const statementID = Date.now();

    // Extract from/to dates - try multiple rows and methods
    let fromDateRaw = "";
    let toDateRaw = "";
    
    // Try reading with raw: true to get Excel serial numbers
    const row4Raw = XLSX.utils.sheet_to_json(ws, { header: 1, range: 3, raw: true })[0] || [];
    const row4Text = XLSX.utils.sheet_to_json(ws, { header: 1, range: 3, raw: false })[0] || [];
    
    for (let j = 0; j < row4Text.length; j++) {
      const cellText = String(row4Text[j]).toLowerCase();
      if (cellText === "from" && j + 1 < row4Raw.length) {
        fromDateRaw = row4Raw[j + 1];
      }
      if (cellText === "to" && j + 1 < row4Raw.length) {
        toDateRaw = row4Raw[j + 1];
      }
    }
    
    const fromDate = formatDate(fromDateRaw);
    const toDate = formatDate(toDateRaw);
    
    console.log('Date extraction:', { fromDateRaw, toDateRaw, fromDate, toDate });

    // Extract closing balance from the statement
    let closingBalance = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      const row = data[i];
      if (row && row.length > 0) {
        const firstCell = String(row[0]).toLowerCase();
        if (firstCell.includes("closing") || firstCell.includes("balance")) {
          // Look for the balance value in the same row
          for (let j = 1; j < row.length; j++) {
            const val = parseAmount(row[j]);
            if (val !== 0) {
              closingBalance = val;
              break;
            }
          }
          if (closingBalance !== 0) break;
        }
      }
    }

    // Lines
    const linesSheetData = [
      [
        "LINENUMBER", "BANKACCOUNT", "STATEMENTID", "BOOKINGDATE", "AMOUNT",
        "BANKSTATEMENTTRANSACTIONCODE", "COUNTERAMOUNT", "COUNTERCURRENCY", "COUNTEREXCHANGERATE",
        "CREDITORREFERENCEINFORMATION", "DOCUMENTNUMBER", "ENTRYREFERENCE", "INSTRUCTEDAMOUNT",
        "INSTRUCTEDCURRENCY", "INSTRUCTEDEXCHANGERATE", "LINESTATUS", "REFERENCENUMBER",
        "RELATEDBANK", "RELATEDBANKACCOUNT", "REVERSAL", "TRADINGPARTY"
      ]
    ];

    let lineNum = 1;
    for (let i = 7; i < data.length; i++) {
      const row = data[i];
      if (!row?.[0]) continue;
      const docNum = String(row[0]).toLowerCase();
      if (docNum.includes("total") || docNum.includes("summary")) continue;

      const bookingDate = formatDate(row[1]);
      const paidInVal = parseAmount(row[5]);
      const withdrawnVal = parseAmount(row[6]);

      if (paidInVal !== 0) {
        linesSheetData.push([
          lineNum++, "MPESA", statementID, bookingDate, parseFloat(paidInVal.toFixed(3)),
          "", 0, "", 0, "", row[0], "", 0, "", 0, "Booked", row[0], "", "", "No", ""
        ]);
      }
      if (withdrawnVal !== 0) {
        linesSheetData.push([
          lineNum++, "MPESA", statementID, bookingDate, parseFloat((-Math.abs(withdrawnVal)).toFixed(3)),
          "", 0, "", 0, "", row[0], "", 0, "", 0, "Booked", row[0], "", "", "No", ""
        ]);
      }
    }

    // Lines workbook (in memory)
    const linesWB = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(linesWB, XLSX.utils.aoa_to_sheet(linesSheetData), "Bank_statement_lines");
    const linesBuffer = XLSX.write(linesWB, { type: "buffer", bookType: "xlsx" });

    // Header workbook (in memory) - use closing balance from statement
    const headerWB = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      headerWB,
      XLSX.utils.aoa_to_sheet([
        ["STATEMENTID", "BANKACCOUNT", "CURRENCY", "ENDINGBALANCE", "FROMDATE", "OPENINGBALANCE", "TODATE"],
        [statementID, "MPESA", "KES", parseFloat(closingBalance.toFixed(3)), fromDate, parseFloat(openingBalance.toFixed(3)), toDate],
      ]),
      "Bank_statement_header"
    );
    const headerBuffer = XLSX.write(headerWB, { type: "buffer", bookType: "xlsx" });

    // Save buffers in memory (simple store)
    const id = statementID.toString();
    memoryFiles[id] = {
      header: headerBuffer,
      lines: linesBuffer,
    };

    // Save to database
    const processedDate = new Date().toISOString();
    const totalTransactions = linesSheetData.length - 1; // Exclude header row
    
    db.run(
      `INSERT INTO statements (statementID, bankAccount, currency, openingBalance, closingBalance, fromDate, toDate, processedDate, totalTransactions, fileName) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [statementID, "MPESA", "KES", openingBalance, closingBalance, fromDate, toDate, processedDate, totalTransactions, req.file.originalname],
      (err) => {
        if (err) console.error("Database insert error:", err);
      }
    );

    // Send JSON with download links
    res.json({
      files: [
        { name: "M-Pesa-Header.xlsx", url: `/download/${id}/header` },
        { name: "M-Pesa-Lines.xlsx", url: `/download/${id}/lines` },
      ],
      statementInfo: {
        statementID,
        openingBalance,
        closingBalance,
        fromDate,
        toDate,
        totalTransactions
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// In-memory store
const memoryFiles = {};

// Download endpoints
app.get("/download/:id/:type", (req, res) => {
  const { id, type } = req.params;
  const file = memoryFiles[id]?.[type];
  if (!file) return res.status(404).send("File not found");

  const filename = type === "header" ? "M-Pesa-Header.xlsx" : "M-Pesa-Lines.xlsx";
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.send(file);
});

// History endpoint
app.get("/api/history", (req, res) => {
  const { fromDate, toDate, statementID } = req.query;
  
  let query = "SELECT * FROM statements WHERE 1=1";
  const params = [];
  
  if (fromDate) {
    query += " AND DATE(fromDate) >= DATE(?)";
    params.push(fromDate);
  }
  if (toDate) {
    query += " AND DATE(toDate) <= DATE(?)";
    params.push(toDate);
  }
  if (statementID) {
    query += " AND statementID = ?";
    params.push(statementID);
  }
  
  query += " ORDER BY processedDate DESC";
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error("Database query error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ statements: rows });
  });
});

// Fallback for /
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✅ Export for Vercel
module.exports = app;

// ✅ Local test mode
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
}
