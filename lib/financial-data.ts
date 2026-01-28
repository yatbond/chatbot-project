// Financial Report Knowledge Base
// Pre-processed structured data for accurate querying

export interface FinancialItem {
  description: string
  tender: string
  firstWorking: string
  businessPlan: string
  auditReport: string
  projection: string
  accrual: string
  cashFlow: string
}

export const takTakFinancialReport: FinancialItem[] = [
  {
    description: 'Gross Profit (Item 1.0-2.0) (Financial A/C)',
    tender: '12,606',
    firstWorking: '13,307',
    businessPlan: '16,385',
    auditReport: '16,385',
    projection: '16,385',
    accrual: '22,083',
    cashFlow: '25,755'
  },
  {
    description: 'Total Income',
    tender: '283,769',
    firstWorking: '286,247',
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
    businessPlan: '4,720',
    auditReport: '5,322',
    projection: '12,643',
    accrual: '18,336',
    cashFlow: '22,062'
  }
]

export function getGrossProfitAuditReport(): string {
  const gp = takTakFinancialReport.find(item => 
    item.description.includes('Gross Profit') && 
    item.description.includes('Financial A/C')
  )
  
  if (gp) {
    return `Gross Profit for Audit Report (WIP): ${gp.auditReport} HK$'000`
  }
  return 'Data not found'
}

export function formatForAI(): string {
  let output = '=== FINANCIAL REPORT DATA ===\n\n'
  output += 'Column Mapping:\n'
  output += '  Col 2: Tender (Budget)\n'
  output += '  Col 3: 1st Working (Budget)\n'
  output += '  Col 6: Business Plan\n'
  output += '  Col 7: Audit Report (WIP)  <-- IMPORTANT: This is the Audit figure\n'
  output += '  Col 9: Projection\n'
  output += '  Col 13: Accrual\n'
  output += '  Col 14: Cash Flow\n\n'
  
  output += 'Key Financial Figures:\n\n'
  
  for (const item of takTakFinancialReport) {
    output += `${item.description}:\n`
    output += `  Tender: ${item.tender}\n`
    output += `  1st Working: ${item.firstWorking}\n`
    output += `  Business Plan: ${item.businessPlan}\n`
    output += `  Audit Report (WIP): ${item.auditReport}\n`
    output += `  Projection: ${item.projection}\n`
    output += `  Accrual: ${item.accrual}\n`
    output += `  Cash Flow: ${item.cashFlow}\n\n`
  }
  
  return output
}
