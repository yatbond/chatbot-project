// General Financial Report Parser
// Applies correct column mapping to all financial reports in the same format

export interface FinancialTableRow {
  itemCode: string
  description: string
  tender: string
  firstWorking: string
  adjCost: string
  revision: string
  businessPlan: string
  auditReport: string
  adjCostVariation: string
  projection: string
  committedValue: string
  accrual: string
  cashFlow: string
}

export function parseFinancialTable(text: string): FinancialTableRow[] {
  const rows: FinancialTableRow[] = []
  const lines = text.split('\n')
  
  for (const line of lines) {
    // Look for lines with financial data patterns
    // Pattern: description followed by multiple HK$ values
    if (/\d/.test(line) && !line.includes('Page') && !line.includes('Date')) {
      
      // Split by common delimiters (spaces that look like column separators)
      // In extracted text, numbers tend to cluster together
      const parts = line.trim().split(/\s{2,}/).filter(p => p.trim())
      
      if (parts.length >= 2) {
        // First part is usually description, rest are values
        const description = parts[0]
        
        // Extract all numbers from the line
        const numbers = line.match(/[\d,]+\.?\d*/g) || []
        
        // Clean numbers (remove commas)
        const cleanNumbers = numbers.map(n => n.replace(/,/g, ''))
        
        // Map based on expected position in financial reports
        // Col 2 = Tender, Col 3 = 1st Working, Col 6 = Business Plan
        // Col 7 = Audit Report, Col 9 = Projection, Col 13 = Accrual, Col 14 = Cash Flow
        const row: FinancialTableRow = {
          itemCode: '',
          description: description,
          tender: cleanNumbers[0] || '',
          firstWorking: cleanNumbers[1] || '',
          adjCost: cleanNumbers[2] || '',
          revision: cleanNumbers[3] || '',
          businessPlan: cleanNumbers[4] || '',
          auditReport: cleanNumbers[5] || '',
          adjCostVariation: cleanNumbers[6] || '',
          projection: cleanNumbers[7] || '',
          committedValue: cleanNumbers[8] || '',
          accrual: cleanNumbers[9] || '',
          cashFlow: cleanNumbers[10] || ''
        }
        
        rows.push(row)
      }
    }
  }
  
  return rows
}

export function formatFinancialData(text: string): string {
  const rows = parseFinancialTable(text)
  
  if (rows.length === 0) {
    return text // Return original if no table detected
  }
  
  let output = '\n\n=== FINANCIAL DATA EXTRACTION ===\n\n'
  
  output += 'COLUMN MAPPING (All Financial Reports):\n'
  output += '  Col 2: Tender (Budget)\n'
  output += '  Col 3: 1st Working (Budget)\n'
  output += '  Col 4: Adjustment Cost (Budget)\n'
  output += '  Col 5: Revision (Budget)\n'
  output += '  Col 6: Business Plan\n'
  output += '  Col 7: AUDIT REPORT (WIP) <-- For audit questions\n'
  output += '  Col 8: Adj Cost Variation\n'
  output += '  Col 9: Projection\n'
  output += '  Col 10: Committed Value\n'
  output += '  Col 13: Accrual\n'
  output += '  Col 14: Cash Flow\n\n'
  
  // Find key financial rows
  const keyRows = rows.filter(r => {
    const desc = r.description.toLowerCase()
    return desc.includes('gross profit') || 
           desc.includes('total income') || 
           desc.includes('total cost') ||
           desc.includes('net profit')
  })
  
  if (keyRows.length > 0) {
    output += 'KEY FINANCIAL FIGURES:\n\n'
    
    for (const row of keyRows) {
      output += `${row.description}:\n`
      output += `  Tender: ${row.tender}\n`
      output += `  1st Working: ${row.firstWorking}\n`
      output += `  Business Plan: ${row.businessPlan}\n`
      output += `  *** AUDIT REPORT (WIP): ${row.auditReport} ***\n`
      output += `  Projection: ${row.projection}\n`
      output += `  Accrual: ${row.accrual}\n`
      output += `  Cash Flow: ${row.cashFlow}\n\n`
    }
  }
  
  return output
}

export function getGrossProfitAudit(text: string): string {
  const rows = parseFinancialTable(text)
  
  const gpRow = rows.find(r => {
    const desc = r.description.toLowerCase()
    return desc.includes('gross profit') && desc.includes('financial')
  })
  
  if (gpRow) {
    return `Gross Profit for Audit Report (WIP): ${gpRow.auditReport} HK$'000`
  }
  
  // Try alternate pattern
  const altRows = rows.filter(r => {
    const desc = r.description.toLowerCase()
    return desc.includes('gross profit') && desc.length < 50
  })
  
  if (altRows.length > 0) {
    return `Gross Profit for Audit Report (WIP): ${altRows[0].auditReport} HK$'000`
  }
  
  return 'Gross Profit for Audit Report (WIP): Data not found in document'
}

export function getAllGrossProfit(text: string): string {
  const rows = parseFinancialTable(text)
  
  const gpRows = rows.filter(r => {
    const desc = r.description.toLowerCase()
    return desc.includes('gross profit')
  })
  
  if (gpRows.length === 0) {
    return 'Gross Profit data not found'
  }
  
  let output = '\n\n=== GROSS PROFIT DATA ===\n\n'
  
  for (const row of gpRows) {
    output += `${row.description}:\n`
    output += `  Tender: ${row.tender} HK$'000\n`
    output += `  1st Working: ${row.firstWorking} HK$'000\n`
    output += `  Business Plan: ${row.businessPlan} HK$'000\n`
    output += `  AUDIT REPORT (WIP): ${row.auditReport} HK$'000\n`
    output += `  Projection: ${row.projection} HK$'000\n`
    output += `  Accrual: ${row.accrual} HK$'000\n`
    output += `  Cash Flow: ${row.cashFlow} HK$'000\n\n`
  }
  
  return output
}
