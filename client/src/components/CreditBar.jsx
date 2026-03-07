import { useState } from 'react'
import './CreditBar.css'

function CreditBar({ user }) {
  const [showTooltip, setShowTooltip] = useState(false)

  if (!user) return null

  const analyses = user.jobAnalysesRemaining ?? 0
  const analysesMax = user.isLifetimePlan
    ? (user.planDetails?.lifetimeJobAnalyses || analyses)
    : (user.jobAnalysesMonthlyAllowance === -1 ? null : (user.jobAnalysesMonthlyAllowance || 0))

  const training = user.trainingCreditsRemaining ?? 0
  const trainingMax = user.isLifetimePlan
    ? (user.planDetails?.lifetimeTrainingCredits || training)
    : (user.trainingCreditsMonthlyAllowance || 0)

  const getBarColor = (pct) => {
    if (pct > 50) return '#f59e0b'
    if (pct > 20) return '#fbbf24'
    return '#ef4444'
  }

  const analysisPct = analysesMax ? Math.min(100, (analyses / analysesMax) * 100) : 100
  const trainingPct = trainingMax > 0 ? Math.min(100, (training / trainingMax) * 100) : 0

  return (
    <div
      className="credit-bar"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="credit-row">
        <div className="credit-info">
          <span className="credit-label">Analyses</span>
          <span className="credit-amount">
            {analysesMax === null ? 'Unlimited' : `${analyses}${user.isLifetimePlan ? '' : ` / ${analysesMax}`}`}
          </span>
        </div>
        {analysesMax !== null && analysesMax > 0 && (
          <div className="credit-progress">
            <div
              className="credit-progress-fill"
              style={{ width: `${analysisPct}%`, backgroundColor: getBarColor(analysisPct) }}
            />
          </div>
        )}
      </div>

      <div className="credit-row">
        <div className="credit-info">
          <span className="credit-label">Training</span>
          <span className="credit-amount">
            {training}{user.isLifetimePlan ? '' : (trainingMax > 0 ? ` / ${trainingMax}` : '')}
          </span>
        </div>
        {trainingMax > 0 && (
          <div className="credit-progress">
            <div
              className="credit-progress-fill"
              style={{ width: `${trainingPct}%`, backgroundColor: getBarColor(trainingPct) }}
            />
          </div>
        )}
      </div>

      {showTooltip && (
        <div className="credit-tooltip">
          Analyses are used for job postings. Training credits power chat, quizzes, and practice.
        </div>
      )}
    </div>
  )
}

export default CreditBar
