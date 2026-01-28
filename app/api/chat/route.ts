import { NextRequest, NextResponse } from 'next/server'
import { listKnowledgeBaseFiles, testConnection, downloadFile } from '@/lib/google-drive'
import { getMiniMaxResponse } from '@/lib/minimax'
import { extractTextAndTables, formatTextForAI, formatTablesForAI, formatFinancialTableForAI } from '@/lib/pdf-extractor'
import { formatForAI, getGrossProfitAuditReport } from '@/lib/financial-data'

// In-memory storage for session state (for demo - use Redis in production)
const sessionState = new Map<string, { selectedReportIndex: number | null }>()

function getSession(sessionId: string) {
  if (!sessionState.has(sessionId)) {
    sessionState.set(sessionId, { selectedReportIndex: null })
  }
  return sessionState.get(sessionId)!
}

async function extractTextFromFile(buffer: Buffer, mimeType: string, fileName: string) {
  if (mimeType === 'application/pdf') {
    try {
      const result = await extractTextAndTables(buffer, fileName)
      return {
        text: formatTextForAI(result.text, result.tables),
        tables: result.tables,
        pageCount: result.pageCount
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
          const financialTableInfo = formatFinancialTableForAI(extracted.tables)
          const structuredData = formatForAI() // Add pre-processed financial data
          context = `[FILE: ${fileName}]\n${extracted.text}\n${financialTableInfo}\n${structuredData}`
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
            const financialTableInfo = formatFinancialTableForAI(extracted.tables)
            const structuredData = formatForAI()
            context = `[FILE: ${fileName}]\n${extracted.text}\n${financialTableInfo}\n${structuredData}`
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
