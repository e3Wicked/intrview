import { useState, useEffect } from 'react'
import ProgressTracker from './ProgressTracker'
import ConfidenceScoring from './ConfidenceScoring'
import './StudyPlan.css'

function StudyPlan({ studyPlan, topics, jobDescriptionHash }) {
  const [expandedTopic, setExpandedTopic] = useState(null)

  if (!studyPlan && !topics) {
    return <div className="study-plan-empty">No study plan available</div>
  }

  return (
    <div className="study-plan-container">
      {studyPlan?.summary && (
        <div className="study-plan-summary">
          <h2>Summary</h2>
          <p>{studyPlan.summary}</p>
        </div>
      )}

      {topics && topics.length > 0 && (
        <>
          <div className="study-plan-topics-header">
            <h2>Study Plan</h2>
          </div>

          <div className="topics-list">
            {topics.map((topic, idx) => {
              const isExpanded = expandedTopic === idx
              
              return (
                <div key={idx} className={`topic-item ${isExpanded ? 'expanded' : ''}`}>
                  <div 
                    className="topic-header"
                    onClick={() => setExpandedTopic(isExpanded ? null : idx)}
                  >
                    <div className="topic-title-section">
                      <h3 className="topic-title">{topic.topic}</h3>
                      {topic.description && (
                        <p className="topic-description-preview">
                          {topic.description.substring(0, 100)}...
                        </p>
                      )}
                    </div>
                    <div className="topic-actions">
                      <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="topic-content">
                      {topic.description && (
                        <p className="topic-description">{topic.description}</p>
                      )}
                      
                      {topic.keyPoints && topic.keyPoints.length > 0 && (
                        <div className="topic-key-points">
                          <h4>Key Points</h4>
                          <ul>
                            {topic.keyPoints.map((point, pIdx) => (
                              <li key={pIdx}>{point}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {topic.studyResources && topic.studyResources.length > 0 && (
                        <div className="topic-resources">
                          <h4>Resources</h4>
                          <ul>
                            {topic.studyResources.map((resource, rIdx) => {
                              const resourceObj = typeof resource === 'string' 
                                ? { title: resource, url: null, type: null }
                                : resource;
                              return (
                                <li key={rIdx}>
                                  {resourceObj.url ? (
                                    <a href={resourceObj.url} target="_blank" rel="noopener noreferrer" className="resource-link">
                                      {resourceObj.title}
                                      {resourceObj.type && <span className="resource-type"> ({resourceObj.type})</span>}
                                    </a>
                                  ) : (
                                    resourceObj.title
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}

                      <div className="topic-progress-inline">
                        <ConfidenceScoring topics={[topic]} compact={true} jobDescriptionHash={jobDescriptionHash} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {studyPlan?.interviewQuestions?.stages && (
        <div className="study-plan-questions">
          <h2>Interview Questions</h2>
          {studyPlan.interviewQuestions.stages.map((stage, idx) => (
            <div key={idx} className="stage-card">
              <h3>{stage.stageName}</h3>
              <div className="questions-list">
                {stage.questions && stage.questions.map((q, qIdx) => (
                  <div key={qIdx} className="question-card">
                    <div className="question-text">{q.question}</div>
                    {q.category && (
                      <span className="category">{q.category}</span>
                    )}
                    {q.answer && (
                      <div className="answer">
                        <strong>Answer:</strong>
                        <div className="answer-content">{q.answer}</div>
                      </div>
                    )}
                    {q.references && q.references.length > 0 && (
                      <div className="references">
                        <strong>References:</strong>
                        <ul>
                          {q.references.map((ref, refIdx) => (
                            <li key={refIdx}>
                              <a href={ref.url} target="_blank" rel="noopener noreferrer" className="reference-link">
                                {ref.title}
                              </a>
                              {ref.description && <span className="reference-desc"> - {ref.description}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {q.tips && (
                      <div className="tips">
                        <strong>Tips:</strong> {q.tips}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default StudyPlan

