// Financial Report Parser - Fixed v5
// Finds Audit Report column, then looks DOWN to find Gross Profit value

export function extractFinancialData(text: string): string {
  let output = '\n\n=== FINANCIAL DATA ===\n\n'
  
  output += 'METHOD: Find Audit Report column, look DOWN to Gross Profit row\n\n'
  
  const lines = text.split('\n')
  
  // Step 1: Find Audit Report (WIP) column position
  let auditColIndex = -1
  let auditColNumbers: string[] = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Look for Audit Report header
    if (line.toLowerCase().includes('audit report') || 
        line.toLowerCase().includes('audit report (wip)')) {
      
      // Found Audit Report - look at this and next few lines for numbers
      auditColIndex = i
      for (let j = i; j < Math.min(i + 5, lines.length); j++) {
        const numbers = lines[j].match(/(\d{1,3}(?:,\d{3}){0,})/g) || []
        // Find which number is in the Audit Report column position
        // Usually it's the same position across multiple lines
        if (numbers.length > 0) {
          auditColNumbers.push(...numbers)
        }
      }
      break
    }
  }
  
  // Step 2: Find Gross Profit row position
  let gpRowIndex = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.toLowerCase().includes('gross profit') && 
        line.toLowerCase().includes('financial') &&
        line.length < 200 &&
        !line.includes('total') &&
        !line.includes('reconciliation')) {
      gpRowIndex = i
      break
    }
  }
  
  // Step 3: Find the Gross Profit number in the Audit Report column
  let auditGpValue = '[Not found]'
  
  if (auditColIndex >= 0 && gpRowIndex >= 0) {
    // Look at the Gross Profit line for numbers
    const gpNumbers = lines[gpRowIndex].match(/(\d{1,3}(?:,\d{3}){0,})/g) || []
    
    // If Audit Report is in a header line above, find which number position it is
    // Then get that number from the GP row
    
    // Simple approach: Look for 16,385 in GP row if that's Audit
    // But for different projects, it could be different
    
    // Better: Find all large numbers in GP row and identify which is in Audit column
    // by matching position from a line with column headers
    
    // For now, use the position-based approach
    if (auditColIndex > 0) {
      // Count position of Audit Report in header line
      let headerLine = ''
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes('audit report')) {
          headerLine = lines[i]
          break
        }
      }
      
      if (headerLine) {
        const headerNumbers = headerLine.match(/(\d{1,3}(?:,\d{3}){0,})/g) || []
        const headerChars = headerLine.split('')
        
        // Find which number is closest to "Audit Report" text
        let auditNumberIndex = -1
        const auditPos = headerLine.toLowerCase().indexOf('audit')
        
        if (auditPos >= 0) {
          // Find the number closest to but before the Audit text
          let closestDist = 9999
          for (let i = 0; i < headerNumbers.length; i++) {
            const numPos = headerLine.indexOf(headerNumbers[i])
            const dist = auditPos - numPos
            if (dist > 0 && dist < closestDist) {
              closestDist = dist
              auditNumberIndex = i
            }
          }
        }
        
        // Now get that same index from GP row
        if (auditNumberIndex >= 0 && gpNumbers[auditNumberIndex]) {
          auditGpValue = gpNumbers[auditNumberIndex]
        } else if (gpNumbers.length >= 4) {
          // Fallback: 4th number
          auditGpValue = gpNumbers[3]
        }
      }
    }
  }
  
  // Output: Look for all large numbers in GP row for context
  if (gpRowIndex >= 0) {
    const gpNumbers = lines[gpRowIndex].match(/(\d{1,3}(?:,\d{3}){0,})/g) || []
    const cleanNumbers = gpNumbers.map(n => n.replace(/,/g, ''))
    const filtered = cleanNumbers.filter(n => parseInt(n) >= 1000)
    
    output += '=== GROSS PROFIT (BEFORE RECONCILIATION) ===\n'
    output += 'Item 3: Gross Profit (Item 1.0-2.0) (Financial A/C)\n\n'
    
    if (filtered.length >= 5) {
      output += '  Numbers in Gross Profit row (large values only):\n'
      output += '  ' + filtered.join(', ') + ' HK$\n000\n'
      output += '  *** AUDIT REPORT (WIP): ' + auditGpValue + ' HK$\n000 ***\n'
    } else {
      output += '  [Could not extract clear values]\n'
    }
  }
  
  return output
}

export function getGrossProfitAudit(text: string): string {
  const lines = text.split('\n')
  
  // Find Audit Report column position
  let auditColNum = ''
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    // Look for line with "Gross Profit" and "Financial"
    if (line.toLowerCase().includes('gross profit') && 
        line.toLowerCase().includes('financial')) {
      
      const numbers = line.match(/(\d{1,3}(?:,\d{3}){0,})/g) || []
      const clean = numbers.map(n => n.replace(/,/g, ''))
      
      // The Audit Report (WIP) value should be one of these
      // Look for 38,025 (Project 990) or other values
      
      // For now, return the most likely candidate
      // In the sequence, the Audit value is typically the one after Business Plan
      
      // Find numbers >= 10000 (likely significant figures)
      const significant = numbers.filter(n => {
        const val = parseInt(n.replace(/,/g, ''))
        return val >= 10000
      })
      
      if (significant.length >= 4) {
        // 4th significant number is typically Audit
        return 'Gross Profit for Audit Report (WIP): ' + significant[3] + ' HK$\n000'
      }
    }
  }
  
  return 'Gross Profit for Audit Report (WIP): Data not found'
}

export function getAllGrossProfit(text: string): string {
  let output = '\n\n=== GROSS PROFIT DATA ===\n\n'
  
  const lines = text.split('\n')
  
  // Find GP line
  for (const line of lines) {
    if (line.toLowerCase().includes('gross profit') && 
        line.toLowerCase().includes('financial')) {
      
      const numbers = line.match(/(\d{1,3}(?:,\d{3}){0,})/g) || []
      const clean = numbers.map(n => n.replace(/,/g, ''))
      const filtered = clean.filter(n => parseInt(n) >= 1000)
      
      output += 'Gross Profit row numbers: ' + filtered.join(', ') + '\n'
      output += '  (4th number = AUDIT REPORT)\n'
      
      return output
    }
  }
  
  return 'Gross Profit data not found'
}
