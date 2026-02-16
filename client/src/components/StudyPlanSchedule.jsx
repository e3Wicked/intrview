import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import './StudyPlanSchedule.css'

function StudyPlanSchedule({ analyses, studyPlans, progress: propProgress }) {
  const [serverProgress, setServerProgress] = useState(null)

  // Get the first available study plan
  const firstAnalysis = analyses[0]
  const studyPlan = firstAnalysis ? studyPlans[firstAnalysis.job_description_hash] : null
  const jobHash = firstAnalysis?.job_description_hash

  // Load progress from server
  useEffect(() => {
    if (!jobHash) return
    const load = async () => {
      try {
        const res = await api.progress.get(jobHash)
        setServerProgress({
          topicsStudied: res.data.topicsStudied || [],
          topicsCompleted: res.data.topicsCompleted || [],
        })
      } catch (err) {
        // Fallback to localStorage
        const saved = localStorage.getItem('interviewPrepperProgress')
        if (saved) {
          try {
            const parsed = JSON.parse(saved)
            setServerProgress({
              topicsStudied: parsed.topicsStudied || [],
              topicsCompleted: parsed.topicsCompleted || [],
            })
          } catch (e) {}
        }
      }
    }
    load()
  }, [jobHash])

  if (!studyPlan || !studyPlan.studyPlan || !studyPlan.studyPlan.topics) {
    return (
      <div className="study-plan-empty">
        <p>No study plan available yet. Study plans are generated when you analyze a job posting.</p>
      </div>
    )
  }

  const effectiveProgress = propProgress || serverProgress
  const topicsStudied = new Set(effectiveProgress?.topicsStudied || [])
  const topicsCompleted = new Set(effectiveProgress?.topicsCompleted || [])

  const topics = studyPlan.studyPlan.topics || []
  const weeks = Math.ceil(topics.length / 3)
  const weeklySchedule = []

  for (let week = 1; week <= weeks; week++) {
    const weekTopics = topics.slice((week - 1) * 3, week * 3)
    weeklySchedule.push({
      week,
      topics: weekTopics
    })
  }

  return (
    <div className="study-plan-schedule">
      <div className="schedule-header">
        <h3>Your Study Schedule</h3>
        <p className="schedule-subtitle">Complete topics to track your progress</p>
      </div>
      <div className="weekly-schedule">
        {weeklySchedule.map(({ week, topics: weekTopics }) => (
          <div key={week} className="week-card">
            <div className="week-header">
              <h4 className="week-title">Week {week}</h4>
            </div>
            <div className="week-topics">
              {weekTopics.map((topic, idx) => {
                const isCompleted = topicsCompleted.has(topic.topic)
                const isStudied = topicsStudied.has(topic.topic)

                return (
                  <div key={idx} className={`topic-item ${isCompleted ? 'completed' : isStudied ? 'studied' : ''}`}>
                    {isCompleted && <span className="topic-check" style={{ color: '#4ade80' }}>✓</span>}
                    {isStudied && !isCompleted && <span className="topic-check" style={{ color: '#f59e0b' }}>~</span>}
                    <span className="topic-name">{topic.topic}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default StudyPlanSchedule
