import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../utils/api'
import './ConfidenceScoring.css'

function ConfidenceScoring({ topics, compact = false, jobDescriptionHash }) {
  const [confidences, setConfidences] = useState({})
  const saveTimerRef = useRef(null)

  // Load from server
  useEffect(() => {
    if (!jobDescriptionHash) {
      // Fallback to localStorage if no hash
      const saved = localStorage.getItem('interviewPrepperConfidence')
      if (saved) {
        try { setConfidences(JSON.parse(saved)) } catch (e) {}
      }
      return
    }
    const load = async () => {
      try {
        const res = await api.progress.get(jobDescriptionHash)
        const scores = res.data.confidenceScores || {}
        setConfidences(scores)
      } catch (err) {
        // Fallback to localStorage
        const saved = localStorage.getItem('interviewPrepperConfidence')
        if (saved) {
          try { setConfidences(JSON.parse(saved)) } catch (e) {}
        }
      }
    }
    load()
  }, [jobDescriptionHash])

  // Debounced save to server
  const saveToServer = useCallback((newConfidences) => {
    if (!jobDescriptionHash) {
      localStorage.setItem('interviewPrepperConfidence', JSON.stringify(newConfidences))
      return
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        await api.progress.save({ jobDescriptionHash, confidenceScores: newConfidences })
      } catch (err) {
        console.error('Failed to save confidence scores:', err)
      }
    }, 500)
  }, [jobDescriptionHash])

  const updateConfidence = (topicName, score) => {
    const newConfidences = {
      ...confidences,
      [topicName]: {
        score,
        updatedAt: new Date().toISOString()
      }
    }
    setConfidences(newConfidences)
    saveToServer(newConfidences)
  }

  const getConfidenceColor = (score) => {
    if (score >= 4) return '#10b981'
    if (score >= 3) return '#f59e0b'
    if (score >= 2) return '#f59e0b'
    return '#ff6b6b'
  }

  const getConfidenceLabel = (score) => {
    if (score === 5) return 'Very Confident'
    if (score === 4) return 'Confident'
    if (score === 3) return 'Moderate'
    if (score === 2) return 'Low'
    if (score === 1) return 'Very Low'
    return 'Not Rated'
  }

  const averageConfidence = topics && topics.length > 0
    ? Object.values(confidences).reduce((sum, conf) => sum + (conf?.score || 0), 0) / topics.length
    : 0

  const lowConfidenceTopics = topics?.filter(topic => {
    const conf = confidences[topic.topic]
    return !conf || conf.score < 3
  }) || []

  if (!topics || topics.length === 0) {
    return <div className="confidence-empty">No topics available for confidence scoring</div>
  }

  if (compact && topics.length === 1) {
    const topic = topics[0]
    const confidence = confidences[topic.topic]
    const currentScore = confidence?.score || 0

    return (
      <div className="confidence-compact">
        <div className="confidence-compact-label">Confidence:</div>
        <div className="rating-buttons-compact">
          {[1, 2, 3, 4, 5].map(score => (
            <button
              key={score}
              className={`rating-btn-compact ${currentScore === score ? 'active' : ''}`}
              style={{
                backgroundColor: currentScore === score
                  ? getConfidenceColor(score)
                  : '#1a1a1a',
                borderColor: currentScore === score
                  ? getConfidenceColor(score)
                  : '#2a2a2a'
              }}
              onClick={() => updateConfidence(topic.topic, score)}
            >
              {score}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="confidence-container">
      <div className="confidence-header">
        <h2>Confidence Scoring</h2>
        {averageConfidence > 0 && (
          <div className="confidence-average">
            Average: <span style={{ color: getConfidenceColor(Math.round(averageConfidence)) }}>
              {averageConfidence.toFixed(1)}/5
            </span>
          </div>
        )}
      </div>

      <div className="confidence-summary">
        <div className="summary-card">
          <div className="summary-value">{topics.length}</div>
          <div className="summary-label">Total Topics</div>
        </div>
        <div className="summary-card">
          <div className="summary-value">{lowConfidenceTopics.length}</div>
          <div className="summary-label">Need Practice</div>
        </div>
        <div className="summary-card">
          <div className="summary-value">
            {topics.length - lowConfidenceTopics.length}
          </div>
          <div className="summary-label">Confident</div>
        </div>
      </div>

      <div className="confidence-topics">
        {topics.map((topic, idx) => {
          const confidence = confidences[topic.topic]
          const currentScore = confidence?.score || 0

          return (
            <div key={idx} className="confidence-topic-card">
              <div className="topic-header">
                <h3 className="topic-title">{topic.topic}</h3>
                {currentScore > 0 && (
                  <div className="topic-confidence-display">
                    <span
                      className="confidence-score"
                      style={{ color: getConfidenceColor(currentScore) }}
                    >
                      {currentScore}/5
                    </span>
                    <span className="confidence-label">
                      {getConfidenceLabel(currentScore)}
                    </span>
                  </div>
                )}
              </div>

              <div className="confidence-rating">
                <div className="rating-label">Rate your confidence:</div>
                <div className="rating-buttons">
                  {[1, 2, 3, 4, 5].map(score => (
                    <button
                      key={score}
                      className={`rating-btn ${currentScore === score ? 'active' : ''}`}
                      style={{
                        backgroundColor: currentScore === score
                          ? getConfidenceColor(score)
                          : '#1a1a1a',
                        borderColor: currentScore === score
                          ? getConfidenceColor(score)
                          : '#2a2a2a'
                      }}
                      onClick={() => updateConfidence(topic.topic, score)}
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </div>

              {lowConfidenceTopics.includes(topic) && currentScore < 3 && (
                <div className="low-confidence-warning">
                  Focus on this topic - your confidence is low
                </div>
              )}
            </div>
          )
        })}
      </div>

      {lowConfidenceTopics.length > 0 && (
        <div className="confidence-recommendations">
          <h3>Recommended Focus Areas</h3>
          <p className="recommendations-text">
            Based on your confidence scores, we recommend focusing on these topics:
          </p>
          <ul className="recommendations-list">
            {lowConfidenceTopics.map((topic, idx) => (
              <li key={idx}>{topic.topic}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default ConfidenceScoring
