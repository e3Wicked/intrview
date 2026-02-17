# intrview.io

A minimal web application that generates personalized study plans and interview questions from job description URLs using OpenAI.

## Features

- 🎯 Paste a job description URL
- 📝 Automatically scrapes and extracts job description content
- 🤖 Uses OpenAI to generate:
  - Structured study plans organized by topics
  - Interview questions organized by interview stages
  - Up-to-date information and best practices
- 🎨 Clean, minimal UI design

## Setup

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- OpenAI API key

### Installation

1. Clone or navigate to this repository

2. Install all dependencies:
```bash
npm run install-all
```

3. Set up environment variables:
   - Copy `server/.env.example` to `server/.env` (if it exists) or create `server/.env`
   - Add your OpenAI API key:
```
OPENAI_API_KEY=your_openai_api_key_here
PORT=5000
```

### Running the Application

1. Build the frontend and start the server:
```bash
npm start
```

This will:
- Build the React frontend
- Start the server on `http://localhost:5000`

2. Open your browser and navigate to `http://localhost:5000`

The landing page will be at the root URL where you can paste the job description URL.

**Note:** If you need to rebuild after making frontend changes:
```bash
npm run build
npm run server
```

## Usage

1. Paste a job description URL in the input field
2. Click "Generate Study Plan"
3. Wait for the analysis (this may take 30-60 seconds)
4. Review your personalized study plan and interview questions

## Project Structure

```
InterviewPrepper/
├── client/          # React frontend
│   ├── src/
│   └── package.json
├── server/          # Express backend
│   ├── index.js
│   └── package.json
└── package.json     # Root package.json with scripts
```

## Technologies

- **Frontend**: React, Vite
- **Backend**: Node.js, Express
- **Web Scraping**: Cheerio, Axios
- **AI**: OpenAI API (GPT-4)

## Notes

- The web scraper attempts to find job description content using common HTML selectors
- If the scraper can't find specific content, it will extract text from the main body
- The OpenAI API uses GPT-4 Turbo for generating study plans and questions
- Make sure you have sufficient OpenAI API credits

## Troubleshooting

- **"OpenAI API key not configured"**: Make sure you've created `server/.env` with your API key
- **"Could not extract meaningful content"**: The URL might not be accessible or doesn't contain enough text
- **CORS errors**: Make sure the backend server is running on port 5000

