import { useState } from 'react'
import axios from 'axios'
import './QuizMode.css'

function QuizMode({ questions, jobDescription, jobDescriptionHash, sessionId, onXpGained }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [userAnswer, setUserAnswer] = useState('')
  const [evaluation, setEvaluation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [scores, setScores] = useState([])
  const [lastXp, setLastXp] = useState(null)

  if (!questions || questions.length === 0) {
    return <div className="quiz-empty">No questions available for quiz</div>
  }

  const currentQuestion = questions[currentIndex]
  const averageScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null

  const handleSubmit = async () => {
    if (!userAnswer.trim()) return

    setLoading(true)
    setEvaluation(null)
    setLastXp(null)

    try {
      const response = await axios.post('/api/quiz/evaluate', {
        question: currentQuestion.question,
        userAnswer,
        correctAnswer: currentQuestion.answer,
        jobDescription,
        jobDescriptionHash: jobDescriptionHash || '',
        sessionId: sessionId || null,
        questionCategory: currentQuestion.category || null,
      })

      const newScore = response.data.evaluation.score
      setScores(prev => [...prev, newScore])
      setEvaluation(response.data.evaluation)

      if (response.data.xpEarned !== undefined) {
        setLastXp(response.data.xpEarned)
        if (onXpGained) {
          onXpGained({
            xpEarned: response.data.xpEarned,
            totalXp: response.data.totalXp,
            levelUp: response.data.levelUp,
            levelTitle: response.data.levelTitle,
            newAchievements: response.data.newAchievements,
          })
        }
      }
    } catch (error) {
      console.error('Error evaluating answer:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setUserAnswer('')
      setEvaluation(null)
      setLastXp(null)
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setUserAnswer('')
      setEvaluation(null)
      setLastXp(null)
    }
  }

  const status = currentQuestion._status
  const statusLabels = {
    new: { label: 'New', cls: 'status-new' },
    needs_work: { label: 'Needs Work', cls: 'status-needs-work' },
    improving: { label: 'Improving', cls: 'status-improving' },
    mastered: { label: 'Mastered', cls: 'status-mastered' },
  }

  return (
    <div className="quiz-container">
      <div className="quiz-header">
        {averageScore !== null && (
          <div className="quiz-average">
            Quiz Average: <span className="score-value">{averageScore}/100</span>
          </div>
        )}
      </div>

      <div className="quiz-question-card">
        <div className="quiz-question-header">
          <span className="quiz-number">Question {currentIndex + 1} of {questions.length}</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {status && statusLabels[status] && (
              <span className={`quiz-status-badge ${statusLabels[status].cls}`}>
                {statusLabels[status].label}
              </span>
            )}
            {currentQuestion.category && (
              <span className="quiz-category">{currentQuestion.category}</span>
            )}
          </div>
        </div>
        <h3 className="quiz-question-text">{currentQuestion.question}</h3>
      </div>

      <div className="quiz-answer-section">
        <label className="quiz-label">Your Answer:</label>
        <textarea
          className="quiz-textarea"
          value={userAnswer}
          onChange={(e) => setUserAnswer(e.target.value)}
          placeholder="Type your answer here..."
          rows={6}
          disabled={loading}
        />
        <button
          className="quiz-submit-btn"
          onClick={handleSubmit}
          disabled={loading || !userAnswer.trim()}
        >
          {loading ? 'Evaluating...' : 'Submit Answer'}
        </button>
      </div>

      {evaluation && (
        <div className="quiz-evaluation">
          <div className="evaluation-header">
            <h3>Evaluation</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className={`score-badge score-${evaluation.score >= 80 ? 'high' : evaluation.score >= 60 ? 'medium' : 'low'}`}>
                {evaluation.score}/100
              </div>
              {lastXp !== null && lastXp > 0 && (
                <div className="quiz-xp-gain">+{lastXp} XP</div>
              )}
            </div>
          </div>

          <div className="evaluation-section">
            <h4 className="evaluation-title">Strengths</h4>
            <ul className="evaluation-list strengths">
              {evaluation.strengths.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>

          <div className="evaluation-section">
            <h4 className="evaluation-title">Areas for Improvement</h4>
            <ul className="evaluation-list improvements">
              {evaluation.improvements.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>

          <div className="evaluation-section">
            <h4 className="evaluation-title">Tips</h4>
            <ul className="evaluation-list tips">
              {evaluation.tips.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>

          {evaluation.feedback && (
            <div className="evaluation-feedback"><p>{evaluation.feedback}</p></div>
          )}
        </div>
      )}

      <div className="quiz-controls">
        <button className="quiz-nav-btn" onClick={handlePrev} disabled={currentIndex === 0}>
          Previous
        </button>
        <button className="quiz-nav-btn" onClick={handleNext} disabled={currentIndex === questions.length - 1}>
          Next
        </button>
      </div>
    </div>
  )
}

export default QuizMode
