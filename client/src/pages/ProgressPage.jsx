import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../utils/api'
import './ProgressPage.css'

function ProgressPage({ user }) {
  const navigate = useNavigate()
  const [topics, setTopics] = useState([])
  const [practiceHistory, setPracticeHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const [topicsRes, historyRes] = await Promise.all([
          api.topics.getAllTopics().catch(() => ({ data: [] })),
          api.practice.getHistory({ limit: 10 }).catch(() => ({ data: { sessions: [] } })),
        ])
        setTopics(topicsRes.data || [])
        setPracticeHistory(historyRes.data.sessions || [])
      } catch (err) {
        console.error('Error loading progress data:', err)
      } finally {
        setLoading(false)
      }
    }
    if (user) loadData()
    else setLoading(false)
  }, [user])

  const getMasteryColor = (mastery) => {
    if (mastery >= 80) return '#22c55e'
    if (mastery >= 40) return '#f59e0b'
    return '#ef4444'
  }

  const getMasteryClass = (mastery) => {
    if (mastery >= 80) return 'high'
    if (mastery >= 40) return 'mid'
    return 'low'
  }

  // Compute stats from real topic data
  const stats = useMemo(() => {
    const total = topics.length
    const practiced = topics.filter(t => Number(t.attempts) > 0)
    const totalDrills = practiced.reduce((sum, t) => sum + Number(t.attempts), 0)
    const avgMastery = practiced.length > 0
      ? Math.round(practiced.reduce((sum, t) => sum + Number(t.score), 0) / practiced.length)
      : 0
    const mastered = topics.filter(t => Number(t.score) >= 80).length

    // Group by category
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

    // Weakest practiced topics (score < 80, sorted ascending)
    const weakTopics = practiced
      .filter(t => Number(t.score) < 80)
      .sort((a, b) => Number(a.score) - Number(b.score))
      .slice(0, 5)

    // Top practiced topics sorted by mastery descending
    const topTopics = [...practiced]
      .sort((a, b) => Number(b.score) - Number(a.score))
      .slice(0, 10)

    return { total, practiced: practiced.length, totalDrills, avgMastery, mastered, categories, weakTopics, topTopics }
  }, [topics])

  if (loading) {
    return (
      <div className="progress-page">
        <div className="progress-page-loading">Loading progress...</div>
      </div>
    )
  }

  return (
    <div className="progress-page">
      <div className="progress-page-header">
        <h1 className="progress-page-title">Progress</h1>
        <p className="progress-page-subtitle">Track your mastery across all topics.</p>
      </div>

      {/* Stats Bar */}
      <div className="progress-stats-bar">
        <div className="progress-stat-block">
          <span className="progress-stat-label">Topics</span>
          <span className="progress-stat-value">{stats.practiced}/{stats.total}</span>
          <span className="progress-stat-multiplier">{stats.mastered} mastered</span>
        </div>
        <div className="progress-stat-divider" />
        <div className="progress-stat-block">
          <span className="progress-stat-label">Avg Mastery</span>
          <span className="progress-stat-value">{stats.avgMastery}%</span>
        </div>
        <div className="progress-stat-divider" />
        <div className="progress-stat-block">
          <span className="progress-stat-label">Total Drills</span>
          <span className="progress-stat-value">{stats.totalDrills}</span>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="progress-overview-grid">
        <div className="progress-overview-card">
          <span className="progress-overview-value">{stats.avgMastery}%</span>
          <span className="progress-overview-label">Avg Mastery</span>
        </div>
        <div className="progress-overview-card">
          <span className="progress-overview-value">{stats.totalDrills}</span>
          <span className="progress-overview-label">Total Drills</span>
        </div>
        <div className="progress-overview-card">
          <span className="progress-overview-value">{stats.practiced}</span>
          <span className="progress-overview-label">Topics Practiced</span>
        </div>
        <div className="progress-overview-card">
          <span className="progress-overview-value">{stats.mastered}</span>
          <span className="progress-overview-label">Mastered</span>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="progress-columns">
        {/* Left: Skill Breakdown by Category */}
        <div className="progress-col-main">
          <section className="progress-section">
            <h2 className="progress-section-title">Mastery by Category</h2>
            {stats.categories.length === 0 ? (
              <div className="progress-empty-card">
                <p>Analyze a job post and practice to see your skill breakdown.</p>
              </div>
            ) : (
              <div className="progress-category-list">
                {stats.categories.map(cat => (
                  <div key={cat.name} className="progress-category-row">
                    <div className="progress-category-info">
                      <span className="progress-category-name">{cat.name.replace('_', ' ')}</span>
                      <span className="progress-category-meta">
                        {cat.practiced}/{cat.total} topics &middot; {cat.totalAttempts} drills
                      </span>
                    </div>
                    <div className="progress-category-bar-wrap">
                      <div className="progress-category-bar">
                        <div
                          className={`progress-category-bar-fill ${getMasteryClass(cat.mastery)}`}
                          style={{ width: `${Math.min(100, cat.mastery)}%` }}
                        />
                      </div>
                      <span className="progress-category-score" style={{ color: getMasteryColor(cat.mastery) }}>
                        {cat.mastery}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Top Topics */}
          {stats.topTopics.length > 0 && (
            <section className="progress-section">
              <h2 className="progress-section-title">Top Topics</h2>
              <div className="progress-topic-table">
                <div className="progress-topic-header">
                  <span>Topic</span>
                  <span>Mastery</span>
                  <span>Drills</span>
                </div>
                {stats.topTopics.map(topic => {
                  const score = Math.round(Number(topic.score))
                  return (
                    <div
                      key={topic.id}
                      className="progress-topic-row"
                      onClick={() => navigate(`/focus-chat?skill=${encodeURIComponent(topic.topic_name)}`)}
                    >
                      <div className="progress-topic-name">
                        <span>{topic.topic_name}</span>
                        {topic.category && (
                          <span className="progress-topic-cat">{topic.category.replace('_', ' ')}</span>
                        )}
                      </div>
                      <div className="progress-topic-mastery">
                        <div className="progress-topic-bar">
                          <div
                            className={`progress-topic-bar-fill ${getMasteryClass(score)}`}
                            style={{ width: `${Math.min(100, score)}%` }}
                          />
                        </div>
                        <span className="progress-topic-score">{score}%</span>
                      </div>
                      <span className="progress-topic-drills">{Number(topic.attempts)}</span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        {/* Right: Weak Spots + Recent Activity */}
        <div className="progress-col-side">
          {/* Weak Spots */}
          {stats.weakTopics.length > 0 && (
            <section className="progress-section">
              <h2 className="progress-section-title">Needs Work</h2>
              <div className="progress-weak-list">
                {stats.weakTopics.map(topic => {
                  const score = Math.round(Number(topic.score))
                  return (
                    <div key={topic.id} className="progress-weak-item">
                      <div className="progress-weak-info">
                        <span className="progress-weak-name">{topic.topic_name}</span>
                        <span className="progress-weak-score" style={{ color: getMasteryColor(score) }}>{score}%</span>
                      </div>
                      <div className="progress-weak-bar">
                        <div
                          className={`progress-weak-bar-fill ${getMasteryClass(score)}`}
                          style={{ width: `${Math.min(100, score)}%` }}
                        />
                      </div>
                      <button
                        className="progress-weak-action"
                        onClick={() => navigate(`/focus-chat?skill=${encodeURIComponent(topic.topic_name)}`)}
                      >
                        Practice &rarr;
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Recent Activity */}
          <section className="progress-section">
            <h2 className="progress-section-title">Recent Activity</h2>
            {practiceHistory.length === 0 ? (
              <div className="progress-empty-card">
                <p>No practice sessions yet.</p>
              </div>
            ) : (
              <div className="recent-activity-list">
                {practiceHistory.slice(0, 5).map((session, idx) => {
                  const scoreDisplay = session.average_score > 0 ? `${Math.round(session.average_score / 10)}/10` : null
                  const modeLabel = session.mode === 'voice' ? 'Voice Practice'
                    : session.mode === 'focus' ? 'Coach'
                    : session.mode === 'flashcards' ? 'Flashcards'
                    : 'Quiz'
                  return (
                    <div key={session.id || idx} className="activity-item">
                      <div className="activity-icon">
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                          <rect width="20" height="20" rx="4" fill="#22c55e" fillOpacity="0.15"/>
                          <path d="M6 10l3 3 5-6" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div className="activity-info">
                        <span className="activity-label">{modeLabel}</span>
                        <span className="activity-date">{new Date(session.ended_at || session.started_at).toLocaleDateString()}</span>
                      </div>
                      <div className="activity-stats">
                        {scoreDisplay && (
                          <span className="activity-score">{scoreDisplay}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>

    </div>
  )
}

export default ProgressPage
