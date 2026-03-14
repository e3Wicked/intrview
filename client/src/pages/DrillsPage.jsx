import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
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

const SENIORITY_OPTIONS = [
  { value: 'intern', label: 'Intern' },
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid' },
  { value: 'senior', label: 'Senior' },
  { value: 'staff', label: 'Staff' },
  { value: 'lead', label: 'Lead+' },
]

function DrillsPage({ user }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [topics, setTopics] = useState([])
  const [drillSessions, setDrillSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [backfilling, setBackfilling] = useState(false)
  const [filter, setFilter] = useState('all')
  const [expandedTopic, setExpandedTopic] = useState(null)
  const [seniority, setSeniority] = useState('mid')
  const [questionGoal, setQuestionGoal] = useState(10)
  const [activeTab, setActiveTab] = useState('practice')
  const [historyLimit, setHistoryLimit] = useState(15)
  const [progressFilter, setProgressFilter] = useState('all')
  const [jobs, setJobs] = useState([])
  const [jobFilter, setJobFilter] = useState('all')

  const fetchData = async () => {
    try {
      let [topicsRes, sessionsRes, jobsRes] = await Promise.all([
        api.topics.getAllTopics(),
        api.drills.getAllSessions().catch(() => ({ data: [] })),
        api.user.getAnalyses().catch(() => ({ data: [] })),
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
      setJobs(jobsRes.data || [])
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

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const tab = params.get('tab')
    if (tab === 'history' || tab === 'progress') setActiveTab(tab)
  }, [location.search])

  // Re-fetch data when window regains focus (e.g. returning from FocusChat)
  useEffect(() => {
    const handleFocus = () => { if (user) fetchData() }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
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

    // Categories with mastery (absorbed from ProgressPage)
    const categoryMap = {}
    topics.forEach(t => {
      const cat = t.category || 'general'
      if (!categoryMap[cat]) categoryMap[cat] = { total: 0, practiced: 0, totalScore: 0, totalAttempts: 0 }
      categoryMap[cat].total++
      if (Number(t.attempts) > 0) {
        categoryMap[cat].practiced++
        categoryMap[cat].totalScore += Number(t.score)
        categoryMap[cat].totalAttempts += Number(t.attempts)
      }
    })
    const categories = Object.entries(categoryMap)
      .map(([name, data]) => ({
        name,
        total: data.total,
        practiced: data.practiced,
        mastery: data.practiced > 0 ? Math.round(data.totalScore / data.practiced) : 0,
        totalAttempts: data.totalAttempts,
      }))
      .sort((a, b) => b.totalAttempts - a.totalAttempts)

    // Top 10 practiced topics by score desc
    const topTopics = [...practiced]
      .sort((a, b) => Number(b.score) - Number(a.score))
      .slice(0, 10)

    // 5 weakest practiced topics (score < 80)
    const weakTopics = practiced
      .filter(t => Number(t.score) < 80)
      .sort((a, b) => Number(a.score) - Number(b.score))
      .slice(0, 5)

    return { total, practiced: practiced.length, totalAttempts, avgScore, mastered, notStarted: notStarted.length, weakest, categories, topTopics, weakTopics }
  }, [topics])

  const categoryNames = useMemo(() => {
    const cats = new Set()
    topics.forEach(t => { if (t.category) cats.add(t.category) })
    return Array.from(cats).sort()
  }, [topics])

  const filteredTopics = useMemo(() => {
    let filtered
    if (filter === 'all') filtered = topics
    else filtered = topics.filter(t => t.category === filter)

    if (jobFilter !== 'all') {
      filtered = filtered.filter(t => (t.job_hashes || []).includes(jobFilter))
    }

    return [...filtered].sort((a, b) => {
      const aActive = getSavedSession(a.topic_name) ? 1 : 0
      const bActive = getSavedSession(b.topic_name) ? 1 : 0
      if (bActive !== aActive) return bActive - aActive
      const aP = a.last_practiced_at ? new Date(a.last_practiced_at).getTime() : 0
      const bP = b.last_practiced_at ? new Date(b.last_practiced_at).getTime() : 0
      if (bP !== aP) return bP - aP
      return (a.topic_name || '').localeCompare(b.topic_name || '')
    })
  }, [topics, filter, jobFilter])

  const sortedSessions = useMemo(() => {
    return [...drillSessions].sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
  }, [drillSessions])

  const progressTopics = useMemo(() => {
    if (progressFilter === 'not-started') return topics.filter(t => Number(t.attempts) === 0)
    if (progressFilter === 'in-progress') return topics.filter(t => Number(t.attempts) > 0 && Number(t.score) < 80)
    if (progressFilter === 'mastered') return topics.filter(t => Number(t.score) >= 80)
    return topics
  }, [topics, progressFilter])

  const handlePractice = (topicName) => {
    navigate(`/focus-chat?skill=${encodeURIComponent(topicName)}&seniority=${seniority}&goal=${questionGoal}&from=/study/drills`)
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
        <div className="drills-header-left">
          <h1>Drills</h1>
          <p>Scored questions to test and track your mastery on each topic.</p>
        </div>
        {activeTab === 'practice' && (
          <div className="drills-header-config">
            <select className="drills-config-select" value={questionGoal} onChange={(e) => setQuestionGoal(Number(e.target.value))}>
              <option value={5}>5 Qs</option>
              <option value={10}>10 Qs</option>
              <option value={15}>15 Qs</option>
              <option value={20}>20 Qs</option>
            </select>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="drills-tabs">
        <button className={`drills-tab ${activeTab === 'practice' ? 'active' : ''}`} onClick={() => setActiveTab('practice')}>Practice</button>
        <button className={`drills-tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>Drill History</button>
        <button className={`drills-tab ${activeTab === 'progress' ? 'active' : ''}`} onClick={() => setActiveTab('progress')}>Progress</button>
      </div>

      {/* ===== Practice Tab ===== */}
      {activeTab === 'practice' && (
        <>
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
              {/* Filter groups */}
              <div className="drills-filter-groups">
                <div className="drills-filter-group">
                  <span className="drills-filter-group-label">Seniority</span>
                  {SENIORITY_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      className={`drills-filter ${seniority === opt.value ? 'active' : ''}`}
                      onClick={() => setSeniority(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                  {jobs.length > 0 && (
                    <select
                      className="drills-job-filter-select"
                      value={jobFilter}
                      onChange={e => setJobFilter(e.target.value)}
                    >
                      <option value="all">All Jobs</option>
                      {jobs.map(job => (
                        <option key={job.job_description_hash} value={job.job_description_hash}>
                          {job.role_title || 'Unknown Role'}{job.company_name ? ` — ${job.company_name}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {categoryNames.length > 1 && categoryNames.length < topics.length && (
                  <div className="drills-filter-group">
                    <span className="drills-filter-group-label">Category</span>
                    <button className={`drills-filter ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                      All Categories
                    </button>
                    {categoryNames.map(cat => (
                      <button
                        key={cat}
                        className={`drills-filter ${filter === cat ? 'active' : ''}`}
                        onClick={() => setFilter(cat)}
                      >
                        {cat.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                )}
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
                  const lastSession = history.length > 0 ? history[0] : null
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
                          {topic.category && categoryNames.length > 1 && categoryNames.length < topics.length && (
                            <span className="drills-row-category">{topic.category.replace('_', ' ')}</span>
                          )}
                          {session && (
                            <span className="drills-session-info">
                              {session.exchangeCount} {session.exchangeCount === 1 ? 'answer' : 'answers'}
                              {sessionAvg !== null && (
                                <> &middot; avg <strong className={sessionAvg >= 70 ? 'score-good' : sessionAvg >= 50 ? 'score-mid' : 'score-low'}>{sessionAvg}%</strong></>
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
                              className={`drills-row-bar-fill ${score >= 80 ? 'high' : score >= 50 ? 'mid' : 'low'}`}
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
                                  <strong className={lastSession.avg_score >= 70 ? 'score-good' : lastSession.avg_score >= 50 ? 'score-mid' : 'score-low'}>
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
                              <span className={`drills-detail-stat-value ${score >= 80 ? 'high' : score >= 50 ? 'mid' : 'low'}`}>
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
                                        <span className={`drills-history-score ${sAvg >= 70 ? 'high' : sAvg >= 50 ? 'mid' : 'low'}`}>
                                          {sAvg}%
                                        </span>
                                      )}
                                      {s.xp_earned > 0 && <span className="drills-history-xp">+{s.xp_earned} XP</span>}
                                      {sScores.length > 0 && (
                                        <div className="drills-history-bars">
                                          {sScores.map((sc, j) => (
                                            <div
                                              key={j}
                                              className={`drills-history-bar ${sc >= 70 ? 'high' : sc >= 50 ? 'mid' : 'low'}`}
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
        </>
      )}

      {/* ===== History Tab ===== */}
      {activeTab === 'history' && (
        <div className="drills-history-tab">
          {sortedSessions.length === 0 ? (
            <div className="drills-tab-empty">
              <p>No drill sessions yet. Start practicing to see your history here.</p>
            </div>
          ) : (
            <>
              <div className="drills-list">
                <div className="drills-history-header">
                  <span>Date</span>
                  <span>Topic</span>
                  <span>Questions</span>
                  <span>Score</span>
                </div>
                {sortedSessions.slice(0, historyLimit).map((session, i) => (
                  <div key={session.id || i} className="drills-history-row-item">
                    <span className="drills-history-date-cell">{timeAgo(session.completed_at)}</span>
                    <span className="drills-history-topic">{session.topic_name}</span>
                    <span className="drills-history-answers-cell">{session.answers}</span>
                    <span className={`drills-history-score-cell ${session.avg_score >= 80 ? 'high' : session.avg_score >= 50 ? 'mid' : 'low'}`}>
                      {Math.round(session.avg_score)}%
                    </span>
                  </div>
                ))}
              </div>
              {historyLimit < sortedSessions.length && (
                <button className="drills-load-more" onClick={() => setHistoryLimit(prev => prev + 15)}>
                  Load more ({sortedSessions.length - historyLimit} remaining)
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ===== Progress Tab ===== */}
      {activeTab === 'progress' && (
        <div className="drills-progress-tab">
          {topics.length === 0 ? (
            <div className="drills-tab-empty">
              <p>Analyze a job and start drilling to track your progress.</p>
            </div>
          ) : (
            <>
              {/* Overview Stats */}
              <div className="drills-summary">
                <div className="drills-summary-card">
                  <div className="drills-summary-value">{summary.practiced}/{summary.total}</div>
                  <div className="drills-summary-label">Topics</div>
                </div>
                <div className="drills-summary-card">
                  <div className="drills-summary-value">{summary.avgScore}%</div>
                  <div className="drills-summary-label">Avg Mastery</div>
                </div>
                <div className="drills-summary-card">
                  <div className="drills-summary-value">{summary.totalAttempts}</div>
                  <div className="drills-summary-label">Total Drills</div>
                </div>
                <div className="drills-summary-card">
                  <div className="drills-summary-value">{summary.mastered}</div>
                  <div className="drills-summary-label">Mastered</div>
                </div>
              </div>

              {/* Status Filter */}
              <div className="drills-filters" style={{ marginBottom: 20 }}>
                {['all', 'not-started', 'in-progress', 'mastered'].map(f => (
                  <button key={f} className={`drills-filter ${progressFilter === f ? 'active' : ''}`} onClick={() => setProgressFilter(f)}>
                    {f === 'all' ? 'All' : f === 'not-started' ? 'Not Started' : f === 'in-progress' ? 'In Progress' : 'Mastered'}
                  </button>
                ))}
              </div>

              {/* Mastery by Category — only show if categories actually group multiple topics */}
              {summary.categories.length > 1 && summary.categories.length < summary.total && (
                <div className="drills-progress-section">
                  <h3 className="drills-progress-section-title">Mastery by Category</h3>
                  <div className="drills-progress-categories">
                    {summary.categories.map(cat => (
                      <div key={cat.name} className="drills-progress-category-row">
                        <div className="drills-progress-category-info">
                          <span className="drills-progress-category-name">{cat.name.replace('_', ' ')}</span>
                          <span className="drills-progress-category-meta">{cat.practiced}/{cat.total} topics &middot; {cat.totalAttempts} drills</span>
                        </div>
                        <div className="drills-progress-category-bar-wrap">
                          <div className="drills-row-bar" style={{ flex: 1 }}>
                            <div className={`drills-row-bar-fill ${cat.mastery >= 80 ? 'high' : cat.mastery >= 50 ? 'mid' : 'low'}`} style={{ width: `${cat.mastery}%` }} />
                          </div>
                          <span className="drills-row-score">{cat.mastery}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Topics List */}
              {progressTopics.length > 0 && (
                <div className="drills-progress-section">
                  <h3 className="drills-progress-section-title">Topics ({progressTopics.length})</h3>
                  <div className="drills-progress-topics">
                    {progressTopics.map(topic => {
                      const score = Math.round(Number(topic.score))
                      const attempts = Number(topic.attempts)
                      return (
                        <div key={topic.id} className="drills-progress-topic-row">
                          <span className="drills-progress-topic-name">{topic.topic_name}</span>
                          <span className="drills-progress-topic-category">{(topic.category || 'general').replace('_', ' ')}</span>
                          <div className="drills-row-bar" style={{ flex: 1, maxWidth: 120 }}>
                            <div
                              className={`drills-row-bar-fill ${score >= 80 ? 'high' : score >= 50 ? 'mid' : 'low'}`}
                              style={{ width: `${Math.min(100, Math.max(attempts > 0 ? 3 : 0, score))}%` }}
                            />
                          </div>
                          <span className="drills-row-score">{attempts > 0 ? `${score}%` : '--'}</span>
                          <span className="drills-progress-topic-drills">{attempts > 0 ? `${attempts} drills` : '--'}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

            </>
          )}
        </div>
      )}
    </div>
  )
}

export default DrillsPage
