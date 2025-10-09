# M-Pesa Extractor - Setup and Usage Guide

## 🚀 Quick Start

### Prerequisites
- ✅ Node.js v22.19.0 (Installed)
- ✅ npm v10.9.3 (Installed)

### Setup Complete ✅
The local environment has been successfully set up with:
- All dependencies installed
- Uploads directory created
- Enhanced date parsing implemented
- Server tested and working

## 🏃‍♂️ Running the Application

### Option 1: Using the Batch File (Recommended)
```batch
start.bat
```

### Option 2: Using Node.js directly
```bash
node server.js
```

### Option 3: Using npm (if you add a start script)
Add to package.json:
```json
{
  "scripts": {
    "start": "node server.js"
  }
}
```
Then run:
```bash
npm start
```

## 🌐 Access the Application

Once the server is running, open your web browser and navigate to:
```
http://localhost:8100
```

You should see the M-Pesa Statement Processor interface.

## 📋 How to Use

1. **Start the Server**
   - Run `start.bat` or `node server.js`
   - Server will start on port 8100

2. **Open Web Interface**
   - Go to `http://localhost:8100` in your browser
   - You'll see a clean upload interface

3. **Upload M-Pesa Statement**
   - Click "Choose File" and select your M-Pesa Excel statement
   - Click "Process" to start the conversion

4. **Download Results**
   - The system will generate two Excel files:
     - **Header File**: Contains statement summary information
     - **Lines File**: Contains individual transaction details
   - Download links will appear after processing

## 📁 File Structure
```
m-pesa-extractor/
├── node_modules/          # Dependencies
├── public/               # Web interface files
│   ├── index.html       # Main web interface
│   ├── style.css        # Styling
│   └── ...
├── uploads/             # Temporary upload storage
├── server.js            # Main application server
├── start.bat           # Windows startup script
├── test-date-parsing.js # Date parsing test
└── DATE_PARSING_IMPROVEMENTS.md # Documentation
```

## ⚙️ Configuration

The application includes enhanced date parsing with configurable options in `server.js`:

```javascript
const CONFIG = {
  // Enforce current month validation for statement date ranges
  ENFORCE_CURRENT_MONTH_FOR_STATEMENT_RANGE: false,
  
  // Enforce current month validation for transaction dates
  ENFORCE_CURRENT_MONTH_FOR_TRANSACTIONS: true,
  
  // Log warnings for month mismatches
  LOG_MONTH_MISMATCH_WARNINGS: true,
  
  // Assume dd/mm/yyyy format (M-Pesa Kenya standard)
  ASSUME_DAY_MONTH_FORMAT: true
};
```

## 🧪 Testing Date Parsing

Run the date parsing test to verify functionality:
```bash
node test-date-parsing.js
```

This will show how different date formats are parsed and validated.

## 🔧 Troubleshooting

### Server Won't Start
- Ensure Node.js is installed: `node --version`
- Check if port 8100 is available
- Verify all dependencies are installed: `npm install`

### Upload Issues
- Ensure the `uploads/` directory exists
- Check file permissions
- Verify the Excel file format is supported

### Date Parsing Issues
- Check the console logs for date parsing warnings
- Verify date formats in your M-Pesa statement
- Adjust CONFIG settings if needed

## 📊 Supported Date Formats

The enhanced parser supports:
- `dd/mm/yyyy` (M-Pesa Kenya standard)
- `dd-mm-yyyy`
- `yyyy-mm-dd` (ISO format)
- `dd/mm/yyyy hh:mm:ss` (with time)
- Excel serial date numbers
- Mixed formats within the same file

## 🛡️ Security Notes

- The application runs locally on your machine
- Uploaded files are stored temporarily and should be cleaned up
- One security vulnerability exists in the xlsx dependency (acceptable for development)

## 🔄 Stopping the Server

To stop the server:
- Press `Ctrl+C` in the terminal/command prompt
- Close the terminal window

## 📝 Output Files

The application generates two Excel files with timestamps:
- `YYYY-MM-DD M-Pesa Recon Header TIMESTAMP.xlsx`
- `YYYY-MM-DD M-Pesa Recon Lines TIMESTAMP.xlsx`

These files are saved in the `public/` directory and can be downloaded directly from the web interface.

## 🆘 Support

If you encounter issues:
1. Check the console output for error messages
2. Verify your M-Pesa statement format
3. Test with the provided test script
4. Review the DATE_PARSING_IMPROVEMENTS.md for technical details