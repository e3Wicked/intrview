import { useGamification } from '../contexts/GamificationContext'
import './StreakCounter.css'

function StreakCounter({ compact = false }) {
  const { gamStats } = useGamification() || {}

  if (!gamStats) return null

  const streak = gamStats.streak || { current: 0, multiplier: 1.0 }
  const isActive = streak.lastPracticeDate === new Date().toISOString().split('T')[0]
  const hasStreak = streak.current > 0

  if (compact && !hasStreak) return null

  return (
    <div className={`streak-counter ${isActive ? 'active' : ''} ${compact ? 'compact' : ''}`}>
      <span className={`streak-flame ${hasStreak ? 'lit' : ''}`}>
        {hasStreak ? '🔥' : '💤'}
      </span>
      <span className="streak-number">{streak.current}</span>
      {!compact && <span className="streak-label">day streak</span>}
      {streak.multiplier > 1.0 && (
        <span className="streak-multiplier">{streak.multiplier}x</span>
      )}
    </div>
  )
}

export default StreakCounter
