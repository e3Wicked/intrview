import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../utils/api'
import { useGamification } from '../contexts/GamificationContext'
import './FocusChat.css'

function FocusChat({ skill, user }) {
  const navigate = useNavigate()
  const { refreshStats } = useGamification()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [sessionXp, setSessionXp] = useState(0)
  const [exchangeCount, setExchangeCount] = useState(0)
  const [sessionId, setSessionId] = useState(null)
  const [showEndSummary, setShowEndSummary] = useState(false)
  const [error, setError] = useState(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const abortRef = useRef(null)
  const startedRef = useRef(false)

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

  // Start session and first message on mount
  useEffect(() => {
    if (!skill || startedRef.current) return
    startedRef.current = true

    const init = async () => {
      // Start practice session
      try {
        const res = await api.practice.startSession({ jobDescriptionHash: '', mode: 'focus' })
        setSessionId(res.data.sessionId)
      } catch (e) {
        // Non-critical — session tracking may fail
      }

      // Send first message (empty history triggers diagnostic question)
      sendMessage(null)
    }
    init()

    return () => {
      // End session on unmount
      if (sessionId) {
        api.practice.endSession({ sessionId }).catch(() => {})
      }
    }
  }, [skill])

  const sendMessage = async (userText) => {
    const updatedMessages = userText
      ? [...messages, { role: 'user', content: userText }]
      : [...messages]

    if (userText) {
      setMessages(updatedMessages)
      setInput('')
      setExchangeCount(prev => prev + 1)
    }

    setStreaming(true)
    setError(null)

    // Add empty coach message to be filled by tokens
    setMessages(prev => [...prev, { role: 'coach', content: '' }])

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
          sessionId,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Request failed' }))
        if (response.status === 402) {
          setError('No credits remaining. Upgrade your plan to continue.')
        } else {
          setError(err.error || 'Request failed')
        }
        // Remove the empty coach message
        setMessages(prev => prev.slice(0, -1))
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
                return updated
              })
            }
            if (event.xpEarned) {
              setSessionXp(prev => prev + event.xpEarned)
              refreshStats()
            }
          } else if (event.type === 'error') {
            setMessages(prev => {
              const updated = [...prev]
              updated[updated.length - 1] = { role: 'system', content: event.error }
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
    sendMessage(text)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleEndChat = () => {
    if (abortRef.current) abortRef.current.abort()
    if (sessionId) {
      api.practice.endSession({ sessionId }).catch(() => {})
    }
    setShowEndSummary(true)
  }

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
            <span className="focus-stat-label">Exchanges</span>
          </div>
          <div className="focus-summary-stat">
            <span className="focus-stat-value xp-value">+{sessionXp}</span>
            <span className="focus-stat-label">XP Earned</span>
          </div>
        </div>
        <div className="focus-summary-actions">
          <button className="focus-back-btn" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </button>
          <button className="focus-restart-btn" onClick={() => {
            setMessages([])
            setExchangeCount(0)
            setSessionXp(0)
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
          <button className="focus-nav-back" onClick={() => navigate('/dashboard')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span className="focus-skill-badge">{skill}</span>
          <span className="focus-exchange-count">{exchangeCount} exchanges</span>
        </div>
        <div className="focus-header-right">
          {sessionXp > 0 && (
            <span className="focus-xp-counter">+{sessionXp} XP</span>
          )}
          <button className="focus-end-btn" onClick={handleEndChat}>
            End Chat
          </button>
        </div>
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
              <div className="focus-message-text">{msg.content}</div>
              {msg.evaluation && (
                <div className="focus-evaluation">
                  <span className="focus-eval-score">
                    Score: <strong>{msg.evaluation.score}/100</strong>
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
