import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { api } from '../utils/api'
import LogoWithFallbacks from '../components/LogoWithFallbacks'
import './JobAnalysisPage.css'

function JobAnalysisPage({ result, companyName, progress, user }) {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('company')
  const [research, setResearch] = useState(null)
  const [researchLoading, setResearchLoading] = useState(false)
  const [serverProgress, setServerProgress] = useState(null)
  const [lastSession, setLastSession] = useState(null)

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

  // Load server progress for this job
  useEffect(() => {
    const hash = result?.jobDescriptionHash || result?.url
    if (!hash) return
    api.progress.get(hash)
      .then(res => setServerProgress(res.data))
      .catch(() => {})
  }, [result?.jobDescriptionHash])

  // Load last session for resume CTA
  useEffect(() => {
    api.practice.getHistory({ limit: 5 })
      .then(res => {
        const sessions = res.data.sessions || []
        const hash = result?.jobDescriptionHash
        const session = sessions.find(s => s.job_description_hash === hash)
        if (session) setLastSession(session)
      })
      .catch(() => {})
  }, [result?.jobDescriptionHash])

  // Normalize study plan
  const studyPlanData = useMemo(() => {
    if (!result?.studyPlan) return null
    const sp = result.studyPlan
    return {
      topics: sp.studyPlan?.topics || sp.topics || [],
      summary: sp.summary || sp.studyPlan?.summary || null,
      raw: sp,
    }
  }, [result?.studyPlan])

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
  const jobDescriptionHash = result.jobDescriptionHash || result.url || ''
  const topics = studyPlanData?.topics || []

  // Progress calculation
  const topicsStudied = new Set(serverProgress?.topicsStudied || [])
  const totalTopics = topics.length
  const studiedCount = topics.filter(t => topicsStudied.has(t.topic || t)).length
  const progressPercent = totalTopics > 0 ? Math.round((studiedCount / totalTopics) * 100) : 0

  // Logo domain
  let domain = null
  if (result.companyInfo?.url || result.url) {
    try {
      domain = new URL(result.companyInfo?.url || result.url).hostname.replace('www.', '')
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
        <div className="jb-progress-ring-wrapper">
          <svg className="jb-progress-ring" width="48" height="48" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="20" fill="none" stroke="#e6e3de" strokeWidth="3" />
            <circle
              cx="24" cy="24" r="20"
              fill="none" stroke="#f59e0b" strokeWidth="3"
              strokeDasharray={`${2 * Math.PI * 20}`}
              strokeDashoffset={`${2 * Math.PI * 20 * (1 - progressPercent / 100)}`}
              strokeLinecap="round"
              transform="rotate(-90 24 24)"
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>
          <span className="jb-progress-text">{progressPercent}%</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="jb-tabs">
        <button
          className={`jb-tab ${activeTab === 'company' ? 'active' : ''}`}
          onClick={() => setActiveTab('company')}
        >
          Company Intel
        </button>
        <button
          className={`jb-tab ${activeTab === 'prepare' ? 'active' : ''}`}
          onClick={() => setActiveTab('prepare')}
        >
          Prepare
        </button>
      </div>

      {/* Company Intel Tab */}
      {activeTab === 'company' && (
        <div className="jb-tab-content">
          {researchLoading && !research ? (
            <p className="jb-loading-text">Loading company research...</p>
          ) : (
            <div className="jb-intel-grid">
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

              {/* Empty state */}
              {!research && !researchLoading && (
                <div className="jb-card jb-card-full">
                  <p className="jb-empty-text">No company research available yet.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Prepare Tab */}
      {activeTab === 'prepare' && (
        <div className="jb-tab-content">
          {studyPlanData?.summary && (
            <p className="jb-prepare-summary">{studyPlanData.summary}</p>
          )}

          {topics.length > 0 ? (
            <div className="jb-topic-grid">
              {topics.map((topic, idx) => {
                const topicName = topic.topic || topic.name || topic
                const isStudied = topicsStudied.has(topicName)

                return (
                  <div key={idx} className={`jb-topic-card ${isStudied ? 'studied' : ''}`}>
                    <div className="jb-topic-card-header">
                      <span className={`jb-topic-status ${isStudied ? 'done' : ''}`}>
                        {isStudied ? (
                          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                            <path d="M6 10l3 3 5-6" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : (
                          <span className="jb-status-dot" />
                        )}
                      </span>
                      <span className="jb-topic-card-name">{topicName}</span>
                    </div>
                    {topic.description && (
                      <p className="jb-topic-card-desc">{topic.description}</p>
                    )}
                    {topic.keyPoints?.length > 0 && (
                      <ul className="jb-topic-card-points">
                        {topic.keyPoints.slice(0, 3).map((pt, pi) => (
                          <li key={pi}>{pt}</li>
                        ))}
                      </ul>
                    )}
                    <button
                      className="jb-topic-practice-btn"
                      onClick={() => navigate(`/focus-chat?skill=${encodeURIComponent(topicName)}`)}
                    >
                      Practice
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="jb-empty-text">No study plan available yet.</p>
          )}

          {/* CTA Buttons */}
          <div className="jb-cta-section">
            <button
              className="jb-cta-primary"
              onClick={() => navigate('/study/drills')}
            >
              Practice Drills
            </button>
            <button
              className="jb-cta-secondary"
              onClick={() => navigate(`/focus-chat?skill=${encodeURIComponent(`${roleTitle || 'Role'} at ${displayCompany}`)}`)}
            >
              Study with Chat
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default JobAnalysisPage
