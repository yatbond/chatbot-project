import { NextRequest, NextResponse } from 'next/server'
import { listKnowledgeBaseFiles, testConnection, downloadFile } from '@/lib/google-drive'
import { getMiniMaxResponse } from '@/lib/minimax'
import { extractFinancialData } from '@/lib/financial-parser'
import { parseExcelFinancialData, formatExcelData } from '@/lib/excel-parser'

const sessionState = new Map<string, { selectedReportIndex: number | null }>()

function getSession(sessionId: string) {
  if (!sessionState.has(sessionId)) {
    sessionState.set(sessionId, { selectedReportIndex: null })
  }
  return sessionState.get(sessionId)!
}

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

function isExcelFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.xlsx') || fileName.toLowerCase().endsWith('.xls')
}

function isJsonFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('_data.json')
}

function parseFileName(fileName: string): { projectNo: string; projectName: string } {
  let name = fileName.replace('_data.json', '').replace('.pdf', '').replace('.xlsx', '').replace('.xls', '')
  
  const match = name.match(/^(\d+)\s*[-–]?\s*/)
  let projectNo = ''
  let projectName = name
  
  if (match) {
    projectNo = match[1]
    projectName = name.substring(match[0].length).trim()
  } else {
    const firstWord = name.split(/[\s-–]/)[0]
    if (firstWord && /^\d+$/.test(firstWord)) {
      projectNo = firstWord
      projectName = name.substring(firstWord.length).trim().replace(/^[-–]\s*/, '')
    }
  }
  
  projectName = projectName
    .replace(/\s+Financial\s*Report.*/i, '')
    .replace(/\s+Finanical\s*Report.*/i, '')
    .replace(/^\d{4}-\d{2}.*/i, '')
    .trim()
  
  return {
    projectNo: projectNo || 'Unknown',
    projectName: projectName || name
  }
}

async function extractTextFromFile(buffer: Buffer, mimeType: string, fileName: string) {
  if (mimeType === 'application/pdf' && pdfParse) {
    try {
      const data = await pdfParse(buffer)
      return { text: data.text, tables: detectTables(data.text), pageCount: data.numpages }
    } catch (error: any) {
      return { text: `[Error reading PDF: ${error.message}]`, tables: [], pageCount: 0 }
    }
  }
  return { text: `[File: ${fileName}]`, tables: [], pageCount: 1 }
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
      if (cells.length >= 2) currentTable.push(cells)
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
  let output = `\n\n=== EXTRACTED DATA FROM ${fileName} ===\nSource: Pre-processed JSON file\n\n`
  
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

export async function POST(request: NextRequest) {
  try {
    const { question, selectedReportIndex } = await request.json()

    if (!question || question.trim().length === 0) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 })
    }

    const folderId = process.env.KNOWLEDGE_BASE_FOLDER_ID
    if (!folderId) {
      return NextResponse.json({ answer: 'Please configure Google Drive folder ID.' })
    }

    const connectionTest = await testConnection()
    if (!connectionTest.connected) {
      return NextResponse.json({ answer: `❌ Google Drive error: ${connectionTest.error}` })
    }

    const files = await listKnowledgeBaseFiles(folderId)
    if (!files || files.length === 0) {
      return NextResponse.json({ answer: '✅ Connected! No documents found.', files: [] })
    }

    const jsonFiles = files.filter((f: any) => isJsonFile(f.name))
    const excelFiles = files.filter((f: any) => isExcelFile(f.name))
    const pdfFiles = files.filter((f: any) => !isJsonFile(f.name) && !isExcelFile(f.name))

    const projectMap = new Map<string, any>()
    
    pdfFiles.forEach((f: any) => {
      const parsed = parseFileName(f.name)
      const key = `${parsed.projectNo}-${parsed.projectName}`.toLowerCase()
      projectMap.set(key, {
        pdfFile: f, excelFile: null, jsonFile: null,
        hasJson: false, hasExcel: false,
        projectNo: parsed.projectNo, projectName: parsed.projectName
      })
    })
    
    excelFiles.forEach((f: any) => {
      const parsed = parseFileName(f.name)
      const key = `${parsed.projectNo}-${parsed.projectName}`.toLowerCase()
      if (projectMap.has(key)) {
        const existing = projectMap.get(key)
        existing.excelFile = f
        existing.hasExcel = true
      } else {
        projectMap.set(key, {
          pdfFile: null, excelFile: f, jsonFile: null,
          hasJson: false, hasExcel: true,
          projectNo: parsed.projectNo, projectName: parsed.projectName
        })
      }
    })
    
    jsonFiles.forEach((f: any) => {
      const parsed = parseFileName(f.name)
      const key = `${parsed.projectNo}-${parsed.projectName}`.toLowerCase()
      if (projectMap.has(key)) {
        const existing = projectMap.get(key)
        existing.jsonFile = f
        existing.hasJson = true
      } else {
        projectMap.set(key, {
          pdfFile: null, excelFile: null, jsonFile: f,
          hasJson: true, hasExcel: false,
          projectNo: parsed.projectNo, projectName: parsed.projectName
        })
      }
    })

    const projects = Array.from(projectMap.values())
      .sort((a, b) => a.projectNo.localeCompare(b.projectNo, undefined, { numeric: true }))

    const lowerQuestion = question.toLowerCase().trim()
    
    if (lowerQuestion === 'hi' || lowerQuestion === 'hello' || lowerQuestion === 'list') {
      const reportList = projects.map((project: any, index: number) => {
        let icon = '📄'
        if (project.hasExcel) icon = '📊'
        else if (project.hasJson) icon = '✅'
        return `${index + 1}. ${icon} **${project.projectNo} - ${project.projectName}**`
      }).join('\n')

      return NextResponse.json({
        answer: `👋 **Hello! Here are your financial reports:**\n\n${reportList}\n\n📝 **Enter the number (1-${projects.length})** of the project you want to analyze.`,
        files: projects.map((p: any, i: number) => ({ 
          id: p.hasExcel ? p.excelFile.id : (p.hasJson ? p.jsonFile.id : p.pdfFile.id), 
          projectNo: p.projectNo, projectName: p.projectName,
          hasJson: p.hasJson, hasExcel: p.hasExcel, index: i + 1 
        })),
        selectedReportIndex: null, showList: true
      })
    }

    if (selectedReportIndex !== undefined && selectedReportIndex !== null) {
      let project = null
      
      const inputValue = typeof selectedReportIndex === 'string' 
        ? parseInt(selectedReportIndex, 10) 
        : selectedReportIndex
      
      const listIndex = inputValue - 1
      if (listIndex >= 0 && listIndex < projects.length) {
        project = projects[listIndex]
      } else {
        const inputNum = String(inputValue)
        project = projects.find(p => p.projectNo === inputNum)
      }
      
      if (project) {
        let fileId: string | null = null
        let mimeType = 'application/octet-stream'
        let fileName = ''
        let dataType = ''
        
        if (project.hasExcel) {
          fileId = project.excelFile.id
          fileName = project.excelFile.name
          dataType = 'excel'
          // Set correct mimeType based on extension
          if (fileName.toLowerCase().endsWith('.xls')) {
            mimeType = 'application/vnd.ms-excel'
          } else {
            mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          }
        } else if (project.hasJson) {
          fileId = project.jsonFile.id
          mimeType = 'application/json'
          fileName = project.jsonFile.name
          dataType = 'json'
        } else if (project.pdfFile) {
          fileId = project.pdfFile.id
          mimeType = project.pdfFile.mimeType || 'application/pdf'
          fileName = project.pdfFile.name
          dataType = 'pdf'
        }
        
        if (!fileId) {
          return NextResponse.json({ answer: 'Error: No file found for this project.' })
        }
        
        const fileContent = await downloadFile(fileId, mimeType)
        let context = ''

        if (fileContent) {
          if (dataType === 'excel') {
            const excelData = parseExcelFinancialData(fileContent)
            if (excelData) context = formatExcelData(excelData, fileName)
            else context = `[Error parsing Excel file: ${fileName}]`
          } else if (dataType === 'json') {
            try {
              const jsonData = JSON.parse(fileContent.toString())
              context = formatJsonData(jsonData, fileName)
            } catch (e) {
              context = `[Error parsing JSON: ${e}]`
            }
          } else {
            const extracted = await extractTextFromFile(fileContent, mimeType, fileName)
            context = formatDocument(extracted.text, extracted.tables, fileName)
            context += extractFinancialData(extracted.text)
          }
        }

        const answer = await getMiniMaxResponse(
          `Focus ONLY on this report (${project.projectNo} - ${project.projectName}). ${question}`,
          context
        )

        return NextResponse.json({
          answer,
          files: projects.map((p: any, i: number) => ({ 
            id: p.hasExcel ? p.excelFile.id : (p.hasJson ? p.jsonFile.id : p.pdfFile.id), 
            projectNo: p.projectNo, projectName: p.projectName,
            hasJson: p.hasJson, hasExcel: p.hasExcel, index: i + 1 
          })),
          selectedReportIndex: selectedReportIndex,
          selectedFileName: `${project.projectNo} - ${project.projectName}`,
          showList: false
        })
      }
    }

    let context = ''
    let selectedProject = null

    if (selectedReportIndex !== null && selectedReportIndex !== undefined) {
      const inputValue = typeof selectedReportIndex === 'string' 
        ? parseInt(selectedReportIndex, 10) 
        : selectedReportIndex
      
      const listIndex = inputValue - 1
      if (listIndex >= 0 && listIndex < projects.length) {
        selectedProject = projects[listIndex]
      } else {
        const inputNum = String(inputValue)
        selectedProject = projects.find(p => p.projectNo === inputNum)
      }
      
      if (selectedProject) {
        let fileId: string | null = null
        let mimeType = 'application/octet-stream'
        let fileName = ''
        let dataType = ''
        
        if (selectedProject.hasExcel) {
          fileId = selectedProject.excelFile.id
          fileName = selectedProject.excelFile.name
          dataType = 'excel'
          // Set correct mimeType based on extension
          if (fileName.toLowerCase().endsWith('.xls')) {
            mimeType = 'application/vnd.ms-excel'
          } else {
            mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          }
        } else if (selectedProject.hasJson) {
          fileId = selectedProject.jsonFile.id
          mimeType = 'application/json'
          fileName = selectedProject.jsonFile.name
          dataType = 'json'
        } else if (selectedProject.pdfFile) {
          fileId = selectedProject.pdfFile.id
          mimeType = selectedProject.pdfFile.mimeType || 'application/pdf'
          fileName = selectedProject.pdfFile.name
          dataType = 'pdf'
        }
        
        if (fileId) {
          const fileContent = await downloadFile(fileId, mimeType)
          if (fileContent) {
            if (dataType === 'excel') {
              const excelData = parseExcelFinancialData(fileContent)
              if (excelData) context = formatExcelData(excelData, fileName)
            } else if (dataType === 'json') {
              try {
                const jsonData = JSON.parse(fileContent.toString())
                context = formatJsonData(jsonData, fileName)
              } catch (e) {}
            } else {
              const extracted = await extractTextFromFile(fileContent, mimeType, fileName)
              context = formatDocument(extracted.text, extracted.tables, fileName)
              context += extractFinancialData(extracted.text)
            }
          }
        }
      }
    }

    if (!context) {
      const projectList = projects.map((p: any) => {
        let icon = '📄'
        if (p.hasExcel) icon = '📊'
        else if (p.hasJson) icon = '✅'
        return `**${p.projectNo} - ${p.projectName}**${p.hasJson ? ' (accurate)' : ''}`
      }).join('\n')
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
        id: p.hasExcel ? p.excelFile.id : (p.hasJson ? p.jsonFile.id : p.pdfFile.id), 
        projectNo: p.projectNo, projectName: p.projectName,
        hasJson: p.hasJson, hasExcel: p.hasExcel, index: i + 1 
      })),
      selectedReportIndex: selectedReportIndex ?? null,
      selectedFileName: selectedProject ? `${selectedProject.projectNo} - ${selectedProject.projectName}` : null,
      showList: false
    })

  } catch (error: any) {
    console.error('Chat error:', error)
    return NextResponse.json({ error: 'Failed: ' + error.message }, { status: 500 })
  }
}

export async function GET() {
  const connectionTest = await testConnection()
  return NextResponse.json({
    status: 'Chatbot v5 - Financial Report Analyzer (Excel Support)',
    connection: connectionTest,
    features: ['Excel file support (📊)', 'JSON pre-processed data (✅)', 'PDF fallback (📄)']
  })
}
