import { useEffect, useRef } from 'react'
import { useGamification } from '../contexts/GamificationContext'
import './AchievementToast.css'

function AchievementToast() {
  const { pendingToasts, dismissToast } = useGamification() || {}
  const timersRef = useRef({})

  useEffect(() => {
    if (!pendingToasts) return
    pendingToasts.forEach(toast => {
      if (!timersRef.current[toast.id]) {
        timersRef.current[toast.id] = setTimeout(() => {
          dismissToast(toast.id)
          delete timersRef.current[toast.id]
        }, 5000)
      }
    })
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout)
    }
  }, [pendingToasts, dismissToast])

  if (!pendingToasts || pendingToasts.length === 0) return null

  return (
    <div className="achievement-toast-container">
      {pendingToasts.slice(0, 3).map(toast => (
        <div
          key={toast.id}
          className={`achievement-toast achievement-toast-${toast.type}`}
          onClick={() => dismissToast(toast.id)}
        >
          {toast.type === 'achievement' && (
            <>
              <span className="toast-icon">{toast.achievement.icon}</span>
              <div className="toast-content">
                <div className="toast-title">Achievement Unlocked!</div>
                <div className="toast-name">{toast.achievement.name}</div>
                <div className="toast-desc">{toast.achievement.description}</div>
                <div className="toast-xp">+{toast.achievement.xpReward} XP</div>
              </div>
            </>
          )}
          {toast.type === 'level_up' && (
            <>
              <span className="toast-icon">🎉</span>
              <div className="toast-content">
                <div className="toast-title">Level Up!</div>
                <div className="toast-name">{toast.levelTitle}</div>
              </div>
            </>
          )}
          {toast.type === 'xp' && (
            <>
              <span className="toast-icon">⚡</span>
              <div className="toast-content">
                <div className="toast-title">+{toast.amount} XP</div>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

export default AchievementToast
