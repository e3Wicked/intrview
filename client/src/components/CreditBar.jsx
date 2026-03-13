import { useState, useRef } from 'react'
import './CreditBar.css'

const TOTAL_SEGMENTS = 8

function getSegmentColor(pct) {
  if (pct > 50) return '#2563eb'
  if (pct > 20) return '#eab308'
  return '#ef4444'
}

function SegmentMeter({ remaining, max }) {
  const pct = max ? Math.min(100, (remaining / max) * 100) : 100
  let filled = Math.round((remaining / (max || remaining || 1)) * TOTAL_SEGMENTS)
  if (remaining > 0 && filled < 1) filled = 1
  if (filled > TOTAL_SEGMENTS) filled = TOTAL_SEGMENTS
  const color = getSegmentColor(pct)
  const depleted = remaining === 0 && max > 0

  return (
    <div
      className={`credit-segments${depleted ? ' depleted' : ''}`}
      style={{ '--segment-color': color }}
    >
      {Array.from({ length: TOTAL_SEGMENTS }, (_, i) => (
        <span key={i} className={`credit-segment ${i < filled ? 'filled' : 'empty'}`} />
      ))}
    </div>
  )
}

function CreditBar({ user }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 })
  const barRef = useRef(null)

  if (!user) return null

  const analyses = user.jobAnalysesRemaining ?? 0
  const analysesMax = user.isLifetimePlan
    ? (user.planDetails?.lifetimeJobAnalyses || analyses)
    : (user.jobAnalysesMonthlyAllowance === -1 ? null : (user.jobAnalysesMonthlyAllowance || 0))

  const training = user.trainingCreditsRemaining ?? 0
  const trainingMax = user.isLifetimePlan
    ? (user.planDetails?.lifetimeTrainingCredits || training)
    : (user.trainingCreditsMonthlyAllowance || 0)

  return (
    <div
      className="credit-bar"
      ref={barRef}
      onMouseEnter={() => {
        if (barRef.current) {
          const rect = barRef.current.getBoundingClientRect()
          setTooltipPos({ top: rect.top + rect.height / 2, left: rect.right + 10 })
        }
        setShowTooltip(true)
      }}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="credit-row">
        <div className="credit-info">
          <span className="credit-label">Analyses</span>
          <span className="credit-amount">
            {analysesMax === null ? '∞' : `${analyses}${user.isLifetimePlan ? '' : ` / ${analysesMax}`}`}
          </span>
        </div>
        {analysesMax === null ? (
          <SegmentMeter remaining={TOTAL_SEGMENTS} max={TOTAL_SEGMENTS} />
        ) : analysesMax > 0 ? (
          <SegmentMeter remaining={analyses} max={analysesMax} />
        ) : null}
      </div>

      <div className="credit-row">
        <div className="credit-info">
          <span className="credit-label">Training</span>
          <span className="credit-amount">
            {training}{user.isLifetimePlan ? '' : (trainingMax > 0 ? ` / ${trainingMax}` : '')}
          </span>
        </div>
        {trainingMax > 0 && (
          <SegmentMeter remaining={training} max={trainingMax} />
        )}
      </div>

      {user.creditsResetAt && !user.isLifetimePlan && (
        <div className="credit-reset-info">
          Resets {new Date(user.creditsResetAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      )}

      {showTooltip && (
        <div className="credit-tooltip" style={{ top: tooltipPos.top, left: tooltipPos.left }}>
          Analyses are used for job postings. Training credits power chat, quizzes, and practice.
        </div>
      )}
    </div>
  )
}

export default CreditBar
