import { useState } from 'react'
import axios from 'axios'
import './CreditBar.css'

function CreditBar({ user, onUpgrade }) {
  const [showTooltip, setShowTooltip] = useState(false)

  if (!user) return null

  const percentage = user.creditsMonthlyAllowance > 0 
    ? (user.creditsRemaining / user.creditsMonthlyAllowance) * 100 
    : 0

  const getCreditColor = () => {
    if (percentage > 50) return '#f59e0b'
    if (percentage > 20) return '#fbbf24'
    return '#ef4444'
  }

  return (
    <div className="credit-bar">
      <div 
        className="credit-info"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <span className="credit-label">Credits:</span>
        <span className="credit-amount">
          {user.creditsRemaining}{user.creditsMonthlyAllowance > 0 ? ` / ${user.creditsMonthlyAllowance}` : ''}
        </span>
        {user.creditsMonthlyAllowance > 0 && (
          <div className="credit-progress">
            <div
              className="credit-progress-fill"
              style={{
                width: `${Math.min(100, percentage)}%`,
                backgroundColor: getCreditColor()
              }}
            />
          </div>
        )}
        {showTooltip && (
          <div className="credit-tooltip">
            Prep credits power AI-generated study plans, questions, and feedback.
          </div>
        )}
      </div>
      
      {user.creditsRemaining === 0 && (
        <button className="credit-upgrade-btn" onClick={onUpgrade}>
          Upgrade
        </button>
      )}
    </div>
  )
}

export default CreditBar

