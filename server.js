const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.static("public"));

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

// --- Format date with swapped day/month for D365 ---
const formatDate = (val) => {
  if (!val) return "";
  const d = new Date(val);
  if (isNaN(d)) return String(val);

  // Swap day and month for export
  return `${d.getFullYear()}-${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
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

    // --- Generate Lines sheet ---
    const linesSheetData = [
      ["LINENUMBER","BANKACCOUNT","STATEMENTID","BOOKINGDATE","AMOUNT",
       "BANKSTATEMENTTRANSACTIONCODE","COUNTERAMOUNT","COUNTERCURRENCY","COUNTEREXCHANGERATE",
       "CREDITORREFERENCEINFORMATION","DOCUMENTNUMBER","ENTRYREFERENCE","INSTRUCTEDAMOUNT",
       "INSTRUCTEDCURRENCY","INSTRUCTEDEXCHANGERATE","LINESTATUS","REFERENCENUMBER",
       "RELATEDBANK","RELATEDBANKACCOUNT","REVERSAL","TRADINGPARTY"]
    ];

    let lineNum = 1; // LINENUMBER column
    let minBookingDate = null;
    let maxBookingDate = null;

    for (let i = 7; i < data.length; i++) { // start after header rows
      const row = data[i];
      if (!row?.[0]) continue; // skip empty rows

      const docNum = String(row[0]).toLowerCase();
      if (docNum.includes("total") || docNum.includes("summary")) continue; // skip totals

      const bookingDateRaw = row[1];
      const bookingDateObj = new Date(bookingDateRaw);

      if (!isNaN(bookingDateObj)) {
        if (!minBookingDate || bookingDateObj < minBookingDate) minBookingDate = bookingDateObj;
        if (!maxBookingDate || bookingDateObj > maxBookingDate) maxBookingDate = bookingDateObj;
      }

      const bookingDate = formatDate(bookingDateRaw);

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

    // --- Use actual min/max dates for header, offset by 1 sec ---
    let fromDate = "";
    let toDate = "";
    if (minBookingDate && maxBookingDate) {
      const from = new Date(minBookingDate);
      from.setSeconds(from.getSeconds() - 1);

      const to = new Date(maxBookingDate);
      to.setSeconds(to.getSeconds() + 1);

      fromDate = formatDate(from);
      toDate = formatDate(to);
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
