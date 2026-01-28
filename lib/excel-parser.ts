// Excel Financial Data Parser - Debug version
import * as XLSX from 'xlsx'

export interface ExcelFinancialData {
  project?: string
  gross_profit?: {
    before_reconciliation?: {
      tender?: string
      first_working?: string
      business_plan?: string
      audit_report_wip?: string
      projection?: string
      accrual?: string
      cash_flow?: string
    }
    after_reconciliation?: {
      tender?: string
      first_working?: string
      business_plan?: string
      projection?: string
      accrual?: string
      cash_flow?: string
    }
  }
}

function isNumeric(val: any): boolean {
  if (val === null || val === undefined || val === '') return false
  const str = String(val).replace(/[,$]/g, '').trim()
  return !isNaN(Number(str)) && str !== ''
}

export function parseExcelFinancialData(buffer: Buffer): ExcelFinancialData | null {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]
    
    console.log('=== EXCEL PARSER DEBUG ===')
    console.log('Sheet:', sheetName, 'Rows:', data.length)
    
    // Find ALL numeric rows with their content
    console.log('\n--- ALL ROWS WITH NUMERIC DATA ---')
    for (let i = 0; i < Math.min(data.length, 50); i++) {
      const row = data[i]
      if (!row) continue
      
      const rowStr = String(row).substring(0, 100)
      const hasNumeric = row.some(cell => isNumeric(cell))
      const numericCount = row.filter(cell => isNumeric(cell)).length
      
      if (hasNumeric) {
        console.log(`Row ${i}: ${numericCount} numeric values`)
        console.log(`  Content: ${rowStr}`)
        console.log(`  Values: ${row.map((c: any) => cleanNumber(c)).slice(0, 8).join(', ')}`)
      }
    }
    
    // Look for "Gross Profit" section
    console.log('\n--- SEARCHING FOR GROSS PROFIT ---')
    let gpSectionFound = false
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i]
      if (!row) continue
      
      const rowStr = String(row).toLowerCase()
      
      if (rowStr.includes('gross profit') && !rowStr.includes('after')) {
        gpSectionFound = true
        console.log(`BEFORE section at row ${i}:`)
        console.log(`  ${String(row).substring(0, 150)}`)
        
        // Show the NEXT few rows with their numeric values
        for (let j = i + 1; j <= i + 5; j++) {
          const nextRow = data[j]
          if (!nextRow) continue
          const nextRowStr = String(nextRow).substring(0, 100)
          const numericCount = nextRow.filter(cell => isNumeric(cell)).length
          console.log(`  Row ${j} (${numericCount} nums): ${nextRowStr}`)
          console.log(`    Values: ${nextRow.map((c: any) => cleanNumber(c)).slice(0, 8).join(', ')}`)
        }
      }
      
      if ((rowStr.includes('gross profit') && rowStr.includes('after')) || 
          rowStr.includes('reconciliation') && rowStr.includes('gross')) {
        console.log(`AFTER section at row ${i}:`)
        console.log(`  ${String(row).substring(0, 150)}`)
        
        for (let j = i + 1; j <= i + 5; j++) {
          const nextRow = data[j]
          if (!nextRow) continue
          const nextRowStr = String(nextRow).substring(0, 100)
          const numericCount = nextRow.filter(cell => isNumeric(cell)).length
          console.log(`  Row ${j} (${numericCount} nums): ${nextRowStr}`)
          console.log(`    Values: ${nextRow.map((c: any) => cleanNumber(c)).slice(0, 8).join(', ')}`)
        }
      }
    }
    
    if (!gpSectionFound) {
      console.log('NO Gross Profit section found!')
      console.log('Showing first 10 rows:')
      for (let i = 0; i < Math.min(10, data.length); i++) {
        const row = data[i]
        if (!row) continue
        console.log(`Row ${i}: ${String(row).substring(0, 120)}`)
      }
    }
    
    return { gross_profit: { before_reconciliation: {}, after_reconciliation: {} } }
    
  } catch (error) {
    console.error('Error parsing Excel:', error)
    return null
  }
}

function cleanNumber(val: any): string {
  if (val === null || val === undefined || val === '') return 'N/A'
  return String(val).trim()
}

export function formatExcelData(data: ExcelFinancialData, fileName: string): string {
  let output = `\n\n=== EXTRACTED DATA FROM ${fileName} ===\nSource: Excel Spreadsheet\n\n`
  
  const gp = data.gross_profit
  if (gp?.before_reconciliation) {
    const b = gp.before_reconciliation
    output += `\n=== GROSS PROFIT (BEFORE RECONCILIATION) ===\n`
    output += `  Tender (Budget): ${b.tender || 'N/A'} HK$\n`
    output += `  1st Working Budget: ${b.first_working || 'N/A'} HK$\n`
    output += `  Business Plan: ${b.business_plan || 'N/A'} HK$\n`
    output += `  *** AUDIT REPORT (WIP): ${b.audit_report_wip || 'N/A'} HK$ ***\n`
    output += `  Projection: ${b.projection || 'N/A'} HK$\n`
    output += `  Accrual: ${b.accrual || 'N/A'} HK$\n`
    output += `  Cash Flow: ${b.cash_flow || 'N/A'} HK$\n`
  }
  
  if (gp?.after_reconciliation) {
    const a = gp.after_reconciliation
    output += `\n=== GROSS PROFIT (AFTER RECONCILIATION) ===\n`
    output += `  Tender (Budget): ${a.tender || 'N/A'} HK$\n`
    output += `  1st Working Budget: ${a.first_working || 'N/A'} HK$\n`
    output += `  Business Plan: ${a.business_plan || 'N/A'} HK$\n`
    output += `  Projection: ${a.projection || 'N/A'} HK$\n`
    output += `  Accrual: ${a.accrual || 'N/A'} HK$\n`
    output += `  Cash Flow: ${a.cash_flow || 'N/A'} HK$\n`
  }
  
  return output
}
