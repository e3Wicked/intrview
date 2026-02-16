import { useGamification } from '../contexts/GamificationContext'
import { ACHIEVEMENTS } from '../utils/gamification'
import './AchievementsBadgeGrid.css'

function AchievementsBadgeGrid({ limit }) {
  const { gamStats } = useGamification() || {}

  if (!gamStats) return null

  const earnedMap = {}
  if (gamStats.achievements) {
    gamStats.achievements.forEach(a => {
      if (a.unlocked) earnedMap[a.id] = a.unlockedAt
    })
  }

  const allAchievements = ACHIEVEMENTS.map(a => ({
    ...a,
    unlocked: !!earnedMap[a.id],
    unlockedAt: earnedMap[a.id] || null,
  }))

  // Show earned first, then locked
  const sorted = [...allAchievements].sort((a, b) => {
    if (a.unlocked && !b.unlocked) return -1
    if (!a.unlocked && b.unlocked) return 1
    return 0
  })

  const display = limit ? sorted.slice(0, limit) : sorted
  const earnedCount = allAchievements.filter(a => a.unlocked).length

  return (
    <div className="achievements-grid-container">
      <div className="achievements-header">
        <h3>Achievements</h3>
        <span className="achievements-count">{earnedCount}/{allAchievements.length}</span>
      </div>
      <div className="achievements-grid">
        {display.map(achievement => (
          <div
            key={achievement.id}
            className={`achievement-badge ${achievement.unlocked ? 'unlocked' : 'locked'}`}
            title={achievement.unlocked
              ? `${achievement.name} - Earned ${new Date(achievement.unlockedAt).toLocaleDateString()}`
              : `${achievement.name} - ${achievement.description}`
            }
          >
            <span className="badge-icon">
              {achievement.unlocked ? achievement.icon : '🔒'}
            </span>
            <span className="badge-name">{achievement.name}</span>
            {achievement.unlocked ? (
              <span className="badge-xp">+{achievement.xpReward} XP</span>
            ) : (
              <span className="badge-desc">{achievement.description}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default AchievementsBadgeGrid
