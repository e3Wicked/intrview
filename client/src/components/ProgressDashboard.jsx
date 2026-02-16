import { useState, useEffect, useMemo } from 'react'
import { api } from '../utils/api'
import XPBar from './XPBar'
import StreakCounter from './StreakCounter'
import AchievementsBadgeGrid from './AchievementsBadgeGrid'
import './ProgressDashboard.css'

function ProgressDashboard({ analyses, studyPlans }) {
  const [serverProgress, setServerProgress] = useState({})
  const [practiceHistory, setPracticeHistory] = useState([])

  // Load progress from server for all analyses
  useEffect(() => {
    const loadProgress = async () => {
      const progressMap = {}
      for (const analysis of analyses) {
        try {
          const res = await api.progress.get(analysis.job_description_hash)
          progressMap[analysis.job_description_hash] = res.data
        } catch (err) {
          // Fallback: no server data for this hash
        }
      }
      setServerProgress(progressMap)
    }

    const loadHistory = async () => {
      try {
        const res = await api.practice.getHistory()
        setPracticeHistory(res.data.sessions || [])
      } catch (err) {
        // Non-critical
      }
    }

    if (analyses.length > 0) {
      loadProgress()
      loadHistory()
    }
  }, [analyses])

  const progressData = useMemo(() => {
    let totalTopics = 0
    let completedTopics = 0
    const categoryProgress = {}

    analyses.forEach(analysis => {
      const plan = studyPlans[analysis.job_description_hash]
      if (plan?.studyPlan?.topics) {
        const sp = serverProgress[analysis.job_description_hash]
        const topicsStudied = new Set(sp?.topicsStudied || [])

        plan.studyPlan.topics.forEach(topic => {
          totalTopics++
          const category = topic.category || 'General'
          if (!categoryProgress[category]) {
            categoryProgress[category] = { total: 0, completed: 0 }
          }
          categoryProgress[category].total++

          if (topicsStudied.has(topic.topic)) {
            completedTopics++
            categoryProgress[category].completed++
          }
        })
      }
    })

    const overallProgress = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0

    return {
      overall: overallProgress,
      categories: Object.entries(categoryProgress).map(([name, data]) => ({
        name,
        progress: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0
      }))
    }
  }, [analyses, studyPlans, serverProgress])

  return (
    <div className="progress-dashboard">
      <div className="progress-gamification-header" style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <XPBar compact={false} />
        <StreakCounter />
      </div>

      <div className="progress-overview">
        <div className="progress-ring-large">
          <svg className="progress-ring-svg-large" width="200" height="200">
            <circle
              className="progress-ring-circle-bg-large"
              cx="100"
              cy="100"
              r="90"
              fill="none"
              stroke="#2a2a2a"
              strokeWidth="12"
            />
            <circle
              className="progress-ring-circle-large"
              cx="100"
              cy="100"
              r="90"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="12"
              strokeDasharray={`${2 * Math.PI * 90}`}
              strokeDashoffset={`${2 * Math.PI * 90 * (1 - progressData.overall / 100)}`}
              transform="rotate(-90 100 100)"
            />
          </svg>
          <div className="progress-ring-text-large">
            <span className="progress-ring-value-large">{progressData.overall}%</span>
            <span className="progress-ring-label-large">Overall Completion</span>
          </div>
        </div>
      </div>

      <div className="progress-categories">
        <h3 className="categories-title">Progress by Category</h3>
        <div className="categories-list">
          {progressData.categories.map((category, idx) => (
            <div key={idx} className="category-progress-item">
              <div className="category-header">
                <span className="category-name">{category.name}</span>
                <span className="category-percent">{category.progress}%</span>
              </div>
              <div className="category-bar">
                <div
                  className="category-bar-fill"
                  style={{ width: `${category.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {practiceHistory.length > 0 && (
        <div className="practice-history-section" style={{ marginTop: '32px' }}>
          <h3 className="categories-title">Recent Practice Sessions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {practiceHistory.slice(0, 5).map((session, idx) => (
              <div key={idx} style={{
                background: '#1a1a1a',
                border: '1px solid #2a2a2a',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div>
                  <span style={{ color: '#fff', fontSize: '14px' }}>
                    {session.mode || 'Practice'} Session
                  </span>
                  <span style={{ color: '#666', fontSize: '12px', marginLeft: '8px' }}>
                    {new Date(session.started_at).toLocaleDateString()}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '13px' }}>
                  <span style={{ color: '#b0b0b0' }}>{session.questions_attempted || 0} questions</span>
                  {session.average_score > 0 && (
                    <span style={{ color: '#f59e0b' }}>Avg: {Math.round(session.average_score)}</span>
                  )}
                  {session.xp_earned > 0 && (
                    <span style={{ color: '#4ade80' }}>+{session.xp_earned} XP</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: '32px' }}>
        <AchievementsBadgeGrid />
      </div>
    </div>
  )
}

export default ProgressDashboard
