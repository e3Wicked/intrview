import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../utils/api'
import './DrillsPage.css'

function timeAgo(dateStr) {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function getSavedSession(topicName) {
  try {
    const raw = sessionStorage.getItem(`focus_chat_${topicName}`)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (data.messages?.length > 0) return data
    return null
  } catch { return null }
}

function DrillsPage({ user }) {
  const navigate = useNavigate()
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [backfilling, setBackfilling] = useState(false)
  const [filter, setFilter] = useState('all')

  const fetchTopics = async () => {
    try {
      let res = await api.topics.getAllTopics()
      let data = res.data || []

      if (data.length === 0) {
        setBackfilling(true)
        try {
          const backfillRes = await api.topics.backfill()
          if (backfillRes.data?.totalTopics > 0) {
            res = await api.topics.getAllTopics()
            data = res.data || []
          }
        } catch (backfillErr) {
          console.error('Backfill failed:', backfillErr)
        }
        setBackfilling(false)
      }

      setTopics(data)
    } catch (err) {
      console.error('Error fetching topics:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) fetchTopics()
    else setLoading(false)
  }, [user])

  const summary = useMemo(() => {
    const total = topics.length
    const practiced = topics.filter(t => Number(t.attempts) > 0)
    const totalAttempts = practiced.reduce((sum, t) => sum + Number(t.attempts), 0)
    const avgScore = practiced.length > 0
      ? Math.round(practiced.reduce((sum, t) => sum + Number(t.score), 0) / practiced.length)
      : 0
    const mastered = topics.filter(t => Number(t.score) >= 80).length
    const notStarted = topics.filter(t => Number(t.attempts) === 0)
    const weakest = practiced.length > 0
      ? practiced.reduce((w, t) => Number(t.score) < Number(w.score) ? t : w, practiced[0])
      : null

    return { total, practiced: practiced.length, totalAttempts, avgScore, mastered, notStarted: notStarted.length, weakest }
  }, [topics])

  const categories = useMemo(() => {
    const cats = new Set()
    topics.forEach(t => { if (t.category) cats.add(t.category) })
    return Array.from(cats).sort()
  }, [topics])

  const filteredTopics = useMemo(() => {
    let filtered
    if (filter === 'all') filtered = topics
    else if (filter === 'not-started') filtered = topics.filter(t => Number(t.attempts) === 0)
    else if (filter === 'in-progress') filtered = topics.filter(t => Number(t.attempts) > 0 && Number(t.score) < 80)
    else if (filter === 'mastered') filtered = topics.filter(t => Number(t.score) >= 80)
    else filtered = topics.filter(t => t.category === filter)

    // Sort: active sessions first, then recently practiced, then by name
    return [...filtered].sort((a, b) => {
      const aActive = getSavedSession(a.topic_name) ? 1 : 0
      const bActive = getSavedSession(b.topic_name) ? 1 : 0
      if (bActive !== aActive) return bActive - aActive
      const aP = a.last_practiced_at ? new Date(a.last_practiced_at).getTime() : 0
      const bP = b.last_practiced_at ? new Date(b.last_practiced_at).getTime() : 0
      if (bP !== aP) return bP - aP
      return (a.topic_name || '').localeCompare(b.topic_name || '')
    })
  }, [topics, filter])

  const handlePractice = (topicName) => {
    navigate(`/focus-chat?skill=${encodeURIComponent(topicName)}&from=/study/drills`)
  }

  if (loading) {
    return (
      <div className="drills-page">
        <div className="drills-loading">
          {backfilling ? 'Extracting topics from your analyzed jobs...' : 'Loading topics...'}
        </div>
      </div>
    )
  }

  return (
    <div className="drills-page">
      <div className="drills-header">
        <h1>Drills</h1>
        <p>Practice questions on specific topics to build mastery.</p>
      </div>

      {topics.length === 0 ? (
        <div className="drills-empty">
          <div className="drills-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
          <h2>No topics yet</h2>
          <p>Analyze a job post from the dashboard to generate topics you can drill on.</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="drills-summary">
            <div className="drills-summary-card">
              <span className="drills-summary-value">{summary.total}</span>
              <span className="drills-summary-label">Total Topics</span>
            </div>
            <div className="drills-summary-card">
              <span className="drills-summary-value">{summary.avgScore}%</span>
              <span className="drills-summary-label">Avg Mastery</span>
            </div>
            <div className="drills-summary-card">
              <span className="drills-summary-value">{summary.totalAttempts}</span>
              <span className="drills-summary-label">Total Drills</span>
            </div>
            <div className="drills-summary-card">
              <span className="drills-summary-value">{summary.mastered}</span>
              <span className="drills-summary-label">Mastered</span>
            </div>
          </div>

          {/* Weakness nudge */}
          {summary.weakest && Number(summary.weakest.score) < 60 && (
            <div className="drills-nudge">
              <div className="drills-nudge-text">
                <span className="drills-nudge-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </span>
                Your weakest topic is <strong>{summary.weakest.topic_name}</strong> ({Math.round(summary.weakest.score)}% mastery)
              </div>
              <button className="drills-nudge-btn" onClick={() => handlePractice(summary.weakest.topic_name)}>
                Practice Now
              </button>
            </div>
          )}

          {/* Filter bar */}
          <div className="drills-filters">
            <button className={`drills-filter ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
              All ({topics.length})
            </button>
            <button className={`drills-filter ${filter === 'not-started' ? 'active' : ''}`} onClick={() => setFilter('not-started')}>
              Not Started ({summary.notStarted})
            </button>
            <button className={`drills-filter ${filter === 'in-progress' ? 'active' : ''}`} onClick={() => setFilter('in-progress')}>
              In Progress ({summary.practiced - summary.mastered})
            </button>
            <button className={`drills-filter ${filter === 'mastered' ? 'active' : ''}`} onClick={() => setFilter('mastered')}>
              Mastered ({summary.mastered})
            </button>
            {categories.length > 1 && (
              <span className="drills-filter-divider" />
            )}
            {categories.length > 1 && categories.map(cat => (
              <button
                key={cat}
                className={`drills-filter ${filter === cat ? 'active' : ''}`}
                onClick={() => setFilter(cat)}
              >
                {cat.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Topic list */}
          <div className="drills-list">
            <div className="drills-list-header">
              <span className="drills-col-name">Topic</span>
              <span className="drills-col-stat">Mastery</span>
              <span className="drills-col-drills">Drills</span>
              <span className="drills-col-last">Status</span>
              <span className="drills-col-action" />
            </div>
            {filteredTopics.map(topic => {
              const score = Math.round(Number(topic.score))
              const attempts = Number(topic.attempts)
              const isMastered = score >= 80
              const lastPracticed = timeAgo(topic.last_practiced_at)
              const session = getSavedSession(topic.topic_name)
              const sessionAvg = session?.scores?.length > 0
                ? Math.round(session.scores.reduce((a, b) => a + b, 0) / session.scores.length)
                : null

              return (
                <div
                  key={topic.id}
                  className={`drills-list-row ${isMastered ? 'mastered' : ''} ${session ? 'has-session' : ''}`}
                  onClick={() => handlePractice(topic.topic_name)}
                >
                  <div className="drills-col-name">
                    <div className="drills-row-name-line">
                      {session && <span className="drills-active-dot" title="Active session" />}
                      <span className="drills-row-name">{topic.topic_name}</span>
                    </div>
                    {topic.category && (
                      <span className="drills-row-category">{topic.category.replace('_', ' ')}</span>
                    )}
                    {session && (
                      <span className="drills-session-info">
                        {session.exchangeCount} {session.exchangeCount === 1 ? 'answer' : 'answers'}
                        {sessionAvg !== null && (
                          <> &middot; avg <strong className={sessionAvg >= 70 ? 'score-good' : sessionAvg >= 40 ? 'score-mid' : 'score-low'}>{sessionAvg}%</strong></>
                        )}
                        {session.sessionXp > 0 && (
                          <> &middot; +{session.sessionXp} XP</>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="drills-col-stat">
                    <div className="drills-row-bar">
                      <div
                        className={`drills-row-bar-fill ${score >= 80 ? 'high' : score >= 40 ? 'mid' : 'low'}`}
                        style={{ width: `${Math.min(100, Math.max(attempts > 0 ? 3 : 0, score))}%` }}
                      />
                    </div>
                    <span className="drills-row-score">{attempts > 0 ? `${score}%` : '--'}</span>
                  </div>
                  <div className="drills-col-drills">
                    <span className="drills-row-value">{attempts > 0 ? attempts : '--'}</span>
                  </div>
                  <div className="drills-col-last">
                    {session ? (
                      <span className="drills-row-active-tag">In progress</span>
                    ) : (
                      <span className={`drills-row-last ${lastPracticed ? 'has-date' : ''}`}>
                        {lastPracticed || 'Not started'}
                      </span>
                    )}
                  </div>
                  <div className="drills-col-action">
                    <button
                      className={`drills-practice-btn ${session ? 'resume' : attempts > 0 ? 'continue' : ''}`}
                      onClick={(e) => { e.stopPropagation(); handlePractice(topic.topic_name) }}
                    >
                      {session ? 'Resume' : attempts > 0 ? 'Continue' : 'Start'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {filteredTopics.length === 0 && (
            <div className="drills-no-results">No topics match this filter.</div>
          )}
        </>
      )}
    </div>
  )
}

export default DrillsPage
