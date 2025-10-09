const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.static("public"));

// --- Configuration for date validation behavior ---
const CONFIG = {
  // Set to true to enforce that statement date ranges must be in current month
  ENFORCE_CURRENT_MONTH_FOR_STATEMENT_RANGE: false,
  
  // Set to true to enforce that individual transaction dates must be in current month
  ENFORCE_CURRENT_MONTH_FOR_TRANSACTIONS: true,
  
  // Log warnings when dates don't match current month (regardless of enforcement)
  LOG_MONTH_MISMATCH_WARNINGS: true,
  
  // Assume dd/mm/yyyy format for ambiguous dates (true) or mm/dd/yyyy (false)
  ASSUME_DAY_MONTH_FORMAT: true // Set to true for M-Pesa Kenya format (dd/mm/yyyy)
};

// --- Date validation helper function ---
const isDateInCurrentMonth = (date, strictMode = false) => {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();
  
  if (strictMode) {
    // Strict mode: date must be in current month and year
    return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
  } else {
    // Lenient mode: allow current month of current or previous year
    return date.getMonth() === currentMonth && 
           (date.getFullYear() === currentYear || date.getFullYear() === currentYear - 1);
  }
};

// --- Enhanced date parser with M-Pesa specific logic ---
const parseStatementDate = (dateStr, contextInfo = {}) => {
  if (!dateStr) return null;
  
  const str = String(dateStr).trim();
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  
  // Excel serial date handling
  if (!isNaN(str) && str.length <= 5) {
    const excelEpoch = new Date(1900, 0, 1);
    const days = parseInt(str) - 2;
    return new Date(excelEpoch.getTime() + (days * 24 * 60 * 60 * 1000));
  }
  
  // Common M-Pesa date patterns
  const datePatterns = [
    // dd/mm/yyyy format (most common in M-Pesa Kenya) or mm/dd/yyyy
    {
      regex: /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
      parser: (match) => {
        const first = parseInt(match[1]);
        const second = parseInt(match[2]);
        const year = parseInt(match[3]);
        const hour = match[4] ? parseInt(match[4]) : 0;
        const minute = match[5] ? parseInt(match[5]) : 0;
        const second_time = match[6] ? parseInt(match[6]) : 0;
        
        let day, month;
        
        // Determine format based on configuration and logic
        if (CONFIG.ASSUME_DAY_MONTH_FORMAT) {
          // dd/mm/yyyy format (M-Pesa Kenya)
          day = first;
          month = second;
        } else {
          // mm/dd/yyyy format (US style)
          day = second;
          month = first;
        }
        
        // Validation and smart detection
        if (first > 12 && second <= 12) {
          // First number > 12, must be day (dd/mm/yyyy)
          day = first;
          month = second;
        } else if (second > 12 && first <= 12) {
          // Second number > 12, must be day (mm/dd/yyyy)
          day = second;
          month = first;
        }
        
        // Final validation
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900) {
          return new Date(year, month - 1, day, hour, minute, second_time);
        }
        return null;
      }
    },
    // yyyy-mm-dd format
    {
      regex: /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
      parser: (match) => {
        const year = parseInt(match[1]);
        const month = parseInt(match[2]);
        const day = parseInt(match[3]);
        const hour = match[4] ? parseInt(match[4]) : 0;
        const minute = match[5] ? parseInt(match[5]) : 0;
        const second = match[6] ? parseInt(match[6]) : 0;
        
        return new Date(year, month - 1, day, hour, minute, second);
      }
    }
  ];
  
  for (let pattern of datePatterns) {
    const match = str.match(pattern.regex);
    if (match) {
      const date = pattern.parser(match);
      if (date && !isNaN(date)) {
        return date;
      }
    }
  }
  
  // Fallback to native parsing
  const fallbackDate = new Date(str);
  return isNaN(fallbackDate) ? null : fallbackDate;
};

// --- Robust amount parser ---
const parseAmount = (val) => {
  if (val === undefined || val === null) return 0;
  let str = String(val).replace(/\s/g, '').replace(/,/g,'');
  if (!str) return 0;

  // Negative numbers in parentheses
  let isNegative = false;
  if (str.startsWith('(') && str.endsWith(')')) {
    isNegative = true;
    str = str.slice(1, -1);
  }

  const num = parseFloat(str);
  if (isNaN(num)) return 0;

  return isNegative ? -num : num;
};

// --- Format date yyyy-mm-dd hh:mm:ss with enhanced parsing ---
const formatDate = (val, enforceCurrentMonth = false) => {
  if (!val) return "";
  
  // Use the enhanced parser
  const parsedDate = parseStatementDate(val);
  
  if (!parsedDate) {
    if (CONFIG.LOG_MONTH_MISMATCH_WARNINGS) {
      console.warn(`Unable to parse date: ${val}`);
    }
    return String(val);
  }
  
  // Optional: enforce current month validation
  if (enforceCurrentMonth) {
    const currentMonth = new Date().getMonth();
    if (parsedDate.getMonth() !== currentMonth) {
      if (CONFIG.LOG_MONTH_MISMATCH_WARNINGS) {
        console.warn(`Date month ${parsedDate.getMonth() + 1} doesn't match current month ${currentMonth + 1} for date: ${val}`);
      }
      // You can choose different behaviors here:
      // 1. Return the original value (strict validation fails)
      // 2. Adjust to current month: parsedDate.setMonth(currentMonth);
      // 3. Just log warning and proceed (current behavior)
      
      // For now, we'll proceed with the parsed date but log the warning
      // Uncomment the next line if you want strict rejection:
      // return String(val);
    }
  }
  
  // Format as yyyy-mm-dd hh:mm:ss
  return `${parsedDate.getFullYear()}-${String(parsedDate.getMonth()+1).padStart(2,'0')}-${String(parsedDate.getDate()).padStart(2,'0')} ${String(parsedDate.getHours()).padStart(2,'0')}:${String(parsedDate.getMinutes()).padStart(2,'0')}:${String(parsedDate.getSeconds()).padStart(2,'0')}`;
};

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const inputFile = req.file.path;
    const workbook = XLSX.readFile(inputFile);
    const ws = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

    const statementID = 1;
    const openingBalance = 0;

    // --- Extract from/to dates from row 4 ---
    let fromDateRaw = "";
    let toDateRaw = "";
    const row4 = XLSX.utils.sheet_to_json(ws, { header: 1, range: 3, raw: false })[0] || [];
    console.log("Row 4 contents:", row4);

    for (let j = 0; j < row4.length; j++) {
      if (String(row4[j]).toLowerCase() === "from" && row4[j + 1]) {
        fromDateRaw = row4[j + 1];
      }
      if (String(row4[j]).toLowerCase() === "to" && row4[j + 1]) {
        toDateRaw = row4[j + 1];
      }
    }

    // Use configuration for statement date range validation
    const fromDate = formatDate(fromDateRaw, CONFIG.ENFORCE_CURRENT_MONTH_FOR_STATEMENT_RANGE);
    const toDate = formatDate(toDateRaw, CONFIG.ENFORCE_CURRENT_MONTH_FOR_STATEMENT_RANGE);
    console.log("Extracted From Date:", fromDate);
    console.log("Extracted To Date:", toDate);

  
    // --- Generate Lines sheet ---
    const linesSheetData = [
      ["LINENUMBER","BANKACCOUNT","STATEMENTID","BOOKINGDATE","AMOUNT",
       "BANKSTATEMENTTRANSACTIONCODE","COUNTERAMOUNT","COUNTERCURRENCY","COUNTEREXCHANGERATE",
       "CREDITORREFERENCEINFORMATION","DOCUMENTNUMBER","ENTRYREFERENCE","INSTRUCTEDAMOUNT",
       "INSTRUCTEDCURRENCY","INSTRUCTEDEXCHANGERATE","LINESTATUS","REFERENCENUMBER",
       "RELATEDBANK","RELATEDBANKACCOUNT","REVERSAL","TRADINGPARTY"]
    ];

    let lineNum = 1; // LINENUMBER column

    for (let i = 7; i < data.length; i++) { // start after header rows
      const row = data[i];
      if (!row?.[0]) continue; // skip empty rows

      const docNum = String(row[0]).toLowerCase();
      if (docNum.includes("total") || docNum.includes("summary")) continue; // skip totals

      // Use configuration for transaction date validation
      const bookingDate = formatDate(row[1], CONFIG.ENFORCE_CURRENT_MONTH_FOR_TRANSACTIONS);

      // Paid In row
      const paidInVal = parseAmount(row[5]);
      if (paidInVal !== 0) {
        linesSheetData.push([
          lineNum++,
          "MPESA",
          statementID,
          bookingDate,
          parseFloat(paidInVal.toFixed(3)),
          "",0,"",0,"",
          row[0],"",0,"",0,
          "Booked", row[0], "","","No",""
        ]);
      }

      // Withdrawn row
      const withdrawnVal = parseAmount(row[6]);
      if (withdrawnVal !== 0) {
        linesSheetData.push([
          lineNum++,
          "MPESA",
          statementID,
          bookingDate,
          parseFloat((-Math.abs(withdrawnVal)).toFixed(3)), // ensure negative
          "",0,"",0,"",
          row[0],"",0,"",0,
          "Booked", row[0], "","","No",""
        ]);
      }
    }

    // --- Create Lines workbook ---
    const linesWB = XLSX.utils.book_new();
    const linesWS = XLSX.utils.aoa_to_sheet(linesSheetData);
    XLSX.utils.book_append_sheet(linesWB, linesWS, "Bank_statement_lines");

    const dateStr = new Date().toISOString().split("T")[0];
    const ts = new Date().getTime();
    const linesFile = path.join(__dirname, `public/${dateStr} M-Pesa Recon Lines ${ts}.xlsx`);
    XLSX.writeFile(linesWB, linesFile);

    // --- Calculate Ending Balance ---
    let endingBalance = 0;
    for (let i = 1; i < linesSheetData.length; i++) {
      endingBalance += linesSheetData[i][4]; // column 5 = AMOUNT
    }

    // --- Create Header workbook ---
    const headerWB = XLSX.utils.book_new();
    const headerWS = XLSX.utils.aoa_to_sheet([
      ["STATEMENTID","BANKACCOUNT","CURRENCY","ENDINGBALANCE","FROMDATE","OPENINGBALANCE","TODATE"],
      [
        statementID,
        "MPESA",
        "KES",
        parseFloat(endingBalance.toFixed(3)),
        fromDate,
        openingBalance,
        toDate
      ]
    ]);
    XLSX.utils.book_append_sheet(headerWB, headerWS, "Bank_statement_header");

    const headerFile = path.join(__dirname, `public/${dateStr} M-Pesa Recon Header ${ts}.xlsx`);
    XLSX.writeFile(headerWB, headerFile);

    fs.unlinkSync(inputFile);

    res.json({ files: [`/${path.basename(headerFile)}`, `/${path.basename(linesFile)}`] });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(8100, () => console.log("Server running on port 8100"));
