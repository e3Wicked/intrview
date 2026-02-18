import { useState, useMemo } from 'react'
import './InterviewPlan.css'

function InterviewPlan({ analyses, studyPlans }) {
  const [expandedStages, setExpandedStages] = useState(new Set())

  // Get the first analysis and its study plan
  const analysis = analyses[0]
  const studyPlan = analysis ? studyPlans[analysis.job_description_hash] : null

  // Extract interview questions organized by stage
  // Handle both nested (studyPlan.studyPlan.interviewQuestions) and flat (studyPlan.interviewQuestions) structures
  const stagesWithQuestions = useMemo(() => {
    const stages =
      studyPlan?.studyPlan?.interviewQuestions?.stages ||
      studyPlan?.interviewQuestions?.stages ||
      null

    if (!stages || stages.length === 0) {
      return []
    }

    return stages.map(stage => ({
      stageName: stage.stageName || 'Interview Stage',
      description: stage.description || 'Questions for this interview stage',
      questions: stage.questions || []
    }))
  }, [studyPlan])

  // Count total questions across all stages
  const totalQuestions = useMemo(() => {
    return stagesWithQuestions.reduce((sum, stage) => sum + (stage.questions?.length || 0), 0)
  }, [stagesWithQuestions])

  const toggleStage = (stageName) => {
    setExpandedStages(prev => {
      const next = new Set(prev)
      if (next.has(stageName)) {
        next.delete(stageName)
      } else {
        next.add(stageName)
      }
      return next
    })
  }

  if (!analysis || !studyPlan) {
    return (
      <div className="interview-plan-empty">
        <p>No interview plan available yet. Interview questions are generated when you analyze a job posting.</p>
      </div>
    )
  }

  if (stagesWithQuestions.length === 0) {
    return (
      <div className="interview-plan-empty">
        <p>No interview stages found in this study plan. Try analyzing the job posting again to generate interview questions.</p>
      </div>
    )
  }

  return (
    <div className="interview-plan">
      <div className="interview-plan-summary">
        <span className="plan-summary-text">
          {stagesWithQuestions.length} interview {stagesWithQuestions.length === 1 ? 'stage' : 'stages'} &middot; {totalQuestions} {totalQuestions === 1 ? 'question' : 'questions'}
        </span>
      </div>
      <div className="interview-timeline">
        {stagesWithQuestions.map((stage, idx) => {
          const isExpanded = expandedStages.has(stage.stageName)
          const hasQuestions = stage.questions && stage.questions.length > 0

          return (
            <div key={idx} className="timeline-stage">
              <div className="stage-connector">
                {idx > 0 && <div className="connector-line" />}
                <div className={`stage-dot ${hasQuestions ? 'has-questions' : ''}`} />
                {idx < stagesWithQuestions.length - 1 && <div className="connector-line" />}
              </div>
              <div className="stage-content">
                <div className="stage-header" onClick={() => hasQuestions && toggleStage(stage.stageName)}>
                  <div>
                    <h3 className="stage-name">
                      {stage.stageName}
                      {hasQuestions && (
                        <span className="stage-question-badge">
                          {stage.questions.length}
                        </span>
                      )}
                    </h3>
                    <p className="stage-description">{stage.description}</p>
                  </div>
                  {hasQuestions && (
                    <button className="stage-toggle">
                      {isExpanded ? '\u2212' : '+'}
                    </button>
                  )}
                </div>

                {isExpanded && hasQuestions && (
                  <div className="stage-questions">
                    {stage.questions.map((question, qIdx) => (
                      <div key={qIdx} className="question-item">
                        <div className="question-header">
                          <span className="question-number">{qIdx + 1}</span>
                          <span className="question-category">{question.category || 'General'}</span>
                        </div>
                        <div className="question-text">{question.question}</div>
                        {question.answer && (
                          <details className="question-answer">
                            <summary>View Answer</summary>
                            <div className="answer-content">{question.answer}</div>
                            {question.tips && (
                              <div className="answer-tips">
                                <strong>Tips:</strong> {question.tips}
                              </div>
                            )}
                            {question.references && question.references.length > 0 && (
                              <div className="answer-references">
                                <strong>References:</strong>
                                <ul>
                                  {question.references.map((ref, rIdx) => (
                                    <li key={rIdx}>
                                      {ref.url ? (
                                        <a href={ref.url} target="_blank" rel="noopener noreferrer">
                                          {ref.title || ref.url}
                                        </a>
                                      ) : (
                                        ref.title
                                      )}
                                      {ref.description && <span className="ref-desc"> - {ref.description}</span>}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default InterviewPlan
