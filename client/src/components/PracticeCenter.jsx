import { useState, useEffect, useMemo } from 'react'
import Practice from './Practice'
import { api } from '../utils/api'
import './PracticeCenter.css'

function PracticeCenter({ analyses, studyPlans }) {
  const [serverProgress, setServerProgress] = useState(null)

  // Get the first analysis and its study plan
  const analysis = analyses[0]
  const studyPlan = analysis ? studyPlans[analysis.job_description_hash] : null
  const jobHash = analysis?.job_description_hash

  // Load progress from server
  useEffect(() => {
    if (!jobHash) return
    const load = async () => {
      try {
        const res = await api.progress.get(jobHash)
        setServerProgress(res.data)
      } catch (err) {
        // Fallback to localStorage
        const saved = localStorage.getItem('interviewPrepperProgress')
        if (saved) {
          try {
            const parsed = JSON.parse(saved)
            setServerProgress({ topicsStudied: parsed.topicsStudied || [] })
          } catch (e) {}
        }
      }
    }
    load()
  }, [jobHash])

  // Extract questions from study plan - handle both nested and flat structures
  const questions = useMemo(() => {
    if (!studyPlan) return []

    // Try nested structure first (studyPlan.studyPlan.interviewQuestions)
    if (studyPlan.studyPlan?.interviewQuestions?.stages) {
      const allQuestions = []
      studyPlan.studyPlan.interviewQuestions.stages.forEach(stage => {
        if (stage.questions) {
          stage.questions.forEach(q => {
            allQuestions.push({
              question: q.question,
              answer: q.answer,
              category: q.category,
              tips: q.tips,
              references: q.references
            })
          })
        }
      })
      if (allQuestions.length > 0) return allQuestions
    }

    // Try direct structure (studyPlan.interviewQuestions)
    if (studyPlan.interviewQuestions?.stages) {
      const allQuestions = []
      studyPlan.interviewQuestions.stages.forEach(stage => {
        if (stage.questions) {
          stage.questions.forEach(q => {
            allQuestions.push({
              question: q.question,
              answer: q.answer,
              category: q.category,
              tips: q.tips,
              references: q.references
            })
          })
        }
      })
      if (allQuestions.length > 0) return allQuestions
    }

    return []
  }, [studyPlan])

  // Extract study topics for chat practice
  const studyTopics = useMemo(() => {
    if (!studyPlan) return []
    const topics = studyPlan.studyPlan?.topics || studyPlan.topics || []
    return topics.map(t => typeof t === 'string' ? t : t.topic || t.name || '').filter(Boolean)
  }, [studyPlan])

  // Calculate progress from server data
  const progressData = useMemo(() => {
    if (!studyPlan?.studyPlan?.topics) return { overall: 0, categories: [] }

    let totalTopics = 0
    let completedTopics = 0
    const categoryProgress = {}

    const topicsStudied = new Set(serverProgress?.topicsStudied || [])

    studyPlan.studyPlan.topics.forEach(topic => {
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

    const overallProgress = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0

    return {
      overall: overallProgress,
      categories: Object.entries(categoryProgress).map(([name, data]) => ({
        name,
        progress: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0
      }))
    }
  }, [studyPlan, serverProgress])

  if (!analysis || !studyPlan) {
    return (
      <div className="practice-center-empty">
        <p>No study plan available yet. Study plans are generated when you analyze a job posting.</p>
      </div>
    )
  }

  return (
    <div className="practice-center">
      {/* Progress Summary at Top */}
      {progressData.overall > 0 && (
        <div className="practice-progress-summary">
          <div className="progress-summary-header">
            <h3>Your Progress</h3>
            <div className="progress-overall">
              <span className="progress-value">{progressData.overall}%</span>
              <span className="progress-label">Complete</span>
            </div>
          </div>
          {progressData.categories.length > 0 && (
            <div className="progress-categories">
              {progressData.categories.map((cat, idx) => (
                <div key={idx} className="progress-category-item">
                  <span className="category-name">{cat.name}</span>
                  <div className="category-progress-bar">
                    <div
                      className="category-progress-fill"
                      style={{ width: `${cat.progress}%` }}
                    />
                  </div>
                  <span className="category-progress-value">{cat.progress}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Practice Section */}
      <div className="practice-section">
        <Practice
          questions={questions}
          jobDescription={studyPlan.jobDescription || (studyPlan.studyPlan ? '' : '')}
          companyName={analysis.company_name}
          roleTitle={analysis.role_title}
          techStack={null}
          jobDescriptionHash={analysis.job_description_hash}
          studyTopics={studyTopics}
        />
      </div>
    </div>
  )
}

export default PracticeCenter
