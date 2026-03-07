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
  const [creditGate, setCreditGate] = useState(null)
  const [showAnalyzeForm, setShowAnalyzeForm] = useState(false)
  const [progressSteps, setProgressSteps] = useState([])
  const [inputMode, setInputMode] = useState('url') // 'url' | 'text'
  const [pastedText, setPastedText] = useState('')
  const abortControllerRef = useRef(null)

  const processAnalysisResult = (analysisResult) => {
    // Update user credits if returned in response
    if (analysisResult.user && setUser) {
      setUser(prevUser => ({
        ...prevUser,
        ...analysisResult.user
      }))
    }

    if (analysisResult && analysisResult.companyInfo) {
      const jdEntry = {
        id: Date.now().toString(),
        url: localUrl || 'pasted-text',
        companyName: analysisResult.companyInfo?.name || 'Unknown Company',
        roleTitle: analysisResult.companyInfo?.roleTitle || analysisResult.roleTitle || 'Unknown Role',
        timestamp: new Date().toISOString()
      }

      // Cache in sessionStorage for immediate navigation
      sessionStorage.setItem(`job_analysis_${jdEntry.id}`, JSON.stringify(analysisResult))

      if (setResult) setResult(analysisResult)
      if (setSelectedJdId) setSelectedJdId(jdEntry.id)

      navigate(`/job/${jdEntry.id}`)
    } else {
      setError('Invalid response from server. Please try again.')
    }
  }

  const handleAnalyze = async (e) => {
    if (e && e.preventDefault) {
      e.preventDefault()
    }
    if (inputMode === 'url' && (!localUrl || localUrl.trim() === '')) {
      setError('Please enter a job post URL')
      return
    }
    if (inputMode === 'text' && (!pastedText || pastedText.trim().length < 200)) {
      setError('Please paste at least 200 characters of the job description')
      return
    }

    setLocalLoading(true)
    setError(null)
    setCreditGate(null)
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
        body: JSON.stringify(inputMode === 'url' ? { url: localUrl } : { text: pastedText }),
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
            setCreditGate({
              remaining: errData.remaining ?? 0,
              required: errData.required ?? 1,
              resourceType: errData.resourceType || 'jobAnalyses'
            })
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
              {inputMode === 'url' ? (
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
                        {user && <span className="credit-badge">1 analysis</span>}
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="dashboard-text-input-wrapper">
                  <textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Paste the full job description here (minimum 200 characters)..."
                    disabled={localLoading}
                    className="dashboard-text-input"
                    rows={8}
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={localLoading || pastedText.trim().length < 200}
                    className="dashboard-analyze-btn dashboard-analyze-btn-full"
                  >
                    {localLoading ? 'Analyzing...' : (
                      <>
                        Analyze Job Description
                        {user && <span className="credit-badge">1 analysis</span>}
                      </>
                    )}
                  </button>
                </div>
              )}
              {!localLoading && (
                <button
                  type="button"
                  className="input-mode-toggle"
                  onClick={() => { setInputMode(inputMode === 'url' ? 'text' : 'url'); setError(null) }}
                >
                  {inputMode === 'url' ? "Can't use a URL? Paste the job description instead" : 'Use a URL instead'}
                </button>
              )}
              {error && (
                <div className="dashboard-error">
                  {error}
                  {inputMode === 'url' && error.toLowerCase().includes('paste') && (
                    <button
                      type="button"
                      className="error-paste-btn"
                      onClick={() => { setInputMode('text'); setError(null) }}
                    >
                      Paste job description instead
                    </button>
                  )}
                </div>
              )}
              {creditGate && (
                <div className="credit-gate">
                  <div className="credit-gate-header">
                    {creditGate.resourceType === 'jobAnalyses'
                      ? "You've used all your job analyses"
                      : "You've run out of training credits"}
                  </div>
                  <p className="credit-gate-detail">
                    {creditGate.resourceType === 'jobAnalyses'
                      ? <>You have <strong>{creditGate.remaining}</strong> job analys{creditGate.remaining !== 1 ? 'es' : 'is'} remaining.</>
                      : <>You have <strong>{creditGate.remaining}</strong> training credit{creditGate.remaining !== 1 ? 's' : ''} remaining. This requires <strong>{creditGate.required}</strong>.</>}
                  </p>
                  {creditGate.resetDate && (
                    <p className="credit-gate-refresh">
                      Your credits refresh on {new Date(creditGate.resetDate).toLocaleDateString()}.
                    </p>
                  )}
                  <p className="credit-gate-encouragement">
                    Upgrade your plan to unlock more and keep your prep momentum going.
                  </p>
                  <div className="credit-gate-actions">
                    <button className="credit-gate-upgrade" onClick={() => { setCreditGate(null); onSelectPlan(); }}>
                      Upgrade Plan
                    </button>
                    <button className="credit-gate-dismiss" onClick={() => setCreditGate(null)}>
                      Maybe later
                    </button>
                  </div>
                </div>
              )}
            </form>
            <InlineLoadingTerminal steps={progressSteps} loading={localLoading} />
          </div>
        </div>
      )}

      {/* Mission Control Dashboard */}
      <MissionDashboard
        user={user}
        onAnalyzeClick={() => {
          if (user && user.jobAnalysesRemaining === 0 && user.jobAnalysesMonthlyAllowance !== -1) {
            setCreditGate({
              remaining: 0,
              required: 1,
              resourceType: 'jobAnalyses',
              resetDate: user.creditsResetAt || null
            })
            setShowAnalyzeForm(true)
            return
          }
          setShowAnalyzeForm(true)
        }}
      />
    </div>
  )
}

export default DashboardPage
