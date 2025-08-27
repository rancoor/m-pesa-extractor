const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.static("public"));

app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const inputFile = req.file.path;
  const workbook = XLSX.readFile(inputFile);
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const statementID = 1;
  const openingBalance = 0;

  // --- Date formatting ---
  const formatDate = (val) => {
    if (!val) return "";
    const d = new Date(val);
    if (isNaN(d)) return String(val);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  };

  const fromDate = data[3]?.[2] ? formatDate(data[3][2]) : "";
  const toDate = data[3]?.[4] ? formatDate(data[3][4]) : "";

  // --- Generate Lines workbook ---
  const linesSheetData = [["LINENUMBER","BANKACCOUNT","STATEMENTID","BOOKINGDATE","AMOUNT","BANKSTATEMENTTRANSACTIONCODE","COUNTERAMOUNT","COUNTERCURRENCY","COUNTEREXCHANGERATE","CREDITORREFERENCEINFORMATION","DOCUMENTNUMBER","ENTRYREFERENCE","INSTRUCTEDAMOUNT","INSTRUCTEDCURRENCY","INSTRUCTEDEXCHANGERATE","LINESTATUS","REFERENCENUMBER","RELATEDBANK","RELATEDBANKACCOUNT","REVERSAL","TRADINGPARTY"]];

  for (let i = 8; i < data.length; i++) { // start from row 9
    const row = data[i];
    if (!row?.[0]) continue;

    const docNum = String(row[0] || "").toLowerCase();
    if (docNum.includes("total") || docNum.includes("summary")) continue; // skip totals

    // PaidIn (col 5), Withdrawn (col 6)
    let paidIn = parseFloat(String(row[5] || 0).replace(/,/g,'').trim()) || 0;
    let withdrawn = parseFloat(String(row[6] || 0).replace(/,/g,'').trim()) || 0;

    withdrawn = -Math.abs(withdrawn); // withdrawals are negative
    const amt = parseFloat((paidIn + withdrawn).toFixed(3));

    const bookingDate = formatDate(row[1]);

    linesSheetData.push([
      i-7,"MPESA",statementID,bookingDate,amt,"",0,"",0,"", row[0],"",0,"",0,"Booked", row[0],"","","No",""
    ]);
  }

  const linesWB = XLSX.utils.book_new();
  const linesWS = XLSX.utils.aoa_to_sheet(linesSheetData);
  XLSX.utils.book_append_sheet(linesWB, linesWS, "Bank_statement_lines");

  const dateStr = new Date().toISOString().split("T")[0];
  const ts = new Date().getTime();
  const linesFile = path.join(__dirname, `public/${dateStr} M-Pesa Recon Lines ${ts}.xlsx`);
  XLSX.writeFile(linesWB, linesFile);

  // --- Calculate Ending Balance from Lines workbook ---
  const linesReadWB = XLSX.readFile(linesFile);
  const linesReadWS = linesReadWB.Sheets["Bank_statement_lines"];
  const linesData = XLSX.utils.sheet_to_json(linesReadWS, { header: 1 });

  let endingBalance = 0;
  for (let i = 1; i < linesData.length; i++) { // skip header
    const docNum = String(linesData[i][10] || "").toLowerCase(); // DOCUMENTNUMBER column
    if (docNum.includes("total") || docNum.includes("summary")) continue;

    let amtRaw = linesData[i][4]; // AMOUNT column
    if (amtRaw === undefined || amtRaw === null) amtRaw = 0;
    amtRaw = String(amtRaw).replace(/,/g,'').trim();
    const amt = parseFloat(amtRaw) || 0;
    endingBalance += amt;
  }

  // --- Generate Header workbook ---
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
});

app.listen(8100, () => console.log("Server running on port 5000"));
