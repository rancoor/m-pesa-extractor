const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

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

    // Extract from/to
    let fromDateRaw = "";
    let toDateRaw = "";
    const row4 = XLSX.utils.sheet_to_json(ws, { header: 1, range: 3, raw: false })[0] || [];
    for (let j = 0; j < row4.length; j++) {
      if (String(row4[j]).toLowerCase() === "from" && row4[j + 1]) fromDateRaw = row4[j + 1];
      if (String(row4[j]).toLowerCase() === "to" && row4[j + 1]) toDateRaw = row4[j + 1];
    }

    const fromDate = formatDate(fromDateRaw);
    const toDate = formatDate(toDateRaw);

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

    // Header workbook (in memory)
    let endingBalance = 0;
    for (let i = 1; i < linesSheetData.length; i++) endingBalance += linesSheetData[i][4];

    const headerWB = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      headerWB,
      XLSX.utils.aoa_to_sheet([
        ["STATEMENTID", "BANKACCOUNT", "CURRENCY", "ENDINGBALANCE", "FROMDATE", "OPENINGBALANCE", "TODATE"],
        [statementID, "MPESA", "KES", parseFloat(endingBalance.toFixed(3)), fromDate, openingBalance, toDate],
      ]),
      "Bank_statement_header"
    );
    const headerBuffer = XLSX.write(headerWB, { type: "buffer", bookType: "xlsx" });

    // Save buffers in memory (simple store)
    const id = Date.now().toString();
    memoryFiles[id] = {
      header: headerBuffer,
      lines: linesBuffer,
    };

    // Send JSON with download links
    res.json({
      files: [
        { name: "M-Pesa-Header.xlsx", url: `/download/${id}/header` },
        { name: "M-Pesa-Lines.xlsx", url: `/download/${id}/lines` },
      ],
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
