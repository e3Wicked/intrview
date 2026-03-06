import './MockInterviewPage.css'

function MockInterviewPage() {
  return (
    <div className="mock-interview-page">
      <div className="mock-interview-card">
        <div className="mock-interview-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
        <h1>Mock Interview</h1>
        <p className="mock-interview-desc">
          Practice with AI-powered voice interviews. Get real-time feedback on your answers,
          tone, and delivery.
        </p>
        <div className="mock-interview-badge">Coming Soon</div>
        <p className="mock-interview-sub">
          Voice-based interview simulation powered by ElevenLabs is being developed.
          In the meantime, use <strong>Chat</strong> or <strong>Drills</strong> to sharpen your skills.
        </p>
      </div>
    </div>
  )
}

export default MockInterviewPage
