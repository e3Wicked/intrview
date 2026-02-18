import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { api } from '../utils/api'
import { useGamification } from '../contexts/GamificationContext'
import { getLevelForXp } from '../utils/gamification'
import AchievementsBadgeGrid from './AchievementsBadgeGrid'
import LogoWithFallbacks from './LogoWithFallbacks'
import './MissionDashboard.css'

function MissionDashboard({ user, onAnalyzeClick }) {
  const navigate = useNavigate()
  const { gamStats } = useGamification()
  const [analyses, setAnalyses] = useState([])
  const [loading, setLoading] = useState(true)
  const [studyPlans, setStudyPlans] = useState({})
  const [serverProgress, setServerProgress] = useState({})
  const [skillStats, setSkillStats] = useState({ skills: [], weeklyStats: { questionsThisWeek: 0, questionsLastWeek: 0, changePercent: 0 } })
  const [practiceHistory, setPracticeHistory] = useState([])
  const [showAllAchievements, setShowAllAchievements] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [analysesRes, statsRes, skillStatsRes, historyRes] = await Promise.all([
        axios.get('/api/user/analyses?limit=100'),
        axios.get('/api/user/stats'),
        api.gamification.getSkillStats().catch(() => ({ data: { skills: [], weeklyStats: { questionsThisWeek: 0, questionsLastWeek: 0, changePercent: 0 } } })),
        api.practice.getHistory({ limit: 5 }).catch(() => ({ data: { sessions: [] } })),
      ])
      setAnalyses(analysesRes.data)
      setSkillStats(skillStatsRes.data)
      setPracticeHistory(historyRes.data.sessions || [])

      // Load study plans and server progress in parallel
      const plans = {}
      const progressMap = {}
      for (const analysis of analysesRes.data) {
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
      }
      setStudyPlans(plans)
      setServerProgress(progressMap)
    } catch (err) {
      console.error('Error loading dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Group analyses by company
  const companiesData = useMemo(() => {
    const grouped = analyses.reduce((acc, analysis) => {
      const company = analysis.company_name || 'Unknown Company'
      if (!acc[company]) {
        acc[company] = {
          name: company,
          roles: [],
          analyses: []
        }
      }
      acc[company].roles.push(analysis.role_title || 'Unknown Role')
      acc[company].analyses.push(analysis)
      return acc
    }, {})

    return Object.values(grouped).map(company => {
      let completedTopics = 0
      let totalTopics = 0

      company.analyses.forEach(analysis => {
        const plan = studyPlans[analysis.job_description_hash]
        if (plan?.studyPlan?.topics) {
          const sp = serverProgress[analysis.job_description_hash]
          const topicsStudied = new Set(sp?.topicsStudied || [])
          const currentTopics = plan.studyPlan.topics.map(t => t.topic)
          const studied = currentTopics.filter(t => topicsStudied.has(t))
          completedTopics += studied.length
          totalTopics += currentTopics.length
        }
      })

      const avgProgress = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0

      const latestAnalysis = company.analyses[0]
      let logoUrl = latestAnalysis?.logo_url || null
      let domain = null

      if (latestAnalysis?.url) {
        try {
          const urlObj = new URL(latestAnalysis.url)
          domain = urlObj.hostname.replace('www.', '')
        } catch (e) {}
      }

      return {
        ...company,
        roleCount: company.roles.length,
        uniqueRoles: [...new Set(company.roles)],
        progress: avgProgress,
        latestAnalysis: latestAnalysis,
        logoUrl: logoUrl,
        domain: domain
      }
    })
  }, [analyses, studyPlans, serverProgress])

  // Helpers
  const getStreakMessage = (days) => {
    if (days >= 30) return "You're unstoppable!"
    if (days >= 14) return "Amazing dedication!"
    if (days >= 7) return "On fire!"
    if (days >= 3) return "Keep it up!"
    if (days >= 1) return "Good start!"
    return "Start today!"
  }

  const getMasteryColor = (mastery) => {
    if (mastery >= 80) return '#22c55e'
    if (mastery >= 60) return '#f59e0b'
    return '#ef4444'
  }

  const getMasteryBg = (mastery) => {
    if (mastery >= 80) return 'rgba(34, 197, 94, 0.1)'
    if (mastery >= 60) return 'rgba(245, 158, 11, 0.1)'
    return 'rgba(239, 68, 68, 0.1)'
  }

  const getMasteryBorder = (mastery) => {
    if (mastery >= 80) return 'rgba(34, 197, 94, 0.25)'
    if (mastery >= 60) return 'rgba(245, 158, 11, 0.25)'
    return 'rgba(239, 68, 68, 0.25)'
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
  const weeklyStats = skillStats.weeklyStats || { questionsThisWeek: 0, changePercent: 0 }

  return (
    <div className="mission-dashboard">
      {/* Dashboard Header */}
      <div className="dash-header">
        <div className="dash-header-text">
          <h1 className="dash-title">Dashboard</h1>
          <p className="dash-subtitle">Your interview prep command center</p>
        </div>
      </div>

      {/* Stat Cards Row */}
      <div className="stat-cards-row">
        <div className="stat-card">
          <div className="stat-card-label">STUDY STREAK</div>
          <div className="stat-card-value">{streak.current} <span className="stat-card-unit">{streak.current === 1 ? 'day' : 'days'}</span></div>
          <div className="stat-card-extra">
            <span className="streak-flame">{streak.current > 0 ? '\uD83D\uDD25' : '\uD83D\uDCA4'}</span>
            <span className="stat-card-note">{getStreakMessage(streak.current)}</span>
            {streak.multiplier > 1.0 && (
              <span className="streak-multiplier-badge">{streak.multiplier}x</span>
            )}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">THIS WEEK</div>
          <div className="stat-card-value">{weeklyStats.questionsThisWeek}</div>
          <div className="stat-card-extra">
            {weeklyStats.questionsLastWeek > 0 ? (
              <span className={`stat-card-change ${weeklyStats.changePercent >= 0 ? 'positive' : 'negative'}`}>
                {weeklyStats.changePercent >= 0 ? '+' : ''}{weeklyStats.changePercent}% from last week
              </span>
            ) : weeklyStats.questionsThisWeek > 0 ? (
              <span className="stat-card-note">Great start this week!</span>
            ) : (
              <span className="stat-card-note">Start practicing!</span>
            )}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">LEVEL</div>
          <div className="stat-card-value">{levelInfo?.title || 'Applicant'}</div>
          <div className="stat-card-extra">
            <span className="stat-card-xp">{gamStats?.totalXp || 0} XP</span>
            {levelInfo && (
              <div className="stat-card-progress">
                <div className="stat-card-progress-fill" style={{ width: `${levelInfo.progressPercent || 0}%` }} />
              </div>
            )}
          </div>
        </div>

        <button className="stat-card-cta" onClick={onAnalyzeClick}>
          <span className="cta-icon">+</span>
          <span className="cta-text">Add New Job URL</span>
          {user && <span className="cta-credits">5 credits</span>}
        </button>
      </div>

      {/* Skill Heatmap */}
      <section className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">Skill Heatmap</h2>
          {skillStats.skills.length > 0 && (
            <button className="dash-section-action" onClick={() => {}}>
              Smart Practice &rarr;
            </button>
          )}
        </div>
        {skillStats.skills.length === 0 ? (
          <div className="empty-state-card">
            <p>Complete some practice questions to see your skill breakdown</p>
          </div>
        ) : (
          <div className="skill-heatmap-grid">
            {skillStats.skills.slice(0, 6).map((skill) => (
              <div
                key={skill.category}
                className="skill-card"
                style={{
                  backgroundColor: getMasteryBg(skill.mastery),
                  borderColor: getMasteryBorder(skill.mastery),
                }}
              >
                <div className="skill-card-top">
                  <span className="skill-card-name">{skill.category}</span>
                  <span
                    className="skill-card-mastery"
                    style={{ backgroundColor: getMasteryColor(skill.mastery) }}
                  >
                    {skill.mastery}%
                  </span>
                </div>
                <div className="skill-card-stats">
                  <span>Avg score {Math.round(skill.avgScore)}%</span>
                  <span>{skill.totalAttempts} {skill.totalAttempts === 1 ? 'drill' : 'drills'} completed</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Target Companies */}
      <section className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">Your Target Companies</h2>
        </div>
        {companiesData.length === 0 ? (
          <div className="empty-state-card">
            <p>No companies yet. Start by analyzing a job posting!</p>
            <button className="empty-state-cta" onClick={onAnalyzeClick}>
              Analyze Your First Job Posting
            </button>
          </div>
        ) : (
          <div className="companies-grid">
            {companiesData.map((company) => (
              <div
                key={company.name}
                className="company-card"
                onClick={() => navigate(`/company/${encodeURIComponent(company.name)}`)}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/company/${encodeURIComponent(company.name)}`)}
                tabIndex={0}
                role="button"
              >
                <div className="company-card-header">
                  <div className="company-logo-container">
                    <LogoWithFallbacks
                      domain={company.domain}
                      name={company.name}
                      logoUrl={company.logoUrl}
                    />
                  </div>
                  <div className="company-card-info">
                    <h3 className="company-name">{company.name}</h3>
                    <div className="company-meta">
                      <span className="roles-count">{company.roleCount} {company.roleCount === 1 ? 'role' : 'roles'}</span>
                    </div>
                  </div>
                </div>
                {/* Role names list */}
                {company.uniqueRoles.length > 0 && (
                  <div className="company-card-roles">
                    {company.uniqueRoles.slice(0, 3).map((role, idx) => (
                      <div key={idx} className="company-card-role-item">
                        <span className="role-bullet">{idx === company.uniqueRoles.slice(0, 3).length - 1 && company.uniqueRoles.length <= 3 ? '└' : '├'}</span>
                        <span className="role-name-text">{role}</span>
                      </div>
                    ))}
                    {company.uniqueRoles.length > 3 && (
                      <div className="company-card-role-item more">
                        <span className="role-bullet">└</span>
                        <span className="role-name-text">+{company.uniqueRoles.length - 3} more</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="company-progress">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${company.progress}%` }}
                    />
                  </div>
                  <span className="progress-text">{company.progress}% complete</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recently Completed */}
      <section className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">Recently Completed</h2>
        </div>
        {practiceHistory.length === 0 ? (
          <div className="empty-state-card">
            <p>No practice sessions yet. Start practicing to track your progress!</p>
          </div>
        ) : (
          <div className="recently-completed-list">
            {practiceHistory.map((session, idx) => {
              const scoreDisplay = session.average_score > 0 ? `${Math.round(session.average_score / 10)}/10` : null
              const mode = session.mode === 'voice' ? 'Voice Practice' : 'Quiz'
              return (
                <div key={session.id || idx} className="completed-item">
                  <div className="completed-icon">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <rect width="20" height="20" rx="4" fill="#22c55e" fillOpacity="0.15"/>
                      <path d="M6 10l3 3 5-6" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div className="completed-info">
                    <span className="completed-label">Completed {mode}</span>
                    <span className="completed-date">{new Date(session.ended_at || session.started_at).toLocaleDateString()}</span>
                  </div>
                  <div className="completed-stats">
                    {session.total_xp_earned > 0 && (
                      <span className="completed-xp">+{session.total_xp_earned} XP</span>
                    )}
                    {scoreDisplay && (
                      <span className="completed-score">{scoreDisplay}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Achievements */}
      <section className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">Achievements</h2>
          <button
            className="dash-section-action"
            onClick={() => setShowAllAchievements(!showAllAchievements)}
          >
            {showAllAchievements ? 'Show Less' : 'View All'} &rarr;
          </button>
        </div>
        <AchievementsBadgeGrid limit={showAllAchievements ? undefined : 8} />
      </section>
    </div>
  )
}

export default MissionDashboard
