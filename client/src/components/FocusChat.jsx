import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../utils/api'
import './FocusChat.css'

function FocusChat({ skill, user, difficulty, onDifficultyChange }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('from') || '/dashboard'

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [scores, setScores] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [showEndSummary, setShowEndSummary] = useState(false)
  const [error, setError] = useState(null)

  // Structured drill state
  const [drillSessionId, setDrillSessionId] = useState(null)
  const [questionNumber, setQuestionNumber] = useState(0)
  const [questionCount, setQuestionCount] = useState(5)
  const [previousQuestions, setPreviousQuestions] = useState([])
  const [drillComplete, setDrillComplete] = useState(false)

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const abortRef = useRef(null)
  const startedRef = useRef(false)
  const sessionIdRef = useRef(null)
  const messagesRef = useRef([])
  const scoresRef = useRef([])
  const drillSessionIdRef = useRef(null)
  const questionNumberRef = useRef(0)
  const previousQuestionsRef = useRef([])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  useEffect(() => {
    if (!streaming && inputRef.current) inputRef.current.focus()
  }, [streaming])

  // Keep refs in sync
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { scoresRef.current = scores }, [scores])
  useEffect(() => { drillSessionIdRef.current = drillSessionId }, [drillSessionId])
  useEffect(() => { questionNumberRef.current = questionNumber }, [questionNumber])
  useEffect(() => { previousQuestionsRef.current = previousQuestions }, [previousQuestions])

  // Start session on mount
  useEffect(() => {
    if (!skill || startedRef.current) return
    startedRef.current = true

    const init = async () => {
      try {
        const { data } = await api.drills.start({ skill, difficulty, questionCount: 5 })
        setDrillSessionId(data.session.id)
        drillSessionIdRef.current = data.session.id
        setQuestionCount(data.session.question_count || 5)
        setPreviousQuestions(data.previousQuestions || [])
        previousQuestionsRef.current = data.previousQuestions || []

        // If resuming an active session with questions already answered
        if (data.session.questions_answered > 0) {
          setQuestionNumber(data.session.questions_answered)
          questionNumberRef.current = data.session.questions_answered
        }

        // Also start a practice session for credit tracking
        try {
          const res = await api.practice.startSession({ jobDescriptionHash: '', mode: 'focus' })
          setSessionId(res.data.sessionId)
          sessionIdRef.current = res.data.sessionId
        } catch (e) { /* non-critical */ }
      } catch (e) {
        console.error('Failed to start drill:', e)
      }
      doSendMessage(null)
    }
    init()
  }, [skill])

  const doSendMessage = async (userText) => {
    const currentMessages = messagesRef.current
    const updatedMessages = userText
      ? [...currentMessages, { role: 'user', content: userText }]
      : [...currentMessages]

    if (userText) {
      setMessages(updatedMessages)
      messagesRef.current = updatedMessages
      setInput('')
    }

    setStreaming(true)
    setError(null)

    const withCoach = [...updatedMessages, { role: 'coach', content: '' }]
    setMessages(withCoach)
    messagesRef.current = withCoach

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const token = localStorage.getItem('session_token')
      const response = await fetch('/api/chat/focus', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          skill,
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
          sessionId: sessionIdRef.current,
          difficulty,
          drillSessionId: drillSessionIdRef.current,
          questionNumber: questionNumberRef.current,
          questionCount,
          previousQuestions: previousQuestionsRef.current,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Request failed' }))
        if (response.status === 402) {
          setError('No training credits remaining. Upgrade your plan to continue.')
        } else {
          setError(err.error || 'Request failed')
        }
        setMessages(updatedMessages)
        messagesRef.current = updatedMessages
        setStreaming(false)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6)
          if (!jsonStr) continue

          let event
          try { event = JSON.parse(jsonStr) } catch { continue }

          if (event.type === 'token') {
            setMessages(prev => {
              const updated = [...prev]
              const last = updated[updated.length - 1]
              updated[updated.length - 1] = { ...last, content: last.content + event.content }
              messagesRef.current = updated
              return updated
            })
          } else if (event.type === 'done') {
            if (event.evaluation) {
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  evaluation: event.evaluation
                }
                messagesRef.current = updated
                return updated
              })
              if (typeof event.evaluation.score === 'number') {
                setScores(prev => [...prev, event.evaluation.score])
              }
            }
            // Handle drill progress
            if (event.drillProgress) {
              setQuestionNumber(event.drillProgress.current)
              questionNumberRef.current = event.drillProgress.current
              if (event.drillProgress.isComplete) {
                setDrillComplete(true)
              }
            }
          } else if (event.type === 'error') {
            setMessages(prev => {
              const updated = [...prev]
              updated[updated.length - 1] = { role: 'system', content: event.error }
              messagesRef.current = updated
              return updated
            })
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      setMessages(prev => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?.role === 'coach' && !last.content) {
          updated[updated.length - 1] = { role: 'system', content: err.message || 'Connection failed' }
        } else {
          updated.push({ role: 'system', content: err.message || 'Connection failed' })
        }
        messagesRef.current = updated
        return updated
      })
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text || streaming || drillComplete) return
    doSendMessage(text)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleEndChat = () => {
    if (abortRef.current) abortRef.current.abort()
    if (sessionIdRef.current) {
      api.practice.endSession({ sessionId: sessionIdRef.current }).catch(() => {})
    }
    if (drillSessionIdRef.current && !drillComplete) {
      api.drills.abandon({ sessionId: drillSessionIdRef.current }).catch(() => {})
    }
    setShowEndSummary(true)
  }

  const goBack = () => {
    if (abortRef.current) abortRef.current.abort()
    navigate(returnTo)
  }

  // Auto-show summary when drill completes
  useEffect(() => {
    if (drillComplete && !streaming) {
      const timer = setTimeout(() => setShowEndSummary(true), 1500)
      return () => clearTimeout(timer)
    }
  }, [drillComplete, streaming])

  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null

  if (showEndSummary) {
    return (
      <div className="focus-chat-summary">
        <div className="focus-summary-header">
          <h3>{drillComplete ? 'Drill Complete!' : 'Session Ended'}</h3>
          <p>{skill}</p>
        </div>
        <div className="focus-summary-stats">
          <div className="focus-summary-stat">
            <span className="focus-stat-value">{questionNumber}</span>
            <span className="focus-stat-label">
              {drillComplete ? `of ${questionCount} Questions` : `of ${questionCount} Answered`}
            </span>
          </div>
          {avgScore !== null && (
            <div className="focus-summary-stat">
              <span className={`focus-stat-value ${avgScore >= 70 ? 'score-good' : avgScore >= 40 ? 'score-mid' : 'score-low'}`}>
                {avgScore}%
              </span>
              <span className="focus-stat-label">Avg Score</span>
            </div>
          )}
        </div>
        {scores.length > 0 && (
          <div className="focus-summary-breakdown">
            <h4>Score Breakdown</h4>
            <div className="focus-summary-scores">
              {scores.map((s, i) => (
                <div key={i} className="focus-score-dot-row">
                  <span className="focus-score-dot-label">Q{i + 1}</span>
                  <div className="focus-score-dot-bar">
                    <div
                      className={`focus-score-dot-fill ${s >= 70 ? 'high' : s >= 40 ? 'mid' : 'low'}`}
                      style={{ width: `${Math.min(100, s)}%` }}
                    />
                  </div>
                  <span className="focus-score-dot-value">{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="focus-summary-actions">
          <button className="focus-back-btn" onClick={() => navigate(returnTo)}>
            Back to {returnTo === '/study/drills' ? 'Drills' : 'Dashboard'}
          </button>
          <button className="focus-restart-btn" onClick={() => {
            setMessages([])
            messagesRef.current = []
            setQuestionNumber(0)
            questionNumberRef.current = 0
            setScores([])
            scoresRef.current = []
            setDrillComplete(false)
            setDrillSessionId(null)
            drillSessionIdRef.current = null
            setShowEndSummary(false)
            startedRef.current = false
          }}>
            Practice Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="focus-chat-container">
      {/* Header */}
      <div className="focus-header">
        <div className="focus-header-left">
          <button className="focus-nav-back" onClick={goBack} title="Back (progress saved)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span className="focus-skill-badge">{skill}</span>
          {difficulty && (
            <button
              className={`focus-difficulty-badge clickable ${difficulty}`}
              onClick={onDifficultyChange}
              title="Change difficulty"
            >
              {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
              <svg className="focus-difficulty-edit-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
              </svg>
            </button>
          )}
          <span className="focus-exchange-count">
            Question {Math.min(questionNumber + (streaming ? 1 : 0), questionCount)} of {questionCount}
            {avgScore !== null && <> &middot; avg {avgScore}%</>}
          </span>
        </div>
        <div className="focus-header-right">
          <button className="focus-end-btn" onClick={handleEndChat}>
            {drillComplete ? 'View Summary' : 'End Early'}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="drill-progress-bar">
        <div className="drill-progress-fill" style={{ width: `${(questionNumber / questionCount) * 100}%` }} />
      </div>

      {/* Messages */}
      <div className="focus-messages">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`focus-message ${msg.role}${streaming && idx === messages.length - 1 && msg.role === 'coach' ? ' streaming' : ''}`}
          >
            <div className="focus-message-avatar">
              {msg.role === 'coach' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 16v-4M12 8h.01"/>
                </svg>
              ) : msg.role === 'user' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="15" y1="9" x2="9" y2="15"/>
                  <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
              )}
            </div>
            <div className="focus-message-content">
              <div className="focus-message-role">
                {msg.role === 'coach' ? 'Coach' : msg.role === 'user' ? 'You' : 'System'}
              </div>
              <div className="focus-message-text">
                {msg.role === 'coach' && !msg.content && streaming && idx === messages.length - 1
                  ? <span className="focus-typing-dots"><span/><span/><span/></span>
                  : msg.content}
              </div>
              {msg.evaluation && (
                <div className="focus-evaluation">
                  <span className={`focus-eval-badge ${msg.evaluation.score >= 70 ? 'good' : msg.evaluation.score >= 40 ? 'mid' : 'low'}`}>
                    {msg.evaluation.score}/100
                  </span>
                  {msg.evaluation.feedback && (
                    <span className="focus-eval-feedback">{msg.evaluation.feedback}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Drill complete banner */}
      {drillComplete && !showEndSummary && (
        <div className="focus-complete-banner">
          All {questionCount} questions answered! Showing summary...
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="focus-error-banner">
          {error}
          {messages.length === 0 && (
            <button className="focus-retry-btn" onClick={() => { setError(null); startedRef.current = true; doSendMessage(null) }}>
              Retry
            </button>
          )}
        </div>
      )}

      {/* Input */}
      <div className="focus-input-bar">
        <textarea
          ref={inputRef}
          className="focus-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={drillComplete ? 'Drill complete!' : 'Type your answer...'}
          rows={2}
          disabled={streaming || drillComplete}
        />
        <button
          className="focus-send-btn"
          onClick={handleSend}
          disabled={!input.trim() || streaming || drillComplete}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default FocusChat
