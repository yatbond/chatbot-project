import { google } from 'googleapis'

// Use OAuth credentials from environment variables
const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/callback/google'

// Create OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
)

// Set credentials if access token is available (from session/auth)
export function setAccessToken(accessToken: string) {
  oauth2Client.setCredentials({ access_token: accessToken })
}

const drive = google.drive({ version: 'v3', auth: oauth2Client })

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
export async function downloadFile(fileId: string, mimeType: string): Promise<Buffer | null> {
  try {
    // For supported document types, get content
    const supportedTypes = [
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
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
    console.error('Error downloading file:', error.message)
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
    if (!clientId || !clientSecret) {
      return {
        connected: false,
        error: 'GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set'
      }
    }
    const about = await drive.about.get({
      fields: 'user'
    })
    return {
      connected: true,
      user: about.data.user?.emailAddress || 'Connected with OAuth'
    }
  } catch (error: any) {
    return {
      connected: false,
      error: error.message
    }
  }
}

export { drive, oauth2Client, setAccessToken }
