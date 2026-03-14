import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Markdown from 'react-markdown'
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

const SENIORITY_OPTIONS = [
  { value: 'intern', label: 'Intern' },
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid' },
  { value: 'senior', label: 'Senior' },
  { value: 'staff', label: 'Staff' },
  { value: 'lead', label: 'Lead+' },
]

function FocusChat({ skill, user, seniorityLevel = 'mid', onSeniorityChange, questionGoal = 10 }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('from') || '/dashboard'
  // Try to restore a saved session for this skill
  const saved = useRef(loadSavedSession(skill))

  const [messages, setMessages] = useState(saved.current?.messages || [])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [exchangeCount, setExchangeCount] = useState(saved.current?.exchangeCount || 0)
  const [sessionId, setSessionId] = useState(saved.current?.sessionId || null)
  const [showEndSummary, setShowEndSummary] = useState(false)
  const [error, setError] = useState(null)
  const [questionTarget, setQuestionTarget] = useState(saved.current?.questionTarget || questionGoal)
  const [autoStopTriggered, setAutoStopTriggered] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const abortRef = useRef(null)
  const startedRef = useRef(!!saved.current)
  const sessionIdRef = useRef(saved.current?.sessionId || null)
  const messagesRef = useRef(saved.current?.messages || [])
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
  useEffect(() => { exchangeCountRef.current = exchangeCount }, [exchangeCount])

  // Save chat state to sessionStorage whenever it changes
  useEffect(() => {
    if (messages.length > 0 && !showEndSummary) {
      saveChatSession(skill, {
        messages: messages.filter(m => m.content),
        exchangeCount,
        sessionId: sessionIdRef.current,
        questionTarget,
      })
    }
  }, [messages, exchangeCount, skill, showEndSummary, questionTarget])

  // Auto-stop when question target reached
  useEffect(() => {
    if (
      questionTarget > 0 &&
      exchangeCount > 0 &&
      exchangeCount >= questionTarget &&
      !autoStopTriggered &&
      !showEndSummary &&
      !streaming
    ) {
      setAutoStopTriggered(true)
      handleEndChat()
    }
  }, [exchangeCount, questionTarget, autoStopTriggered, showEndSummary, streaming])

  const initSession = async () => {
    try {
      const res = await api.practice.startSession({ jobDescriptionHash: '', mode: 'focus', skill })
      setSessionId(res.data.sessionId)
      sessionIdRef.current = res.data.sessionId
    } catch (e) {
      // Non-critical
    }
    doSendMessage(null)
  }

  // Start session and first message on mount
  useEffect(() => {
    if (!skill || startedRef.current) return
    startedRef.current = true
    initSession()
  }, [skill])

  // End session on unmount so it shows in history
  useEffect(() => {
    return () => {
      if (sessionIdRef.current) {
        api.practice.endSession({ sessionId: sessionIdRef.current, questionsAttempted: exchangeCountRef.current || 0 }).catch(() => {})
      }
    }
  }, [])

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
          seniorityLevel,
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
            // Session complete, no scoring in learn mode
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
      api.practice.endSession({ sessionId: sessionIdRef.current, questionsAttempted: exchangeCount }).catch(() => {})
      sessionIdRef.current = null
    }
    clearChatSession(skill)
    setShowEndSummary(true)
  }

  const handleContinueMore = async () => {
    setAutoStopTriggered(false)
    setQuestionTarget(prev => prev + 5)
    setShowEndSummary(false)
    try {
      const res = await api.practice.startSession({ jobDescriptionHash: '', mode: 'focus', skill })
      setSessionId(res.data.sessionId)
      sessionIdRef.current = res.data.sessionId
    } catch (e) { /* non-critical */ }
  }

  const goBack = () => {
    // Save is automatic via the useEffect — just navigate away
    if (abortRef.current) abortRef.current.abort()
    navigate(returnTo)
  }

  if (showEndSummary) {
    return (
      <div className="focus-chat-summary">
        <div className="focus-summary-header">
          <h3>{autoStopTriggered ? `${questionTarget} Questions Done!` : 'Session Complete'}</h3>
          <p>{skill}</p>
        </div>
        <div className="focus-summary-stats">
          <div className="focus-summary-stat">
            <span className="focus-stat-value">{exchangeCount}</span>
            <span className="focus-stat-label">Messages</span>
          </div>
        </div>
        <div className="focus-summary-actions">
          {autoStopTriggered && (
            <button className="focus-continue-btn" onClick={handleContinueMore}>
              Continue +5 more
            </button>
          )}
          <button className="focus-back-btn" onClick={() => navigate(returnTo)}>
            Back to {returnTo === '/study/drills' ? 'Drills' : 'Dashboard'}
          </button>
          <button className="focus-restart-btn" onClick={() => {
            setMessages([])
            messagesRef.current = []
            setExchangeCount(0)
            exchangeCountRef.current = 0
            setShowEndSummary(false)
            setAutoStopTriggered(false)
            setQuestionTarget(questionGoal)
            initSession()
          }}>
            Practice Again
          </button>
        </div>
      </div>
    )
  }

  const isResumed = saved.current && messages.length > 0
  const seniorityLabel = SENIORITY_OPTIONS.find(o => o.value === seniorityLevel)?.label || 'Mid'

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
          <span className="focus-header-tag">{seniorityLabel}</span>
          <span className="focus-exchange-count">
            {exchangeCount}/{questionTarget}
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
              <div className="focus-message-text">
                {msg.role === 'coach' ? <Markdown>{msg.content}</Markdown> : msg.content}
              </div>
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
