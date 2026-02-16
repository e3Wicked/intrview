import { useGamification } from '../contexts/GamificationContext'
import { getLevelForXp } from '../utils/gamification'
import './SessionSummary.css'

function SessionSummary({ session, onContinue, onEnd }) {
  const { gamStats } = useGamification() || {}

  if (!session) return null

  const levelInfo = gamStats ? getLevelForXp(gamStats.totalXp) : null

  return (
    <div className="session-summary-overlay" onClick={onEnd}>
      <div className="session-summary-modal" onClick={e => e.stopPropagation()}>
        <h2 className="session-summary-title">Session Complete!</h2>

        <div className="session-stats-grid">
          <div className="session-stat">
            <div className="session-stat-value">{session.questionsAttempted || 0}</div>
            <div className="session-stat-label">Questions</div>
          </div>
          <div className="session-stat">
            <div className="session-stat-value">{Math.round(session.averageScore || 0)}</div>
            <div className="session-stat-label">Avg Score</div>
          </div>
          <div className="session-stat">
            <div className="session-stat-value">{session.questionsCorrect || 0}</div>
            <div className="session-stat-label">Correct (70+)</div>
          </div>
        </div>

        <div className="session-xp-section">
          <div className="session-xp-earned">
            <span className="session-xp-icon">⚡</span>
            <span className="session-xp-amount">+{session.totalXpEarned || 0} XP</span>
          </div>

          {levelInfo && (
            <div className="session-level-bar">
              <div className="session-level-label">
                <span>Level {levelInfo.level} - {levelInfo.title}</span>
                <span>{levelInfo.progressPercent}%</span>
              </div>
              <div className="session-level-track">
                <div
                  className="session-level-fill"
                  style={{ width: `${levelInfo.progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {session.achievements && session.achievements.length > 0 && (
          <div className="session-achievements">
            <h3>Achievements Unlocked!</h3>
            {session.achievements.map(ach => (
              <div key={ach.id} className="session-achievement-item">
                <span className="session-ach-icon">{ach.icon}</span>
                <div>
                  <div className="session-ach-name">{ach.name}</div>
                  <div className="session-ach-desc">{ach.description}</div>
                </div>
                <span className="session-ach-xp">+{ach.xpReward} XP</span>
              </div>
            ))}
          </div>
        )}

        {session.streakUpdate && (
          <div className="session-streak">
            🔥 {session.streakUpdate.currentStreak} day streak
            {session.streakUpdate.multiplier > 1 && (
              <span className="session-streak-mult"> ({session.streakUpdate.multiplier}x bonus)</span>
            )}
          </div>
        )}

        <div className="session-summary-actions">
          <button className="session-btn-continue" onClick={onContinue}>
            Continue Practicing
          </button>
          <button className="session-btn-end" onClick={onEnd}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export default SessionSummary
