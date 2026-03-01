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
  const [nudgeDismissed, setNudgeDismissed] = useState(false)
  const [lastSessions, setLastSessions] = useState({})

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [analysesRes, weaknessRes, historyRes] = await Promise.all([
        axios.get('/api/user/analyses?limit=100'),
        api.gamification.getWeaknessReport().catch(() => ({ data: null })),
        api.practice.getHistory({ limit: 20 }).catch(() => ({ data: { sessions: [] } })),
      ])
      setAnalyses(analysesRes.data)

      // Build weakness nudge from top weakness
      if (weaknessRes.data?.weakCategories?.length > 0) {
        const weakest = weaknessRes.data.weakCategories[0]
        if (weakest.mastery < 80) {
          setWeaknessNudge(weakest)
        }
      }

      // Build last session per job hash for "Resume" CTA
      const sessionMap = {}
      const sessions = historyRes.data.sessions || []
      for (const session of sessions) {
        if (session.job_description_hash && !sessionMap[session.job_description_hash]) {
          sessionMap[session.job_description_hash] = session
        }
      }
      setLastSessions(sessionMap)

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

  // Build job cards: one card per analysis (not grouped by company)
  const jobCards = useMemo(() => {
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

      let logoUrl = analysis.logo_url || null
      let domain = null
      if (analysis.url) {
        try {
          domain = new URL(analysis.url).hostname.replace('www.', '')
        } catch (e) {}
      }

      // Determine last mode for "Resume" CTA
      const lastSession = lastSessions[analysis.job_description_hash]
      let lastMode = null
      if (lastSession) {
        const mode = lastSession.mode
        if (mode === 'flashcards') lastMode = 'Flashcards'
        else if (mode === 'quiz') lastMode = 'Quiz'
        else if (mode === 'voice') lastMode = 'Voice'
        else if (mode === 'focus' || mode === 'coach') lastMode = 'Coach'
        else lastMode = null
      }

      return {
        id: analysis.id,
        companyName: analysis.company_name || 'Unknown Company',
        roleTitle: analysis.role_title || 'Unknown Role',
        progressPercent,
        logoUrl,
        domain,
        jobDescriptionHash: analysis.job_description_hash,
        lastMode,
      }
    })
  }, [analyses, studyPlans, serverProgress, lastSessions])

  // Find the most recently active job for nudge link
  const mostRecentJobId = analyses.length > 0 ? analyses[0].id : null

  const handleDismissNudge = () => {
    setNudgeDismissed(true)
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

  const hasTrainingData = streak.current > 0 || (gamStats?.totalXp || 0) > 0 || (weaknessNudge && !nudgeDismissed)

  return (
    <div className="mission-dashboard">
      {/* Dashboard Header */}
      <div className="dash-header">
        <div className="dash-header-text">
          <h1 className="dash-title">Dashboard</h1>
        </div>
      </div>

      {/* Analyze New Job CTA — primary action */}
      <div className="analyze-cta-row">
        <button className="analyze-cta-btn" onClick={onAnalyzeClick}>
          <span className="analyze-cta-icon">+</span>
          <span className="analyze-cta-text">Analyze New Job</span>
          {user && <span className="analyze-cta-credits">5 credits</span>}
        </button>
      </div>

      {/* Your Jobs */}
      <section className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">Your Jobs</h2>
        </div>
        {jobCards.length === 0 ? (
          <div className="empty-state-card">
            <p>No jobs yet. Start by analyzing a job posting!</p>
            <button className="empty-state-cta" onClick={onAnalyzeClick}>
              Analyze Your First Job Posting
            </button>
          </div>
        ) : (
          <div className="jobs-grid">
            {jobCards.map((job) => (
              <div key={job.id} className="job-card">
                <div
                  className="job-card-header"
                  onClick={() => navigate(`/job/${job.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/job/${job.id}`)}
                  title="View Job Brief"
                >
                  <div className="job-card-logo">
                    <LogoWithFallbacks
                      domain={job.domain}
                      name={job.companyName}
                      logoUrl={job.logoUrl}
                    />
                  </div>
                  <div className="job-card-info">
                    <h3 className="job-card-company">{job.companyName}</h3>
                    <p className="job-card-role">{job.roleTitle}</p>
                  </div>
                </div>

                <div className="job-card-progress">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${job.progressPercent}%` }} />
                  </div>
                  <span className="progress-text">{job.progressPercent}%</span>
                </div>

                <div className="job-card-actions">
                  <button
                    className="job-card-cta primary"
                    onClick={() => navigate(`/job/${job.id}/train`)}
                  >
                    Start Training &rarr;
                  </button>
                  {job.lastMode && (
                    <button
                      className="job-card-cta secondary"
                      onClick={() => navigate(`/job/${job.id}/train?mode=${job.lastMode.toLowerCase()}`)}
                    >
                      Resume {job.lastMode} &rarr;
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Your Training — hidden when user has no training data */}
      {hasTrainingData && (
        <section className="dash-section">
          <div className="dash-section-header">
            <h2 className="dash-section-title">Your Training</h2>
          </div>

          <div className="training-stats">
            <div className="status-bar">
              <div className="status-bar-item">
                <span className="status-bar-icon">{streak.current > 0 ? '\uD83D\uDD25' : '\uD83D\uDCA4'}</span>
                <span className="status-bar-label">{streak.current} day streak</span>
                {streak.multiplier > 1.0 && (
                  <span className="status-bar-multiplier">{streak.multiplier}x</span>
                )}
              </div>
              <span className="status-bar-divider" />
              <div className="status-bar-item">
                <span className="status-bar-label">{levelInfo?.title || 'Applicant'}</span>
              </div>
              <span className="status-bar-divider" />
              <div className="status-bar-item">
                <span className="status-bar-xp">{gamStats?.totalXp || 0} XP</span>
                {levelInfo && (
                  <div className="status-bar-progress">
                    <div className="status-bar-progress-fill" style={{ width: `${levelInfo.progressPercent || 0}%` }} />
                  </div>
                )}
              </div>
            </div>

            {weaknessNudge && !nudgeDismissed && mostRecentJobId && (
              <div className="nudge-banner">
                <span className="nudge-text">
                  You're weakest in <strong>{weaknessNudge.category}</strong> ({weaknessNudge.mastery}% mastery)
                </span>
                <button
                  className="nudge-action"
                  onClick={() => navigate(`/job/${mostRecentJobId}/train?mode=coach&focus=${encodeURIComponent(weaknessNudge.category)}`)}
                >
                  Practice now &rarr;
                </button>
                <button className="nudge-dismiss" onClick={handleDismissNudge} title="Dismiss">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

export default MissionDashboard
