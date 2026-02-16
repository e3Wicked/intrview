import { useState, useEffect } from 'react'
import { useGamification } from '../contexts/GamificationContext'
import { getLevelForXp } from '../utils/gamification'
import './XPBar.css'

function XPBar({ xpGained, compact = false }) {
  const { gamStats } = useGamification() || {}
  const [showGain, setShowGain] = useState(false)
  const [displayGain, setDisplayGain] = useState(0)

  useEffect(() => {
    if (xpGained && xpGained > 0) {
      setDisplayGain(xpGained)
      setShowGain(true)
      const timer = setTimeout(() => setShowGain(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [xpGained])

  if (!gamStats) return null

  const levelInfo = getLevelForXp(gamStats.totalXp)

  if (compact) {
    return (
      <div className="xp-bar-compact">
        <span className="xp-level-badge">Lv.{levelInfo.level}</span>
        <div className="xp-bar-mini">
          <div className="xp-bar-fill-mini" style={{ width: `${levelInfo.progressPercent}%` }} />
        </div>
        <span className="xp-total-mini">{gamStats.totalXp} XP</span>
        {showGain && (
          <span className="xp-gain-float">+{displayGain} XP</span>
        )}
      </div>
    )
  }

  return (
    <div className="xp-bar-container">
      <div className="xp-bar-header">
        <div className="xp-level-info">
          <span className="xp-level-number">Level {levelInfo.level}</span>
          <span className="xp-level-title">{levelInfo.title}</span>
        </div>
        <div className="xp-numbers">
          <span className="xp-current">{gamStats.totalXp} XP</span>
          {levelInfo.xpNeededForNext > 0 && (
            <span className="xp-next">/ {levelInfo.xpForNextLevel} XP</span>
          )}
        </div>
      </div>
      <div className="xp-bar-track">
        <div
          className="xp-bar-fill"
          style={{ width: `${levelInfo.progressPercent}%` }}
        />
        {showGain && (
          <span className="xp-gain-float-bar">+{displayGain} XP</span>
        )}
      </div>
      {levelInfo.xpNeededForNext > 0 && (
        <div className="xp-bar-footer">
          {levelInfo.xpNeededForNext - levelInfo.xpIntoLevel} XP to next level
        </div>
      )}
    </div>
  )
}

export default XPBar
