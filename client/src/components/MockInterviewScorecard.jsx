import { useState } from 'react'
import './MockInterviewScorecard.css'

function CommunicationSkillBar({ label, score }) {
  const barColor = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444'
  return (
    <div className="mock-scorecard-skill-row">
      <span className="mock-scorecard-skill-label">{label}</span>
      <div className="mock-scorecard-skill-track">
        <div
          className="mock-scorecard-skill-fill"
          style={{ width: `${score}%`, backgroundColor: barColor }}
        />
      </div>
      <span className="mock-scorecard-skill-value">{score}</span>
    </div>
  )
}

function MockInterviewScorecard({ scorecard, onBack }) {
  const [expandedQuestion, setExpandedQuestion] = useState(null)

  if (!scorecard) return null

  const {
    overallScore = 0,
    summary = '',
    communicationSkills,
    strengths = [],
    improvements = [],
    keyMoments,
    recommendations = [],
    questionResults: questions = [],
  } = scorecard

  const scoreColor = overallScore >= 80 ? '#22c55e' : overallScore >= 60 ? '#f59e0b' : '#ef4444'

  // SVG circular progress ring
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (overallScore / 100) * circumference

  return (
    <div className="mock-scorecard">
      <button className="mock-scorecard-back" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Back to Mock Interviews
      </button>
      <div className="mock-scorecard-header">
        <h2>Interview Scorecard</h2>
      </div>

      {/* Top Section: Score Ring + Summary + Communication Skills */}
      <div className="mock-scorecard-top-grid">
        <div className="mock-scorecard-ring-wrapper">
          <svg width="140" height="140" viewBox="0 0 140 140">
            <circle
              cx="70" cy="70" r={radius}
              fill="none"
              stroke="var(--color-border, #e6e3de)"
              strokeWidth="8"
            />
            <circle
              cx="70" cy="70" r={radius}
              fill="none"
              stroke={scoreColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              transform="rotate(-90 70 70)"
              style={{ transition: 'stroke-dashoffset 1s ease' }}
            />
          </svg>
          <div className="mock-scorecard-ring-value" style={{ color: scoreColor }}>
            {overallScore}
          </div>
          <div className="mock-scorecard-ring-label">/ 100</div>
        </div>

        <div className="mock-scorecard-top-right">
          {summary && (
            <p className="mock-scorecard-summary">{summary}</p>
          )}
          {communicationSkills && (
            <div className="mock-scorecard-skills">
              <CommunicationSkillBar label="Clarity" score={communicationSkills.clarity} />
              <CommunicationSkillBar label="Confidence" score={communicationSkills.confidence} />
              <CommunicationSkillBar label="Relevance" score={communicationSkills.relevance} />
              <CommunicationSkillBar label="Structure" score={communicationSkills.structure} />
            </div>
          )}
        </div>
      </div>

      {/* Strengths + Improvements side-by-side */}
      {(strengths.length > 0 || improvements.length > 0) && (
        <div className="mock-scorecard-two-col">
          {strengths.length > 0 && (
            <div className="mock-scorecard-section">
              <h3 className="mock-scorecard-section-title">
                <span className="mock-scorecard-dot success" />
                Strengths
              </h3>
              <ul className="mock-scorecard-list">
                {strengths.map((item, i) => (
                  <li key={i} className="mock-scorecard-item success">{item}</li>
                ))}
              </ul>
            </div>
          )}

          {improvements.length > 0 && (
            <div className="mock-scorecard-section">
              <h3 className="mock-scorecard-section-title">
                <span className="mock-scorecard-dot warning" />
                Areas for Improvement
              </h3>
              <ul className="mock-scorecard-list">
                {improvements.map((item, i) => (
                  <li key={i} className="mock-scorecard-item warning">{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Key Moments */}
      {keyMoments && (keyMoments.bestAnswer || keyMoments.weakestAnswer) && (
        <div className="mock-scorecard-section">
          <h3 className="mock-scorecard-section-title">Key Moments</h3>
          <div className="mock-scorecard-moments">
            {keyMoments.bestAnswer && (
              <div className="mock-scorecard-moment best">
                <span className="mock-scorecard-moment-icon">&#9733;</span>
                <div>
                  <strong>Best: Q{keyMoments.bestAnswer.questionIndex + 1}</strong>
                  <span className="mock-scorecard-moment-sep"> &mdash; </span>
                  {keyMoments.bestAnswer.highlight}
                </div>
              </div>
            )}
            {keyMoments.weakestAnswer && (
              <div className="mock-scorecard-moment weakest">
                <span className="mock-scorecard-moment-icon">&#9888;</span>
                <div>
                  <strong>Weakest: Q{keyMoments.weakestAnswer.questionIndex + 1}</strong>
                  <span className="mock-scorecard-moment-sep"> &mdash; </span>
                  {keyMoments.weakestAnswer.highlight}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="mock-scorecard-section">
          <h3 className="mock-scorecard-section-title">Recommendations</h3>
          <ul className="mock-scorecard-list">
            {recommendations.map((item, i) => (
              <li key={i} className="mock-scorecard-item">{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Per-Question Breakdown */}
      {questions.length > 0 && (
        <div className="mock-scorecard-section">
          <h3 className="mock-scorecard-section-title">Question Breakdown</h3>
          <div className="mock-scorecard-questions">
            {questions.map((q, i) => {
              const isExpanded = expandedQuestion === i
              const qScoreColor = q.score >= 80 ? 'high' : q.score >= 60 ? 'mid' : 'low'

              return (
                <div key={i} className={`mock-scorecard-question ${isExpanded ? 'expanded' : ''}`}>
                  <button
                    className="mock-scorecard-question-header"
                    onClick={() => setExpandedQuestion(isExpanded ? null : i)}
                  >
                    <span className="mock-scorecard-question-num">Q{i + 1}</span>
                    <span className="mock-scorecard-question-text">{q.question}</span>
                    <span className={`mock-scorecard-question-score ${qScoreColor}`}>
                      {q.score}
                    </span>
                    <svg
                      className={`mock-scorecard-chevron ${isExpanded ? 'open' : ''}`}
                      width="16" height="16" viewBox="0 0 16 16"
                      fill="none" stroke="currentColor" strokeWidth="2"
                    >
                      <path d="M4 6l4 4 4-4" />
                    </svg>
                  </button>
                  {isExpanded && (
                    <div className="mock-scorecard-question-detail">
                      {(q.transcript || q.userAnswer) && (
                        <div className="mock-scorecard-question-answer">
                          <span className="mock-scorecard-detail-label">Your Answer</span>
                          <p>{q.transcript || q.userAnswer}</p>
                        </div>
                      )}
                      {q.feedback && (
                        <div className="mock-scorecard-question-feedback">
                          <span className="mock-scorecard-detail-label">Feedback</span>
                          <p>{q.feedback}</p>
                        </div>
                      )}
                      {q.modelAnswer && (
                        <div className="mock-scorecard-model-answer">
                          <span className="mock-scorecard-detail-label">Model Answer</span>
                          <p>{q.modelAnswer}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}

export default MockInterviewScorecard
