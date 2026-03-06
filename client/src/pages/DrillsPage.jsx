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
  const [drillSessions, setDrillSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [backfilling, setBackfilling] = useState(false)
  const [filter, setFilter] = useState('all')
  const [expandedTopic, setExpandedTopic] = useState(null)

  const fetchData = async () => {
    try {
      let [topicsRes, sessionsRes] = await Promise.all([
        api.topics.getAllTopics(),
        api.drills.getAllSessions().catch(() => ({ data: [] })),
      ])
      let data = topicsRes.data || []

      if (data.length === 0) {
        setBackfilling(true)
        try {
          const backfillRes = await api.topics.backfill()
          if (backfillRes.data?.totalTopics > 0) {
            topicsRes = await api.topics.getAllTopics()
            data = topicsRes.data || []
          }
        } catch (backfillErr) {
          console.error('Backfill failed:', backfillErr)
        }
        setBackfilling(false)
      }

      setTopics(data)
      setDrillSessions(sessionsRes.data || [])
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) fetchData()
    else setLoading(false)
  }, [user])

  // Group drill sessions by topic name (normalized)
  const sessionsByTopic = useMemo(() => {
    const map = {}
    for (const s of drillSessions) {
      const key = (s.topic_name || '').toLowerCase().trim()
      if (!map[key]) map[key] = []
      map[key].push(s)
    }
    return map
  }, [drillSessions])

  const getTopicSessions = (topicName) => {
    return sessionsByTopic[(topicName || '').toLowerCase().trim()] || []
  }

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

  const toggleExpand = (topicId, e) => {
    e.stopPropagation()
    setExpandedTopic(prev => prev === topicId ? null : topicId)
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
              const history = getTopicSessions(topic.topic_name)
              const lastSession = history.length > 0 ? history[0] : null // already sorted DESC
              const isExpanded = expandedTopic === topic.id
              const sessionAvg = session?.scores?.length > 0
                ? Math.round(session.scores.reduce((a, b) => a + b, 0) / session.scores.length)
                : null

              return (
                <div key={topic.id} className={`drills-topic-group ${isExpanded ? 'expanded' : ''}`}>
                  <div
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
                      ) : lastSession ? (
                        <div className="drills-last-session">
                          <span className="drills-last-session-label">
                            {lastSession.avg_score !== null && (
                              <strong className={lastSession.avg_score >= 70 ? 'score-good' : lastSession.avg_score >= 40 ? 'score-mid' : 'score-low'}>
                                {Math.round(lastSession.avg_score)}%
                              </strong>
                            )}
                            {' '}{timeAgo(lastSession.completed_at) || ''}
                          </span>
                          {history.length > 1 && (
                            <span className="drills-history-count">{history.length} sessions</span>
                          )}
                        </div>
                      ) : (
                        <span className={`drills-row-last ${lastPracticed ? 'has-date' : ''}`}>
                          {lastPracticed || 'Not started'}
                        </span>
                      )}
                    </div>
                    <div className="drills-col-action">
                      {(history.length > 0 || attempts > 0) && (
                        <button
                          className="drills-expand-btn"
                          onClick={(e) => toggleExpand(topic.id, e)}
                          title="View history"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                      )}
                      <button
                        className={`drills-practice-btn ${session ? 'resume' : attempts > 0 ? 'continue' : ''}`}
                        onClick={(e) => { e.stopPropagation(); handlePractice(topic.topic_name) }}
                      >
                        {session ? 'Resume' : attempts > 0 ? 'Continue' : 'Start'}
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail panel */}
                  {isExpanded && (
                    <div className="drills-detail-panel" onClick={(e) => e.stopPropagation()}>
                      <div className="drills-detail-stats">
                        <div className="drills-detail-stat">
                          <span className="drills-detail-stat-value">{attempts}</span>
                          <span className="drills-detail-stat-label">Total Drills</span>
                        </div>
                        <div className="drills-detail-stat">
                          <span className={`drills-detail-stat-value ${score >= 80 ? 'high' : score >= 40 ? 'mid' : 'low'}`}>
                            {attempts > 0 ? `${score}%` : '--'}
                          </span>
                          <span className="drills-detail-stat-label">Mastery</span>
                        </div>
                        <div className="drills-detail-stat">
                          <span className="drills-detail-stat-value">{history.length}</span>
                          <span className="drills-detail-stat-label">Sessions</span>
                        </div>
                        {lastPracticed && (
                          <div className="drills-detail-stat">
                            <span className="drills-detail-stat-value">{lastPracticed}</span>
                            <span className="drills-detail-stat-label">Last Practiced</span>
                          </div>
                        )}
                      </div>

                      {history.length > 0 && (
                        <div className="drills-detail-history">
                          <h4>Session History</h4>
                          <div className="drills-history-list">
                            {history.map((s, i) => {
                              const sScores = Array.isArray(s.scores) ? s.scores : []
                              const sAvg = s.avg_score !== null ? Math.round(s.avg_score) : null
                              return (
                                <div key={s.id || i} className="drills-history-row">
                                  <span className="drills-history-date">{timeAgo(s.completed_at) || 'Unknown'}</span>
                                  <span className="drills-history-answers">{s.answers} {s.answers === 1 ? 'answer' : 'answers'}</span>
                                  {sAvg !== null && (
                                    <span className={`drills-history-score ${sAvg >= 70 ? 'high' : sAvg >= 40 ? 'mid' : 'low'}`}>
                                      {sAvg}%
                                    </span>
                                  )}
                                  {s.xp_earned > 0 && <span className="drills-history-xp">+{s.xp_earned} XP</span>}
                                  {sScores.length > 0 && (
                                    <div className="drills-history-bars">
                                      {sScores.map((sc, j) => (
                                        <div
                                          key={j}
                                          className={`drills-history-bar ${sc >= 70 ? 'high' : sc >= 40 ? 'mid' : 'low'}`}
                                          style={{ height: `${Math.max(4, sc * 0.2)}px` }}
                                          title={`Q${j + 1}: ${sc}%`}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {history.length === 0 && attempts > 0 && (
                        <p className="drills-detail-note">
                          Session history will appear here after your next completed drill.
                        </p>
                      )}
                    </div>
                  )}
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
