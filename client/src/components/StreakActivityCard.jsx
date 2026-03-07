import './StreakActivityCard.css'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function StreakActivityCard({ data }) {
  if (!data) return null

  const { currentStreak, longestStreak, last7Days } = data
  const maxSessions = Math.max(...last7Days.map(d => d.sessions), 1)
  const today = new Date().toISOString().slice(0, 10)
  const hasActivity = last7Days.some(d => d.sessions > 0)

  return (
    <div className="streak-activity-card">
      <div className="streak-section">
        <div className="streak-number">{currentStreak} 🔥</div>
        <div className="streak-label">day streak</div>
        <div className="streak-best">Best: {longestStreak} day{longestStreak !== 1 ? 's' : ''}</div>
      </div>
      <div className="activity-section">
        {hasActivity ? (
          <div className="activity-chart">
            <div className="activity-bars">
              {last7Days.map((day) => {
                const height = day.sessions > 0 ? Math.max(10, (day.sessions / maxSessions) * 100) : 4
                const isToday = day.date === today
                const dayOfWeek = DAY_LABELS[new Date(day.date + 'T12:00:00').getDay()]
                return (
                  <div key={day.date} className="activity-bar-col">
                    <div className="activity-bar-wrap">
                      <div
                        className={`activity-bar ${isToday ? 'today' : ''} ${day.sessions > 0 ? 'active' : ''}`}
                        style={{ height: `${height}%` }}
                      />
                    </div>
                    <span className={`activity-day-label ${isToday ? 'today' : ''}`}>{dayOfWeek}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="activity-empty">
            <span>Start practicing to build your streak!</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default StreakActivityCard
