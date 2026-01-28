import { NextRequest, NextResponse } from 'next/server'
import { testConnection } from '@/lib/google-drive'

export async function GET() {
  const connectionTest = await testConnection()
  
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
    serviceAccountJsonPresent: !!process.env.SERVICE_ACCOUNT_JSON,
    serviceAccountJsonLength: process.env.SERVICE_ACCOUNT_JSON?.length || 0,
    connection: connectionTest
  })
}
