import { useState, useEffect, useMemo } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import Practice from '../components/Practice'
import FocusChat from '../components/FocusChat'
import { api } from '../utils/api'
import './TrainingPage.css'

const MODE_CARDS = [
  {
    id: 'flashcards',
    title: 'Flashcards',
    description: 'Quick recall practice',
    cost: null,
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
  },
  {
    id: 'quiz',
    title: 'Quiz',
    description: 'Test your knowledge with scored answers',
    cost: null,
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    id: 'voice',
    title: 'Voice',
    description: 'Practice explaining out loud',
    cost: null,
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
        <path d="M19 10v2a7 7 0 01-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    ),
  },
  {
    id: 'coach',
    title: 'Coach',
    description: 'AI-guided skill coaching',
    cost: '1 credit/message',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
  },
]

function TrainingPage({ result, user }) {
  const { jobId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [selectedMode, setSelectedMode] = useState(null)
  const [jobData, setJobData] = useState(result || null)
  const [studyPlan, setStudyPlan] = useState(null)
  const [loading, setLoading] = useState(!result)

  const modeParam = searchParams.get('mode')
  const focusParam = searchParams.get('focus')

  // Load job data if not provided via props
  useEffect(() => {
    if (result) {
      setJobData(result)
      setLoading(false)
      return
    }

    const loadJobData = async () => {
      // Try sessionStorage first
      const sessionData = sessionStorage.getItem(`job_analysis_${jobId}`)
      if (sessionData) {
        try {
          setJobData(JSON.parse(sessionData))
          setLoading(false)
          return
        } catch (e) {}
      }

      // Try jdHistory from localStorage
      const savedHistory = localStorage.getItem('jd_history')
      if (savedHistory) {
        try {
          const history = JSON.parse(savedHistory)
          const job = history.find(jd => jd.id === jobId)
          if (job?.result) {
            setJobData(job.result)
            setLoading(false)
            return
          }
        } catch (e) {}
      }

      // Server fallback
      if (/^\d+$/.test(jobId)) {
        try {
          const res = await axios.get(`/api/user/analysis/${jobId}`)
          setJobData(res.data)
          sessionStorage.setItem(`job_analysis_${jobId}`, JSON.stringify(res.data))
        } catch (err) {
          console.error('Error loading job data for training:', err)
        }
      }
      setLoading(false)
    }
    loadJobData()
  }, [jobId, result])

  // Load study plan for question extraction
  useEffect(() => {
    if (!jobData?.jobDescriptionHash) return
    axios.get(`/api/user/study-plan/${jobData.jobDescriptionHash}`)
      .then(res => setStudyPlan(res.data))
      .catch(() => {})
  }, [jobData?.jobDescriptionHash])

  // Auto-select mode if URL param provided
  useEffect(() => {
    if (modeParam && !selectedMode) {
      const validModes = ['flashcards', 'quiz', 'voice', 'coach']
      if (validModes.includes(modeParam.toLowerCase())) {
        setSelectedMode(modeParam.toLowerCase())
      }
    }
  }, [modeParam, selectedMode])

  // Extract questions from study plan
  const questions = useMemo(() => {
    const sp = studyPlan || jobData?.studyPlan
    if (!sp) return []
    const iq = sp.interviewQuestions || sp.studyPlan?.interviewQuestions
    if (!iq?.stages) return []
    try {
      return iq.stages.flatMap(stage =>
        (stage.questions || []).map(q => ({
          question: q.question,
          answer: q.answer,
          category: q.category,
        }))
      )
    } catch (e) {
      return []
    }
  }, [studyPlan, jobData?.studyPlan])

  const studyTopics = useMemo(() => {
    const sp = studyPlan || jobData?.studyPlan
    if (!sp) return []
    const topics = sp.studyPlan?.topics || sp.topics || []
    return topics.map(t => typeof t === 'string' ? t : t.topic || t.name || '').filter(Boolean)
  }, [studyPlan, jobData?.studyPlan])

  const handleSelectMode = (modeId) => {
    setSelectedMode(modeId)
  }

  const handleExitPractice = () => {
    setSelectedMode(null)
  }

  if (loading) {
    return (
      <div className="training-page">
        <div className="training-loading">Loading training data...</div>
      </div>
    )
  }

  if (!jobData) {
    return (
      <div className="training-page">
        <div className="training-empty">
          <p>No job data found. Please analyze a job posting first.</p>
          <button className="training-back-btn" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const companyName = jobData.companyInfo?.name || jobData.company?.name || 'Unknown'
  const roleTitle = jobData.companyInfo?.roleTitle || jobData.company?.roleTitle || ''
  const jobDescriptionHash = jobData.jobDescriptionHash || jobData.url || ''

  // If a mode is selected, show full-screen practice
  if (selectedMode) {
    if (selectedMode === 'coach') {
      // Coach mode = FocusChat with skill context
      const coachSkill = focusParam || studyTopics[0] || 'General Interview Prep'
      return (
        <div className="training-fullscreen">
          <div className="training-topbar">
            <button className="training-exit-btn" onClick={handleExitPractice}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              Back to modes
            </button>
            <span className="training-topbar-label">{companyName} &middot; Coach</span>
          </div>
          <FocusChat skill={coachSkill} user={user} />
        </div>
      )
    }

    // Flashcards, Quiz, or Voice
    const focusCategories = focusParam ? [focusParam] : []

    return (
      <div className="training-fullscreen">
        <div className="training-topbar">
          <button className="training-exit-btn" onClick={handleExitPractice}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to modes
          </button>
          <span className="training-topbar-label">
            {companyName} &middot; {MODE_CARDS.find(m => m.id === selectedMode)?.title}
          </span>
        </div>
        <Practice
          questions={questions}
          jobDescription={jobData.jobDescription}
          companyName={companyName}
          roleTitle={roleTitle}
          techStack={jobData.companyInfo?.techStack || jobData.company?.techStack}
          jobDescriptionHash={jobDescriptionHash}
          studyTopics={studyTopics}
          initialFocusCategories={focusCategories}
          initialSmartMode={true}
          initialMode={selectedMode}
        />
      </div>
    )
  }

  // Mode picker
  return (
    <div className="training-page">
      <button className="training-nav-back" onClick={() => navigate(`/job/${jobId}`)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Back to Job Brief
      </button>

      <div className="training-header">
        <h1 className="training-title">Choose Your Training Mode</h1>
        <p className="training-subtitle">{companyName} &middot; {roleTitle}</p>
      </div>

      <div className="mode-picker-grid">
        {MODE_CARDS.map(mode => (
          <button
            key={mode.id}
            className="mode-picker-card"
            onClick={() => handleSelectMode(mode.id)}
          >
            <div className="mode-picker-icon">{mode.icon}</div>
            <h3 className="mode-picker-title">{mode.title}</h3>
            <p className="mode-picker-desc">{mode.description}</p>
            {mode.cost ? (
              <span className="mode-picker-cost">{mode.cost}</span>
            ) : (
              <span className="mode-picker-free">Free</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

export default TrainingPage
