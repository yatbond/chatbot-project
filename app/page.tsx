'use client'

import { useState, useEffect, useRef } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface FileInfo {
  id: string
  name: string
  index: number
}

interface ChatResponse {
  answer: string
  files: FileInfo[]
  selectedReportIndex: number | null
  selectedFileName: string | null
  showList: boolean
  filesFound?: number
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [files, setFiles] = useState<FileInfo[]>([])
  const [selectedReportIndex, setSelectedReportIndex] = useState<number | null>(null)
  const [isConfigured, setIsConfigured] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Check knowledge base status on load
  useEffect(() => {
    checkKnowledgeBase()
  }, [])

  const checkKnowledgeBase = async () => {
    try {
      const response = await fetch('/api/chat')
      const data = await response.json()
      if (data.knowledgeBase?.configured) {
        setIsConfigured(true)
        setFiles(data.files || [])
      }
    } catch (error) {
      console.error('Error checking knowledge base:', error)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsLoading(true)

    try {
      // Check if user is entering a report number
      const messageNumber = parseInt(userMessage)
      
      let reportIndex: number | null = selectedReportIndex
      
      // If user enters a number and it's within range of available files
      if (!isNaN(messageNumber) && messageNumber > 0 && messageNumber <= files.length) {
        reportIndex = messageNumber
        setSelectedReportIndex(messageNumber)
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          question: userMessage,
          selectedReportIndex: reportIndex
        })
      })

      const data: ChatResponse = await response.json()
      
      if (data.answer) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.answer }])
        
        // Update files list if returned
        if (data.files && data.files.length > 0) {
          setFiles(data.files)
        }
        
        // Update selected report
        if (data.selectedReportIndex !== undefined) {
          setSelectedReportIndex(data.selectedReportIndex)
        }
        
        // If showing list, clear selection
        if (data.showList) {
          setSelectedReportIndex(null)
        }
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I could not answer that question.' }])
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }])
    }

    setIsLoading(false)
  }

  const refreshKnowledgeBase = async () => {
    setIsLoading(true)
    await checkKnowledgeBase()
    setMessages(prev => [...prev, { 
      role: 'assistant', 
      content: '✅ Knowledge base refreshed!\n\n👋 Say **"hi"** to see your financial reports list.' 
    }])
    setIsLoading(false)
  }

  const clearChat = () => {
    setMessages([])
    setSelectedReportIndex(null)
  }

  const getSelectedFileName = () => {
    if (selectedReportIndex && files[selectedReportIndex - 1]) {
      return files[selectedReportIndex - 1].name
    }
    return null
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#1a1a2e' }}>
      {/* Header */}
      <header className="bg-gray-800 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold" style={{ color: '#a78bfa' }}>📊 Financial Report Analyzer</h1>
          <div className="flex gap-2">
            <button 
              onClick={clearChat}
              className="px-3 py-2 text-sm rounded-lg transition-colors"
              style={{ 
                color: '#9ca3af',
                backgroundColor: 'transparent',
              }}
            >
              🗑️ Clear
            </button>
            <button 
              onClick={refreshKnowledgeBase}
              disabled={isLoading}
              className="px-4 py-2 text-sm rounded-lg disabled:opacity-50 transition-colors"
              style={{ 
                color: '#a78bfa',
                backgroundColor: 'transparent',
                border: '1px solid #a78bfa'
              }}
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Status Bar */}
      <div className="max-w-4xl mx-auto px-4 py-2">
        <div className="rounded-lg shadow-sm p-3 flex flex-wrap gap-4 text-sm items-center" style={{ backgroundColor: '#16213e' }}>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isConfigured ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
            <span className="text-gray-300">
              {isConfigured ? '✅ Connected to Google Drive' : '⚠️ Not Configured'}
            </span>
          </div>
          
          {isConfigured && (
            <>
              <span className="text-gray-500">|</span>
              <span className="text-gray-300">📄 {files.length} documents</span>
              
              {selectedReportIndex ? (
                <>
                  <span className="text-gray-500">|</span>
                  <span className="px-2 py-1 rounded text-sm" style={{ backgroundColor: '#6366f1', color: '#ffffff' }}>
                    📑 Current: {selectedReportIndex}. {getSelectedFileName()}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-gray-500">|</span>
                  <span className="text-gray-400">No report selected</span>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <main className="max-w-4xl mx-auto px-4 py-4">
        <div className="rounded-xl shadow-lg overflow-hidden" style={{ backgroundColor: '#16213e' }}>
          {/* Messages */}
          <div className="h-[60vh] overflow-y-auto p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-12" style={{ color: '#9ca3af' }}>
                <p className="text-4xl mb-4">👋</p>
                <p className="text-lg font-medium">Welcome to Financial Report Analyzer</p>
                <p className="mt-2 text-sm">I can help you analyze and compare financial reports.</p>
                {isConfigured && (
                  <div className="mt-6 p-4 rounded-lg mx-auto max-w-md" style={{ backgroundColor: '#0f3460' }}>
                    <p className="text-sm" style={{ color: '#a78bfa' }}>Say <strong>"hi"</strong> to see your reports list!</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className="max-w-[85%] rounded-lg px-4 py-3 whitespace-pre-wrap"
                      style={{
                        backgroundColor: message.role === 'user' ? '#6366f1' : '#0f3460',
                        color: message.role === 'user' ? '#ffffff' : '#e5e7eb'
                      }}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="rounded-lg px-4 py-3" style={{ backgroundColor: '#0f3460' }}>
                      <span className="flex items-center space-x-2">
                        <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: '#a78bfa' }}></span>
                        <span className="w-2 h-2 rounded-full animate-bounce delay-100" style={{ backgroundColor: '#a78bfa' }}></span>
                        <span className="w-2 h-2 rounded-full animate-bounce delay-200" style={{ backgroundColor: '#a78bfa' }}></span>
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t p-4" style={{ borderColor: '#0f3460' }}>
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder={
                  selectedReportIndex 
                    ? `Ask about ${getSelectedFileName()}...` 
                    : 'Type "hi" to see reports list...'
                }
                className="flex-1 px-4 py-2 rounded-lg focus:outline-none focus:ring-2"
                style={{ 
                  backgroundColor: '#0f3460',
                  color: '#ffffff',
                  border: '1px solid #374151'
                }}
                disabled={isLoading}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                className="px-6 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ 
                  backgroundColor: '#6366f1',
                  color: '#ffffff'
                }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-sm" style={{ color: '#6b7280' }}>
        <p>💡 Tip: Say <strong>"hi"</strong> or <strong>"list"</strong> to see all reports</p>
      </footer>
    </div>
  )
}
