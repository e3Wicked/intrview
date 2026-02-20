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
        <div className="ilt-indicator">
          <span className="ilt-dot" />
          <span className="ilt-dot" />
          <span className="ilt-dot" />
        </div>
        <span className="ilt-label">analyzing job posting</span>
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
                {isDone && <span className="ilt-check">✓</span>}
                {isActive && <span className="ilt-spinner">›</span>}
                {isPending && <span className="ilt-pending">·</span>}
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
        <span className="ilt-pct">{progress}%</span>
      </div>

      <p className="ilt-note">This usually takes around 30–60 seconds</p>
    </div>
  )
}

export default InlineLoadingTerminal
