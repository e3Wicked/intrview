import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import LogoWithFallbacks from '../components/LogoWithFallbacks'
import './CompanyPage.css'

function CompanyPage({ user }) {
  const { companyName } = useParams()
  const navigate = useNavigate()
  const [analyses, setAnalyses] = useState([])
  const [studyPlans, setStudyPlans] = useState({})
  const [serverProgress, setServerProgress] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCompanyData()
  }, [companyName])

  const loadCompanyData = async () => {
    try {
      setLoading(true)
      const analysesRes = await axios.get('/api/user/analyses?limit=100')
      const companyAnalyses = analysesRes.data.filter(
        a => (a.company_name || '').toLowerCase() === decodeURIComponent(companyName).toLowerCase()
      )
      setAnalyses(companyAnalyses)

      // Single role: redirect directly to job brief
      if (companyAnalyses.length === 1) {
        navigate(`/job/${companyAnalyses[0].id}`, { replace: true })
        return
      }

      // Load study plans and progress for multi-role view
      const plans = {}
      const progress = {}
      await Promise.all(companyAnalyses.map(async (analysis) => {
        try {
          const [planRes, progressRes] = await Promise.all([
            axios.get(`/api/user/study-plan/${analysis.job_description_hash}`).catch(() => null),
            axios.get(`/api/progress/${analysis.job_description_hash}`).catch(() => null),
          ])
          if (planRes?.data) plans[analysis.job_description_hash] = planRes.data
          if (progressRes?.data) progress[analysis.job_description_hash] = progressRes.data
        } catch (e) {}
      }))
      setStudyPlans(plans)
      setServerProgress(progress)
    } catch (err) {
      console.error('Error loading company data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Compute per-role cards
  const roleCards = useMemo(() => {
    return analyses.map(analysis => {
      const plan = studyPlans[analysis.job_description_hash]
      const prog = serverProgress[analysis.job_description_hash]

      const topics = plan?.studyPlan?.topics || plan?.topics || []
      const topicCount = topics.length
      let progressPercent = 0
      if (topicCount > 0 && prog?.topicsStudied) {
        const studied = new Set(prog.topicsStudied)
        const completed = topics.filter(t => studied.has(t.topic || t)).length
        progressPercent = Math.round((completed / topicCount) * 100)
      }

      let domain = null
      try {
        if (analysis.url) domain = new URL(analysis.url).hostname.replace('www.', '')
      } catch (e) {}

      return {
        ...analysis,
        topicCount,
        progressPercent,
        domain,
        date: new Date(analysis.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      }
    })
  }, [analyses, studyPlans, serverProgress])

  if (loading) {
    return <div className="company-page-loading">Loading company data...</div>
  }

  if (analyses.length === 0) {
    return (
      <div className="company-page-empty">
        <p>No analyses found for this company.</p>
        <button onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
      </div>
    )
  }

  const firstAnalysis = analyses[0]
  let domain = null
  try {
    if (firstAnalysis?.url) {
      domain = new URL(firstAnalysis.url).hostname.replace('www.', '')
    }
  } catch (e) {}

  return (
    <div className="company-page">
      {/* Back */}
      <button className="company-back-button" onClick={() => navigate('/dashboard')} title="Back to Dashboard">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Back to Dashboard
      </button>

      {/* Company Header */}
      <div className="company-page-header">
        <div className="company-header-left">
          <div className="company-logo-large-container">
            {domain ? (
              <LogoWithFallbacks domain={domain} name={companyName} logoUrl={firstAnalysis.logo_url} />
            ) : (
              <div className="company-logo-large">{decodeURIComponent(companyName).charAt(0).toUpperCase()}</div>
            )}
          </div>
          <div>
            <h1 className="company-page-title">{decodeURIComponent(companyName)}</h1>
            <div className="company-header-meta">
              <span className="roles-badge">{analyses.length} roles analyzed</span>
            </div>
          </div>
        </div>
      </div>

      {/* Role Cards */}
      <div className="company-roles-grid">
        {roleCards.map(role => (
          <div
            key={role.id}
            className="company-role-card"
            onClick={() => navigate(`/job/${role.id}`)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && navigate(`/job/${role.id}`)}
          >
            <div className="company-role-card-header">
              <div className="company-role-logo">
                <LogoWithFallbacks domain={role.domain} name={role.company_name} logoUrl={role.logo_url} />
              </div>
              <div className="company-role-info">
                <h3 className="company-role-title">{role.role_title || 'Unknown Role'}</h3>
                <span className="company-role-date">{role.date}</span>
              </div>
            </div>
            <div className="company-role-progress">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${role.progressPercent}%` }} />
              </div>
              <span className="progress-text">{role.progressPercent}% complete</span>
            </div>
            <button
              className="company-role-cta"
              onClick={(e) => {
                e.stopPropagation()
                navigate(`/job/${role.id}/train`)
              }}
            >
              Start Training &rarr;
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default CompanyPage
