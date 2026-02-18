import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import './CompanyPage.css'
import CompanyIntel from '../components/CompanyIntel'
import InterviewPlan from '../components/InterviewPlan'
import PracticeCenter from '../components/PracticeCenter'
import LogoWithFallbacks from '../components/LogoWithFallbacks'

function CompanyPage({ user }) {
  const { companyName } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [analyses, setAnalyses] = useState([])
  const [activeTab, setActiveTab] = useState('interview')
  const [studyPlans, setStudyPlans] = useState({})
  const [serverProgress, setServerProgress] = useState({})
  const [loading, setLoading] = useState(true)

  const selectedRoleId = searchParams.get('role') || null

  useEffect(() => {
    loadCompanyData()
  }, [companyName])

  // Auto-select if only 1 analysis
  useEffect(() => {
    if (!selectedRoleId && analyses.length === 1) {
      setSearchParams({ role: analyses[0].id }, { replace: true })
    }
  }, [analyses, selectedRoleId])

  const loadCompanyData = async () => {
    try {
      setLoading(true)
      const analysesRes = await axios.get('/api/user/analyses?limit=100')
      const companyAnalyses = analysesRes.data.filter(
        a => (a.company_name || '').toLowerCase() === decodeURIComponent(companyName).toLowerCase()
      )
      setAnalyses(companyAnalyses)

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

  // Compute per-role stats
  const roleCards = useMemo(() => {
    return analyses.map(analysis => {
      const plan = studyPlans[analysis.job_description_hash]
      const prog = serverProgress[analysis.job_description_hash]

      let questionCount = 0
      const stages = plan?.interviewQuestions?.stages || plan?.studyPlan?.interviewQuestions?.stages || []
      stages.forEach(s => { questionCount += (s.questions || []).length })

      const topics = plan?.studyPlan?.topics || plan?.topics || []
      const topicCount = topics.length

      let progressPercent = 0
      if (topicCount > 0 && prog?.topicsStudied) {
        const studied = new Set(prog.topicsStudied)
        const completed = topics.filter(t => studied.has(t.topic || t)).length
        progressPercent = Math.round((completed / topicCount) * 100)
      }

      return {
        ...analysis,
        questionCount,
        topicCount,
        progressPercent,
        hasPlan: !!plan,
        date: new Date(analysis.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      }
    })
  }, [analyses, studyPlans, serverProgress])

  const selectedAnalysis = useMemo(() => {
    if (selectedRoleId) {
      return analyses.find(a => a.id.toString() === selectedRoleId) || null
    }
    return null
  }, [analyses, selectedRoleId])

  const handleRoleSelect = (analysisId) => {
    if (selectedRoleId === analysisId.toString()) return // already selected
    setSearchParams({ role: analysisId })
    setActiveTab('interview')
  }

  if (loading) {
    return <div className="company-page-loading">Loading company data...</div>
  }

  if (analyses.length === 0) {
    return (
      <div className="company-page-empty">
        <p>No analyses found for this company.</p>
        <button onClick={() => navigate('/dashboard')}>Back to Prep Hub</button>
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
      {/* Company Header */}
      <div className="company-page-header">
        <div className="company-header-left">
          <button
            className="company-back-button"
            onClick={() => navigate('/dashboard')}
            title="Back to Dashboard"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div className="company-logo-large-container">
            {domain ? (
              <LogoWithFallbacks
                domain={domain}
                name={companyName}
                logoUrl={firstAnalysis.logo_url}
              />
            ) : (
              <div className="company-logo-large">{decodeURIComponent(companyName).charAt(0).toUpperCase()}</div>
            )}
          </div>
          <div>
            <h1 className="company-page-title">{decodeURIComponent(companyName)}</h1>
            <div className="company-header-meta">
              <span className="roles-badge">
                {analyses.length} {analyses.length === 1 ? 'role' : 'roles'} analyzed
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Company Intel — always visible, company-wide */}
      <CompanyIntel analyses={analyses} studyPlans={studyPlans} />

      {/* Role Selector — horizontal chips */}
      <div className="role-selector-section">
        <h2 className="role-selector-heading">Your Roles</h2>
        <div className="role-chips">
          {roleCards.map(role => {
            const isSelected = selectedRoleId === role.id.toString()
            return (
              <button
                key={role.id}
                className={`role-chip ${isSelected ? 'selected' : ''}`}
                onClick={() => handleRoleSelect(role.id)}
              >
                <div className="role-chip-main">
                  <span className="role-chip-title">{role.role_title || 'Unknown Role'}</span>
                  <span className="role-chip-stats">
                    {role.date}
                    {role.questionCount > 0 && <> &middot; {role.questionCount}q</>}
                    {role.topicCount > 0 && <> &middot; {role.topicCount}t</>}
                  </span>
                </div>
                {role.hasPlan && (
                  <div className="role-chip-progress">
                    <div className="role-chip-bar">
                      <div
                        className={`role-chip-bar-fill ${role.progressPercent === 100 ? 'complete' : ''}`}
                        style={{ width: `${role.progressPercent}%` }}
                      />
                    </div>
                    <span className="role-chip-percent">{role.progressPercent}%</span>
                  </div>
                )}
                {!role.hasPlan && (
                  <span className="role-chip-no-plan">No plan</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected Role Content — role-specific tabs */}
      {selectedAnalysis && (
        <>
          <div className="company-tabs">
            <button
              className={`company-tab ${activeTab === 'interview' ? 'active' : ''}`}
              onClick={() => setActiveTab('interview')}
            >
              Interview Plan
            </button>
            <button
              className={`company-tab ${activeTab === 'practice' ? 'active' : ''}`}
              onClick={() => setActiveTab('practice')}
            >
              Practice & Progress
            </button>
          </div>

          <div className="company-tab-content">
            {activeTab === 'interview' && (
              <InterviewPlan analyses={[selectedAnalysis]} studyPlans={studyPlans} />
            )}
            {activeTab === 'practice' && (
              <PracticeCenter analyses={[selectedAnalysis]} studyPlans={studyPlans} />
            )}
          </div>
        </>
      )}

      {!selectedAnalysis && analyses.length > 1 && (
        <div className="no-role-selected">
          <p>Select a role above to view study plan, practice questions, and interview prep.</p>
        </div>
      )}
    </div>
  )
}

export default CompanyPage
