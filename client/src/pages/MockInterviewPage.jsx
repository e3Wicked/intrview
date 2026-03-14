import { useState, useEffect } from 'react'
import axios from 'axios'
import { api } from '../utils/api'
import MockInterviewSetup from '../components/MockInterviewSetup'
import MockInterviewSession from '../components/MockInterviewSession'
import MockInterviewScorecard from '../components/MockInterviewScorecard'
import MockInterviewHistory from '../components/MockInterviewHistory'
import './MockInterviewPage.css'

function MockInterviewPage() {
  const [view, setView] = useState('setup') // setup | interviewing | generating | scorecard | history
  const [user, setUser] = useState(null)
  const [sessionData, setSessionData] = useState(null)
  const [scorecard, setScorecard] = useState(null)
  const [loadingUser, setLoadingUser] = useState(true)

  // Fetch user since App.jsx doesn't pass it as a prop
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await axios.get('/api/auth/me')
        if (res.data.user) {
          setUser(res.data.user)
        }
      } catch (err) {
        console.error('Failed to fetch user:', err)
      } finally {
        setLoadingUser(false)
      }
    }
    fetchUser()
  }, [])

  const handleStart = (data) => {
    setSessionData(data)
    setView('interviewing')
  }

  const handleEndInterview = async (sessionId) => {
    setView('generating')

    try {
      const res = await api.mockInterview.end({ sessionId })
      setScorecard(res.data.scorecard || res.data)
      setView('scorecard')
    } catch (err) {
      console.error('Failed to generate scorecard:', err)
      setScorecard(null)
      setView('scorecard')
    }
  }

  const handleNewInterview = () => {
    setSessionData(null)
    setScorecard(null)
    setView('setup')
  }

  const handleViewHistory = () => {
    setView('history')
  }

  const handleViewSession = async (sessionId) => {
    setView('generating')

    try {
      const res = await api.mockInterview.session(sessionId)
      setScorecard(res.data.scorecard || res.data)
      setView('scorecard')
    } catch (err) {
      console.error('Failed to load session:', err)
      setView('history')
    }
  }

  if (loadingUser) {
    return (
      <div className="mock-interview-page">
        <div className="mock-interview-loading">Loading...</div>
      </div>
    )
  }

  const isSetupOrHistory = view === 'setup' || view === 'history'

  return (
    <div className="mock-interview-page">
      {/* Header */}
      {isSetupOrHistory && (
        <div className="mock-page-header">
          <div className="mock-page-header-text">
            <h1 className="mock-page-title">Mock Interview</h1>
            <p className="mock-page-subtitle">Practice with an AI interviewer tailored to your target role.</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      {isSetupOrHistory && (
        <div className="mock-page-tabs">
          <button
            className={`mock-page-tab ${view === 'setup' ? 'active' : ''}`}
            onClick={() => setView('setup')}
          >
            New Interview
          </button>
          <button
            className={`mock-page-tab ${view === 'history' ? 'active' : ''}`}
            onClick={() => setView('history')}
          >
            Past Interviews
          </button>
        </div>
      )}

      {view === 'setup' && (
        <MockInterviewSetup user={user} onStart={handleStart} />
      )}

      {view === 'interviewing' && sessionData && (
        <MockInterviewSession
          sessionId={sessionData.sessionId}
          questionCount={sessionData.questionCount}
          openingAudioBase64={sessionData.openingAudioBase64}
          openingText={sessionData.openingText}
          firstQuestionText={sessionData.firstQuestionText}
          onEnd={handleEndInterview}
        />
      )}

      {view === 'generating' && (
        <div className="mock-page-generating">
          <div className="mock-page-generating-spinner" />
          <h3>Generating your scorecard...</h3>
          <p>Analyzing your responses and preparing feedback.</p>
        </div>
      )}

      {view === 'scorecard' && (
        <MockInterviewScorecard
          scorecard={scorecard}
          onBack={handleNewInterview}
        />
      )}

      {view === 'history' && (
        <MockInterviewHistory
          onViewSession={handleViewSession}
          onNewInterview={handleNewInterview}
        />
      )}
    </div>
  )
}

export default MockInterviewPage
