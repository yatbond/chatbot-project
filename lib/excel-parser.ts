// Excel Financial Data Parser
import * as XLSX from 'xlsx'

export interface ExcelFinancialData {
  project?: string
  report_date?: string
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

function extractNumbers(row: any[]): string[] {
  return row
    .filter((c: any) => c !== undefined && c !== null && c !== '')
    .map((c: any) => String(c).trim())
    .filter((c: string) => /\d/.test(c))
}

function isRowHeader(row: any[], keywords: string[]): boolean {
  const rowStr = String(row).toLowerCase()
  return keywords.some(k => rowStr.includes(k.toLowerCase()))
}

export function parseExcelFinancialData(buffer: Buffer): ExcelFinancialData | null {
  try {
    console.log('Parsing Excel buffer, size:', buffer.length)
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    console.log('Sheet names:', workbook.SheetNames)
    
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]
    
    console.log('Total rows:', data.length)
    
    const result: ExcelFinancialData = {}
    
    // Find all numeric rows and their row numbers
    const numericRows: { row: any[], index: number, numbers: string[] }[] = []
    for (let i = 0; i < data.length; i++) {
      const row = data[i]
      if (!row || row.length === 0) continue
      const numbers = extractNumbers(row)
      if (numbers.length >= 3) {
        numericRows.push({ row, index: i, numbers })
        console.log(`Row ${i}:`, row.slice(0, 8), '-> numbers:', numbers.slice(0, 7))
      }
    }
    
    // Look for "Gross Profit" section headers
    let beforeStart = -1
    let afterStart = -1
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i]
      if (!row) continue
      const rowStr = String(row).toLowerCase()
      
      if (rowStr.includes('gross profit') && !rowStr.includes('after')) {
        beforeStart = i
        console.log('Found BEFORE section at row', i)
      }
      if (rowStr.includes('gross profit') && (rowStr.includes('after') || rowStr.includes('reconciliation'))) {
        afterStart = i
        console.log('Found AFTER section at row', i)
      }
    }
    
    // Parse BEFORE section
    if (beforeStart >= 0) {
      result.gross_profit = { before_reconciliation: {}, after_reconciliation: {} }
      
      // Find the data row (usually 1-2 rows after header)
      for (let i = beforeStart + 1; i < Math.min(beforeStart + 5, data.length); i++) {
        const row = data[i]
        if (!row) continue
        const rowStr = String(row).toLowerCase()
        
        // Skip if this is another header row
        if (rowStr.includes('tender') || rowStr.includes('budget') || rowStr.includes('hkd')) continue
        
        const numbers = extractNumbers(row)
        console.log('BEFORE data row', i, ':', numbers)
        
        if (numbers.length >= 4) {
          result.gross_profit!.before_reconciliation!.tender = numbers[0]
          result.gross_profit!.before_reconciliation!.first_working = numbers[1]
          result.gross_profit!.before_reconciliation!.business_plan = numbers[2]
          result.gross_profit!.before_reconciliation!.audit_report_wip = numbers[3]
          result.gross_profit!.before_reconciliation!.projection = numbers[4] || 'N/A'
          if (numbers.length >= 7) {
            result.gross_profit!.before_reconciliation!.accrual = numbers[5]
            result.gross_profit!.before_reconciliation!.cash_flow = numbers[6]
          }
          break
        }
      }
    }
    
    // Parse AFTER section
    if (afterStart >= 0) {
      for (let i = afterStart + 1; i < Math.min(afterStart + 5, data.length); i++) {
        const row = data[i]
        if (!row) continue
        const rowStr = String(row).toLowerCase()
        
        if (rowStr.includes('tender') || rowStr.includes('budget') || rowStr.includes('hkd')) continue
        
        const numbers = extractNumbers(row)
        console.log('AFTER data row', i, ':', numbers)
        
        if (numbers.length >= 4) {
          if (!result.gross_profit) result.gross_profit = { before_reconciliation: {}, after_reconciliation: {} }
          result.gross_profit!.after_reconciliation!.tender = numbers[0]
          result.gross_profit!.after_reconciliation!.first_working = numbers[1]
          result.gross_profit!.after_reconciliation!.business_plan = numbers[2]
          result.gross_profit!.after_reconciliation!.projection = numbers[3]
          if (numbers.length >= 6) {
            result.gross_profit!.after_reconciliation!.accrual = numbers[4]
            result.gross_profit!.after_reconciliation!.cash_flow = numbers[5]
          }
          break
        }
      }
    }
    
    console.log('Parsed result:', JSON.stringify(result, null, 2))
    return result
    
  } catch (error) {
    console.error('Error parsing Excel:', error)
    return null
  }
}

export function formatExcelData(data: ExcelFinancialData, fileName: string): string {
  let output = `\n\n=== EXTRACTED DATA FROM ${fileName} ===\n`
  output += `Source: Excel Spreadsheet\n\n`
  
  if (data.project) output += `Project: ${data.project}\n`
  
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
