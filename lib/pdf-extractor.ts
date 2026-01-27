// PDF Text Extraction with Table Detection
// Uses pdf-parse for text extraction and pattern recognition for tables

const fs = require('fs')
const path = require('path')

// Try to import pdf-parse, fallback to simple extraction
let pdfParse: ((dataBuffer: Buffer) => Promise<any>) | null = null
try {
  pdfParse = require('pdf-parse')
} catch (e) {
  console.log('pdf-parse not installed, using basic extraction')
}

interface TableCandidate {
  rows: string[][]
  confidence: number
  page: number
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

  if (!pdfParse) {
    // Fallback: Basic text extraction
    result.text = '[PDF text extraction requires pdf-parse package. Install with: npm install pdf-parse]'
    return result
  }

  try {
    const data = await pdfParse(pdfBuffer)
    
    result.text = data.text
    result.pageCount = data.numpages
    
    // Detect tables from the extracted text
    result.tables = detectTables(data.text)
    
    // Check for images (basic detection)
    result.metadata.hasImages = detectImages(data.text)
    
    console.log(`Extracted ${result.pageCount} pages, ${result.tables.length} tables from ${fileName}`)
    
  } catch (error: any) {
    console.error('PDF extraction error:', error)
    result.text = `Error extracting PDF: ${error.message}`
  }

  return result
}

/**
 * Detect table-like structures in text
 */
function detectTables(text: string): TableCandidate[] {
  const tables: TableCandidate[] = []
  
  // Split text into lines
  const lines = text.split('\n')
  
  let currentTable: string[][] = []
  let tableStart = -1
  let emptyLineCount = 0
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    
    // Detect table row patterns
    // Tables often have: pipes |, tabs, or consistent spacing with numbers
    const hasPipe = line.includes('|')
    const hasMultipleTabs = (line.match(/\t/g) || []).length >= 2
    const hasConsistentSpacing = detectConsistentSpacing(line)
    const hasNumbers = /\d/.test(line)
    
    const isTableRow = hasPipe || hasMultipleTabs || (hasConsistentSpacing && hasNumbers)
    
    if (isTableRow && line.length > 5) {
      // This looks like a table row
      const cells = splitTableRow(line)
      
      if (cells.length >= 2) {
        if (tableStart === -1) {
          tableStart = i
          currentTable = []
        }
        currentTable.push(cells)
        emptyLineCount = 0
      }
    } else if (line === '' || line.match(/^[\s-]{10,}$/)) {
      // Empty line or separator
      if (currentTable.length > 2) {
        // This is likely a table
        tables.push({
          rows: currentTable,
          confidence: calculateTableConfidence(currentTable),
          page: 1 // Would need page tracking for accuracy
        })
      }
      currentTable = []
      tableStart = -1
      emptyLineCount++
    }
    
    // Skip too many empty lines
    if (emptyLineCount > 5) break
  }
  
  // Don't forget the last table
  if (currentTable.length > 2) {
    tables.push({
      rows: currentTable,
      confidence: calculateTableConfidence(currentTable),
      page: 1
    })
  }
  
  return tables
}

/**
 * Split a table row into cells
 */
function splitTableRow(row: string): string[] {
  if (row.includes('|')) {
    return row.split('|').map(cell => cell.trim()).filter(cell => cell)
  }
  
  if ((row.match(/\t/g) || []).length >= 2) {
    return row.split('\t').map(cell => cell.trim()).filter(cell => cell)
  }
  
  // Try to detect CSV-like patterns
  const commaCount = (row.match(/,/g) || []).length
  if (commaCount >= 2) {
    return row.split(',').map(cell => cell.trim()).filter(cell => cell)
  }
  
  return [row]
}

/**
 * Detect if a line has consistent spacing (potential table column alignment)
 */
function detectConsistentSpacing(line: string): boolean {
  const words = line.split(/\s+/)
  if (words.length < 3) return false
  
  // Check if most words are followed by similar number of spaces
  const spacing = words.slice(0, -1).map(word => line.indexOf(word) + word.length)
  const spacingDiffs = spacing.map((pos, i) => Math.abs(pos - (i * 10)))
  
  return spacingDiffs.every(diff => diff < 3)
}

/**
 * Calculate confidence that a detected table is actually a table
 */
function calculateTableConfidence(rows: string[][]): number {
  if (rows.length < 3) return 0
  
  const columnCounts = rows.map(row => row.length)
  const consistentColumns = columnCounts.every(count => count === columnCounts[0])
  const hasNumbers = rows.some(row => row.some(cell => /\d/.test(cell)))
  
  let confidence = 0.5
  if (consistentColumns) confidence += 0.2
  if (hasNumbers) confidence += 0.2
  if (rows.length >= 5) confidence += 0.1
  
  return Math.min(confidence, 1.0)
}

/**
 * Basic image detection in PDF text
 */
function detectImages(text: string): boolean {
  const imageIndicators = [
    /image/i,
    /figure/i,
    /picture/i,
    /photo/i,
    /graphics/i
  ]
  
  return imageIndicators.some(pattern => pattern.test(text))
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

export { detectTables }
