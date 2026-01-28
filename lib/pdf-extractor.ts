// PDF Text Extraction with Table Detection
// Uses pdfjs-dist for better table extraction from complex PDFs

import * as pdfjsLib from 'pdfjs-dist'

// Set up worker for pdfjs-dist
if (typeof window !== 'undefined') {
  // For browser environment
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
} else {
  // For Node.js environment
  pdfjsLib.GlobalWorkerOptions.workerSrc = `pdfjs-dist/build/pdf.worker.mjs`
}

interface TableCandidate {
  rows: string[][]
  confidence: number
  page: number
}

interface TableRegion {
  rows: { y: number; items: any[] }[]
}

interface ExtractionResult {
  text: string
  tables: TableCandidate[]
  pageCount: number
  metadata: {
    fileName: string
    extractedAt: string
    hasImages: boolean
  }
}

/**
 * Extract text and detect tables from PDF buffer
 * Uses pdfjs-dist for better table structure extraction
 */
export async function extractTextAndTables(pdfBuffer: Buffer, fileName: string): Promise<ExtractionResult> {
  const result: ExtractionResult = {
    text: '',
    tables: [],
    pageCount: 0,
    metadata: {
      fileName,
      extractedAt: new Date().toISOString(),
      hasImages: false
    }
  }

  try {
    // Load PDF document - convert Buffer to Uint8Array for pdfjs-dist
    const uint8Array = new Uint8Array(pdfBuffer)
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array })
    const pdf = await loadingTask.promise
    result.pageCount = pdf.numPages

    let fullText = ''
    const allTables: TableCandidate[] = []

    // Process each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)

      // Extract text content
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ')
      fullText += pageText + '\n\n'

      // Extract text items with position info for table detection
      const textItems = textContent.items.map((item: any) => ({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width || 0,
        height: item.height || 0
      }))

      // Detect tables on this page
      const pageTables = detectTablesFromItems(textItems, pageNum)
      allTables.push(...pageTables)
    }

    result.text = fullText
    result.tables = allTables

    console.log(`Extracted ${result.pageCount} pages, ${result.tables.length} tables from ${fileName}`)

  } catch (error: any) {
    console.error('PDF extraction error:', error)
    result.text = `Error extracting PDF: ${error.message}`
  }

  return result
}

/**
 * Detect tables from PDF text items with position information
 * Handles complex tables with merged cells
 */
function detectTablesFromItems(textItems: any[], pageNum: number): TableCandidate[] {
  const tables: TableCandidate[] = []

  if (textItems.length === 0) return tables

  // Group text items by approximate Y position (same row)
  const rowThreshold = 5 // pixels
  const rows: { y: number; items: any[] }[] = []

  for (const item of textItems) {
    const y = Math.round(item.y / rowThreshold) * rowThreshold

    // Find or create row
    let row = rows.find(r => Math.abs(r.y - y) < rowThreshold)
    if (!row) {
      row = { y, items: [] }
      rows.push(row)
    }
    row.items.push(item)
  }

  // Sort rows by Y position (top to bottom)
  rows.sort((a, b) => b.y - a.y)

  // Detect if this looks like a table
  // Tables typically have: multiple columns, numeric data, consistent spacing
  const tableRegions = identifyTableRegions(rows)

  for (const region of tableRegions) {
    const tableRows = extractTableRows(region.rows)
    if (tableRows.length >= 2) {
      tables.push({
        rows: tableRows,
        confidence: calculateTableConfidence(tableRows),
        page: pageNum
      })
    }
  }

  return tables
}

/**
 * Identify regions that look like tables based on structure
 */
function identifyTableRegions(rows: { y: number; items: any[] }[]): TableRegion[] {
  const regions: TableRegion[] = []
  let currentRegion: { y: number; items: any[] }[] = []
  let rowCount = 0

  for (const row of rows) {
    const items = row.items.sort((a, b) => a.x - b.x)
    const hasMultipleColumns = items.length >= 2
    const hasNumbers = items.some(item => /\d/.test(item.str))
    const hasConsistentSpacing = checkColumnSpacing(items)

    const isTableRow = hasMultipleColumns && (hasNumbers || hasConsistentSpacing)

    if (isTableRow) {
      currentRegion.push(row)
      rowCount++
    } else {
      if (rowCount >= 3) {
        regions.push({ rows: [...currentRegion] })
      }
      currentRegion = []
      rowCount = 0
    }
  }

  // Don't forget last region
  if (rowCount >= 3) {
    regions.push({ rows: [...currentRegion] })
  }

  return regions
}

/**
 * Check if items have consistent column spacing
 */
function checkColumnSpacing(items: any[]): boolean {
  if (items.length < 2) return false

  const positions = items.map(item => item.x)
  const gaps: number[] = []

  for (let i = 1; i < positions.length; i++) {
    gaps.push(positions[i] - positions[i - 1])
  }

  // Check if gaps are somewhat consistent
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length
  const variance = gaps.reduce((sum, gap) => sum + Math.pow(gap - avgGap, 2), 0) / gaps.length

  return variance < avgGap * avgGap * 0.5 // Low variance = consistent spacing
}

/**
 * Extract table rows from a region
 */
function extractTableRows(regionRows: { y: number; items: any[] }[]): string[][] {
  const tableRows: string[][] = []

  for (const row of regionRows) {
    const items = row.items.sort((a: any, b: any) => a.x - b.x)
    const cells = items.map((item: any) => item.str.trim()).filter((s: string) => s)
    if (cells.length >= 2) {
      tableRows.push(cells)
    }
  }

  return tableRows
}

/**
 * Calculate confidence that detected data is actually a table
 */
function calculateTableConfidence(rows: string[][]): number {
  if (rows.length < 2) return 0

  const columnCounts = rows.map(row => row.length)
  const consistentColumns = columnCounts.every(count => count === columnCounts[0])
  const hasNumbers = rows.some(row => row.some(cell => /\d/.test(cell)))
  const hasHeaders = rows[0].some(cell => /^[A-Z]/.test(cell))

  let confidence = 0.5
  if (consistentColumns) confidence += 0.2
  if (hasNumbers) confidence += 0.15
  if (hasHeaders) confidence += 0.15

  return Math.min(confidence, 1.0)
}

/**
 * Format extracted tables for AI consumption
 */
export function formatTablesForAI(tables: TableCandidate[]): string {
  if (tables.length === 0) return 'No tables detected in documents.'

  let formatted = `=== TABLES DETECTED: ${tables.length} ===\n\n`

  tables.forEach((table, index) => {
    formatted += `--- Table ${index + 1} (Confidence: ${(table.confidence * 100).toFixed(0)}%) ---\n`

    // Convert table to markdown-style format
    table.rows.forEach(row => {
      formatted += `| ${row.join(' | ')} |\n`
    })

    formatted += '\n'
  })

  return formatted
}

/**
 * Format document text for AI
 */
export function formatTextForAI(text: string, tables: TableCandidate[]): string {
  const tableSection = tables.length > 0 ? `\n\n${formatTablesForAI(tables)}\n` : ''

  return `=== DOCUMENT CONTENT ===\n\n${text}${tableSection}`
}

/**
 * Fallback: Simple text extraction using pdf-parse
 */
export async function extractTextSimple(pdfBuffer: Buffer): Promise<string> {
  try {
    const pdfParse = require('pdf-parse')
    const data = await pdfParse(pdfBuffer)
    return data.text
  } catch (error) {
    console.error('Simple extraction error:', error)
    return ''
  }
}

/**
 * Special handler for Financial Status tables with merged headers
 * Creates clear column mappings for accurate LLM interpretation
 */
export function formatFinancialTableForAI(tables: TableCandidate[]): string {
  if (tables.length === 0) return ''

  let formatted = '\n\n=== FINANCIAL STATUS TABLE ===\n\n'

  // Define the column mapping for Financial Status table
  // Based on the structure: Budget spans cols 2-5, then separate columns for each category
  const columnLabels = [
    'Item Code',
    'Description',
    'Tender (Budget)',
    '1st Working (Budget)',
    'Adjustment Cost (Budget)',
    'Revision (Budget)',
    'Business Plan',
    'Audit Report (WIP)',
    'Adj Cost Variation',
    'Projection',
    'Committed Value',
    'E1=% (Adj Cost)',
    'F=Variance',
    'Accrual',
    'Cash Flow',
    'G1=% (Accrual)',
    'H=Variance'
  ]

  for (const table of tables) {
    // Check if this looks like a financial table
    const hasFinancialKeywords = table.rows.some(row =>
      row.some(cell => cell && (
        /Gross Profit/i.test(cell) ||
        /Total Income/i.test(cell) ||
        /Total Cost/i.test(cell) ||
        /Acc\. Net Profit/i.test(cell) ||
        /HK\$/.test(cell) ||
        /Financial Status/i.test(cell)
      ))
    )

    if (!hasFinancialKeywords) continue

    formatted += 'Column Mapping:\n'
    columnLabels.forEach((label, idx) => {
      formatted += `  Col ${idx}: ${label}\n`
    })
    formatted += '\n'

    formatted += 'Key Rows:\n'
    // Extract key financial rows
    const keyRows = table.rows.filter(row =>
      row.some(cell => cell && (
        /Gross Profit/i.test(cell) ||
        /Total Income/i.test(cell) ||
        /Total Cost/i.test(cell) ||
        /Acc\. Net Profit/i.test(cell)
      ))
    )

    for (const row of keyRows) {
      // Find the description
      const desc = row[1] || row[0] || ''
      formatted += `\n${desc}:\n`

      // Print key columns with labels
      const keyColumns = [
        { idx: 2, label: 'Tender' },
        { idx: 3, label: '1st Working' },
        { idx: 6, label: 'Business Plan' },
        { idx: 7, label: 'Audit Report' },
        { idx: 9, label: 'Projection' },
        { idx: 13, label: 'Accrual' },
        { idx: 14, label: 'Cash Flow' }
      ]

      for (const col of keyColumns) {
        const val = row[col.idx] || ''
        if (val) {
          formatted += `  ${col.label}: ${val}\n`
        }
      }
    }

    formatted += '\n'
  }

  return formatted
}
