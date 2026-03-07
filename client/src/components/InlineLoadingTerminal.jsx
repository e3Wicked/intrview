import { useState, useEffect } from 'react'
import './InlineLoadingTerminal.css'

const STEP_LABELS = [
  'Fetching job posting',
  'Parsing description content',
  'Identifying company & role',
  'Researching company background',
  'Generating study plan',
  'Finalising your prep guide',
]

function InlineLoadingTerminal({ steps, loading }) {
  const [dots, setDots] = useState('')

  useEffect(() => {
    if (!loading) return
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.')
    }, 400)
    return () => clearInterval(interval)
  }, [loading])

  if (!loading) return null

  // Derive status per step from the SSE steps array
  const completedIds = new Set(steps.filter(s => s.status === 'done').map(s => s.step))
  const activeStep = steps.find(s => s.status === 'active')

  const completed = completedIds.size
  const progress = Math.round((completed / STEP_LABELS.length) * 100)

  return (
    <div className="inline-loading-terminal">
      <div className="ilt-header">
        <div className="ilt-header-left">
          <div className="ilt-icon-square">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <span className="ilt-title">Analyzing Job Posting</span>
        </div>
        <span className="ilt-badge">{progress}%</span>
      </div>

      <div className="ilt-steps">
        {STEP_LABELS.map((label, i) => {
          const isDone = completedIds.has(i)
          const isActive = activeStep?.step === i && !isDone
          const isPending = !isDone && !isActive

          return (
            <div
              key={i}
              className={`ilt-line ${isDone ? 'done' : ''} ${isActive ? 'active' : ''} ${isPending ? 'pending' : ''}`}
            >
              <span className="ilt-prefix">
                {isDone && (
                  <span className="ilt-check">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="8" fill="#16a34a" />
                      <path d="M5 8.5L7 10.5L11 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
                {isActive && <span className="ilt-spinner" />}
                {isPending && <span className="ilt-pending" />}
              </span>
              <span className="ilt-text">
                {label}
                {isActive && <span className="ilt-dots">{dots}</span>}
              </span>
            </div>
          )
        })}
      </div>

      <div className="ilt-footer">
        <div className="ilt-bar-container">
          <div className="ilt-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <p className="ilt-note">This usually takes around 30-60 seconds</p>
    </div>
  )
}

export default InlineLoadingTerminal
