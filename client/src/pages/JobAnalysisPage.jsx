import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { api } from '../utils/api'
import LogoWithFallbacks from '../components/LogoWithFallbacks'
import './JobAnalysisPage.css'

function JobAnalysisPage({ result, companyName, progress, user }) {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [showFullResearch, setShowFullResearch] = useState(false)
  const [research, setResearch] = useState(null)
  const [researchLoading, setResearchLoading] = useState(false)
  const [expandedTopic, setExpandedTopic] = useState(null)
  const [serverProgress, setServerProgress] = useState(null)
  const [lastSession, setLastSession] = useState(null)

  // Load company research
  useEffect(() => {
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
  }, [result?.companyInfo?.name, companyName])

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
      <div style={{ padding: '64px', textAlign: 'center', color: '#888' }}>
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

  // Key intel bullets
  const keyIntelBullets = []
  if (research?.techStack?.length > 0) {
    keyIntelBullets.push(`Tech stack: ${research.techStack.slice(0, 5).join(', ')}`)
  }
  if (research?.teamSize) {
    keyIntelBullets.push(`Team: ${research.teamSize}`)
  }
  if (research?.uniqueAspects?.length > 0) {
    keyIntelBullets.push(research.uniqueAspects[0])
  }
  if (research?.culture) {
    keyIntelBullets.push(research.culture.length > 120 ? research.culture.substring(0, 120) + '...' : research.culture)
  }

  // Resume CTA state
  let resumeLabel = null
  if (lastSession) {
    const modeLabel = lastSession.mode === 'voice' ? 'Voice'
      : lastSession.mode === 'flashcards' ? 'Flashcards'
      : lastSession.mode === 'focus' ? 'Coach'
      : 'Quiz'
    const attempted = lastSession.questions_attempted || 0
    resumeLabel = `Resume ${modeLabel}${attempted > 0 ? ` \u2014 ${attempted} done` : ''}`
  }

  return (
    <div className="job-brief">
      {/* Back */}
      <button className="jb-nav-back" onClick={() => navigate('/dashboard')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Back to Dashboard
      </button>

      {/* Header with progress ring */}
      <div className="jb-header">
        <div className="jb-header-left">
          <div className="jb-logo">
            {domain ? (
              <LogoWithFallbacks domain={domain} name={displayCompany} logoUrl={result.companyInfo?.logoUrl} />
            ) : (
              <div className="logo-placeholder">{displayCompany.charAt(0).toUpperCase()}</div>
            )}
          </div>
          <div className="jb-header-info">
            <h1 className="jb-company-name">{displayCompany}</h1>
            <p className="jb-role-title">{roleTitle}</p>
          </div>
        </div>
        <div className="jb-progress-ring-wrapper">
          <svg className="jb-progress-ring" width="64" height="64" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="#2a2a2a" strokeWidth="4" />
            <circle
              cx="32" cy="32" r="28"
              fill="none" stroke="#f59e0b" strokeWidth="4"
              strokeDasharray={`${2 * Math.PI * 28}`}
              strokeDashoffset={`${2 * Math.PI * 28 * (1 - progressPercent / 100)}`}
              strokeLinecap="round"
              transform="rotate(-90 32 32)"
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>
          <span className="jb-progress-text">{progressPercent}%</span>
        </div>
      </div>

      {/* Key Intel */}
      <section className="jb-section">
        <h2 className="jb-section-title">Key Intel</h2>
        {researchLoading && keyIntelBullets.length === 0 ? (
          <p className="jb-loading-text">Loading company research...</p>
        ) : keyIntelBullets.length > 0 ? (
          <>
            <ul className="jb-intel-list">
              {keyIntelBullets.slice(0, 4).map((bullet, i) => (
                <li key={i} className="jb-intel-item">{bullet}</li>
              ))}
            </ul>
            <button
              className="jb-expand-btn"
              onClick={() => setShowFullResearch(!showFullResearch)}
            >
              {showFullResearch ? 'Hide full research' : 'See full research \u2192'}
            </button>
          </>
        ) : (
          <p className="jb-empty-text">No company research available yet.</p>
        )}

        {/* Full research expandable */}
        {showFullResearch && research && (
          <div className="jb-full-research">
            {research.recentNews?.length > 0 && (
              <div className="jb-research-block">
                <h4>Recent News</h4>
                <ul>{research.recentNews.map((n, i) => <li key={i}>{n}</li>)}</ul>
              </div>
            )}
            {research.culture && (
              <div className="jb-research-block">
                <h4>Company Culture</h4>
                <p>{research.culture}</p>
              </div>
            )}
            {research.techStack?.length > 0 && (
              <div className="jb-research-block">
                <h4>Tech Stack</h4>
                <div className="jb-tech-tags">
                  {research.techStack.map((t, i) => <span key={i} className="jb-tech-tag">{t}</span>)}
                </div>
              </div>
            )}
            {research.values?.length > 0 && (
              <div className="jb-research-block">
                <h4>Company Values</h4>
                <div className="jb-tech-tags">
                  {research.values.map((v, i) => <span key={i} className="jb-value-tag">{v}</span>)}
                </div>
              </div>
            )}
            {research.interviewTips?.length > 0 && (
              <div className="jb-research-block">
                <h4>Interview Tips</h4>
                <ul>{research.interviewTips.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </div>
            )}
            {research.uniqueAspects?.length > 0 && (
              <div className="jb-research-block">
                <h4>What Makes Them Unique</h4>
                <ul>{research.uniqueAspects.map((a, i) => <li key={i}>{a}</li>)}</ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Study Plan as compact checklist */}
      {topics.length > 0 && (
        <section className="jb-section">
          <h2 className="jb-section-title">Your Study Plan</h2>
          {studyPlanData?.summary && (
            <p className="jb-summary">{studyPlanData.summary}</p>
          )}
          <div className="jb-topic-list">
            {topics.map((topic, idx) => {
              const topicName = topic.topic || topic.name || topic
              const isStudied = topicsStudied.has(topicName)
              const isExpanded = expandedTopic === idx

              return (
                <div key={idx} className={`jb-topic-item ${isStudied ? 'studied' : ''}`}>
                  <div
                    className="jb-topic-row"
                    onClick={() => setExpandedTopic(isExpanded ? null : idx)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setExpandedTopic(isExpanded ? null : idx)}
                  >
                    <span className={`jb-topic-check ${isStudied ? 'checked' : ''}`}>
                      {isStudied ? (
                        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                          <path d="M6 10l3 3 5-6" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        <span className="jb-topic-bullet" />
                      )}
                    </span>
                    <span className="jb-topic-name">{topicName}</span>
                    <span className="jb-topic-expand">{isExpanded ? '\u25BC' : '\u25B6'}</span>
                  </div>
                  {isExpanded && topic.keyPoints && (
                    <div className="jb-topic-detail">
                      <ul className="jb-topic-points">
                        {(topic.keyPoints || []).slice(0, 3).map((pt, pi) => (
                          <li key={pi}>{pt}</li>
                        ))}
                      </ul>
                      {topic.description && (
                        <p className="jb-topic-desc">{topic.description}</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Start Training CTA */}
      <div className="jb-cta-section">
        <button
          className="jb-cta-primary"
          onClick={() => navigate(`/job/${jobId}/train`)}
        >
          {resumeLabel || 'Start Training \u2192'}
        </button>
      </div>
    </div>
  )
}

export default JobAnalysisPage
