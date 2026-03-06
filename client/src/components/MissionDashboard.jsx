import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { api } from '../utils/api'
import { useGamification } from '../contexts/GamificationContext'
import { getLevelForXp } from '../utils/gamification'
import LogoWithFallbacks from './LogoWithFallbacks'
import './MissionDashboard.css'

function MissionDashboard({ user, onAnalyzeClick }) {
  const navigate = useNavigate()
  const { gamStats } = useGamification()
  const [analyses, setAnalyses] = useState([])
  const [loading, setLoading] = useState(true)
  const [studyPlans, setStudyPlans] = useState({})
  const [serverProgress, setServerProgress] = useState({})
  const [weaknessNudge, setWeaknessNudge] = useState(null)
  const [topicScores, setTopicScores] = useState([])
  const [allTopics, setAllTopics] = useState([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [analysesRes, weaknessRes, topicsRes, allTopicsRes] = await Promise.all([
        axios.get('/api/user/analyses?limit=100'),
        api.gamification.getWeaknessReport().catch(() => ({ data: null })),
        api.topics.getUserScores().catch(() => ({ data: [] })),
        api.topics.getAllTopics().catch(() => ({ data: [] })),
      ])
      setAnalyses(analysesRes.data)

      const scored = Array.isArray(topicsRes.data) ? topicsRes.data : []
      const sorted = [...scored].sort((a, b) => {
        if (b.attempts !== a.attempts) return b.attempts - a.attempts
        return b.score - a.score
      })
      setTopicScores(sorted)

      const all = Array.isArray(allTopicsRes.data) ? allTopicsRes.data : []
      setAllTopics(all)

      if (weaknessRes.data?.weakCategories?.length > 0) {
        const weakest = weaknessRes.data.weakCategories[0]
        if (weakest.mastery < 80) {
          setWeaknessNudge(weakest)
        }
      }

      // If no weakness from API, derive from topic scores
      if (!weaknessRes.data?.weakCategories?.length) {
        const practiced = scored.filter(t => t.attempts > 0)
        if (practiced.length > 0) {
          const weakest = practiced.reduce((min, t) => t.score < min.score ? t : min, practiced[0])
          setWeaknessNudge({ category: weakest.topic_name, mastery: weakest.score })
        } else if (all.length > 0) {
          const random = all[Math.floor(Math.random() * all.length)]
          setWeaknessNudge({ category: random.topic_name || random.name, mastery: 0 })
        }
      }

      // Load study plans and server progress in parallel
      const plans = {}
      const progressMap = {}
      await Promise.all(analysesRes.data.map(async (analysis) => {
        try {
          const [planRes, progressRes] = await Promise.all([
            axios.get(`/api/user/study-plan/${analysis.job_description_hash}`),
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

  // Top skills (by score, must have attempts)
  const topSkills = useMemo(() => {
    return topicScores
      .filter(t => t.attempts > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
  }, [topicScores])

  // Topic progress pills: top 4 most-practiced topics with scores
  const topicPills = useMemo(() => {
    const practiced = topicScores.filter(t => t.attempts > 0)
    if (practiced.length === 0) return []
    return [...practiced]
      .sort((a, b) => b.attempts - a.attempts)
      .slice(0, 4)
  }, [topicScores])

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="mission-dashboard">
        <div className="dashboard-loading">Loading your dashboard...</div>
      </div>
    )
  }

  const levelInfo = gamStats ? getLevelForXp(gamStats.totalXp) : null
  const streak = gamStats?.streak || { current: 0, multiplier: 1.0 }

  // All topics for full-width display (practiced first, then unpracticed)
  const allTopicsSorted = useMemo(() => {
    const practiced = topicScores.filter(t => t.attempts > 0)
    const practicedIds = new Set(practiced.map(t => t.topic_id || t.id))
    const unpracticed = allTopics
      .filter(t => !practicedIds.has(t.id))
      .map(t => ({ ...t, topic_name: t.topic_name || t.name, score: 0, attempts: 0 }))
    return [...practiced, ...unpracticed]
  }, [topicScores, allTopics])

  return (
    <div className="mission-dashboard">
      {/* Dashboard Header */}
      <div className="dash-header">
        <div className="dash-header-text">
          <h1 className="dash-title">Dashboard</h1>
          <p className="dash-subtitle">Your interview prep at a glance</p>
        </div>
        <button className="analyze-cta-btn" onClick={onAnalyzeClick}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <span>Analyze Job</span>
          {user && <span className="analyze-cta-credits">5 credits</span>}
        </button>
      </div>

      {/* Stat Cards Row */}
      <div className="dash-stats-row">
        <div className="dash-stat-card">
          <span className="dash-stat-icon">🔥</span>
          <div className="dash-stat-info">
            <span className="dash-stat-value">{streak.current}</span>
            <span className="dash-stat-label">Day Streak</span>
          </div>
        </div>
        <div className="dash-stat-card">
          <span className="dash-stat-icon">⚡</span>
          <div className="dash-stat-info">
            <span className="dash-stat-value">{gamStats?.totalXp || 0}</span>
            <span className="dash-stat-label">Total XP</span>
          </div>
        </div>
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
      </div>

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
      <div className="dash-bottom-row">
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

        {/* Weakness nudge */}
        {weaknessNudge && (
          <div className="dash-card dash-card-nudge">
            <h2 className="dash-card-title">Focus Area</h2>
            <div className="nudge-body">
              <div className="nudge-topic-name">{weaknessNudge.category}</div>
              <div className="nudge-score-ring">
                <svg viewBox="0 0 36 36" className="nudge-ring-svg">
                  <path className="nudge-ring-bg" d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="nudge-ring-fill" strokeDasharray={`${weaknessNudge.mastery}, 100`} d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <span className="nudge-ring-value">
                  {weaknessNudge.mastery > 0 ? `${Math.round(weaknessNudge.mastery)}%` : '0%'}
                </span>
              </div>
              <p className="nudge-hint">
                {weaknessNudge.mastery > 0 ? 'Keep practicing to improve' : 'Start practicing this topic'}
              </p>
              <button
                className="nudge-cta"
                onClick={() => navigate(`/focus-chat?skill=${encodeURIComponent(weaknessNudge.category)}`)}
              >
                Practice Now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default MissionDashboard
