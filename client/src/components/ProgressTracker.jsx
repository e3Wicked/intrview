import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../utils/api'
import AchievementsBadgeGrid from './AchievementsBadgeGrid'
import XPBar from './XPBar'
import './ProgressTracker.css'

function ProgressTracker({ topics, studyPlan, jobDescriptionHash }) {
  const [progress, setProgress] = useState({
    topicsStudied: [],
    topicsCompleted: [],
    confidenceScores: {},
  })
  const [loading, setLoading] = useState(true)
  const saveTimerRef = useRef(null)

  // Load progress from server
  useEffect(() => {
    if (!jobDescriptionHash) {
      setLoading(false)
      return
    }
    const load = async () => {
      try {
        const res = await api.progress.get(jobDescriptionHash)
        setProgress({
          topicsStudied: res.data.topicsStudied || [],
          topicsCompleted: res.data.topicsCompleted || [],
          confidenceScores: res.data.confidenceScores || {},
        })
      } catch (err) {
        console.error('Failed to load progress:', err)
        // Fallback to localStorage during transition
        const saved = localStorage.getItem('interviewPrepperProgress')
        if (saved) {
          try {
            const parsed = JSON.parse(saved)
            setProgress({
              topicsStudied: parsed.topicsStudied || [],
              topicsCompleted: parsed.topicsCompleted || [],
              confidenceScores: {},
            })
          } catch (e) {}
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [jobDescriptionHash])

  // Debounced save to server
  const saveToServer = useCallback((updates) => {
    if (!jobDescriptionHash) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        await api.progress.save({ jobDescriptionHash, ...updates })
      } catch (err) {
        console.error('Failed to save progress:', err)
      }
    }, 300)
  }, [jobDescriptionHash])

  const markTopicStudied = (topicName) => {
    if (progress.topicsStudied.includes(topicName)) return
    const updated = [...progress.topicsStudied, topicName]
    setProgress(prev => ({ ...prev, topicsStudied: updated }))
    saveToServer({ topicsStudied: [topicName] })
  }

  const markTopicCompleted = (topicName) => {
    if (progress.topicsCompleted.includes(topicName)) return
    const updated = [...progress.topicsCompleted, topicName]
    setProgress(prev => ({ ...prev, topicsCompleted: updated }))
    saveToServer({ topicsCompleted: [topicName] })
  }

  const currentTopicNames = topics ? new Set(topics.map(t => t.topic)) : new Set()
  const topicsStudied = new Set(progress.topicsStudied.filter(t => currentTopicNames.has(t)))
  const topicsCompleted = new Set(progress.topicsCompleted.filter(t => currentTopicNames.has(t)))
  const totalTopics = topics?.length || 0
  const studiedCount = topicsStudied.size
  const completedCount = topicsCompleted.size
  const progressPercent = totalTopics > 0 ? Math.min(100, (studiedCount / totalTopics) * 100) : 0
  const completionPercent = totalTopics > 0 ? Math.min(100, (completedCount / totalTopics) * 100) : 0

  if (loading) {
    return <div className="progress-container"><p style={{ color: '#888' }}>Loading progress...</p></div>
  }

  return (
    <div className="progress-container">
      <h2>Progress Tracking</h2>

      <XPBar compact={false} />

      <div className="progress-stats" style={{ marginTop: '16px' }}>
        <div className="stat-card">
          <div className="stat-value">{studiedCount}/{totalTopics}</div>
          <div className="stat-label">Topics Studied</div>
          <div className="stat-progress">
            <div className="stat-progress-bar">
              <div className="stat-progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="stat-percent">{Math.round(progressPercent)}%</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-value">{completedCount}/{totalTopics}</div>
          <div className="stat-label">Topics Completed</div>
          <div className="stat-progress">
            <div className="stat-progress-bar">
              <div className="stat-progress-fill completed" style={{ width: `${completionPercent}%` }} />
            </div>
            <span className="stat-percent">{Math.round(completionPercent)}%</span>
          </div>
        </div>
      </div>

      {topics && topics.length > 0 && (
        <div className="topics-progress">
          <h3>Topics Progress</h3>
          <div className="topics-list">
            {topics.map((topic, idx) => {
              const isStudied = topicsStudied.has(topic.topic)
              const isCompleted = topicsCompleted.has(topic.topic)

              return (
                <div key={idx} className="topic-progress-item">
                  <div className="topic-progress-header">
                    <span className="topic-name">{topic.topic}</span>
                    <div className="topic-status">
                      {isCompleted && <span className="status-badge completed">Completed</span>}
                      {isStudied && !isCompleted && <span className="status-badge studied">Studied</span>}
                      {!isStudied && <span className="status-badge not-started">Not Started</span>}
                    </div>
                  </div>
                  <div className="topic-progress-actions">
                    <button
                      className="progress-btn"
                      onClick={() => markTopicStudied(topic.topic)}
                      disabled={isStudied}
                    >
                      Mark as Studied
                    </button>
                    <button
                      className="progress-btn completed-btn"
                      onClick={() => markTopicCompleted(topic.topic)}
                      disabled={isCompleted}
                    >
                      Mark as Completed
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <AchievementsBadgeGrid />
    </div>
  )
}

export default ProgressTracker
