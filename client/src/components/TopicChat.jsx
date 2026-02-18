import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../utils/api'
import './TopicChat.css'

function TopicChat({ jobDescription, companyName, roleTitle, techStack, jobDescriptionHash, sessionId, onXpGained, studyTopics }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [topic, setTopic] = useState('')
  const [customTopic, setCustomTopic] = useState('')
  const [started, setStarted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sessionXp, setSessionXp] = useState(0)
  const [exchangeCount, setExchangeCount] = useState(0)
  const [showEndSummary, setShowEndSummary] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (started && inputRef.current) {
      inputRef.current.focus()
    }
  }, [started, loading])

  const availableTopics = studyTopics || []

  const getSelectedTopic = () => {
    if (topic === '_custom') return customTopic.trim()
    return topic
  }

  const handleStart = async () => {
    const selectedTopic = getSelectedTopic()
    if (!selectedTopic) return

    setStarted(true)
    setLoading(true)
    setMessages([])

    try {
      const res = await api.chat.practice({
        jobDescriptionHash,
        topic: selectedTopic,
        messages: [],
        companyName,
        roleTitle,
        sessionId,
      })

      setMessages([
        { role: 'interviewer', content: res.data.reply }
      ])
      if (res.data.xpEarned) {
        setSessionXp(prev => prev + res.data.xpEarned)
        if (onXpGained) onXpGained({ xpEarned: res.data.xpEarned })
      }
    } catch (err) {
      setMessages([
        { role: 'interviewer', content: `Let's discuss **${selectedTopic}**. Tell me about your understanding of this topic and how it relates to the ${roleTitle || 'role'} at ${companyName || 'the company'}.` }
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return

    const selectedTopic = getSelectedTopic()
    const updatedMessages = [...messages, { role: 'candidate', content: text }]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)
    setExchangeCount(prev => prev + 1)

    try {
      const res = await api.chat.practice({
        jobDescriptionHash,
        topic: selectedTopic,
        messages: updatedMessages,
        companyName,
        roleTitle,
        sessionId,
      })

      const interviewerMsg = { role: 'interviewer', content: res.data.reply }
      if (res.data.evaluation) {
        interviewerMsg.evaluation = res.data.evaluation
      }
      setMessages(prev => [...prev, interviewerMsg])

      if (res.data.xpEarned) {
        setSessionXp(prev => prev + res.data.xpEarned)
        if (onXpGained) onXpGained({ xpEarned: res.data.xpEarned })
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to get response. Please try again.'
      setMessages(prev => [...prev, {
        role: 'system',
        content: errorMsg
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleEndChat = () => {
    setShowEndSummary(true)
  }

  const handleNewChat = () => {
    setMessages([])
    setStarted(false)
    setShowEndSummary(false)
    setInput('')
    setExchangeCount(0)
    setSessionXp(0)
    setTopic('')
    setCustomTopic('')
  }

  // Topic selection screen
  if (!started) {
    return (
      <div className="topic-chat-setup">
        <div className="chat-setup-header">
          <h3>Chat Practice</h3>
          <p className="chat-setup-desc">
            Have a conversational interview practice session. Pick a topic and dive deep with an AI interviewer who knows about {companyName || 'the company'} and the {roleTitle || 'role'}.
          </p>
        </div>

        <div className="chat-topic-selector">
          <label className="chat-topic-label">Choose a topic</label>
          {availableTopics.length > 0 ? (
            <div className="chat-topic-grid">
              {availableTopics.map((t, idx) => {
                const topicName = typeof t === 'string' ? t : t.topic || t.name || ''
                return (
                  <button
                    key={idx}
                    className={`chat-topic-chip ${topic === topicName ? 'active' : ''}`}
                    onClick={() => { setTopic(topicName); setCustomTopic('') }}
                  >
                    {topicName}
                  </button>
                )
              })}
              <button
                className={`chat-topic-chip custom-chip ${topic === '_custom' ? 'active' : ''}`}
                onClick={() => setTopic('_custom')}
              >
                Custom Topic...
              </button>
            </div>
          ) : (
            <div className="chat-topic-custom-only">
              <input
                type="text"
                className="chat-custom-input"
                placeholder="Type a topic (e.g., System Design, React Performance, SQL Joins)..."
                value={customTopic}
                onChange={(e) => { setCustomTopic(e.target.value); setTopic('_custom') }}
              />
            </div>
          )}

          {topic === '_custom' && availableTopics.length > 0 && (
            <input
              type="text"
              className="chat-custom-input"
              placeholder="Type your custom topic..."
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              autoFocus
            />
          )}
        </div>

        <button
          className="chat-start-btn"
          onClick={handleStart}
          disabled={!getSelectedTopic()}
        >
          Start Chat Practice
        </button>

        <div className="chat-setup-note">
          <span>1 credit per exchange</span>
          <span>&middot;</span>
          <span>Context-aware responses based on your job posting</span>
        </div>
      </div>
    )
  }

  // End summary
  if (showEndSummary) {
    return (
      <div className="topic-chat-summary">
        <div className="chat-summary-header">
          <h3>Chat Session Complete</h3>
          <p>Topic: {getSelectedTopic()}</p>
        </div>
        <div className="chat-summary-stats">
          <div className="chat-summary-stat">
            <span className="chat-stat-value">{exchangeCount}</span>
            <span className="chat-stat-label">Exchanges</span>
          </div>
          <div className="chat-summary-stat">
            <span className="chat-stat-value xp-value">+{sessionXp}</span>
            <span className="chat-stat-label">XP Earned</span>
          </div>
        </div>
        <div className="chat-summary-actions">
          <button className="chat-new-btn" onClick={handleNewChat}>
            New Topic
          </button>
        </div>
      </div>
    )
  }

  // Chat interface
  return (
    <div className="topic-chat-container">
      <div className="chat-header-bar">
        <div className="chat-header-info">
          <span className="chat-topic-badge">{getSelectedTopic()}</span>
          <span className="chat-exchange-count">{exchangeCount} exchanges</span>
        </div>
        <div className="chat-header-actions">
          {sessionXp > 0 && (
            <span className="chat-xp-counter">+{sessionXp} XP</span>
          )}
          <button className="chat-end-btn" onClick={handleEndChat}>
            End Chat
          </button>
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`chat-message ${msg.role}`}>
            <div className="chat-message-avatar">
              {msg.role === 'interviewer' ? '🎯' : msg.role === 'candidate' ? '👤' : '⚠️'}
            </div>
            <div className="chat-message-content">
              <div className="chat-message-role">
                {msg.role === 'interviewer' ? 'Interviewer' : msg.role === 'candidate' ? 'You' : 'System'}
              </div>
              <div className="chat-message-text">{msg.content}</div>
              {msg.evaluation && (
                <div className="chat-evaluation">
                  <div className="chat-eval-score">
                    Score: <strong>{msg.evaluation.score}/100</strong>
                  </div>
                  {msg.evaluation.feedback && (
                    <div className="chat-eval-feedback">{msg.evaluation.feedback}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat-message interviewer">
            <div className="chat-message-avatar">🎯</div>
            <div className="chat-message-content">
              <div className="chat-typing-indicator">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-bar">
        <textarea
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your answer..."
          rows={2}
          disabled={loading}
        />
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={!input.trim() || loading}
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

export default TopicChat
