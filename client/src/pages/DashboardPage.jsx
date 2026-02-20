import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import MissionDashboard from '../components/MissionDashboard'
import InlineLoadingTerminal from '../components/InlineLoadingTerminal'
import './DashboardPage.css'

function DashboardPage({ user, setUser, url, setUrl, handleSubmit, loading, onSelectPlan, setResult, setSelectedJdId, jdHistory, setJdHistory }) {
  const navigate = useNavigate()
  const [localUrl, setLocalUrl] = useState('')
  const [localLoading, setLocalLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showAnalyzeForm, setShowAnalyzeForm] = useState(false)
  const [progressSteps, setProgressSteps] = useState([])
  const abortControllerRef = useRef(null)

  const processAnalysisResult = (analysisResult) => {
    // Update user credits if returned in response
    if (analysisResult.user && setUser) {
      setUser(prevUser => ({
        ...prevUser,
        creditsRemaining: analysisResult.user.creditsRemaining || prevUser.creditsRemaining
      }))
    }

    // Save to JD history
    const savedHistory = localStorage.getItem('jd_history')
    const existingHistory = savedHistory ? JSON.parse(savedHistory) : []

    if (analysisResult && analysisResult.companyInfo) {
      const jdEntry = {
        id: Date.now().toString(),
        url: localUrl,
        companyName: analysisResult.companyInfo?.name || 'Unknown Company',
        roleTitle: analysisResult.companyInfo?.roleTitle || analysisResult.roleTitle || 'Unknown Role',
        result: analysisResult,
        timestamp: new Date().toISOString()
      }

      const currentHistory = existingHistory || []
      const updatedHistory = [jdEntry, ...currentHistory.filter(jd => jd.url !== localUrl)].slice(0, 10)
      localStorage.setItem('jd_history', JSON.stringify(updatedHistory))
      localStorage.setItem('selected_jd_id', jdEntry.id)

      sessionStorage.setItem(`job_analysis_${jdEntry.id}`, JSON.stringify(analysisResult))

      if (setResult) setResult(analysisResult)
      if (setSelectedJdId) setSelectedJdId(jdEntry.id)
      if (setJdHistory) setJdHistory(updatedHistory)

      navigate(`/job/${jdEntry.id}`)
    } else {
      setError('Invalid response from server. Please try again.')
    }
  }

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
    setProgressSteps([])

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const token = localStorage.getItem('session_token')
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ url: localUrl }),
        signal: controller.signal,
      })

      // Handle non-SSE error responses (e.g. 400, 401, 403 before stream starts)
      if (!response.ok) {
        const contentType = response.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
          const errData = await response.json()
          if (response.status === 401) {
            setError('Session expired. Please sign out and sign in again.')
          } else if (response.status === 402 || response.status === 403) {
            setError('Insufficient credits. Please upgrade your plan.')
          } else {
            setError(errData.error || 'An error occurred. Please try again.')
          }
        } else {
          setError('An error occurred. Please try again.')
        }
        setLocalLoading(false)
        return
      }

      // Read SSE stream
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let prevStep = -1

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6)
          if (!jsonStr) continue

          let event
          try {
            event = JSON.parse(jsonStr)
          } catch {
            continue
          }

          if (event.type === 'step') {
            // Mark previous step as done, set new step as active
            setProgressSteps(prev => {
              const updated = prev.map(s => s.status === 'active' ? { ...s, status: 'done' } : s)
              updated.push({ step: event.step, label: event.label, status: 'active' })
              return updated
            })
            prevStep = event.step
          } else if (event.type === 'result') {
            // Mark all steps as done
            setProgressSteps(prev => prev.map(s => ({ ...s, status: 'done' })))
            processAnalysisResult(event.data)
          } else if (event.type === 'error') {
            setError(event.error || 'An error occurred during analysis.')
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError('An error occurred. Please try again.')
      }
    } finally {
      setLocalLoading(false)
      abortControllerRef.current = null
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
        <div className="analyze-overlay" onClick={localLoading ? undefined : () => setShowAnalyzeForm(false)}>
          <div className="analyze-modal" onClick={(e) => e.stopPropagation()}>
            {!localLoading && (
              <button className="analyze-close" onClick={() => setShowAnalyzeForm(false)}>×</button>
            )}
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
            <InlineLoadingTerminal steps={progressSteps} loading={localLoading} />
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
