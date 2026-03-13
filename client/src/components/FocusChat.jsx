import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../utils/api'
import './FocusChat.css'

const STORAGE_KEY = (skill) => `focus_chat_${skill}`

function loadSavedSession(skill) {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY(skill))
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

function saveChatSession(skill, data) {
  try {
    sessionStorage.setItem(STORAGE_KEY(skill), JSON.stringify(data))
  } catch { /* storage full, non-critical */ }
}

function clearChatSession(skill) {
  try { sessionStorage.removeItem(STORAGE_KEY(skill)) } catch {}
}

function saveCompletedSession(skill, { exchangeCount, scores }) {
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null
  // Save to DB (primary)
  api.drills.saveDrillSession({
    skill,
    answers: exchangeCount,
    avgScore,
    scores,
  }).catch(err => console.error('[Drill] Failed to save session to DB:', err))
}

function FocusChat({ skill, user }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('from') || '/dashboard'
  // Try to restore a saved session for this skill
  const saved = useRef(loadSavedSession(skill))

  const [messages, setMessages] = useState(saved.current?.messages || [])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [exchangeCount, setExchangeCount] = useState(saved.current?.exchangeCount || 0)
  const [scores, setScores] = useState(saved.current?.scores || [])
  const [sessionId, setSessionId] = useState(saved.current?.sessionId || null)
  const [showEndSummary, setShowEndSummary] = useState(false)
  const [error, setError] = useState(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const abortRef = useRef(null)
  const startedRef = useRef(!!saved.current)
  const sessionIdRef = useRef(saved.current?.sessionId || null)
  const messagesRef = useRef(saved.current?.messages || [])
  const scoresRef = useRef(saved.current?.scores || [])
  const exchangeCountRef = useRef(saved.current?.exchangeCount || 0)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (!streaming && inputRef.current) {
      inputRef.current.focus()
    }
  }, [streaming])

  // Keep refs in sync with state
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { scoresRef.current = scores }, [scores])
  useEffect(() => { exchangeCountRef.current = exchangeCount }, [exchangeCount])

  // Save chat state to sessionStorage whenever it changes
  useEffect(() => {
    if (messages.length > 0 && !showEndSummary) {
      saveChatSession(skill, {
        messages: messages.filter(m => m.content), // skip empty streaming messages
        exchangeCount,
        scores,
        sessionId: sessionIdRef.current,
      })
    }
  }, [messages, exchangeCount, scores, skill, showEndSummary])

  // Start session and first message on mount (only if no saved session)
  useEffect(() => {
    if (!skill || startedRef.current) return
    startedRef.current = true

    const init = async () => {
      try {
        const res = await api.practice.startSession({ jobDescriptionHash: '', mode: 'focus' })
        setSessionId(res.data.sessionId)
        sessionIdRef.current = res.data.sessionId
      } catch (e) {
        // Non-critical
      }
      doSendMessage(null)
    }
    init()
  }, [skill])

  // On unmount: DON'T end the session — we're saving state for resume.
  // Session gets ended explicitly via "End Session" button.

  const doSendMessage = async (userText) => {
    const currentMessages = messagesRef.current
    const updatedMessages = userText
      ? [...currentMessages, { role: 'user', content: userText }]
      : [...currentMessages]

    if (userText) {
      setMessages(updatedMessages)
      messagesRef.current = updatedMessages
      setInput('')
      setExchangeCount(prev => prev + 1)
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
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Request failed' }))
        if (response.status === 402) {
          if (errData.downgraded) {
            setError('Your plan was downgraded due to a payment issue. Please update your payment or choose a new plan.');
          } else {
            setError(`Not enough training credits (need ${errData.required || '?'}, have ${errData.remaining || 0}). Upgrade your plan to continue.`);
          }
        } else {
          setError(errData.error || 'Request failed')
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
    if (!text || streaming) return
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
    // Use refs to ensure we get the latest values (not stale closure)
    saveCompletedSession(skill, {
      exchangeCount: exchangeCountRef.current,
      scores: scoresRef.current,
    })
    clearChatSession(skill)
    setShowEndSummary(true)
  }

  const goBack = () => {
    // Save is automatic via the useEffect — just navigate away
    if (abortRef.current) abortRef.current.abort()
    navigate(returnTo)
  }

  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null

  if (showEndSummary) {
    return (
      <div className="focus-chat-summary">
        <div className="focus-summary-header">
          <h3>Session Complete</h3>
          <p>{skill}</p>
        </div>
        <div className="focus-summary-stats">
          <div className="focus-summary-stat">
            <span className="focus-stat-value">{exchangeCount}</span>
            <span className="focus-stat-label">Questions Answered</span>
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
            setExchangeCount(0)
            setScores([])
            setShowEndSummary(false)
            startedRef.current = false
          }}>
            Practice Again
          </button>
        </div>
      </div>
    )
  }

  const isResumed = saved.current && messages.length > 0

  return (
    <div className="focus-chat-container">
      {/* Header */}
      <div className="focus-header">
        <div className="focus-header-left">
          <button className="focus-nav-back" onClick={goBack} title="Back (session saved)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span className="focus-skill-badge">{skill}</span>
          <span className="focus-exchange-count">
            {exchangeCount} {exchangeCount === 1 ? 'answer' : 'answers'}
            {avgScore !== null && <> &middot; avg {avgScore}%</>}
          </span>
        </div>
        <div className="focus-header-right">
          <button className="focus-end-btn" onClick={handleEndChat}>
            End Session
          </button>
        </div>
      </div>

      {/* Resumed banner */}
      {isResumed && (
        <div className="focus-resumed-banner">
          Resumed previous session &middot; {exchangeCount} answers so far
        </div>
      )}

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
              <div className="focus-message-text">{msg.content}</div>
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

      {/* Error banner */}
      {error && (
        <div className="focus-error-banner">{error}</div>
      )}

      {/* Input */}
      <div className="focus-input-bar">
        <textarea
          ref={inputRef}
          className="focus-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your answer..."
          rows={2}
          disabled={streaming}
        />
        <button
          className="focus-send-btn"
          onClick={handleSend}
          disabled={!input.trim() || streaming}
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
