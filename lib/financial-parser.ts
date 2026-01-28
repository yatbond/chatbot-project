// Financial Report Parser - Fixed v4
// Correctly reads Gross Profit row and counts numbers from LEFT to RIGHT

export function extractFinancialData(text: string): string {
  let output = '\n\n=== FINANCIAL DATA ===\n\n'
  
  output += 'COLUMN MAPPING (ALL REPORTS):\n'
  output += '  1st number: Tender (Budget)\n'
  output += '  2nd number: 1st Working Budget\n'
  output += '  3rd number: Business Plan\n'
  output += '  4th number: AUDIT REPORT (WIP) ***\n'
  output += '  5th number: Projection\n'
  output += '  ...more numbers for Accrual, Cash Flow\n\n'
  
  // Find the Gross Profit (Financial A/C) line
  const lines = text.split('\n')
  
  let gpLine = ''
  let gpLineIndex = -1
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.toLowerCase().includes('gross profit') && 
        line.toLowerCase().includes('financial') &&
        line.length < 200 &&
        !line.includes('total') &&
        !line.includes('reconciliation')) {
      gpLine = line
      gpLineIndex = i
      break
    }
  }
  
  if (gpLine) {
    // Collect numbers from GP line and next 2 lines
    let allNumbers: string[] = []
    
    for (let i = gpLineIndex; i < Math.min(gpLineIndex + 3, lines.length); i++) {
      const numbers = lines[i].match(/(\d{1,3}(?:,\d{3}){0,})/g) || []
      allNumbers.push(...numbers)
    }
    
    // Filter out single-digit numbers and small values (likely not financial figures)
    allNumbers = allNumbers.filter(n => {
      const val = parseInt(n.replace(/,/g, ''))
      return val >= 1000 // Filter out small numbers
    })
    
    // Output the values in order (left to right)
    output += '=== GROSS PROFIT (BEFORE RECONCILIATION) ===\n'
    output += 'Item 3: Gross Profit (Item 1.0-2.0) (Financial A/C)\n\n'
    
    if (allNumbers.length >= 5) {
      output += '  1st number (Tender): ' + allNumbers[0] + ' HK$\n000\n'
      output += '  2nd number (1st Working): ' + allNumbers[1] + ' HK$\n000\n'
      output += '  3rd number (Business Plan): ' + allNumbers[2] + ' HK$\n000\n'
      output += '  4th number (AUDIT REPORT): ' + allNumbers[3] + ' HK$\n000 ***\n'
      output += '  5th number (Projection): ' + allNumbers[4] + ' HK$\n000\n'
      
      if (allNumbers.length >= 7) {
        output += '  6th+ numbers (Accrual/Cash Flow): ' + allNumbers.slice(5).join(', ') + ' HK$\n000\n'
      }
    } else {
      output += '  [Not enough data extracted - see original PDF]\n'
    }
  } else {
    output += '  Gross Profit line not found in extracted text\n'
  }
  
  return output
}

export function getGrossProfitAudit(text: string): string {
  // Find Gross Profit line
  const lines = text.split('\n')
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.toLowerCase().includes('gross profit') && 
        line.toLowerCase().includes('financial') &&
        line.length < 200) {
      
      // Collect numbers from this line and next 2
      let allNumbers: string[] = []
      for (let j = i; j < Math.min(i + 3, lines.length); j++) {
        const numbers = lines[j].match(/(\d{1,3}(?:,\d{3}){0,})/g) || []
        allNumbers.push(...numbers)
      }
      
      // Filter small numbers
      allNumbers = allNumbers.filter(n => {
        const val = parseInt(n.replace(/,/g, ''))
        return val >= 1000
      })
      
      // The 4th number (index 3) is Audit Report
      if (allNumbers.length >= 4) {
        return 'Gross Profit for Audit Report (WIP): ' + allNumbers[3] + ' HK$\n000'
      }
    }
  }
  
  return 'Gross Profit for Audit Report (WIP): Data not found'
}

export function getAllGrossProfit(text: string): string {
  const lines = text.split('\n')
  
  // Find GP line
  let gpLineIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes('gross profit') && 
        lines[i].toLowerCase().includes('financial')) {
      gpLineIndex = i
      break
    }
  }
  
  if (gpLineIndex < 0) {
    return 'Gross Profit data not found'
  }
  
  // Collect numbers
  let allNumbers: string[] = []
  for (let i = gpLineIndex; i < Math.min(gpLineIndex + 3, lines.length); i++) {
    const numbers = lines[i].match(/(\d{1,3}(?:,\d{3}){0,})/g) || []
    allNumbers.push(...numbers)
  }
  
  allNumbers = allNumbers.filter(n => {
    const val = parseInt(n.replace(/,/g, ''))
    return val >= 1000
  })
  
  let output = '\n\n=== GROSS PROFIT DATA ===\n\n'
  output += 'Numbers counted from LEFT to RIGHT in Gross Profit row:\n\n'
  
  if (allNumbers.length >= 5) {
    output += '  1st: ' + allNumbers[0] + ' (Tender)\n'
    output += '  2nd: ' + allNumbers[1] + ' (1st Working)\n'
    output += '  3rd: ' + allNumbers[2] + ' (Business Plan)\n'
    output += '  4th: ' + allNumbers[3] + ' (AUDIT REPORT) ***\n'
    output += '  5th: ' + allNumbers[4] + ' (Projection)\n'
    if (allNumbers.length > 5) {
      output += '  6th+: ' + allNumbers.slice(5).join(', ') + ' (Accrual/Cash Flow)\n'
    }
  } else {
    output += '  [Not enough data extracted]\n'
  }
  
  return output
}
