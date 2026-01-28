// Excel Financial Data Parser - Improved
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

function isNumeric(val: any): boolean {
  if (val === null || val === undefined || val === '') return false
  return !isNaN(Number(String(val).replace(/[,$]/g, '')))
}

function cleanNumber(val: any): string {
  if (val === null || val === undefined || val === '') return 'N/A'
  const numStr = String(val).replace(/[,$]/g, '').trim()
  return isNumeric(numStr) ? numStr : 'N/A'
}

export function parseExcelFinancialData(buffer: Buffer): ExcelFinancialData | null {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    
    // Get raw data as array of arrays
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]
    
    console.log('Excel sheet has', data.length, 'rows')
    
    const result: ExcelFinancialData = {}
    
    // Find rows containing "Gross Profit"
    const grossProfitRows: { row: any[], index: number, type: string }[] = []
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i]
      if (!row) continue
      
      const rowStr = String(row).toLowerCase()
      
      if (rowStr.includes('gross profit')) {
        // Determine if it's before or after
        let type = 'before'
        if (rowStr.includes('after') || rowStr.includes('reconciliation')) {
          type = 'after'
        }
        grossProfitRows.push({ row, index: i, type })
        console.log(`Found Gross Profit row at index ${i}, type: ${type}`)
      }
    }
    
    // Process each Gross Profit section
    for (const gpRow of grossProfitRows) {
      const { row, index, type } = gpRow
      
      // Find the data row (look for numeric values in nearby rows)
      let dataRow: any[] | null = null
      
      // Search 1-3 rows below for data
      for (let offset = 1; offset <= 3; offset++) {
        const checkRow = data[index + offset]
        if (!checkRow) continue
        
        // Count numeric values in this row
        let numericCount = 0
        for (const cell of checkRow) {
          if (isNumeric(cell)) numericCount++
        }
        
        // If row has enough numeric values, it's likely the data row
        if (numericCount >= 3) {
          dataRow = checkRow
          console.log(`Data row for ${type} at index ${index + offset}, ${numericCount} numeric values`)
          break
        }
      }
      
      // Also check the row above for data (sometimes headers are below)
      if (!dataRow) {
        for (let offset = 1; offset <= 2; offset++) {
          const checkRow = data[index - offset]
          if (!checkRow) continue
          
          let numericCount = 0
          for (const cell of checkRow) {
            if (isNumeric(cell)) numericCount++
          }
          
          if (numericCount >= 3) {
            dataRow = checkRow
            console.log(`Data row (above) for ${type} at index ${index - offset}, ${numericCount} numeric values`)
            break
          }
        }
      }
      
      // If we found a data row, extract the numbers
      if (dataRow) {
        const numbers = dataRow.filter(cell => isNumeric(cell)).map(cleanNumber)
        console.log(`Extracted numbers for ${type}:`, numbers)
        
        if (numbers.length >= 4) {
          if (!result.gross_profit) result.gross_profit = { 
            before_reconciliation: {}, 
            after_reconciliation: {} 
          }
          
          if (type === 'before') {
            result.gross_profit.before_reconciliation = {
              tender: numbers[0],
              first_working: numbers[1],
              business_plan: numbers[2],
              audit_report_wip: numbers[3],
              projection: numbers[4] || 'N/A',
              accrual: numbers[5] || 'N/A',
              cash_flow: numbers[6] || 'N/A'
            }
          } else {
            result.gross_profit.after_reconciliation = {
              tender: numbers[0],
              first_working: numbers[1],
              business_plan: numbers[2],
              projection: numbers[3],
              accrual: numbers[4] || 'N/A',
              cash_flow: numbers[5] || 'N/A'
            }
          }
        }
      }
    }
    
    // Also try to extract ALL numeric rows from the sheet
    // This is a fallback in case the Gross Profit section isn't found
    if (!result.gross_profit) {
      console.log('No Gross Profit section found, searching for numeric rows...')
      
      for (let i = 0; i < Math.min(data.length, 50); i++) {
        const row = data[i]
        if (!row || row.length < 2) continue
        
        const rowStr = String(row).toLowerCase()
        
        // Look for rows that have "Gross Profit" in first column
        const firstCell = String(row[0] || '').toLowerCase()
        if (firstCell.includes('gross profit')) {
          const numbers = row.filter(cell => isNumeric(cell)).map(cleanNumber)
          console.log(`Found Gross Profit at row ${i}:`, numbers)
          
          if (numbers.length >= 4) {
            result.gross_profit = { before_reconciliation: {}, after_reconciliation: {} }
            result.gross_profit.before_reconciliation = {
              tender: numbers[0],
              first_working: numbers[1],
              business_plan: numbers[2],
              audit_report_wip: numbers[3],
              projection: numbers[4] || 'N/A',
              accrual: numbers[5] || 'N/A',
              cash_flow: numbers[6] || 'N/A'
            }
          }
          break
        }
      }
    }
    
    console.log('Final parsed result:', JSON.stringify(result, null, 2))
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
