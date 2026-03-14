import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../utils/api'
import LogoWithFallbacks from './LogoWithFallbacks'
import './MockInterviewSetup.css'

const ROUND_TYPES = [
  {
    id: 'comprehensive',
    label: 'Comprehensive',
    description: 'A full mock interview covering all aspects of the role',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>
      </svg>
    ),
  },
  {
    id: 'phone-screen',
    label: 'Phone Screen',
    description: 'Initial screening — motivation, background, culture fit',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
      </svg>
    ),
  },
  {
    id: 'role-specific',
    label: 'Role-Specific',
    description: 'Deep-dive into the core skills and knowledge for this position',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
      </svg>
    ),
  },
  {
    id: 'situational',
    label: 'Situational',
    description: 'Scenario-based questions — problem-solving, decision-making, priorities',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
  },
  {
    id: 'behavioral',
    label: 'Behavioral',
    description: 'Past experiences, teamwork, leadership, conflict resolution',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
]

function MockInterviewSetup({ user, selectedVoice, onStart }) {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [selectedJob, setSelectedJob] = useState(null)
  const [selectedRound, setSelectedRound] = useState(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadJobs()
  }, [])

  const loadJobs = async () => {
    try {
      const res = await api.user.getAnalyses(50, 0)
      // API returns array directly, not { analyses: [...] }
      const data = Array.isArray(res.data) ? res.data : (res.data.analyses || [])
      setJobs(data)
    } catch (err) {
      console.error('Failed to load jobs:', err)
      setError('Failed to load your analyzed jobs.')
    } finally {
      setLoading(false)
    }
  }

  const canStart = selectedJob && selectedRound && !starting

  const handleStart = async () => {
    if (!canStart) return
    setStarting(true)
    setError(null)

    try {
      const res = await api.mockInterview.start({
        jobDescriptionHash: selectedJob.job_description_hash,
        roundType: selectedRound,
        voiceId: selectedVoice,
      })

      if (res.data) {
        onStart(res.data)
      }
    } catch (err) {
      console.error('Failed to start interview:', err)
      setError(err.response?.data?.error || 'Failed to start the interview. Please try again.')
      setStarting(false)
    }
  }

  // Gate on voice practice feature (plan-based)
  const hasVoiceAccess = user?.plan !== 'free'

  if (!hasVoiceAccess) {
    return (
      <div className="mock-setup-upgrade-card">
        <div className="mock-setup-upgrade-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
        <h2>Upgrade to Unlock Mock Interviews</h2>
        <p>AI-powered voice interviews with real-time feedback are available on Pro and Elite plans.</p>
        <a href="/settings" className="mock-setup-upgrade-btn">View Plans</a>
      </div>
    )
  }

  return (
    <div className="mock-setup">
      {error && (
        <div className="mock-setup-error">{error}</div>
      )}

      {/* Job Picker */}
      <div className="dash-card mock-setup-card">
        <div className="dash-card-header">
          <h3 className="dash-card-title">Select a Job</h3>
          {jobs.length > 0 && <span className="dash-card-count">{jobs.length} jobs</span>}
        </div>
        {loading ? (
          <div className="mock-setup-loading">Loading your jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="mock-setup-empty">
            <p>No analyzed jobs found. Analyze a job posting first to start a mock interview.</p>
            <button className="mock-setup-action-btn" onClick={() => navigate('/dashboard')}>
              Go to Dashboard
            </button>
          </div>
        ) : (
          <div className="mock-setup-jobs">
            {jobs.map((job) => {
              const isSelected = selectedJob?.id === job.id
              let domain = null
              if (job.url) {
                try { domain = new URL(job.url).hostname.replace('www.', '') } catch (e) {}
              }
              return (
                <button
                  key={job.id}
                  className={`mock-setup-job ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedJob(job)}
                >
                  <div className="mock-setup-job-logo">
                    {domain ? (
                      <LogoWithFallbacks domain={domain} name={job.company_name || ''} logoUrl={job.logo_url} />
                    ) : (
                      <div className="mock-setup-job-logo-fallback">
                        {(job.company_name || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="mock-setup-job-info">
                    <span className="mock-setup-job-role">{job.role_title || 'Untitled Role'}</span>
                    <span className="mock-setup-job-company">{job.company_name || 'Unknown Company'}</span>
                  </div>
                  {isSelected && (
                    <svg className="mock-setup-job-check" width="18" height="18" viewBox="0 0 20 20" fill="none">
                      <path d="M6 10l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Round Type — only shown after selecting a job */}
      {selectedJob && (
        <div className="dash-card mock-setup-card">
          <div className="dash-card-header">
            <h3 className="dash-card-title">Round Type</h3>
          </div>
          <div className="mock-setup-rounds">
            {ROUND_TYPES.map((round) => (
              <button
                key={round.id}
                className={`mock-setup-round ${selectedRound === round.id ? 'selected' : ''}`}
                onClick={() => setSelectedRound(round.id)}
              >
                <span className="mock-setup-round-icon">{round.icon}</span>
                <div className="mock-setup-round-text">
                  <span className="mock-setup-round-label">{round.label}</span>
                  <span className="mock-setup-round-desc">{round.description}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Start Button */}
      <div className="mock-setup-footer">
        <div className="mock-setup-cost">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          <span>20 credits per interview</span>
        </div>
        <button
          className="mock-setup-start"
          disabled={!canStart}
          onClick={handleStart}
        >
          {starting ? (
            <>
              <span className="mock-setup-start-spinner" />
              Starting Interview...
            </>
          ) : (
            'Start Interview'
          )}
        </button>
      </div>
    </div>
  )
}

export default MockInterviewSetup
