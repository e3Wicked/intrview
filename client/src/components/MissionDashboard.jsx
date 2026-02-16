import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { api } from '../utils/api'
import XPBar from './XPBar'
import StreakCounter from './StreakCounter'
import './MissionDashboard.css'
import LogoWithFallbacks from './LogoWithFallbacks'

function MissionDashboard({ user, onAnalyzeClick }) {
  const navigate = useNavigate()
  const [analyses, setAnalyses] = useState([])
  const [loading, setLoading] = useState(true)
  const [studyPlans, setStudyPlans] = useState({})
  const [serverProgress, setServerProgress] = useState({})

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [analysesRes, statsRes] = await Promise.all([
        axios.get('/api/user/analyses?limit=100'),
        axios.get('/api/user/stats')
      ])
      setAnalyses(analysesRes.data)

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

    // Calculate progress for each company using server data
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

  const recentActivity = useMemo(() => {
    return analyses.slice(0, 5).map(analysis => ({
      id: analysis.id,
      type: 'analysis',
      message: `Analyzed ${analysis.company_name} - ${analysis.role_title}`,
      timestamp: analysis.created_at
    }))
  }, [analyses])

  if (loading) {
    return (
      <div className="mission-dashboard">
        <div className="dashboard-loading">Loading your mission control...</div>
      </div>
    )
  }

  return (
    <div className="mission-dashboard">
      {/* Gamification Header */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginBottom: '20px',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <XPBar compact />
        <StreakCounter compact />
      </div>

      {/* Top Bar */}
      <div className="dashboard-top-bar">
        <div className="dashboard-credits">
          <span className="credits-label">Credits:</span>
          <span className="credits-value">{user?.creditsRemaining || 0}</span>
          <span className="credits-usage">
            {analyses.length}/{user?.planDetails?.monthlyJobAnalyses === -1 ? '∞' : (user?.planDetails?.monthlyJobAnalyses || 0)} analyses
          </span>
        </div>
        <button
          className="dashboard-primary-cta"
          onClick={onAnalyzeClick}
        >
          + Add New Job URL
        </button>
      </div>

      {/* Target Companies Section */}
      <section className="dashboard-section">
        <h2 className="section-title">Your Target Companies</h2>
        {companiesData.length === 0 ? (
          <div className="empty-state-card">
            <p>No companies yet. Start by analyzing a job posting!</p>
            <button className="empty-state-cta" onClick={onAnalyzeClick}>
              Analyze Your First Job Posting
            </button>
          </div>
        ) : (
          <div className="companies-grid">
            {companiesData.map((company, idx) => (
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
                <div className="company-progress">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${company.progress}%` }}
                    />
                  </div>
                  <span className="progress-text">{company.progress}% complete</span>
                </div>
                <div className="company-roles-count">
                  {company.roleCount} {company.roleCount === 1 ? 'role' : 'roles'} analyzed
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Activity Section */}
      <section className="dashboard-section">
        <h2 className="section-title">Recent Activity</h2>
        {recentActivity.length === 0 ? (
          <div className="empty-state-card">
            <p>No activity yet. Start analyzing job postings!</p>
          </div>
        ) : (
          <div className="activity-feed">
            {recentActivity.map(activity => (
              <div key={activity.id} className="activity-item">
                <div className="activity-icon">✓</div>
                <div className="activity-content">
                  <div className="activity-message">{activity.message}</div>
                  <div className="activity-time">
                    {new Date(activity.timestamp).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default MissionDashboard
