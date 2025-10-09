// Test script for the enhanced date parsing functionality

// Configuration for date validation behavior
const CONFIG = {
  ENFORCE_CURRENT_MONTH_FOR_STATEMENT_RANGE: false,
  ENFORCE_CURRENT_MONTH_FOR_TRANSACTIONS: true,
  LOG_MONTH_MISMATCH_WARNINGS: true,
  ASSUME_DAY_MONTH_FORMAT: true // M-Pesa Kenya format (dd/mm/yyyy)
};

// Enhanced date parser with M-Pesa specific logic
const parseStatementDate = (dateStr) => {
  if (!dateStr) return null;
  
  const str = String(dateStr).trim();
  
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

// Format date yyyy-mm-dd hh:mm:ss with enhanced parsing
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
    }
  }
  
  // Format as yyyy-mm-dd hh:mm:ss
  return `${parsedDate.getFullYear()}-${String(parsedDate.getMonth()+1).padStart(2,'0')}-${String(parsedDate.getDate()).padStart(2,'0')} ${String(parsedDate.getHours()).padStart(2,'0')}:${String(parsedDate.getMinutes()).padStart(2,'0')}:${String(parsedDate.getSeconds()).padStart(2,'0')}`;
};

// Test cases
console.log("=== Testing Enhanced Date Parsing ===");
console.log(`Current month: ${new Date().getMonth() + 1} (${new Date().toLocaleString('default', { month: 'long' })})`);
console.log();

const testDates = [
  "09/10/2024",      // Could be Sept 10 or Oct 9 - with our config, it's 9/Oct/2024
  "15/10/2024",      // Clearly 15/Oct/2024 (dd/mm/yyyy)
  "10/15/2024",      // Clearly 15/Oct/2024 (mm/dd/yyyy detected)
  "2024-10-09",      // ISO format
  "2024-10-09 14:30:45", // ISO with time
  "09/10/2024 08:15", // dd/mm/yyyy with time
  "44567",           // Excel serial date
  "invalid-date"     // Invalid format
];

testDates.forEach(testDate => {
  console.log(`Input: "${testDate}"`);
  console.log(`Parsed (no validation): ${formatDate(testDate, false)}`);
  console.log(`Parsed (with current month check): ${formatDate(testDate, true)}`);
  console.log('---');
});

console.log("\n=== Configuration Options ===");
console.log("To customize the behavior, modify these constants in server.js:");
console.log("- ENFORCE_CURRENT_MONTH_FOR_STATEMENT_RANGE: false (allows any month for from/to dates)");
console.log("- ENFORCE_CURRENT_MONTH_FOR_TRANSACTIONS: true (validates transaction dates against current month)");
console.log("- LOG_MONTH_MISMATCH_WARNINGS: true (logs warnings when months don't match)");
console.log("- ASSUME_DAY_MONTH_FORMAT: true (assumes dd/mm/yyyy for M-Pesa Kenya format)");