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
  const [activeTab, setActiveTab] = useState('overview')
  const [studyPlans, setStudyPlans] = useState({})
  const [loading, setLoading] = useState(true)
  
  // Get selected role from URL or default to first
  const selectedRoleId = searchParams.get('role') || null
  const selectedAnalysis = useMemo(() => {
    if (selectedRoleId) {
      return analyses.find(a => a.id.toString() === selectedRoleId) || analyses[0]
    }
    return analyses[0]
  }, [analyses, selectedRoleId])

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

      // Load study plans
      const plans = {}
      for (const analysis of companyAnalyses) {
        try {
          const planRes = await axios.get(`/api/user/study-plan/${analysis.job_description_hash}`)
          plans[analysis.job_description_hash] = planRes.data
        } catch (e) {
          // Plan might not exist
        }
      }
      setStudyPlans(plans)
    } catch (err) {
      console.error('Error loading company data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Calculate overall progress
  const calculateProgress = () => {
    let totalTopics = 0
    let completedTopics = 0

    analyses.forEach(analysis => {
      const plan = studyPlans[analysis.job_description_hash]
      if (plan?.studyPlan?.topics) {
        const saved = localStorage.getItem('interviewPrepperProgress')
        if (saved) {
          try {
            const progress = JSON.parse(saved)
            const topicsStudied = new Set(progress.topicsStudied || [])
            const currentTopics = plan.studyPlan.topics.map(t => t.topic)
            const studied = currentTopics.filter(t => topicsStudied.has(t))
            completedTopics += studied.length
            totalTopics += currentTopics.length
          } catch (e) {}
        } else {
          totalTopics += plan.studyPlan.topics.length
        }
      }
    })

    return totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0
  }

  // Group analyses by role title for display
  const roles = useMemo(() => {
    const roleMap = new Map()
    analyses.forEach(analysis => {
      const roleTitle = analysis.role_title || 'Unknown Role'
      if (!roleMap.has(roleTitle)) {
        roleMap.set(roleTitle, [])
      }
      roleMap.get(roleTitle).push(analysis)
    })
    return Array.from(roleMap.entries()).map(([title, analyses]) => ({
      title,
      analyses,
      count: analyses.length
    }))
  }, [analyses])

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

  const handleRoleSelect = (analysisId) => {
    setSearchParams({ role: analysisId })
  }

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
            {selectedAnalysis?.url ? (() => {
              try {
                const urlObj = new URL(selectedAnalysis.url)
                const domain = urlObj.hostname.replace('www.', '')
                return (
                  <LogoWithFallbacks 
                    domain={domain}
                    name={companyName}
                    logoUrl={selectedAnalysis.logo_url}
                  />
                )
              } catch (e) {
                return <div className="company-logo-large">{companyName.charAt(0).toUpperCase()}</div>
              }
            })() : (
              <div className="company-logo-large">{companyName.charAt(0).toUpperCase()}</div>
            )}
          </div>
          <div>
            <div className="company-title-row">
              <h1 className="company-page-title">{companyName}</h1>
              {selectedAnalysis?.role_title && (
                <span className="company-role-badge">{selectedAnalysis.role_title}</span>
              )}
            </div>
            <div className="company-header-meta">
              <span className="roles-badge">{analyses.length} {analyses.length === 1 ? 'role' : 'roles'} analyzed</span>
              {roles.length > 1 && (
                <div className="role-switcher-inline">
                  {roles.map((role, idx) => {
                    const roleAnalysis = role.analyses[0]
                    const isActive = selectedAnalysis?.id === roleAnalysis?.id
                    return (
                      <button
                        key={idx}
                        className={`role-switcher-btn-inline ${isActive ? 'active' : ''}`}
                        onClick={() => handleRoleSelect(roleAnalysis.id)}
                        title={role.title}
                      >
                        {role.title}
                        {role.count > 1 && <span className="role-count-badge-inline">{role.count}</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
        {selectedAnalysis?.url && (
          <div className="company-header-right">
            <a 
              href={selectedAnalysis.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="job-post-link"
            >
              View Job Post →
            </a>
          </div>
        )}
      </div>

      {/* Company Tabs */}
      <div className="company-tabs">
        <button
          className={`company-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Company Intel
        </button>
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

      {/* Tab Content */}
      <div className="company-tab-content">
        {activeTab === 'overview' && (
          <CompanyIntel analyses={[selectedAnalysis].filter(Boolean)} studyPlans={studyPlans} />
        )}
        {activeTab === 'interview' && (
          <InterviewPlan analyses={[selectedAnalysis].filter(Boolean)} studyPlans={studyPlans} />
        )}
        {activeTab === 'practice' && (
          <PracticeCenter analyses={[selectedAnalysis].filter(Boolean)} studyPlans={studyPlans} />
        )}
      </div>
    </div>
  )
}

export default CompanyPage

