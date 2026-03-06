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

  return (
    <div className="mission-dashboard">
      {/* Dashboard Header */}
      <div className="dash-header">
        <div className="dash-header-text">
          <h1 className="dash-title">Dashboard</h1>
          <p className="dash-subtitle">Track your interview preparation progress</p>
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
          <span className="dash-stat-value">{streak.current}</span>
          <span className="dash-stat-label">Day Streak</span>
        </div>
        <div className="dash-stat-card">
          <span className="dash-stat-value">{gamStats?.totalXp || 0}</span>
          <span className="dash-stat-label">Total XP</span>
        </div>
        <div className="dash-stat-card">
          <span className="dash-stat-value">{levelInfo?.title || 'Applicant'}</span>
          <span className="dash-stat-label">Current Level</span>
        </div>
        <div className="dash-stat-card">
          <span className="dash-stat-value">{jobsWithProgress.length}</span>
          <span className="dash-stat-label">Jobs Tracked</span>
        </div>
      </div>

      {/* Topic Progress Pills */}
      {topicPills.length > 0 && (
        <div className="dash-topic-pills">
          {topicPills.map((topic) => {
            const score = topic.score || 0
            const colorClass = score >= 80 ? 'pill-mastered' : score >= 50 ? 'pill-progress' : 'pill-weak'
            return (
              <button
                key={topic.id}
                className={`dash-topic-pill ${colorClass}`}
                onClick={() => navigate(`/focus-chat?skill=${encodeURIComponent(topic.topic_name)}&from=/dashboard`)}
                title={`${topic.topic_name} — ${score}% mastery, ${topic.attempts} drills`}
              >
                <span className="pill-name">{topic.topic_name}</span>
                <span className="pill-score">{score}%</span>
                <div className="pill-bar">
                  <div className="pill-bar-fill" style={{ width: `${Math.min(score, 100)}%` }} />
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Main two-column layout */}
      <div className="dash-columns">
        {/* Left column: Jobs grouped by company */}
        <div className="dash-col-left">
          <div className="dash-card">
            <div className="dash-card-header">
              <h2 className="dash-card-title">Your Jobs</h2>
              <span className="dash-card-count">{jobsWithProgress.length}</span>
            </div>

            {companiesWithJobs.length === 0 ? (
              <div className="empty-state-inline">
                <p>No jobs yet. Start by analyzing a job posting.</p>
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
                        <span className="jobs-company-count">
                          {company.jobs.length} roles
                        </span>
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
                            <div
                              className="jobs-list-progress-fill"
                              style={{ width: `${job.progressPercent}%` }}
                            />
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

        {/* Right column: Study stats + weakness nudge + top skills */}
        <div className="dash-col-right">
          {/* Study Overview */}
          <div className="dash-card">
            <h2 className="dash-card-title">Study Overview</h2>
            <div className="study-overview-grid">
              <div className="study-overview-stat">
                <span className="study-overview-value">{studyOverview.totalTopics}</span>
                <span className="study-overview-label">Total Topics</span>
              </div>
              <div className="study-overview-stat">
                <span className="study-overview-value">{studyOverview.avgMastery}%</span>
                <span className="study-overview-label">Avg Mastery</span>
              </div>
              <div className="study-overview-stat">
                <span className="study-overview-value">{studyOverview.totalDrills}</span>
                <span className="study-overview-label">Drills Done</span>
              </div>
              <div className="study-overview-stat">
                <span className="study-overview-value">{studyOverview.mastered}</span>
                <span className="study-overview-label">Mastered</span>
              </div>
            </div>
          </div>

          {/* Weakness Nudge */}
          {weaknessNudge && (
            <div className="dash-card dash-card-nudge">
              <div className="nudge-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <div className="nudge-content">
                <p className="nudge-label">Weakest area</p>
                <p className="nudge-topic">{weaknessNudge.category}</p>
                <p className="nudge-score">
                  {weaknessNudge.mastery > 0
                    ? `Current score: ${Math.round(weaknessNudge.mastery)}%`
                    : 'Not yet practiced'}
                </p>
              </div>
              <button
                className="nudge-cta"
                onClick={() => navigate(`/focus-chat?skill=${encodeURIComponent(weaknessNudge.category)}`)}
              >
                Practice Now
              </button>
            </div>
          )}

          {/* Top Skills */}
          {topSkills.length > 0 && (
            <div className="dash-card">
              <div className="dash-card-header">
                <h2 className="dash-card-title">Top Skills</h2>
                <button className="dash-view-all" onClick={() => navigate('/study/drills')}>
                  View all
                </button>
              </div>
              <div className="top-skills-list">
                {topSkills.map((topic) => (
                  <div key={topic.id} className="top-skill-row">
                    <span className="top-skill-name">{topic.topic_name}</span>
                    <div className="top-skill-bar-wrap">
                      <div className="top-skill-bar">
                        <div
                          className="top-skill-bar-fill"
                          style={{ width: `${Math.min(topic.score, 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="top-skill-score">{topic.score}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default MissionDashboard
