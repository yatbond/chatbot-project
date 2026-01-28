import { google } from 'googleapis'
import { existsSync } from 'fs'
import { join } from 'path'

// Load service account credentials from environment variable or file
let serviceAccount: any = null

// First try to load from SERVICE_ACCOUNT_JSON env var
const serviceAccountJson = process.env.SERVICE_ACCOUNT_JSON
console.log('SERVICE_ACCOUNT_JSON env present:', !!serviceAccountJson)
console.log('SERVICE_ACCOUNT_JSON length:', serviceAccountJson?.length)

if (serviceAccountJson) {
  try {
    serviceAccount = JSON.parse(serviceAccountJson)
    console.log('Service account loaded successfully, client_email:', serviceAccount?.client_email)
  } catch (error) {
    console.error('Error parsing SERVICE_ACCOUNT_JSON:', error)
  }
}
// Fallback to file
else {
  console.log('SERVICE_ACCOUNT_JSON not found, trying file...')
  const serviceAccountPath = join(process.cwd(), 'service-account.json')
  if (existsSync(serviceAccountPath)) {
    try {
      const fs = require('fs')
      serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'))
      console.log('Service account loaded from file, client_email:', serviceAccount?.client_email)
    } catch (error) {
      console.error('Error loading service account:', error)
    }
  }
}

// Create JWT client with service account
const jwtClient = new google.auth.JWT(
  serviceAccount?.client_email || undefined,
  undefined,
  serviceAccount?.private_key || undefined,
  ['https://www.googleapis.com/auth/drive.readonly']
)

const drive = google.drive({ version: 'v3', auth: jwtClient })

// List files in the knowledge base folder
export async function listKnowledgeBaseFiles(folderId: string) {
  try {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, modifiedTime, size, webViewLink)',
      orderBy: 'modifiedTime desc',
      pageSize: 100
    })
    
    return response.data.files || []
  } catch (error: any) {
    console.error('Error listing files:', error.message)
    return []
  }
}

// Download file content
export async function downloadFile(fileId: string, mimeType: string, fileName?: string): Promise<Buffer | null> {
  try {
    // Check if it's Excel by extension or mimeType
    const isExcelFile = fileName?.toLowerCase().endsWith('.xlsx') || 
                        fileName?.toLowerCase().endsWith('.xls') ||
                        mimeType.includes('excel') || 
                        mimeType.includes('spreadsheet')
    
    if (isExcelFile) {
      console.log('Downloading Excel file:', fileName)
      // Export Excel from Google Drive
      const response = await drive.files.export({
        fileId,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }, {
        responseType: 'arraybuffer'
      })
      console.log('Excel export successful, size:', response.data.byteLength)
      return Buffer.from(response.data as ArrayBuffer)
    }
    
    // For other supported types, use alt=media
    const supportedTypes = [
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/csv'
    ]
    
    if (!supportedTypes.includes(mimeType)) {
      console.log(`Skipping unsupported type: ${mimeType}`)
      return null
    }

    // Download the file
    const response = await drive.files.get({
      fileId,
      alt: 'media'
    }, {
      responseType: 'arraybuffer'
    })

    return Buffer.from(response.data as ArrayBuffer)
    
  } catch (error: any) {
    console.error('Error downloading file:', error.message, error.code)
    return null
  }
}

// Get file content (metadata)
export async function readFileContent(fileId: string) {
  try {
    const response = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, webViewLink'
    })
    return response.data
  } catch (error: any) {
    console.error('Error reading file:', error.message)
    return null
  }
}

// Get folder info
export async function getFolderInfo(folderId: string) {
  try {
    const response = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, modifiedTime'
    })
    return response.data
  } catch (error: any) {
    console.error('Error getting folder info:', error.message)
    return null
  }
}

// Test connection
export async function testConnection() {
  try {
    if (!serviceAccount) {
      return {
        connected: false,
        error: 'No service account credentials found (SERVICE_ACCOUNT_JSON env or service-account.json file)'
      }
    }
    const about = await drive.about.get({
      fields: 'user'
    })
    return {
      connected: true,
      user: about.data.user?.emailAddress || 'Service account connected'
    }
  } catch (error: any) {
    return {
      connected: false,
      error: error.message
    }
  }
}

export { drive, jwtClient }
