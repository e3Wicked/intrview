import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { api } from '../utils/api'
import LogoWithFallbacks from './LogoWithFallbacks'
import './MissionDashboard.css'

function timeAgo(dateStr) {
  if (!dateStr) return ''
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

function MissionDashboard({ user, onAnalyzeClick, onDeleteJob }) {
  const navigate = useNavigate()
  const [analyses, setAnalyses] = useState([])
  const [loading, setLoading] = useState(true)
  const [studyPlans, setStudyPlans] = useState({})
  const [serverProgress, setServerProgress] = useState({})
  const [weaknessNudge, setWeaknessNudge] = useState(null)
  const [topicScores, setTopicScores] = useState([])
  const [allTopics, setAllTopics] = useState([])
  const [activityData, setActivityData] = useState(null)
  const [recentSessions, setRecentSessions] = useState([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [analysesRes, topicsRes, allTopicsRes, activityRes, sessionsRes] = await Promise.all([
        axios.get('/api/user/analyses?limit=100'),
        api.topics.getUserScores().catch(() => ({ data: [] })),
        api.topics.getAllTopics().catch(() => ({ data: [] })),
        api.activity.getSummary().catch(() => ({ data: null })),
        api.drills.getAllSessions().catch(() => ({ data: [] })),
      ])
      setAnalyses(analysesRes.data)
      setActivityData(activityRes.data)
      setRecentSessions(Array.isArray(sessionsRes.data) ? sessionsRes.data : [])

      const scored = Array.isArray(topicsRes.data) ? topicsRes.data : []
      const sorted = [...scored].sort((a, b) => {
        if (b.attempts !== a.attempts) return b.attempts - a.attempts
        return b.score - a.score
      })
      setTopicScores(sorted)

      const all = Array.isArray(allTopicsRes.data) ? allTopicsRes.data : []
      setAllTopics(all)

      // Derive weakness nudge from topic scores
      const practiced = scored.filter(t => t.attempts > 0)
      if (practiced.length > 0) {
        const weakest = practiced.reduce((min, t) => t.score < min.score ? t : min, practiced[0])
        if (weakest.score < 80) {
          setWeaknessNudge({ category: weakest.topic_name, mastery: weakest.score })
        }
      } else if (all.length > 0) {
        const random = all[Math.floor(Math.random() * all.length)]
        setWeaknessNudge({ category: random.topic_name || random.name, mastery: 0 })
      }

      // Load study plans and server progress in parallel
      const plans = {}
      const progressMap = {}
      await Promise.all(analysesRes.data.map(async (analysis) => {
        try {
          const [planRes, progressRes] = await Promise.all([
            axios.get(`/api/user/study-plan/${analysis.job_description_hash}`).catch(() => ({ data: null })),
            api.progress.get(analysis.job_description_hash).catch(() => ({ data: {} })),
          ])
          plans[analysis.job_description_hash] = planRes.data
          progressMap[analysis.job_description_hash] = progressRes.data
        } catch (e) {
          // Plan might not exist yet
        }
      }))
      setStudyPlans(plans)
      setServerProgress(progressMap)
    } catch (err) {
      console.error('Error loading dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Build job data with progress for each analysis
  const jobsWithProgress = useMemo(() => {
    return analyses.map(analysis => {
      const plan = studyPlans[analysis.job_description_hash]
      const sp = serverProgress[analysis.job_description_hash]

      let completedTopics = 0
      let totalTopics = 0
      const topics = plan?.studyPlan?.topics || plan?.topics || []
      if (topics.length > 0) {
        const topicsStudied = new Set(sp?.topicsStudied || [])
        const currentTopics = topics.map(t => t.topic || t)
        completedTopics = currentTopics.filter(t => topicsStudied.has(t)).length
        totalTopics = currentTopics.length
      }
      const progressPercent = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0

      let domain = null
      if (analysis.url) {
        try {
          domain = new URL(analysis.url).hostname.replace('www.', '')
        } catch (e) {}
      }

      return {
        id: analysis.id,
        companyName: analysis.company_name || 'Unknown Company',
        roleTitle: analysis.role_title || 'Unknown Role',
        progressPercent,
        logoUrl: analysis.logo_url || null,
        domain,
        jobDescriptionHash: analysis.job_description_hash,
        createdAt: analysis.created_at,
      }
    })
  }, [analyses, studyPlans, serverProgress])

  // Group jobs by company (case-insensitive)
  const companiesWithJobs = useMemo(() => {
    const groups = {}
    for (const job of jobsWithProgress) {
      const key = job.companyName.toLowerCase()
      if (!groups[key]) {
        groups[key] = {
          companyName: job.companyName,
          logoUrl: job.logoUrl,
          domain: job.domain,
          jobs: [],
        }
      }
      groups[key].jobs.push(job)
    }
    return Object.values(groups).sort((a, b) =>
      a.companyName.localeCompare(b.companyName)
    )
  }, [jobsWithProgress])

  // Study overview stats
  const studyOverview = useMemo(() => {
    const practiced = topicScores.filter(t => t.attempts > 0)
    const totalTopics = allTopics.length || topicScores.length
    const totalDrills = practiced.reduce((sum, t) => sum + (t.attempts || 0), 0)
    const avgMastery = practiced.length > 0
      ? Math.round(practiced.reduce((sum, t) => sum + t.score, 0) / practiced.length)
      : 0
    const mastered = practiced.filter(t => t.score >= 80).length
    return { totalTopics, totalDrills, avgMastery, mastered, practiced: practiced.length }
  }, [topicScores, allTopics])

  // All topics for full-width display (practiced first, then unpracticed)
  const allTopicsSorted = useMemo(() => {
    const practiced = topicScores.filter(t => t.attempts > 0)
    const practicedIds = new Set(practiced.map(t => t.topic_id || t.id))
    const unpracticed = allTopics
      .filter(t => !practicedIds.has(t.id))
      .map(t => ({ ...t, topic_name: t.topic_name || t.name, score: 0, attempts: 0 }))
    return [...practiced, ...unpracticed]
  }, [topicScores, allTopics])

  if (loading) {
    return (
      <div className="mission-dashboard">
        <div className="dashboard-loading">Loading your dashboard...</div>
      </div>
    )
  }

  return (
    <div className="mission-dashboard">
      {/* Dashboard Header */}
      <div className="dash-header">
        <div className="dash-header-text">
          <h1 className="dash-title">Dashboard</h1>
          <p className="dash-subtitle">Situational awareness across your entire prep journey</p>
        </div>
        <div className="dash-header-right">
          {activityData && (
            <div className="dash-streak-badge">
              <span className="dash-streak-icon">{'\uD83D\uDD25'}</span>
              <div className="dash-streak-info">
                <span className="dash-streak-label">PRACTICE STREAK</span>
                <span className="dash-streak-num">{activityData.currentStreak} days</span>
              </div>
            </div>
          )}
          <button className="analyze-cta-btn" onClick={onAnalyzeClick}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>Analyze Job</span>
          </button>
        </div>
      </div>

      {/* Stat Cards Row */}
      <div className="dash-stats-row">
        <div className="dash-stat-card">
          <span className="dash-stat-icon">🎯</span>
          <div className="dash-stat-info">
            <span className="dash-stat-value">{studyOverview.totalDrills}</span>
            <span className="dash-stat-label">Drills Done</span>
          </div>
        </div>
        <div className="dash-stat-card">
          <span className="dash-stat-icon">📊</span>
          <div className="dash-stat-info">
            <span className="dash-stat-value">{studyOverview.avgMastery}%</span>
            <span className="dash-stat-label">Avg Mastery</span>
          </div>
        </div>
        <div className="dash-stat-card">
          <span className="dash-stat-icon">📚</span>
          <div className="dash-stat-info">
            <span className="dash-stat-value">{studyOverview.practiced}/{studyOverview.totalTopics}</span>
            <span className="dash-stat-label">Topics Practiced</span>
          </div>
        </div>
        <div className="dash-stat-card">
          <span className="dash-stat-icon">✅</span>
          <div className="dash-stat-info">
            <span className="dash-stat-value">{studyOverview.mastered}</span>
            <span className="dash-stat-label">Mastered</span>
          </div>
        </div>
      </div>

      {/* Streak & Activity */}
      <StreakActivityCard data={activityData} />

      {/* Full-width Topics Section */}
      {allTopicsSorted.length > 0 && (
        <div className="dash-card dash-topics-card">
          <div className="dash-card-header">
            <h2 className="dash-card-title">Your Topics</h2>
            <button className="dash-view-all" onClick={() => navigate('/study/drills')}>
              All drills →
            </button>
          </div>
          <div className="dash-topics-list">
            {allTopicsSorted.map((topic) => {
              const score = Math.round(Number(topic.score) || 0)
              const attempts = Number(topic.attempts) || 0
              const statusClass = attempts === 0 ? 'not-started' : score >= 80 ? 'mastered' : score >= 40 ? 'progress' : 'weak'
              return (
                <div
                  key={topic.id || topic.topic_id}
                  className={`dash-topic-row ${statusClass}`}
                  onClick={() => navigate(`/focus-chat?skill=${encodeURIComponent(topic.topic_name)}&from=/dashboard`)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="dash-topic-name">
                    <span className="dash-topic-label">{topic.topic_name}</span>
                    {topic.category && <span className="dash-topic-category">{topic.category.replace('_', ' ')}</span>}
                  </div>
                  <div className="dash-topic-bar-wrap">
                    <div className="dash-topic-bar">
                      <div className="dash-topic-bar-fill" style={{ width: `${Math.min(100, Math.max(attempts > 0 ? 3 : 0, score))}%` }} />
                    </div>
                  </div>
                  <span className="dash-topic-score">{attempts > 0 ? `${score}%` : '—'}</span>
                  <span className="dash-topic-drills">{attempts > 0 ? `${attempts} drill${attempts !== 1 ? 's' : ''}` : 'Not started'}</span>
                  <button
                    className={`dash-topic-action ${attempts > 0 ? 'continue' : ''}`}
                    onClick={(e) => { e.stopPropagation(); navigate(`/focus-chat?skill=${encodeURIComponent(topic.topic_name)}&from=/dashboard`) }}
                  >
                    {attempts > 0 ? 'Continue' : 'Start'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Bottom row: Jobs + Weakness nudge */}
      <div className={`dash-bottom-row ${companiesWithJobs.length === 0 ? 'dash-bottom-row--full' : ''}`}>
        {/* Jobs card */}
        <div className="dash-card">
          <div className="dash-card-header">
            <h2 className="dash-card-title">Your Jobs</h2>
            <span className="dash-card-count">{jobsWithProgress.length}</span>
          </div>

          {companiesWithJobs.length === 0 ? (
            <div className="empty-state-inline">
              <p>No jobs yet. Analyze a job posting to get started.</p>
              <button className="empty-state-cta" onClick={onAnalyzeClick}>
                Analyze Your First Job
              </button>
            </div>
          ) : (
            <div className="jobs-list">
              {companiesWithJobs.map((company) => (
                <div key={company.companyName} className="jobs-company-group">
                  <div className="jobs-company-header">
                    <div className="jobs-company-logo">
                      <LogoWithFallbacks
                        domain={company.domain}
                        name={company.companyName}
                        logoUrl={company.logoUrl}
                      />
                    </div>
                    <span className="jobs-company-name">{company.companyName}</span>
                    {company.jobs.length > 1 && (
                      <span className="jobs-company-count">{company.jobs.length} roles</span>
                    )}
                  </div>

                  {company.jobs.map((job) => (
                    <div
                      key={job.id}
                      className="jobs-list-item"
                      onClick={() => navigate(`/job/${job.id}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && navigate(`/job/${job.id}`)}
                    >
                      <div className="jobs-list-item-info">
                        <span className="jobs-list-item-role">{job.roleTitle}</span>
                        {job.createdAt && (
                          <span className="jobs-list-item-date">{formatDate(job.createdAt)}</span>
                        )}
                      </div>
                      <div className="jobs-list-item-progress">
                        <div className="jobs-list-progress-bar">
                          <div className="jobs-list-progress-fill" style={{ width: `${job.progressPercent}%` }} />
                        </div>
                        <span className="jobs-list-progress-text">{job.progressPercent}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="dash-columns">
        {/* Main Content */}
        <div className="dash-main">
          {/* Weekly Summary Card */}
          <div className="dash-card dash-summary-card">
            <h2 className="dash-card-title">Weekly Summary</h2>
            <div className="dash-summary-stats">
              <div className="dash-summary-stat">
                <span className="dash-summary-stat-label">TOTAL DRILLS</span>
                <span className="dash-summary-stat-value">{studyOverview.totalDrills}</span>
                <span className="dash-summary-stat-sub">{studyOverview.totalDrills === 0 ? 'No drills yet' : `Avg score ${studyOverview.avgMastery}%`}</span>
              </div>
              <div className="dash-summary-stat">
                <span className="dash-summary-stat-label">MOCK INTERVIEWS</span>
                <span className="dash-summary-stat-value">0</span>
                <span className="dash-summary-stat-sub">Coming soon</span>
              </div>
              <div className="dash-summary-stat">
                <span className="dash-summary-stat-label">TOPICS PRACTICED</span>
                <span className="dash-summary-stat-value">{studyOverview.practiced}</span>
                <span className="dash-summary-stat-sub">of {studyOverview.totalTopics} total</span>
              </div>
              <div className="dash-summary-stat">
                <span className="dash-summary-stat-label">AVG SCORE</span>
                <span className="dash-summary-stat-value">{studyOverview.avgMastery}%</span>
                <span className="dash-summary-stat-sub">Based on {studyOverview.totalDrills} drills</span>
              </div>
            </div>
          </div>

          {/* Weekly Activity */}
          <div className="dash-card dash-activity-card">
            <h2 className="dash-card-title">Weekly Activity</h2>
            <span className="dash-activity-subtitle">CHATS SENT PER DAY</span>
            <div className="dash-activity-chart">
              {(() => {
                const days = []
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                for (let i = 6; i >= 0; i--) {
                  const d = new Date()
                  d.setDate(d.getDate() - i)
                  const dayKey = d.toISOString().split('T')[0]
                  const count = activityData?.dailyActivity?.[dayKey] || 0
                  days.push({ name: dayNames[d.getDay()], count, key: dayKey })
                }
                const maxCount = Math.max(...days.map(d => d.count), 1)
                return days.map((day) => (
                  <div key={day.key} className="dash-activity-bar-group">
                    <div className="dash-activity-bar-container">
                      <div
                        className="dash-activity-bar"
                        style={{ height: `${Math.max(4, (day.count / maxCount) * 100)}%` }}
                      />
                    </div>
                    <span className="dash-activity-day">{day.name}</span>
                    <span className="dash-activity-count">{day.count}</span>
                  </div>
                ))
              })()}
            </div>
          </div>

          {/* Skill Heatmap */}
          {allTopicsSorted.length > 0 && (
            <div className="dash-card dash-heatmap-card">
              <div className="dash-card-header">
                <h2 className="dash-card-title">Skill Heatmap</h2>
                <button className="dash-view-all" onClick={() => navigate('/study/drills')}>
                  View all &rarr;
                </button>
              </div>
              {allTopicsSorted.filter(t => t.attempts > 0).length === 0 ? (
                <p className="dash-heatmap-empty">Complete drills to see your skill progress here!</p>
              ) : (
                <div className="dash-heatmap-grid">
                  {allTopicsSorted.filter(t => t.attempts > 0).slice(0, 12).map((topic) => {
                    const score = Math.round(Number(topic.score) || 0)
                    const level = score >= 80 ? 'high' : score >= 50 ? 'mid' : 'low'
                    return (
                      <div
                        key={topic.id || topic.topic_id}
                        className={`dash-heatmap-cell ${level}`}
                        onClick={() => navigate(`/focus-chat?skill=${encodeURIComponent(topic.topic_name)}&from=/dashboard`)}
                        title={`${topic.topic_name}: ${score}%`}
                      >
                        <span className="dash-heatmap-name">{topic.topic_name}</span>
                        <span className="dash-heatmap-score">{score}%</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Recently Completed */}
          <div className="dash-card dash-recent-card">
            <div className="dash-card-header">
              <h2 className="dash-card-title">Recently Completed</h2>
              <button className="dash-view-all" onClick={() => navigate('/study/drills?tab=history')}>
                View All &rarr;
              </button>
            </div>
            {recentSessions.filter(s => s.completed_at).length === 0 ? (
              <p className="dash-recent-empty">Complete your first drill to see activity here.</p>
            ) : (
              <div className="dash-recent-list">
                {[...recentSessions].filter(s => s.completed_at).sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at)).slice(0, 5).map((session) => {
                  const score = session.avg_score !== null ? Math.round(Number(session.avg_score)) : null
                  return (
                    <div
                      key={session.id}
                      className="dash-recent-row"
                      onClick={() => navigate(`/focus-chat?skill=${encodeURIComponent(session.topic_name)}&from=/dashboard`)}
                    >
                      <div className="dash-recent-info">
                        <span className="dash-recent-name">{session.topic_name}</span>
                        <span className="dash-recent-category">{timeAgo(session.completed_at)}</span>
                      </div>
                      {score !== null && (
                        <span className={`dash-recent-score ${score >= 80 ? 'high' : score >= 50 ? 'mid' : 'low'}`}>
                          {score}%
                        </span>
                      )}
                      <span className="dash-recent-drills">{session.answers} answer{session.answers !== 1 ? 's' : ''}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="dash-sidebar">
          {/* Mini Calendar */}
          <div className="dash-card dash-calendar-card">
            <div className="dash-calendar-header">
              <h2 className="dash-card-title">{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
              <div className="dash-calendar-nav">
                {/* Static display */}
              </div>
            </div>
            <div className="dash-calendar-grid">
              <div className="dash-calendar-weekdays">
                {['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].map(d => (
                  <span key={d} className="dash-calendar-weekday">{d}</span>
                ))}
              </div>
              <div className="dash-calendar-days">
                {(() => {
                  const now = new Date()
                  const year = now.getFullYear()
                  const month = now.getMonth()
                  const firstDay = new Date(year, month, 1)
                  const lastDay = new Date(year, month + 1, 0)
                  const startPad = (firstDay.getDay() + 6) % 7
                  const days = []
                  for (let i = 0; i < startPad; i++) {
                    days.push(<span key={`pad-${i}`} className="dash-calendar-day pad" />)
                  }
                  for (let d = 1; d <= lastDay.getDate(); d++) {
                    const isToday = d === now.getDate()
                    days.push(
                      <span key={d} className={`dash-calendar-day ${isToday ? 'today' : ''}`}>
                        {d}
                      </span>
                    )
                  }
                  return days
                })()}
              </div>
            </div>
          </div>

          {/* Peer Benchmarks */}
          <div className="dash-card dash-benchmarks-card">
            <h2 className="dash-card-title">Peer Benchmarks</h2>
            <div className="dash-benchmark-item">
              <span className="dash-benchmark-label">Technical accuracy</span>
              <span className="dash-benchmark-value">
                {studyOverview.totalDrills > 0 ? `${studyOverview.avgMastery}%` : 'Complete drills to see your ranking'}
              </span>
            </div>
          </div>

          {/* Your Jobs */}
          <div className="dash-card dash-sidebar-jobs">
            <div className="dash-card-header">
              <h2 className="dash-card-title">Your Jobs</h2>
              <span className="dash-card-count">{jobsWithProgress.length}</span>
            </div>
            {companiesWithJobs.length === 0 ? (
              <div className="dash-sidebar-empty">
                <p>No jobs yet.</p>
                <button className="empty-state-cta" onClick={onAnalyzeClick}>
                  Analyze Job
                </button>
              </div>
            ) : (
              <div className="dash-sidebar-jobs-list">
                {companiesWithJobs.map((company) => (
                  <div key={company.companyName} className="dash-sidebar-company">
                    <div className="dash-sidebar-company-header">
                      <div className="dash-sidebar-company-logo">
                        <LogoWithFallbacks
                          domain={company.domain}
                          name={company.companyName}
                          logoUrl={company.logoUrl}
                        />
                      </div>
                      <span
                        className="dash-sidebar-company-name"
                        onClick={() => navigate(`/company/${encodeURIComponent(company.companyName)}`)}
                      >
                        {company.companyName}
                      </span>
                    </div>
                    {company.jobs.map((job) => (
                      <div
                        key={job.id}
                        className="dash-sidebar-job-row"
                        onClick={() => {
                          const cached = {
                            companyInfo: { name: job.companyName, roleTitle: job.roleTitle, logoUrl: job.logoUrl },
                            jobDescriptionHash: job.jobDescriptionHash,
                            url: null,
                          }
                          sessionStorage.setItem(`job_analysis_${job.id}`, JSON.stringify(cached))
                          navigate(`/job/${job.id}`)
                        }}
                      >
                        <span className="dash-sidebar-job-role">{job.roleTitle}</span>
                        <div className="dash-sidebar-job-progress">
                          <div className="dash-sidebar-progress-bar">
                            <div className="dash-sidebar-progress-fill" style={{ width: `${job.progressPercent}%` }} />
                          </div>
                          <span className="dash-sidebar-progress-text">{job.progressPercent}%</span>
                        </div>
                        <button
                          className="dash-sidebar-job-delete"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!window.confirm('Remove this job analysis?')) return
                            axios.delete(`/api/user/analysis/${job.id}`).then(() => {
                              setAnalyses(prev => prev.filter(a => a.id !== job.id))
                              if (onDeleteJob) onDeleteJob(job.id)
                            }).catch(err => console.error('Error deleting:', err))
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <button className="dash-sidebar-analyze-btn" onClick={onAnalyzeClick}>
              + Analyze New Job
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MissionDashboard
