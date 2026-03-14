import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import LogoWithFallbacks from '../components/LogoWithFallbacks'
import './JobAnalysisPage.css'

function JobAnalysisPage({ result, companyName, progress, user }) {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [research, setResearch] = useState(null)
  const [researchLoading, setResearchLoading] = useState(false)

  // Load company research (use result.companyResearch first, fetch as fallback)
  useEffect(() => {
    if (result?.companyResearch) {
      setResearch(result.companyResearch)
      return
    }
    const name = result?.companyInfo?.name || companyName
    if (!name || name === 'Company' || name === 'UNKNOWN') return
    setResearchLoading(true)
    axios.post('/api/company/research', {
      companyName: name,
      jobDescription: result?.jobDescription || '',
    }, { timeout: 30000, validateStatus: s => s < 500 })
      .then(res => {
        if (res.data?.success) {
          setResearch(res.data.research || res.data)
        }
      })
      .catch(() => {})
      .finally(() => setResearchLoading(false))
  }, [result?.companyInfo?.name, result?.companyResearch, companyName])


  if (!result) {
    return (
      <div style={{ padding: '64px', textAlign: 'center', color: '#6b6b6b' }}>
        <p>No job analysis found. Please analyze a job posting first.</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="jb-back-btn"
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  const roleTitle = result.companyInfo?.roleTitle || result.company?.roleTitle || ''
  const displayCompany = result.companyInfo?.name || companyName || 'Company'

  // Logo domain — prefer company website, skip job board domains
  const jobBoardDomains = ['linkedin.com', 'indeed.com', 'glassdoor.com', 'lever.co', 'greenhouse.io', 'workday.com', 'jobs.']
  let domain = null
  const domainCandidates = [result.companyInfo?.website, result.companyInfo?.url, result.url].filter(Boolean)
  for (const candidate of domainCandidates) {
    try {
      const hostname = new URL(candidate).hostname.replace('www.', '')
      if (!jobBoardDomains.some(jb => hostname.includes(jb))) {
        domain = hostname
        break
      }
    } catch (e) {}
  }

  // Company info for About card
  const companyInfo = result.companyInfo || {}
  const companyWebsite = companyInfo.website || companyInfo.url || result.url || null

  return (
    <div className="job-brief">
      {/* Back */}
      <button className="jb-nav-back" onClick={() => navigate('/dashboard')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Dashboard
      </button>

      {/* Header */}
      <div className="jb-header">
        <div className="jb-header-left">
          <div className="jb-logo">
            {domain ? (
              <LogoWithFallbacks domain={domain} name={displayCompany} logoUrl={companyInfo.logoUrl} />
            ) : (
              <div className="logo-placeholder">{displayCompany.charAt(0).toUpperCase()}</div>
            )}
          </div>
          <div className="jb-header-info">
            <h1 className="jb-company-name">
              <a
                href={`/company/${encodeURIComponent(displayCompany)}`}
                onClick={(e) => { e.preventDefault(); navigate(`/company/${encodeURIComponent(displayCompany)}`) }}
                className="jb-company-link"
              >
                {displayCompany}
              </a>
            </h1>
            <p className="jb-role-title">{roleTitle}</p>
          </div>
        </div>
      </div>

      {/* Company Intel */}
      {researchLoading && !research ? (
        <p className="jb-loading-text">Loading company research...</p>
      ) : (
        <div className="jb-intel-grid">
          {/* Job Description Card - full width, first */}
          {result.jobDescription && (
            <div className="jb-card jb-card-full">
              <h3 className="jb-card-title">Job Description</h3>
              <p className="jb-card-text" style={{ whiteSpace: 'pre-wrap' }}>{result.jobDescription}</p>
            </div>
          )}

          {/* About Card - full width */}
          <div className="jb-card jb-card-full">
            <h3 className="jb-card-title">About</h3>
            {companyInfo.description && (
              <p className="jb-card-text">{companyInfo.description}</p>
            )}
            {research?.culture && !companyInfo.description && (
              <p className="jb-card-text">{research.culture}</p>
            )}
            <div className="jb-about-meta">
              {companyInfo.founded && (
                <span className="jb-meta-item">
                  <span className="jb-meta-label">Founded</span>
                  <span className="jb-meta-value">{companyInfo.founded}</span>
                </span>
              )}
              {research?.teamSize && (
                <span className="jb-meta-item">
                  <span className="jb-meta-label">Team</span>
                  <span className="jb-meta-value">{research.teamSize}</span>
                </span>
              )}
              {companyWebsite && (
                <a
                  href={companyWebsite}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="jb-website-link"
                >
                  Visit website
                </a>
              )}
            </div>
          </div>

          {/* Founders Card */}
          {companyInfo.founders?.length > 0 && (
            <div className="jb-card">
              <h3 className="jb-card-title">Founders</h3>
              <div className="jb-founders-list">
                {companyInfo.founders.map((founder, i) => (
                  <div key={i} className="jb-founder-row">
                    <div className="jb-founder-info">
                      <span className="jb-founder-name">{founder.name}</span>
                      {founder.background && (
                        <span className="jb-founder-bg">{founder.background}</span>
                      )}
                    </div>
                    {founder.linkedin && (
                      <a
                        href={founder.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="jb-linkedin-link"
                      >
                        LinkedIn
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Funding Rounds Card - full width */}
          {companyInfo.fundingRounds?.length > 0 && (
            <div className="jb-card jb-card-full">
              <h3 className="jb-card-title">Funding</h3>
              <div className="jb-funding-timeline">
                {companyInfo.fundingRounds.map((round, i) => (
                  <div key={i} className="jb-funding-item">
                    <div className="jb-funding-dot" />
                    {i < companyInfo.fundingRounds.length - 1 && (
                      <div className="jb-funding-line" />
                    )}
                    <div className="jb-funding-content">
                      <div className="jb-funding-header">
                        <span className="jb-funding-type">{round.type || round.round || 'Round'}</span>
                        {round.year && <span className="jb-funding-year">{round.year}</span>}
                      </div>
                      {round.amount && (
                        <span className="jb-funding-amount">{round.amount}</span>
                      )}
                      {round.leadInvestors && (
                        <span className="jb-funding-investors">
                          {Array.isArray(round.leadInvestors)
                            ? round.leadInvestors.join(', ')
                            : round.leadInvestors}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Culture & Values Card */}
          {(research?.culture || research?.values?.length > 0) && (
            <div className="jb-card">
              <h3 className="jb-card-title">Culture & Values</h3>
              {research.culture && companyInfo.description && (
                <p className="jb-card-text">{research.culture}</p>
              )}
              {research.values?.length > 0 && (
                <div className="jb-pills">
                  {research.values.map((v, i) => (
                    <span key={i} className="jb-pill jb-pill-green">{v}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tech Stack Card */}
          {research?.techStack?.length > 0 && (
            <div className="jb-card">
              <h3 className="jb-card-title">Tech Stack</h3>
              <div className="jb-pills">
                {research.techStack.map((t, i) => (
                  <span key={i} className="jb-pill jb-pill-blue">{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Interview Tips Card */}
          {research?.interviewTips?.length > 0 && (
            <div className="jb-card">
              <h3 className="jb-card-title">Interview Tips</h3>
              <ul className="jb-card-list">
                {research.interviewTips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Recent News Card */}
          {research?.recentNews?.length > 0 && (
            <div className="jb-card">
              <h3 className="jb-card-title">Recent News</h3>
              <ul className="jb-card-list">
                {research.recentNews.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Unique Aspects Card */}
          {research?.uniqueAspects?.length > 0 && (
            <div className="jb-card">
              <h3 className="jb-card-title">What Makes Them Unique</h3>
              <ul className="jb-card-list">
                {research.uniqueAspects.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Fallback: show job description if no intel and no JD card already shown */}
          {!research && !researchLoading && !result.jobDescription && (
            <div className="jb-card jb-card-full">
              <p className="jb-empty-text">Company intel unavailable — try refreshing or check back later.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default JobAnalysisPage
