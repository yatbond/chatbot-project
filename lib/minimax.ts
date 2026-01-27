// MiniMax API integration - using the correct v1/text/chatcompletion_v2 format
const MINIMAX_API_URL = 'https://api.minimax.io/v1/text/chatcompletion_v2'

export async function getMiniMaxResponse(
  userQuestion: string,
  contextDocuments: string
): Promise<string> {
  const apiKey = process.env.MINIMAX_API_KEY

  if (!apiKey) {
    console.error('MiniMax API key not configured')
    return 'AI model is not configured. Please check the API key.'
  }

  try {
    const response = await fetch(MINIMAX_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.1',  // Same as Clawdbot
        messages: [
          {
            role: 'system',
            content: `You are a helpful assistant that answers questions based ONLY on the provided documents.
            
Rules:
1. Only use information from the documents provided in the context
2. If the answer is not in the documents, say "I don't have information about that in the available documents."
3. Be concise and direct in your answers

Documents context:
${contextDocuments}`
          },
          {
            role: 'user',
            content: userQuestion
          }
        ],
        temperature: 0.7,
        max_tokens: 1024
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('MiniMax API error:', response.status, errorText)
      return `Error from AI model: ${response.status} - ${errorText}`
    }

    const data = await response.json()
    
    console.log('MiniMax response:', data)

    if (data.choices?.[0]?.message?.content) {
      return data.choices[0].message.content
    } else if (data.generated_message) {
      return data.generated_message
    } else {
      return JSON.stringify(data)
    }
  } catch (error: any) {
    console.error('MiniMax API call failed:', error)
    return 'Failed to get response from AI model. Please try again.'
  }
}
