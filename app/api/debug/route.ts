import { NextRequest, NextResponse } from 'next/server'
import { listKnowledgeBaseFiles, testConnection, downloadFile } from '@/lib/google-drive'
import * as XLSX from 'xlsx'

function isExcelFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.xlsx') || fileName.toLowerCase().endsWith('.xls')
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

function isNumeric(val: any): boolean {
  if (val === null || val === undefined || val === '') return false
  const str = String(val).replace(/[,$]/g, '').trim()
  return !isNaN(Number(str)) && str !== ''
}

function cleanNumber(val: any): string {
  if (val === null || val === undefined || val === '') return 'N/A'
  return String(val).trim()
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const fileId = searchParams.get('fileId')
    const fileName = searchParams.get('fileName')
    const mimeType = searchParams.get('mimeType') || 'application/octet-stream'
    
    // If fileId provided, show all data from that file
    if (fileId) {
      const fileContent = await downloadFile(fileId, mimeType, fileName || undefined)
      
      if (!fileContent) {
        return NextResponse.json({ error: 'Failed to download file', fileId, fileName })
      }

      let result: any = {
        fileName,
        mimeType,
        contentSize: fileContent.length
      }

      if (isExcelFile(fileName || '')) {
        try {
          const workbook = XLSX.read(fileContent, { type: 'buffer' })
          const sheetName = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[sheetName]
          const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]
          
          result.sheetName = sheetName
          result.totalRows = data.length
          
          // Find ALL rows with numeric data
          const numericRows: { rowIndex: number, values: any[], labels: string[] }[] = []
          
          for (let i = 0; i < Math.min(data.length, 100); i++) {
            const row = data[i]
            if (!row || row.length === 0) continue
            
            // Check if row has any numeric values
            const hasNumeric = row.some(cell => isNumeric(cell))
            
            // Also show rows that might be headers (contain text labels)
            const rowStr = String(row).toLowerCase()
            const hasLabel = rowStr.includes('gross profit') || 
                            rowStr.includes('tender') || 
                            rowStr.includes('budget') ||
                            rowStr.includes('revenue') ||
                            rowStr.includes('cost')
            
            if (hasNumeric || hasLabel) {
              const labels = row.map((cell: any) => String(cell || '').substring(0, 30))
              const values = row.map((cell: any) => cleanNumber(cell))
              numericRows.push({ rowIndex: i, values, labels })
            }
          }
          
          result.allNumericRows = numericRows.map(r => ({
            row: r.rowIndex,
            labels: r.labels.slice(0, 8),
            values: r.values.slice(0, 8)
          }))
          
          // Also show the raw sheet as JSON
          result.jsonPreview = XLSX.utils.sheet_to_json(worksheet)
          
        } catch (err: any) {
          result.excelError = err.message
        }
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
        isExcel: isExcelFile(f.name)
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
