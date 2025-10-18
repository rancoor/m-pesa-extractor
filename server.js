const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const app = express();
const upload = multer({ storage: multer.memoryStorage() }); // In-memory upload

app.use(express.static("public"));

// --- Robust amount parser ---
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

// --- Format date yyyy-mm-dd hh:mm:ss ---
const formatDate = (val) => {
  if (!val) return "";
  const d = new Date(val);
  if (isNaN(d)) return String(val);
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

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const ws = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

    const statementID = 1;
    const openingBalance = 0;

    // --- Extract from/to dates from row 4 ---
    let fromDateRaw = "";
    let toDateRaw = "";
    const row4 = XLSX.utils.sheet_to_json(ws, { header: 1, range: 3, raw: false })[0] || [];

    for (let j = 0; j < row4.length; j++) {
      if (String(row4[j]).toLowerCase() === "from" && row4[j + 1]) fromDateRaw = row4[j + 1];
      if (String(row4[j]).toLowerCase() === "to" && row4[j + 1]) toDateRaw = row4[j + 1];
    }

    const fromDate = formatDate(fromDateRaw);
    const toDate = formatDate(toDateRaw);

    // --- Generate Lines sheet ---
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

    // --- Create Lines workbook ---
    const linesWB = XLSX.utils.book_new();
    const linesWS = XLSX.utils.aoa_to_sheet(linesSheetData);
    XLSX.utils.book_append_sheet(linesWB, linesWS, "Bank_statement_lines");

    const dateStr = new Date().toISOString().split("T")[0];
    const ts = Date.now();
    const linesFile = `/tmp/${dateStr}-M-Pesa-Lines-${ts}.xlsx`;
    XLSX.writeFile(linesWB, linesFile);

    // --- Calculate Ending Balance ---
    let endingBalance = 0;
    for (let i = 1; i < linesSheetData.length; i++) {
      endingBalance += linesSheetData[i][4];
    }

    // --- Create Header workbook ---
    const headerWB = XLSX.utils.book_new();
    const headerWS = XLSX.utils.aoa_to_sheet([
      ["STATEMENTID", "BANKACCOUNT", "CURRENCY", "ENDINGBALANCE", "FROMDATE", "OPENINGBALANCE", "TODATE"],
      [statementID, "MPESA", "KES", parseFloat(endingBalance.toFixed(3)), fromDate, openingBalance, toDate]
    ]);
    XLSX.utils.book_append_sheet(headerWB, headerWS, "Bank_statement_header");

    const headerFile = `/tmp/${dateStr}-M-Pesa-Header-${ts}.xlsx`;
    XLSX.writeFile(headerWB, headerFile);

    res.json({
      files: [
        { name: path.basename(headerFile), url: `/api/download?file=${encodeURIComponent(headerFile)}` },
        { name: path.basename(linesFile), url: `/api/download?file=${encodeURIComponent(linesFile)}` }
      ]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// --- Download route ---
app.get("/api/download", (req, res) => {
  const filePath = req.query.file;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }
  res.download(filePath);
});

// ✅ Works locally AND on Vercel
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
}

module.exports = app;
