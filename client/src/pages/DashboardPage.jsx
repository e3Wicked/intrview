import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MissionDashboard from '../components/MissionDashboard'
import axios from 'axios'
import './DashboardPage.css'

function DashboardPage({ user, setUser, url, setUrl, handleSubmit, loading, onSelectPlan, setResult, setSelectedJdId, jdHistory, setJdHistory }) {
  const navigate = useNavigate()
  const [localUrl, setLocalUrl] = useState('')
  const [localLoading, setLocalLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showAnalyzeForm, setShowAnalyzeForm] = useState(false)

  const handleAnalyze = async (e) => {
    if (e && e.preventDefault) {
      e.preventDefault()
    }
    if (!localUrl || localUrl.trim() === '') {
      setError('Please enter a job post URL')
      return
    }
    
    setLocalLoading(true)
    setError(null)

    try {
      const response = await axios.post('/api/analyze', { url: localUrl })
      const analysisResult = response.data
      
      // Update user credits if returned in response
      if (analysisResult.user && setUser) {
        setUser(prevUser => ({
          ...prevUser,
          creditsRemaining: analysisResult.user.creditsRemaining || prevUser.creditsRemaining
        }))
      }
      
      // Save to JD history
      const savedHistory = localStorage.getItem('jd_history')
      const jdHistory = savedHistory ? JSON.parse(savedHistory) : []
      
      if (analysisResult && analysisResult.companyInfo) {
        const jdEntry = {
          id: Date.now().toString(),
          url: localUrl,
          companyName: analysisResult.companyInfo?.name || 'Unknown Company',
          roleTitle: analysisResult.companyInfo?.roleTitle || analysisResult.roleTitle || 'Unknown Role',
          result: analysisResult,
          timestamp: new Date().toISOString()
        }

        // Get current history from props or localStorage
        const currentHistory = jdHistory || []
        const updatedHistory = [jdEntry, ...currentHistory.filter(jd => jd.url !== localUrl)].slice(0, 10)
        localStorage.setItem('jd_history', JSON.stringify(updatedHistory))
        localStorage.setItem('selected_jd_id', jdEntry.id)

        // Store result in sessionStorage as backup
        sessionStorage.setItem(`job_analysis_${jdEntry.id}`, JSON.stringify(analysisResult))

        // Set result directly on App state so JobAnalysisPage renders immediately
        if (setResult) setResult(analysisResult)
        if (setSelectedJdId) setSelectedJdId(jdEntry.id)
        if (setJdHistory) setJdHistory(updatedHistory)

        // Navigate to job analysis page
        navigate(`/job/${jdEntry.id}`)
      } else {
        setError('Invalid response from server. Please try again.')
      }
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Session expired. Please sign out and sign in again.')
      } else if (err.response?.status === 402 || err.response?.status === 403) {
        setError('Insufficient credits. Please upgrade your plan.')
      } else {
        setError(err.response?.data?.error || 'An error occurred. Please try again.')
      }
    } finally {
      setLocalLoading(false)
    }
  }

  const handleSelectAnalysis = (analysisResult) => {
    if (setResult && analysisResult.result) setResult(analysisResult.result)
    if (setSelectedJdId) setSelectedJdId(analysisResult.id)
    navigate(`/job/${analysisResult.id || Date.now()}`)
  }

  return (
    <div className="dashboard-page">
      {/* Analyze Modal/Form - Show when clicking "Add New Job URL" */}
      {showAnalyzeForm && (
        <div className="analyze-overlay" onClick={() => setShowAnalyzeForm(false)}>
          <div className="analyze-modal" onClick={(e) => e.stopPropagation()}>
            <button className="analyze-close" onClick={() => setShowAnalyzeForm(false)}>×</button>
            <h2>Analyze a Job Posting</h2>
            <form onSubmit={handleAnalyze} className="dashboard-analyze-form">
              <div className="dashboard-url-input-wrapper">
                <input
                  type="url"
                  value={localUrl}
                  onChange={(e) => setLocalUrl(e.target.value)}
                  placeholder="Paste job post URL here..."
                  required
                  disabled={localLoading}
                  className="dashboard-url-input"
                  autoFocus
                />
                <button 
                  type="submit" 
                  disabled={localLoading || !localUrl}
                  className="dashboard-analyze-btn"
                >
                  {localLoading ? 'Analyzing...' : (
                    <>
                      Analyze Job Posting
                      {user && <span className="credit-badge">5 credits</span>}
                    </>
                  )}
                </button>
              </div>
              {error && <div className="dashboard-error">{error}</div>}
            </form>
          </div>
        </div>
      )}

      {/* Mission Control Dashboard */}
      <MissionDashboard 
        user={user}
        onAnalyzeClick={() => setShowAnalyzeForm(true)}
      />
    </div>
  )
}

export default DashboardPage
