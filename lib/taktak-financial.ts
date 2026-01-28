// Financial Report Knowledge Base - Tak Tak Financial Report
// Corrected column mappings based on pdfplumber analysis

export interface FinancialRow {
  description: string
  tender: string      // Col 2
  firstWorking: string // Col 3
  adjCostVariation: string // Col 4-5
  businessPlan: string // Col 6
  auditReport: string // Col 7
  projection: string // Col 9
  accrual: string // Col 13
  cashFlow: string // Col 14
}

export const takTakReportData: FinancialRow[] = [
  {
    description: 'Gross Profit (Item 1.0-2.0) (Financial A/C)',
    tender: '12,606',
    firstWorking: '13,307',
    adjCostVariation: '0',
    businessPlan: '16,385',
    auditReport: '16,385',  // <-- THIS IS THE AUDIT REPORT WIP VALUE
    projection: '16,385',
    accrual: '22,083',
    cashFlow: '25,755'
  },
  {
    description: 'Total Income',
    tender: '283,769',
    firstWorking: '286,247',
    adjCostVariation: '0',
    businessPlan: '286,247',
    auditReport: '386,094',
    projection: '386,094',
    accrual: '386,096',
    cashFlow: '384,276'
  },
  {
    description: 'Total Cost',
    tender: '271,163',
    firstWorking: '272,940',
    adjCostVariation: '0',
    businessPlan: '272,940',
    auditReport: '369,710',
    projection: '369,710',
    accrual: '364,013',
    cashFlow: '358,521'
  },
  {
    description: 'Acc. Net Profit/(Loss)',
    tender: '4,093',
    firstWorking: '4,720',
    adjCostVariation: '0',
    businessPlan: '4,720',
    auditReport: '5,322',
    projection: '12,643',
    accrual: '18,336',
    cashFlow: '22,062'
  }
]

export function getFormattedData(): string {
  let output = '=== TAK TAK FINANCIAL REPORT - CORRECTED DATA ===\n\n'
  
  output += 'IMPORTANT COLUMN MAPPING:\n'
  output += '  Col 2: Tender (Budget)\n'
  output += '  Col 3: 1st Working (Budget)\n'
  output += '  Col 4-5: Adjustment Cost Variation (Budget)\n'
  output += '  Col 6: Business Plan\n'
  output += '  Col 7: AUDIT REPORT (WIP) <-- This is what you asked for!\n'
  output += '  Col 9: Projection\n'
  output += '  Col 13: Accrual\n'
  output += '  Col 14: Cash Flow\n\n'
  
  output += '====================================================\n'
  output += 'GROSS PROFIT (ITEM 1.0-2.0) - BEFORE RECONCILIATION\n'
  output += '====================================================\n'
  
  const gp = takTakReportData.find(r => r.description.includes('Gross Profit') && r.description.includes('Financial A/C'))
  if (gp) {
    output += `  Tender (Budget): ${gp.tender} HK$'000\n`
    output += `  1st Working (Budget): ${gp.firstWorking} HK$'000\n`
    output += `  Business Plan: ${gp.businessPlan} HK$'000\n`
    output += `  *** Audit Report (WIP): ${gp.auditReport} HK$'000 ***\n`
    output += `  Projection: ${gp.projection} HK$'000\n`
    output += `  Accrual: ${gp.accrual} HK$'000\n`
    output += `  Cash Flow: ${gp.cashFlow} HK$'000\n`
  }
  
  output += '\n'
  output += '====================================================\n'
  output += 'OTHER KEY FIGURES\n'
  output += '====================================================\n'
  
  for (const row of takTakReportData) {
    if (!row.description.includes('Gross Profit') || !row.description.includes('Financial A/C')) {
      output += `\n${row.description}:\n`
      output += `  Tender: ${row.tender}\n`
      output += `  1st Working: ${row.firstWorking}\n`
      output += `  Business Plan: ${row.businessPlan}\n`
      output += `  Audit Report: ${row.auditReport}\n`
      output += `  Projection: ${row.projection}\n`
      output += `  Accrual: ${row.accrual}\n`
      output += `  Cash Flow: ${row.cashFlow}\n`
    }
  }
  
  return output
}

export function getGrossProfitAuditReport(): string {
  const gp = takTakReportData.find(r => 
    r.description.includes('Gross Profit') && r.description.includes('Financial A/C')
  )
  if (gp) {
    return `Gross Profit for Audit Report (WIP): ${gp.auditReport} HK$'000`
  }
  return 'Data not available'
}
