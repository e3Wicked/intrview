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
  const [companyInfo, setCompanyInfo] = useState(null)
  const [companyResearch, setCompanyResearch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [intelLoading, setIntelLoading] = useState(false)

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

      // Fetch company intel data in parallel
      if (companyAnalyses.length > 0) {
        setIntelLoading(true)
        const [fullRes, researchRes] = await Promise.all([
          axios.get(`/api/user/analysis/${companyAnalyses[0].id}`).catch(() => null),
          axios.post('/api/company/research', {
            companyName: decodeURIComponent(companyName)
          }).catch(() => null),
        ])

        if (fullRes?.data?.companyInfo) {
          setCompanyInfo(fullRes.data.companyInfo)
        }
        if (researchRes?.data?.success) {
          setCompanyResearch(researchRes.data.research)
        }
        setIntelLoading(false)
      }
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

  // Merge funding rounds from companyInfo and research, deduplicated by year+type
  const fundingRounds = useMemo(() => {
    const infoRounds = companyInfo?.fundingRounds || []
    const researchRounds = companyResearch?.recentFundingRounds || []
    const all = [...infoRounds, ...researchRounds]
    const seen = new Set()
    return all.filter(r => {
      const key = `${r.year}-${r.type}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).sort((a, b) => (parseInt(a.year) || 0) - (parseInt(b.year) || 0))
  }, [companyInfo, companyResearch])

  const founders = companyInfo?.founders || []
  const techStack = companyResearch?.techStack || []
  const culture = companyResearch?.culture
  const values = companyResearch?.values || []
  const description = companyInfo?.description
  const founded = companyInfo?.founded
  const website = companyInfo?.website

  const hasAbout = description || founded || website
  const hasIntel = founders.length > 0 || techStack.length > 0 || (culture && culture !== 'Information not available') || values.length > 0

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
              {founded && <span className="company-founded-badge">Founded {founded}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Company Intel */}
      {intelLoading ? (
        <div className="company-intel-loading">Loading company info...</div>
      ) : (
        <>
          {/* About Section */}
          {hasAbout && (
            <div className="company-about">
              {description && <p className="company-about-text">{description}</p>}
              {website && (
                <a
                  className="company-about-link"
                  href={website.startsWith('http') ? website : `https://${website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
              )}
            </div>
          )}

          {/* Intel Grid */}
          {hasIntel && (
            <div className="company-intel-grid">
              {founders.length > 0 && (
                <div className="company-intel-card">
                  <h3>Founders</h3>
                  <div className="company-founders-list">
                    {founders.map((f, i) => (
                      <div key={i} className="company-founder-row">
                        <div className="company-founder-info">
                          <span className="company-founder-name">{f.name}</span>
                          {f.background && (
                            <span className="company-founder-background">{f.background}</span>
                          )}
                        </div>
                        {f.linkedin && f.linkedin !== 'null' && (
                          <a
                            className="company-founder-linkedin"
                            href={f.linkedin}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`${f.name} on LinkedIn`}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                            </svg>
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {techStack.length > 0 && (
                <div className="company-intel-card">
                  <h3>Tech Stack</h3>
                  <div className="company-tech-pills">
                    {techStack.map((tech, i) => (
                      <span key={i} className="company-tech-pill">{tech}</span>
                    ))}
                  </div>
                </div>
              )}

              {culture && culture !== 'Information not available' && (
                <div className="company-intel-card">
                  <h3>Culture</h3>
                  <p className="company-intel-text">{culture}</p>
                </div>
              )}

              {values.length > 0 && (
                <div className="company-intel-card">
                  <h3>Values</h3>
                  <div className="company-tech-pills">
                    {values.map((v, i) => (
                      <span key={i} className="company-tech-pill company-value-pill">{v}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Funding Timeline */}
          {fundingRounds.length > 0 && (
            <div className="company-funding-section">
              <h3 className="company-funding-title">Funding Timeline</h3>
              <div className="company-funding-timeline">
                {fundingRounds.map((round, i) => (
                  <div key={i} className="company-funding-card">
                    <span className="company-funding-year">{round.year}{round.month ? ` - ${round.month}` : ''}</span>
                    <span className="company-funding-type">{round.type}</span>
                    {round.amount && <span className="company-funding-amount">{round.amount}</span>}
                    {round.leadInvestors && round.leadInvestors.length > 0 && (
                      <span className="company-funding-investors">
                        {round.leadInvestors.join(', ')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Role Cards */}
      <div className="company-roles-section">
        <h3 className="company-roles-heading">Roles</h3>
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
                  navigate(`/job/${role.id}`)
                }}
              >
                View Brief &rarr;
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default CompanyPage
