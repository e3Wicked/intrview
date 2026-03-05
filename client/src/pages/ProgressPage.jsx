import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { api } from '../utils/api'
import { useGamification } from '../contexts/GamificationContext'
import { getLevelForXp } from '../utils/gamification'
import AchievementsBadgeGrid from '../components/AchievementsBadgeGrid'
import './ProgressPage.css'

function ProgressPage({ user }) {
  const navigate = useNavigate()
  const { gamStats } = useGamification()
  const [skillStats, setSkillStats] = useState({ skills: [], weeklyStats: { questionsThisWeek: 0, questionsLastWeek: 0, changePercent: 0 } })
  const [weaknessReport, setWeaknessReport] = useState(null)
  const [practiceHistory, setPracticeHistory] = useState([])
  const [analyses, setAnalyses] = useState([])
  const [heatmapScope, setHeatmapScope] = useState('all')
  const [selectedJobHash, setSelectedJobHash] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [skillRes, weakRes, historyRes, analysesRes] = await Promise.all([
        api.gamification.getSkillStats().catch(() => ({ data: { skills: [], weeklyStats: {} } })),
        api.gamification.getWeaknessReport().catch(() => ({ data: null })),
        api.practice.getHistory({ limit: 10 }).catch(() => ({ data: { sessions: [] } })),
        axios.get('/api/user/analyses?limit=100').catch(() => ({ data: [] })),
      ])
      setSkillStats(skillRes.data)
      setWeaknessReport(weakRes.data)
      setPracticeHistory(historyRes.data.sessions || [])
      setAnalyses(analysesRes.data)

      // Default to first job if available
      if (analysesRes.data.length > 0) {
        setSelectedJobHash(analysesRes.data[0].job_description_hash)
      }
    } catch (err) {
      console.error('Error loading progress data:', err)
    } finally {
      setLoading(false)
    }
  }

  const levelInfo = gamStats ? getLevelForXp(gamStats.totalXp) : null
  const streak = gamStats?.streak || { current: 0, multiplier: 1.0 }

  const getMasteryColor = (mastery) => {
    if (mastery >= 80) return '#22c55e'
    if (mastery >= 60) return '#f59e0b'
    return '#ef4444'
  }

  // Filter skills by job scope
  const displaySkills = skillStats.skills || []

  // Top 3 weaknesses
  const weakSpots = useMemo(() => {
    if (!weaknessReport?.weakCategories) return []
    return weaknessReport.weakCategories.filter(c => c.mastery < 80).slice(0, 3)
  }, [weaknessReport])

  // Most recently active job ID for "Practice this" links
  const mostRecentJobId = analyses.length > 0 ? analyses[0].id : null

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
      </div>

      {/* Stats Bar */}
      <div className="progress-stats-bar">
        <div className="progress-stat-block">
          <span className="progress-stat-label">Level</span>
          <span className="progress-stat-value">{levelInfo?.title || 'Applicant'}</span>
        </div>
        <div className="progress-stat-divider" />
        <div className="progress-stat-block">
          <span className="progress-stat-label">Total XP</span>
          <span className="progress-stat-value progress-stat-xp">{gamStats?.totalXp || 0}</span>
          {levelInfo && (
            <div className="progress-stat-bar">
              <div className="progress-stat-bar-fill" style={{ width: `${levelInfo.progressPercent || 0}%` }} />
            </div>
          )}
        </div>
        <div className="progress-stat-divider" />
        <div className="progress-stat-block">
          <span className="progress-stat-label">Streak</span>
          <span className="progress-stat-value">
            {streak.current > 0 ? '\uD83D\uDD25' : '\uD83D\uDCA4'} {streak.current} {streak.current === 1 ? 'day' : 'days'}
          </span>
          {streak.multiplier > 1.0 && (
            <span className="progress-stat-multiplier">{streak.multiplier}x multiplier</span>
          )}
        </div>
        <div className="progress-stat-divider" />
        <div className="progress-stat-block">
          <span className="progress-stat-label">This Week</span>
          <span className="progress-stat-value">{skillStats.weeklyStats?.questionsThisWeek || 0} questions</span>
          {skillStats.weeklyStats?.changePercent != null && skillStats.weeklyStats.questionsLastWeek > 0 && (
            <span className={`progress-stat-change ${skillStats.weeklyStats.changePercent >= 0 ? 'positive' : 'negative'}`}>
              {skillStats.weeklyStats.changePercent >= 0 ? '+' : ''}{skillStats.weeklyStats.changePercent}% vs last week
            </span>
          )}
        </div>
      </div>

      {/* Skill Heatmap */}
      <section className="progress-section">
        <div className="progress-section-header">
          <h2 className="progress-section-title">Skill Heatmap</h2>
          <div className="heatmap-scope-toggle">
            <button
              className={`heatmap-scope-btn ${heatmapScope === 'all' ? 'active' : ''}`}
              onClick={() => setHeatmapScope('all')}
            >
              All Jobs
            </button>
            {analyses.length > 0 && (
              <button
                className={`heatmap-scope-btn ${heatmapScope === 'job' ? 'active' : ''}`}
                onClick={() => setHeatmapScope('job')}
              >
                Per Job
              </button>
            )}
          </div>
        </div>

        {heatmapScope === 'job' && analyses.length > 0 && (
          <div className="heatmap-job-selector">
            {analyses.map(a => (
              <button
                key={a.id}
                className={`heatmap-job-chip ${selectedJobHash === a.job_description_hash ? 'active' : ''}`}
                onClick={() => setSelectedJobHash(a.job_description_hash)}
              >
                {a.company_name} - {a.role_title}
              </button>
            ))}
          </div>
        )}

        {displaySkills.length === 0 ? (
          <div className="progress-empty-card">
            <p>Complete some practice sessions to see your skill breakdown.</p>
          </div>
        ) : (
          <div className="skill-heatmap">
            {displaySkills.slice(0, 12).map((skill, i) => (
              <div key={skill.category} className="skill-heatmap-row">
                <span className="skill-heatmap-label">{skill.category}</span>
                <div className="skill-heatmap-track">
                  <div
                    className="skill-heatmap-fill"
                    style={{
                      '--bar-width': `${skill.mastery}%`,
                      '--bar-color': getMasteryColor(skill.mastery),
                      animationDelay: `${i * 0.06}s`,
                    }}
                  />
                </div>
                <span className="skill-heatmap-value" style={{ color: getMasteryColor(skill.mastery) }}>
                  {skill.mastery}%
                </span>
                <span className="skill-heatmap-meta">
                  {skill.totalAttempts} {skill.totalAttempts === 1 ? 'drill' : 'drills'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Weak Spots */}
      {weakSpots.length > 0 && (
        <section className="progress-section">
          <div className="progress-section-header">
            <h2 className="progress-section-title">Weak Spots</h2>
          </div>
          <div className="weak-spots-list">
            {weakSpots.map((cat, i) => (
              <div key={cat.category} className="weak-spot-card">
                <div className="weak-spot-info">
                  <span className="weak-spot-rank">{i + 1}.</span>
                  <span className="weak-spot-name">{cat.category}</span>
                  <span className="weak-spot-mastery" style={{ color: getMasteryColor(cat.mastery) }}>
                    {cat.mastery}%
                  </span>
                </div>
                <div className="weak-spot-bar">
                  <div className="weak-spot-bar-fill" style={{ width: `${cat.mastery}%`, background: getMasteryColor(cat.mastery) }} />
                </div>
                {mostRecentJobId && (
                  <button
                    className="weak-spot-action"
                    onClick={() => navigate(`/job/${mostRecentJobId}/train?mode=coach&focus=${encodeURIComponent(cat.category)}`)}
                  >
                    Practice this &rarr;
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent Activity */}
      <section className="progress-section">
        <div className="progress-section-header">
          <h2 className="progress-section-title">Recent Activity</h2>
        </div>
        {practiceHistory.length === 0 ? (
          <div className="progress-empty-card">
            <p>No practice sessions yet. Start practicing to track your progress!</p>
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
                    {session.total_xp_earned > 0 && (
                      <span className="activity-xp">+{session.total_xp_earned} XP</span>
                    )}
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

      {/* Achievements */}
      <section className="progress-section">
        <div className="progress-section-header">
          <h2 className="progress-section-title">Achievements</h2>
        </div>
        <AchievementsBadgeGrid />
      </section>
    </div>
  )
}

export default ProgressPage
