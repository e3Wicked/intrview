import { useState, useEffect, useRef } from 'react'
import './LoadingOverlay.css'

const STEPS = [
  { id: 'fetch',     label: 'Fetching job posting',            duration: 4000  },
  { id: 'parse',     label: 'Parsing description content',     duration: 3000  },
  { id: 'company',   label: 'Identifying company & role',      duration: 5000  },
  { id: 'cache',     label: 'Checking research cache',         duration: 3000  },
  { id: 'plan',      label: 'Generating personalised study plan', duration: 20000 },
  { id: 'questions', label: 'Building interview questions',    duration: 15000 },
  { id: 'finalise',  label: 'Finalising your prep guide',      duration: 5000  },
]

function LoadingOverlay({ loading }) {
  const [completedSteps, setCompletedSteps] = useState([])
  const [activeStep, setActiveStep] = useState(0)
  const [dots, setDots] = useState('')
  const timeoutsRef = useRef([])

  // Advance through steps based on each step's estimated duration
  useEffect(() => {
    if (!loading) {
      setCompletedSteps([])
      setActiveStep(0)
      timeoutsRef.current.forEach(clearTimeout)
      timeoutsRef.current = []
      return
    }

    let elapsed = 0
    STEPS.forEach((step, i) => {
      const t = setTimeout(() => {
        setActiveStep(i + 1)
        setCompletedSteps(prev => [...prev, i])
      }, elapsed + step.duration)
      timeoutsRef.current.push(t)
      elapsed += step.duration
    })

    return () => timeoutsRef.current.forEach(clearTimeout)
  }, [loading])

  // Animate the trailing dots on the active step
  useEffect(() => {
    if (!loading) return
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.')
    }, 400)
    return () => clearInterval(interval)
  }, [loading])

  if (!loading) return null

  const progress = Math.round((completedSteps.length / STEPS.length) * 100)

  return (
    <div className="loading-overlay">
      <div className="loading-content">
        <div className="loading-header">
          <div className="loading-indicator">
            <span className="indicator-dot" />
            <span className="indicator-dot" />
            <span className="indicator-dot" />
          </div>
          <span className="loading-label">analyzing job posting</span>
        </div>

        <div className="loading-terminal">
          {STEPS.map((step, i) => {
            const isDone    = completedSteps.includes(i)
            const isActive  = activeStep === i && !isDone
            const isPending = i > activeStep

            return (
              <div
                key={step.id}
                className={`terminal-line ${isDone ? 'done' : ''} ${isActive ? 'active' : ''} ${isPending ? 'pending' : ''}`}
              >
                <span className="terminal-prefix">
                  {isDone    && <span className="check">✓</span>}
                  {isActive  && <span className="spinner-char">›</span>}
                  {isPending && <span className="pending-char">·</span>}
                </span>
                <span className="terminal-text">
                  {step.label}
                  {isActive && <span className="trailing-dots">{dots}</span>}
                </span>
              </div>
            )
          })}
        </div>

        <div className="loading-footer">
          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="progress-pct">{progress}%</span>
        </div>

        <p className="loading-note">This usually takes around 30–60 seconds</p>
      </div>
    </div>
  )
}

export default LoadingOverlay
