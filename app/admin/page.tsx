'use client'

import { useState } from 'react'

interface FolderConfig {
  folderId: string
  folderName: string
  lastUpdated: string
  docCount: number
}

export default function Admin() {
  const [config, setConfig] = useState<FolderConfig>({
    folderId: '',
    folderName: '',
    lastUpdated: '',
    docCount: 0
  })
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState('')

  const saveConfig = async () => {
    if (!config.folderId) {
      setMessage('Please enter a Google Drive folder ID')
      return
    }

    setIsLoading(true)
    setMessage('')

    try {
      const response = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })

      if (response.ok) {
        setMessage('Configuration saved successfully!')
      } else {
        setMessage('Failed to save configuration')
      }
    } catch (error) {
      setMessage('Error saving configuration')
    }

    setIsLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Admin Settings</h1>

        {/* Google Drive Configuration */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">📁 Knowledge Base Configuration</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Google Drive Folder ID
              </label>
              <input
                type="text"
                value={config.folderId}
                onChange={(e) => setConfig({ ...config, folderId: e.target.value })}
                placeholder="Enter Google Drive folder ID"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Find this in the Google Drive folder URL: drive.google.com/drive/folders/[FOLDER_ID]
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Folder Display Name
              </label>
              <input
                type="text"
                value={config.folderName}
                onChange={(e) => setConfig({ ...config, folderName: e.target.value })}
                placeholder="e.g., Company Policies 2024"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              onClick={saveConfig}
              disabled={isLoading}
              className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : 'Save Configuration'}
            </button>

            {message && (
              <div className={`p-3 rounded-lg ${message.includes('Failed') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                {message}
              </div>
            )}
          </div>
        </div>

        {/* Current Status */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">📊 Knowledge Base Status</h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">Documents Loaded</p>
              <p className="text-2xl font-bold text-gray-800">{config.docCount}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">Last Updated</p>
              <p className="text-lg font-medium text-gray-800">{config.lastUpdated || 'Never'}</p>
            </div>
          </div>

          <button className="w-full mt-4 py-2 border border-indigo-600 text-indigo-600 rounded-lg hover:bg-indigo-50">
            Refresh Knowledge Base
          </button>
        </div>
      </div>
    </div>
  )
}
