# M-Pesa Date Parsing Improvements

## Overview
The M-Pesa extractor has been enhanced with robust date parsing logic to handle various date formats commonly found in M-Pesa statements and ensure proper month validation.

## Problem Solved
Previously, the application used JavaScript's native `Date()` constructor which could misinterpret ambiguous date formats, particularly when dealing with formats like "dd/mm/yyyy" vs "mm/dd/yyyy". This led to dates being parsed with incorrect months.

## Solution Implemented

### 1. Enhanced Date Parser (`parseStatementDate`)
- **Smart Format Detection**: Automatically detects whether dates are in dd/mm/yyyy or mm/dd/yyyy format
- **Excel Serial Date Support**: Handles Excel serial date numbers commonly found in exported spreadsheets
- **Multiple Pattern Support**: Recognizes various date formats including:
  - `dd/mm/yyyy` and `dd-mm-yyyy` (M-Pesa Kenya format)
  - `yyyy-mm-dd` (ISO format)
  - Date with time components (`dd/mm/yyyy hh:mm:ss`)
- **Intelligent Validation**: Uses logical rules to determine correct day/month interpretation

### 2. Configuration Options
The system now includes configurable behavior through the `CONFIG` object in `server.js`:

```javascript
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
```

### 3. Month Validation Features
- **Current Month Checking**: Optionally validates that parsed dates match the current month
- **Warning System**: Logs warnings when dates don't match expected month patterns
- **Flexible Enforcement**: Can be configured to either reject mismatched dates or just log warnings

## Key Improvements

### Before
```javascript
const formatDate = (val) => {
  if (!val) return "";
  const d = new Date(val);
  if (isNaN(d)) return String(val);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
};
```

### After
- Comprehensive date parsing with multiple format support
- Smart format detection (dd/mm vs mm/dd)
- Excel serial date handling
- Current month validation
- Configurable behavior
- Enhanced error handling and logging

## Testing
Run the test script to see the enhanced parsing in action:
```bash
node test-date-parsing.js
```

### Test Results (Current Month: October)
- `09/10/2024` → `2024-10-09 00:00:00` (correctly parsed as 9th October)
- `15/10/2024` → `2024-10-15 00:00:00` (unambiguous dd/mm/yyyy)
- `10/15/2024` → `2024-10-15 00:00:00` (auto-detected as mm/dd/yyyy)
- `2024-10-09` → `2024-10-09 00:00:00` (ISO format)
- Excel serial dates are properly converted
- Invalid dates are handled gracefully

## Configuration Recommendations

### For M-Pesa Kenya
```javascript
ASSUME_DAY_MONTH_FORMAT: true,
ENFORCE_CURRENT_MONTH_FOR_TRANSACTIONS: true,
ENFORCE_CURRENT_MONTH_FOR_STATEMENT_RANGE: false,
LOG_MONTH_MISMATCH_WARNINGS: true
```

### For Other Regions (US format)
```javascript
ASSUME_DAY_MONTH_FORMAT: false,
ENFORCE_CURRENT_MONTH_FOR_TRANSACTIONS: false,
ENFORCE_CURRENT_MONTH_FOR_STATEMENT_RANGE: false,
LOG_MONTH_MISMATCH_WARNINGS: true
```

## Error Handling
- Invalid dates are returned as-is with warning logs
- Month mismatches are logged but don't break processing
- Excel serial dates are automatically converted
- Fallback to native Date parsing for edge cases

## Usage
The enhanced parsing is automatically applied to:
1. **Statement date ranges** (From/To dates in row 4)
2. **Individual transaction dates** (Booking dates for each transaction)

No changes are required to existing usage - the improvements are backward compatible and will enhance the accuracy of date parsing automatically.