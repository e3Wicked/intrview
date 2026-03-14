import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import './MockInterviewHistory.css'

function MockInterviewHistory({ onViewSession, onNewInterview }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    try {
      const res = await api.mockInterview.history()
      // API returns array directly or { sessions: [...] }
      const data = Array.isArray(res.data) ? res.data : (res.data.sessions || [])
      setSessions(data)
    } catch (err) {
      console.error('Failed to load interview history:', err)
      setError('Failed to load interview history.')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '--'
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatRoundType = (type) => {
    const labels = {
      'comprehensive': 'Comprehensive',
      'phone-screen': 'Phone Screen',
      'role-specific': 'Role-Specific',
      'situational': 'Situational',
      'behavioral': 'Behavioral',
    }
    return labels[type] || type
  }

  const scoreClass = (score) => {
    if (score >= 80) return 'high'
    if (score >= 60) return 'mid'
    return 'low'
  }

  if (loading) {
    return <div className="mock-history-loading">Loading interview history...</div>
  }

  if (error) {
    return <div className="mock-history-error">{error}</div>
  }

  if (sessions.length === 0) {
    return (
      <div className="mock-history-empty">
        <div className="mock-history-empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
        <h3>No interviews yet</h3>
        <p>Start your first mock interview to see your history here.</p>
        <button className="mock-history-start-btn" onClick={onNewInterview}>
          Start First Interview
        </button>
      </div>
    )
  }

  return (
    <div className="mock-history">
      <div className="dash-card mock-history-card">
        <div className="mock-history-list-header">
          <span>Date</span>
          <span>Position</span>
          <span>Round</span>
          <span>Score</span>
        </div>
        {sessions.map((session) => (
          <button
            key={session.id}
            className="mock-history-row"
            onClick={() => onViewSession(session.id)}
          >
            <span className="mock-history-date">{formatDate(session.started_at || session.created_at)}</span>
            <span className="mock-history-job">
              <span className="mock-history-job-title">
                {session.job_title || 'Untitled'}
              </span>
              {session.company_name && (
                <span className="mock-history-company">{session.company_name}</span>
              )}
            </span>
            <span className="mock-history-round">{formatRoundType(session.round_type)}</span>
            <span className={`mock-history-score ${scoreClass(session.overall_score)}`}>
              {session.overall_score != null ? session.overall_score : '--'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default MockInterviewHistory
