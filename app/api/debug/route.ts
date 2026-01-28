import { NextRequest, NextResponse } from 'next/server'
import { listKnowledgeBaseFiles, testConnection, downloadFile } from '@/lib/google-drive'
import { parseExcelFinancialData, formatExcelData } from '@/lib/excel-parser'
import { extractFinancialData } from '@/lib/financial-parser'

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
  }
  projectName = projectName.replace(/\s+Financial\s*Report.*/i, '').replace(/^\d{4}-\d{2}.*/i, '').trim()
  return { projectNo: projectNo || 'Unknown', projectName: projectName || name }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const fileId = searchParams.get('fileId')
    const fileName = searchParams.get('fileName')
    const mimeType = searchParams.get('mimeType') || 'application/octet-stream'
    
    // If fileId provided, test that specific file
    if (fileId) {
      const fileContent = await downloadFile(fileId, mimeType)
      
      if (!fileContent) {
        return NextResponse.json({ 
          error: 'Failed to download file', 
          fileId,
          mimeType,
          note: 'Check Vercel function logs for detailed error'
        })
      }

      let result: any = {
        fileName,
        mimeType,
        contentSize: fileContent.length,
        firstBytes: Array.from(fileContent.slice(0, 50))
      }

      if (isExcelFile(fileName || '')) {
        const excelData = parseExcelFinancialData(fileContent)
        result.excelParsed = excelData
        result.excelFormatted = excelData ? formatExcelData(excelData, fileName || '') : 'FAILED TO PARSE'
      }

      return NextResponse.json(result)
    }
    
    // Default: list all files
    const folderId = process.env.KNOWLEDGE_BASE_FOLDER_ID
    if (!folderId) {
      return NextResponse.json({ error: 'Missing KNOWLEDGE_BASE_FOLDER_ID' })
    }

    const connectionTest = await testConnection()
    const files = await listKnowledgeBaseFiles(folderId)
    
    // Group files by project
    const projectMap = new Map<string, any>()
    
    files.forEach((f: any) => {
      const parsed = parseFileName(f.name)
      const key = `${parsed.projectNo}-${parsed.projectName}`.toLowerCase()
      if (!projectMap.has(key)) {
        projectMap.set(key, { 
          projectNo: parsed.projectNo, 
          projectName: parsed.projectName, 
          files: [] 
        })
      }
      projectMap.get(key)!.files.push({
        name: f.name,
        mimeType: f.mimeType,
        id: f.id,
        isExcel: isExcelFile(f.name),
        isJson: isJsonFile(f.name)
      })
    })

    return NextResponse.json({
      status: 'Debug endpoint working',
      connection: connectionTest,
      folderId,
      totalFiles: files.length,
      projects: Array.from(projectMap.values())
    })
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { fileId, mimeType, fileName } = await request.json()
    
    if (!fileId) {
      return NextResponse.json({ error: 'fileId required' })
    }

    const fileContent = await downloadFile(fileId, mimeType || 'application/octet-stream')
    
    if (!fileContent) {
      return NextResponse.json({ error: 'Failed to download file' })
    }

    console.log('File content size:', fileContent.length)
    console.log('First 100 bytes:', fileContent.slice(0, 100).toString())

    let result: any = {
      fileName,
      mimeType,
      contentSize: fileContent.length,
      contentType: typeof fileContent
    }

    if (isExcelFile(fileName)) {
      const excelData = parseExcelFinancialData(fileContent)
      result.excelParsed = excelData
      result.excelFormatted = excelData ? formatExcelData(excelData, fileName) : 'FAILED TO PARSE'
    }

    return NextResponse.json(result)
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
