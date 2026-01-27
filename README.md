# AI Document Chatbot

A web application that allows users to ask questions about documents stored in a specific Google Drive folder. Powered by AI (MiniMax model), it answers questions based ONLY on the information within your documents.

## Features

- 💬 **Chat Interface** - Users can ask questions naturally
- 📁 **Google Drive Integration** - Reads documents from a specified folder
- 🤖 **AI-Powered Answers** - Uses MiniMax AI model for accurate responses
- 👨‍💼 **Admin Controls** - Choose which Google Drive folder to use as knowledge base
- 🔒 **Secure** - Users only see answers from your documents

## Tech Stack

- **Frontend**: Next.js 14 + React + TypeScript
- **Styling**: Tailwind CSS
- **AI**: MiniMax API (same model as Clawdbot)
- **Storage**: Google Drive API
- **Hosting**: Vercel (free tier)

## Quick Start

### 1. Clone and Install

```bash
cd chatbot-project
npm install
```

### 2. Configure Environment

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your API keys.

### 3. Run Locally

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

### 4. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Login and deploy
vercel login
vercel --prod
```

## Setup Instructions

### Google Drive API Setup

1. Go to Google Cloud Console: https://console.cloud.google.com
2. Create a new project
3. Enable Google Drive API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
6. Copy Client ID and Secret to `.env.local`

### MiniMax API

1. Go to: https://api.minimax.io
2. Get your API key
3. Add to `.env.local`

### Admin Setup

1. Create a Google Drive folder
2. Add your documents (PDF, DOCX, XLSX, TXT, etc.)
3. Copy the folder ID from the URL
4. Add to `.env.local` as `KNOWLEDGE_BASE_FOLDER_ID`

## Project Structure

```
chatbot-project/
├── app/
│   ├── api/
│   │   └── chat/route.ts    # Chat API endpoint
│   ├── globals.css          # Global styles
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Chat interface
├── .env.example             # Environment template
├── next.config.js           # Next.js config
├── package.json             # Dependencies
└── tsconfig.json            # TypeScript config
```

## How It Works

1. **Admin** selects a Google Drive folder as the knowledge base
2. **System** reads and indexes all documents in the folder
3. **User** asks a question
4. **AI** searches relevant documents
5. **Response** is generated based ONLY on your documents

## Document Types Supported

- 📄 PDF
- 📝 Word (DOCX)
- 📊 Excel (XLSX)
- 📋 CSV
- 📃 Text files (TXT)
- and more...

## Free Tier Limits

| Service | Free Limit |
|---------|-----------|
| Vercel | 100 GB bandwidth/month |
| Google Drive | 15 GB storage |
| MiniMax | Per your plan |

## Next Steps

1. ✅ Set up Google Cloud Console project
2. ✅ Enable Google Drive API
3. ✅ Get MiniMax API key
4. ⬜ Create Google Drive folder with documents
5. ⬜ Configure environment variables
6. ⬜ Test locally
7. ⬜ Deploy to Vercel

## Support

Need help? Contact me!

---

Built with ❤️ using Next.js, Tailwind CSS, and MiniMax AI
