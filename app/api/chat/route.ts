import { NextRequest, NextResponse } from 'next/server'
import { listKnowledgeBaseFiles, testConnection, downloadFile } from '@/lib/google-drive'
import { getMiniMaxResponse } from '@/lib/minimax'
import { extractFinancialData, getAllGrossProfit, getGrossProfitAudit } from '@/lib/financial-parser'

// In-memory storage for session state (for demo - use Redis in production)
const sessionState = new Map<string, { selectedReportIndex: number | null }>()

function getSession(sessionId: string) {
  if (!sessionState.has(sessionId)) {
    sessionState.set(sessionId, { selectedReportIndex: null })
  }
  return sessionState.get(sessionId)!
}

// Try to import pdf-parse
let pdfParse: any = null
try {
  pdfParse = require('pdf-parse')
} catch (e) {
  console.log('pdf-parse not installed')
}

interface TableCandidate {
  rows: string[][]
  confidence: number
}

interface JsonData {
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

async function extractTextFromFile(buffer: Buffer, mimeType: string, fileName: string) {
  if (mimeType === 'application/pdf' && pdfParse) {
    try {
      const data = await pdfParse(buffer)
      return {
        text: data.text,
        tables: detectTables(data.text),
        pageCount: data.numpages
      }
    } catch (error: any) {
      return { text: `[Error reading PDF: ${error.message}]`, tables: [], pageCount: 0 }
    }
  }
  
  // For other file types, return basic info
  return {
    text: `[File: ${fileName}]`,
    tables: [],
    pageCount: 1
  }
}

function detectTables(text: string): TableCandidate[] {
  const tables: TableCandidate[] = []
  const lines = text.split('\n')
  let currentTable: string[][] = []

  for (const line of lines) {
    const trimmed = line.trim()
    const hasPipe = trimmed.includes('|')
    const hasTabs = (trimmed.match(/\t/g) || []).length >= 2

    if ((hasPipe || hasTabs) && trimmed.length > 5) {
      const cells = hasPipe 
        ? trimmed.split('|').map(c => c.trim()).filter(Boolean)
        : trimmed.split('\t').map(c => c.trim()).filter(Boolean)
      
      if (cells.length >= 2) {
        currentTable.push(cells)
      }
    } else if (trimmed === '' && currentTable.length > 3) {
      tables.push({ rows: [...currentTable], confidence: 0.7 })
      currentTable = []
    }
  }

  if (currentTable.length > 3) {
    tables.push({ rows: [...currentTable], confidence: 0.7 })
  }

  return tables
}

function formatDocument(text: string, tables: TableCandidate[], fileName: string): string {
  let tableSection = ''
  
  if (tables.length > 0) {
    tableSection = `\n\n[TABLES IN ${fileName}]\n`
    tables.forEach((table, i) => {
      tableSection += `\n--- Table ${i + 1} ---\n`
      table.rows.forEach(row => {
        tableSection += `| ${row.join(' | ')} |\n`
      })
    })
  }
  
  return `[FILE: ${fileName}]\n${text}${tableSection}`
}

function formatJsonData(jsonData: JsonData, fileName: string): string {
  let output = `\n\n=== EXTRACTED DATA FROM ${fileName} ===\n`
  output += `Source: Pre-processed JSON file\n\n`
  
  if (jsonData.project) {
    output += `Project: ${jsonData.project}\n`
  }
  if (jsonData.report_date) {
    output += `Report Date: ${jsonData.report_date}\n`
  }
  
  const gp = jsonData.gross_profit
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

function isJsonFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('_data.json')
}

function getCorrespondingJsonName(pdfName: string): string {
  return pdfName.replace('.pdf', '_data.json')
}

export async function POST(request: NextRequest) {
  try {
    const { question, sessionId, selectedReportIndex } = await request.json()

    if (!question || question.trim().length === 0) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 })
    }

    const folderId = process.env.KNOWLEDGE_BASE_FOLDER_ID
    if (!folderId) {
      return NextResponse.json({ answer: 'Please configure Google Drive folder ID.' })
    }

    // Test connection
    const connectionTest = await testConnection()
    if (!connectionTest.connected) {
      return NextResponse.json({ answer: `❌ Google Drive error: ${connectionTest.error}` })
    }

    // Get all files
    const files = await listKnowledgeBaseFiles(folderId)
    if (!files || files.length === 0) {
      return NextResponse.json({
        answer: '✅ Connected! No documents found.',
        files: []
      })
    }

    // Separate JSON files from PDFs
    const jsonFiles = files.filter((f: any) => isJsonFile(f.name))
    const pdfFiles = files.filter((f: any) => !isJsonFile(f.name))

    // Create a map of JSON files for quick lookup
    const jsonMap = new Map<string, any>()
    jsonFiles.forEach((f: any) => {
      jsonMap.set(f.name.toLowerCase(), f)
    })

    // Handle special commands
    const lowerQuestion = question.toLowerCase().trim()
    
    // === LIST REPORTS COMMAND ===
    if (lowerQuestion === 'hi' || lowerQuestion === 'hello' || lowerQuestion === 'list' || lowerQuestion === 'list reports' || lowerQuestion === 'show reports') {
      // Show both PDFs and JSON files
      const allDisplayFiles = [...pdfFiles, ...jsonFiles]
      const reportList = allDisplayFiles.map((file: any, index: number) => {
        const icon = file.mimeType?.includes('pdf') ? '📄' : '📁'
        const date = file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : ''
        return `${index + 1}. ${icon} **${file.name}** ${date}`
      }).join('\n')

      return NextResponse.json({
        answer: `👋 **Hello! Here are your financial reports:**\n\n${reportList}\n\n📝 **Enter the number (1-${allDisplayFiles.length})** of the report you want to analyze.`,
        files: allDisplayFiles.map((f: any, i: number) => ({ id: f.id, name: f.name, index: i + 1 })),
        selectedReportIndex: null,
        showList: true
      })
    }

    // === SELECT REPORT COMMAND ===
    if (selectedReportIndex !== undefined && selectedReportIndex !== null) {
      const allFiles = [...pdfFiles, ...jsonFiles]
      const index = selectedReportIndex - 1
      
      if (index >= 0 && index < allFiles.length) {
        const file = allFiles[index]
        const fileName = file.name || 'unknown'
        
        // Check if this is a JSON file
        if (isJsonFile(fileName)) {
          // Use pre-processed JSON data
          if (!file.id) {
            return NextResponse.json({ error: 'File ID is missing' }, { status: 400 })
          }
          const fileContent = await downloadFile(file.id, 'application/json')
          let context = ''
          
          if (fileContent) {
            try {
              const jsonData = JSON.parse(fileContent.toString())
              context = formatJsonData(jsonData, fileName)
            } catch (e) {
              context = `[Error parsing JSON: ${e}]`
            }
          }

          const answer = await getMiniMaxResponse(
            `Focus ONLY on this report (${fileName}). ${question}`,
            context
          )

          return NextResponse.json({
            answer,
            files: allFiles.map((f: any, i: number) => ({ id: f.id, name: f.name, index: i + 1 })),
            selectedReportIndex: selectedReportIndex,
            selectedFileName: fileName,
            showList: false
          })
        } else {
          // This is a PDF - check if JSON version exists
          const jsonName = getCorrespondingJsonName(fileName)
          const jsonFile = jsonMap.get(jsonName.toLowerCase())
          
          if (jsonFile) {
            // Use JSON version instead
            if (!jsonFile.id) {
              return NextResponse.json({ error: 'JSON File ID is missing' }, { status: 400 })
            }
            const fileContent = await downloadFile(jsonFile.id, 'application/json')
            let context = ''
            
            if (fileContent) {
              try {
                const jsonData = JSON.parse(fileContent.toString())
                context = formatJsonData(jsonData, jsonFile.name)
              } catch (e) {
                context = `[Error parsing JSON: ${e}]`
              }
            }

            const answer = await getMiniMaxResponse(
              `Focus ONLY on this report (${fileName}). ${question}`,
              context
            )

            return NextResponse.json({
              answer,
              files: allFiles.map((f: any, i: number) => ({ id: f.id, name: f.name, index: i + 1 })),
              selectedReportIndex: selectedReportIndex,
              selectedFileName: fileName,
              showList: false
            })
          } else {
            // No JSON version - fall back to PDF parsing
            if (!file.id) {
              return NextResponse.json({ error: 'File ID is missing' }, { status: 400 })
            }
            const mimeType = file.mimeType || 'application/octet-stream'
            const fileContent = await downloadFile(file.id, mimeType)
            let context = ''

            if (fileContent) {
              const extracted = await extractTextFromFile(fileContent, mimeType, fileName)
              context = formatDocument(extracted.text, extracted.tables, fileName)
              
              // Add structured data for all financial reports
              const financialData = extractFinancialData(extracted.text)
              context += financialData
            }

            const answer = await getMiniMaxResponse(
              `Focus ONLY on this report (${fileName}). ${question}`,
              context
            )

            return NextResponse.json({
              answer,
              files: allFiles.map((f: any, i: number) => ({ id: f.id, name: f.name, index: i + 1 })),
              selectedReportIndex: selectedReportIndex,
              selectedFileName: fileName,
              showList: false
            })
          }
        }
      }
    }

    // === DEFAULT: Ask about currently selected report or all files ===
    let context = ''
    let selectedFile = null

    if (selectedReportIndex !== null && selectedReportIndex !== undefined) {
      const allFiles = [...pdfFiles, ...jsonFiles]
      const index = selectedReportIndex - 1
      
      if (index >= 0 && index < allFiles.length) {
        selectedFile = allFiles[index]
        const fileName = selectedFile.name || 'unknown'
        
        if (isJsonFile(fileName)) {
          // Use JSON
          if (selectedFile.id) {
            const fileContent = await downloadFile(selectedFile.id, 'application/json')
            if (fileContent) {
              try {
                const jsonData = JSON.parse(fileContent.toString())
                context = formatJsonData(jsonData, fileName)
              } catch (e) {
                context = `[Error parsing JSON: ${e}]`
              }
            }
          }
        } else {
          // PDF - check for JSON version
          const jsonName = getCorrespondingJsonName(fileName)
          const jsonFile = jsonMap.get(jsonName.toLowerCase())
          
          if (jsonFile?.id) {
            const fileContent = await downloadFile(jsonFile.id, 'application/json')
            if (fileContent) {
              try {
                const jsonData = JSON.parse(fileContent.toString())
                context = formatJsonData(jsonData, jsonFile.name)
              } catch (e) {
                context = `[Error parsing JSON: ${e}]`
              }
            }
          } else if (selectedFile.id) {
            // Fall back to PDF
            const mimeType = selectedFile.mimeType || 'application/octet-stream'
            const fileContent = await downloadFile(selectedFile.id, mimeType)
            if (fileContent) {
              const extracted = await extractTextFromFile(fileContent, mimeType, fileName)
              context = formatDocument(extracted.text, extracted.tables, fileName)
              const financialData = extractFinancialData(extracted.text)
              context += financialData
            }
          }
        }
      }
    }

    // If no file selected and no specific file context, use all files
    if (!context) {
      context = files.map((f: any) => `[FILE: ${f.name}]`).join('\n\n')
    }

    const answer = await getMiniMaxResponse(
      selectedFile && selectedFile.name
        ? `About ${selectedFile.name}: ${question}` 
        : question,
      context
    )

    return NextResponse.json({
      answer,
      files: files.map((f: any, i: number) => ({ id: f.id, name: f.name, index: i + 1 })),
      selectedReportIndex: selectedReportIndex ?? null,
      selectedFileName: selectedFile?.name || null,
      showList: false
    })

  } catch (error: any) {
    console.error('Chat error:', error)
    return NextResponse.json(
      { error: 'Failed: ' + error.message },
      { status: 500 }
    )
  }
}

export async function GET() {
  const folderId = process.env.KNOWLEDGE_BASE_FOLDER_ID
  const connectionTest = await testConnection()

  return NextResponse.json({
    status: 'Chatbot v3 - Financial Report Analyzer with JSON Pre-processing',
    connection: connectionTest,
    knowledgeBase: {
      folderId: folderId || 'not configured'
    },
    features: [
      'Pre-processed JSON files for accurate data extraction',
      'Falls back to PDF parsing if JSON not available'
    ]
  })
}
