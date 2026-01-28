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

    // Handle special commands
    const lowerQuestion = question.toLowerCase().trim()
    
    // === LIST REPORTS COMMAND ===
    if (lowerQuestion === 'hi' || lowerQuestion === 'hello' || lowerQuestion === 'list' || lowerQuestion === 'list reports' || lowerQuestion === 'show reports') {
      const reportList = files.map((file: any, index: number) => {
        const icon = file.mimeType?.includes('pdf') ? '📄' : '📁'
        const date = file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : ''
        return `${index + 1}. ${icon} **${file.name}** ${date}`
      }).join('\n')

      return NextResponse.json({
        answer: `👋 **Hello! Here are your financial reports:**\n\n${reportList}\n\n📝 **Enter the number (1-${files.length})** of the report you want to analyze.`,
        files: files.map((f: any, i: number) => ({ id: f.id, name: f.name, index: i + 1 })),
        selectedReportIndex: null,
        showList: true
      })
    }

    // === SELECT REPORT COMMAND ===
    if (selectedReportIndex !== undefined && selectedReportIndex !== null) {
      const index = selectedReportIndex - 1
      if (index >= 0 && index < files.length) {
        const file = files[index]
        
        // Download and process only this file
        const mimeType = file.mimeType || 'application/octet-stream'
        if (!file.id) {
          return NextResponse.json({ error: 'File ID is missing' }, { status: 400 })
        }
        const fileContent = await downloadFile(file.id, mimeType)
        const fileName = file.name || 'unknown'
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
          files: files.map((f: any, i: number) => ({ id: f.id, name: f.name, index: i + 1 })),
          selectedReportIndex: selectedReportIndex,
          selectedFileName: fileName,
          showList: false
        })
      }
    }

    // === DEFAULT: Ask about currently selected report or all files ===
    let context = ''
    let selectedFile = null

    if (selectedReportIndex !== null && selectedReportIndex !== undefined) {
      const index = selectedReportIndex - 1
      if (index >= 0 && index < files.length) {
        selectedFile = files[index]
        if (!selectedFile.id) {
          console.error('Selected file is missing ID')
        } else {
          const mimeType = selectedFile.mimeType || 'application/octet-stream'
          const fileName = selectedFile.name || 'unknown'
          const fileContent = await downloadFile(selectedFile.id, mimeType)
          if (fileContent) {
            const extracted = await extractTextFromFile(fileContent, mimeType, fileName)
            context = formatDocument(extracted.text, extracted.tables, fileName)
            
            // Add structured data for all financial reports
            const financialData = extractFinancialData(extracted.text)
            context += financialData
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
    status: 'Chatbot v2 - Financial Report Analyzer',
    connection: connectionTest,
    knowledgeBase: {
      folderId: folderId || 'not configured'
    }
  })
}
