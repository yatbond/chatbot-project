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

// Parse filename to extract project number and name
function parseFileName(fileName: string): { projectNo: string; projectName: string; hasJson: boolean } {
  // Remove _data.json suffix if present
  let name = fileName.replace('_data.json', '').replace('.pdf', '')
  
  // Extract project number (at the beginning - digits followed by space, dash, or immediately by letters)
  const match = name.match(/^(\d+)\s*[-–]?\s*/)
  let projectNo = ''
  let projectName = name
  
  if (match) {
    projectNo = match[1]
    projectName = name.substring(match[0].length).trim()
  } else {
    // Try to get first word as project number
    const firstWord = name.split(/[\s-–]/)[0]
    if (firstWord && /^\d+$/.test(firstWord)) {
      projectNo = firstWord
      projectName = name.substring(firstWord.length).trim().replace(/^[-–]\s*/, '')
    }
  }
  
  // Clean up project name - remove "Financial Report" and date
  projectName = projectName
    .replace(/\s+Financial\s*Report.*/i, '')
    .replace(/\s+Finanical\s*Report.*/i, '')  // Note the typo in some filenames
    .replace(/^\d{4}-\d{2}.*/i, '')  // Remove date suffix
    .trim()
  
  return {
    projectNo: projectNo || 'Unknown',
    projectName: projectName || name,
    hasJson: fileName.endsWith('_data.json')
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

    // Create a map of JSON files for quick lookup (key = base name lowercase)
    const jsonMap = new Map<string, any>()
    jsonFiles.forEach((f: any) => {
      const baseName = f.name.replace('_data.json', '').toLowerCase()
      jsonMap.set(baseName, f)
    })

    // Group files by project (merge PDF + JSON into single entry)
    const projectMap = new Map<string, any>()
    
    // Process PDFs
    pdfFiles.forEach((f: any) => {
      const parsed = parseFileName(f.name)
      const key = `${parsed.projectNo}-${parsed.projectName}`.toLowerCase()
      projectMap.set(key, {
        pdfFile: f,
        jsonFile: null,
        hasJson: false,
        projectNo: parsed.projectNo,
        projectName: parsed.projectName,
        displayName: `${parsed.projectNo} - ${parsed.projectName}`
      })
    })
    
    // Process JSONs and merge with PDFs
    jsonFiles.forEach((f: any) => {
      const parsed = parseFileName(f.name)
      const key = `${parsed.projectNo}-${parsed.projectName}`.toLowerCase()
      
      if (projectMap.has(key)) {
        // JSON exists, update to use JSON
        const existing = projectMap.get(key)
        existing.jsonFile = f
        existing.hasJson = true
      } else {
        // JSON only (no PDF)
        projectMap.set(key, {
          pdfFile: null,
          jsonFile: f,
          hasJson: true,
          projectNo: parsed.projectNo,
          projectName: parsed.projectName,
          displayName: `${parsed.projectNo} - ${parsed.projectName}`
        })
      }
    })

    // Convert to array and sort
    const projects = Array.from(projectMap.values())
      .sort((a, b) => a.projectNo.localeCompare(b.projectNo, undefined, { numeric: true }))

    // Handle special commands
    const lowerQuestion = question.toLowerCase().trim()
    
    // === LIST REPORTS COMMAND ===
    if (lowerQuestion === 'hi' || lowerQuestion === 'hello' || lowerQuestion === 'list' || lowerQuestion === 'list reports' || lowerQuestion === 'show reports') {
      const reportList = projects.map((project: any, index: number) => {
        const icon = project.hasJson ? '✅' : '📄'
        return `${index + 1}. ${icon} **${project.projectNo} - ${project.projectName}**`
      }).join('\n')

      return NextResponse.json({
        answer: `👋 **Hello! Here are your financial reports:**\n\n${reportList}\n\n📝 **Enter the number (1-${projects.length})** of the project you want to analyze.`,
        files: projects.map((p: any, i: number) => ({ 
          id: p.hasJson ? p.jsonFile.id : p.pdfFile.id, 
          projectNo: p.projectNo,
          projectName: p.projectName,
          hasJson: p.hasJson,
          index: i + 1 
        })),
        selectedReportIndex: null,
        showList: true
      })
    }

    // === SELECT REPORT COMMAND ===
    if (selectedReportIndex !== undefined && selectedReportIndex !== null) {
      let project = null
      
      // Handle both string and number inputs
      const inputValue = typeof selectedReportIndex === 'string' 
        ? parseInt(selectedReportIndex, 10) 
        : selectedReportIndex
      
      // Check if it's a list number (1-21)
      const listIndex = inputValue - 1
      if (listIndex >= 0 && listIndex < projects.length) {
        project = projects[listIndex]
      } else {
        // Check if it matches a project number (e.g., "990" matches project 990)
        const inputNum = String(inputValue)
        project = projects.find(p => p.projectNo === inputNum)
      }
      
      if (project) {
        const fileName = project.hasJson ? project.jsonFile.name : project.pdfFile.name
        const fileId = project.hasJson ? project.jsonFile.id : project.pdfFile.id
        const mimeType = project.hasJson ? 'application/json' : (project.pdfFile.mimeType || 'application/octet-stream')
        
        // Download and process
        const fileContent = await downloadFile(fileId, mimeType)
        let context = ''

        if (fileContent) {
          if (project.hasJson) {
            // Use pre-processed JSON data
            try {
              const jsonData = JSON.parse(fileContent.toString())
              context = formatJsonData(jsonData, fileName)
            } catch (e) {
              context = `[Error parsing JSON: ${e}]`
            }
          } else {
            // Fall back to PDF parsing
            const extracted = await extractTextFromFile(fileContent, mimeType, fileName)
            context = formatDocument(extracted.text, extracted.tables, fileName)
            const financialData = extractFinancialData(extracted.text)
            context += financialData
          }
        }

        const answer = await getMiniMaxResponse(
          `Focus ONLY on this report (${project.projectNo} - ${project.projectName}). ${question}`,
          context
        )

        return NextResponse.json({
          answer,
          files: projects.map((p: any, i: number) => ({ 
            id: p.hasJson ? p.jsonFile.id : p.pdfFile.id, 
            projectNo: p.projectNo,
            projectName: p.projectName,
            hasJson: p.hasJson,
            index: i + 1 
          })),
          selectedReportIndex: selectedReportIndex,
          selectedFileName: `${project.projectNo} - ${project.projectName}`,
          showList: false
        })
      }
    }

    // === DEFAULT: Ask about currently selected report or all projects ===
    let context = ''
    let selectedProject = null

    if (selectedReportIndex !== null && selectedReportIndex !== undefined) {
      // Handle both string and number inputs
      const inputValue = typeof selectedReportIndex === 'string' 
        ? parseInt(selectedReportIndex, 10) 
        : selectedReportIndex
      
      // Check if it's a list number (1-21)
      const listIndex = inputValue - 1
      if (listIndex >= 0 && listIndex < projects.length) {
        selectedProject = projects[listIndex]
      } else {
        // Check if it matches a project number (e.g., "990" matches project 990)
        const inputNum = String(inputValue)
        selectedProject = projects.find(p => p.projectNo === inputNum)
      }
      
      if (selectedProject) {
        const fileId = selectedProject.hasJson ? selectedProject.jsonFile.id : selectedProject.pdfFile.id
        const mimeType = selectedProject.hasJson ? 'application/json' : (selectedProject.pdfFile.mimeType || 'application/octet-stream')
        const fileName = selectedProject.hasJson ? selectedProject.jsonFile.name : selectedProject.pdfFile.name
        
        const fileContent = await downloadFile(fileId, mimeType)
        if (fileContent) {
          if (selectedProject.hasJson) {
            try {
              const jsonData = JSON.parse(fileContent.toString())
              context = formatJsonData(jsonData, fileName)
            } catch (e) {
              context = `[Error parsing JSON: ${e}]`
            }
          } else {
            const extracted = await extractTextFromFile(fileContent, mimeType, fileName)
            context = formatDocument(extracted.text, extracted.tables, fileName)
            const financialData = extractFinancialData(extracted.text)
            context += financialData
          }
        }
      }
    }

    // If no project selected, list all
    if (!context) {
      const projectList = projects.map((p: any) => 
        `**${p.projectNo} - ${p.projectName}**${p.hasJson ? ' (accurate data available)' : ''}`
      ).join('\n')
      context = `Available projects:\n${projectList}`
    }

    const answer = await getMiniMaxResponse(
      selectedProject 
        ? `About ${selectedProject.projectNo} - ${selectedProject.projectName}: ${question}` 
        : question,
      context
    )

    return NextResponse.json({
      answer,
      files: projects.map((p: any, i: number) => ({ 
        id: p.hasJson ? p.jsonFile.id : p.pdfFile.id, 
        projectNo: p.projectNo,
        projectName: p.projectName,
        hasJson: p.hasJson,
        index: i + 1 
      })),
      selectedReportIndex: selectedReportIndex ?? null,
      selectedFileName: selectedProject ? `${selectedProject.projectNo} - ${selectedProject.projectName}` : null,
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
    status: 'Chatbot v4 - Financial Report Analyzer',
    connection: connectionTest,
    knowledgeBase: {
      folderId: folderId || 'not configured'
    },
    features: [
      'Smart project name extraction',
      'Auto-detects JSON files for accurate data',
      'Shows project number + name instead of filename'
    ]
  })
}
