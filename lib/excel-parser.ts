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

export function parseExcelFinancialData(buffer: Buffer): ExcelFinancialData | null {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]
    
    const result: ExcelFinancialData = {}
    
    // Simple parsing - find rows with "Gross Profit"
    for (let i = 0; i < data.length; i++) {
      const row = data[i]
      if (!row) continue
      
      const rowStr = String(row).toLowerCase()
      
      if (rowStr.includes('gross profit') && (rowStr.includes('before') || rowStr.includes('item 3'))) {
        result.gross_profit = { before_reconciliation: {}, after_reconciliation: {} }
        
        // Look for audit report in this row
        const numbers = row.filter((c: any) => c && typeof c === 'string' && /\d/.test(c))
        if (numbers.length >= 4) {
          result.gross_profit!.before_reconciliation!.tender = String(numbers[0])
          result.gross_profit!.before_reconciliation!.first_working = String(numbers[1])
          result.gross_profit!.before_reconciliation!.business_plan = String(numbers[2])
          result.gross_profit!.before_reconciliation!.audit_report_wip = String(numbers[3])
          result.gross_profit!.before_reconciliation!.projection = String(numbers[4])
          if (numbers.length >= 7) {
            result.gross_profit!.before_reconciliation!.accrual = String(numbers[5])
            result.gross_profit!.before_reconciliation!.cash_flow = String(numbers[6])
          }
        }
      }
      
      if (rowStr.includes('gross profit') && (rowStr.includes('after') || rowStr.includes('reconciliation') || rowStr.includes('item 5'))) {
        const numbers = row.filter((c: any) => c && typeof c === 'string' && /\d/.test(c))
        if (numbers.length >= 4) {
          if (!result.gross_profit) result.gross_profit = { before_reconciliation: {}, after_reconciliation: {} }
          result.gross_profit!.after_reconciliation!.tender = String(numbers[0])
          result.gross_profit!.after_reconciliation!.first_working = String(numbers[1])
          result.gross_profit!.after_reconciliation!.business_plan = String(numbers[2])
          result.gross_profit!.after_reconciliation!.projection = String(numbers[3])
          if (numbers.length >= 6) {
            result.gross_profit!.after_reconciliation!.accrual = String(numbers[4])
            result.gross_profit!.after_reconciliation!.cash_flow = String(numbers[5])
          }
        }
      }
    }
    
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
