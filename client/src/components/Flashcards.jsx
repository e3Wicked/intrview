import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../utils/api'
import './Flashcards.css'

function Flashcards({ questions, jobDescriptionHash, sessionId, onXpGained }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [progress, setProgress] = useState({ known: new Set(), needsPractice: new Set() })
  const [serverProgress, setServerProgress] = useState({})
  const saveTimerRef = useRef(null)

  // Load flashcard progress from server
  useEffect(() => {
    if (!jobDescriptionHash) return
    const load = async () => {
      try {
        const res = await api.progress.get(jobDescriptionHash)
        const fp = res.data.flashcardProgress || {}
        const known = new Set()
        const needsPractice = new Set()
        for (const [key, val] of Object.entries(fp)) {
          if (val === 'known') known.add(key)
          else if (val === 'needsPractice') needsPractice.add(key)
        }
        setProgress({ known, needsPractice })
        setServerProgress(fp)
      } catch (err) {
        console.error('Failed to load flashcard progress:', err)
      }
    }
    load()
  }, [jobDescriptionHash])

  // Debounced save to server
  const saveToServer = useCallback((newProgress) => {
    if (!jobDescriptionHash) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        const fp = {}
        newProgress.known.forEach(key => { fp[key] = 'known' })
        newProgress.needsPractice.forEach(key => { fp[key] = 'needsPractice' })
        await api.progress.save({ jobDescriptionHash, flashcardProgress: fp })
      } catch (err) {
        console.error('Failed to save flashcard progress:', err)
      }
    }, 500)
  }, [jobDescriptionHash])

  if (!questions || questions.length === 0) {
    return <div className="flashcards-empty">No questions available for flashcards</div>
  }

  const currentQuestion = questions[currentIndex]
  const progressPercent = ((progress.known.size + progress.needsPractice.size) / questions.length) * 100

  const getQuestionKey = (q, idx) => {
    const text = q.question || q
    return `${idx}-${text.substring(0, 50)}`
  }

  const handleFlip = () => setIsFlipped(!isFlipped)

  const handleMark = async (status) => {
    const questionKey = getQuestionKey(currentQuestion, currentIndex)
    const newProgress = {
      known: new Set(progress.known),
      needsPractice: new Set(progress.needsPractice),
    }
    newProgress.known.delete(questionKey)
    newProgress.needsPractice.delete(questionKey)

    if (status === 'known') newProgress.known.add(questionKey)
    else newProgress.needsPractice.add(questionKey)

    setProgress(newProgress)
    saveToServer(newProgress)

    // Award XP
    if (onXpGained && jobDescriptionHash) {
      try {
        const res = await api.practice.flashcardXp({
          jobDescriptionHash,
          questionText: (currentQuestion.question || '').substring(0, 200),
          mark: status,
          sessionId: sessionId || null,
        })
        if (res.data.xpEarned) {
          onXpGained({ xpEarned: res.data.xpEarned, totalXp: res.data.totalXp })
        }
      } catch (err) {
        // Non-critical
      }
    }

    // Auto-advance
    setTimeout(() => {
      if (currentIndex < questions.length - 1) {
        setCurrentIndex(currentIndex + 1)
        setIsFlipped(false)
      }
    }, 300)
  }

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setIsFlipped(false)
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setIsFlipped(false)
    }
  }

  return (
    <div className="flashcards-container">
      <div className="flashcards-header">
        <div className="flashcards-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <span className="progress-text">{currentIndex + 1} / {questions.length}</span>
        </div>
      </div>

      <div className="flashcard-wrapper">
        <div className={`flashcard ${isFlipped ? 'flipped' : ''}`} onClick={handleFlip}>
          <div className="flashcard-front">
            <div className="flashcard-content">
              <h3>Question</h3>
              <p>{currentQuestion.question}</p>
              {currentQuestion.category && (
                <span className="flashcard-category">{currentQuestion.category}</span>
              )}
            </div>
            <div className="flashcard-hint">Click to flip</div>
          </div>
          <div className="flashcard-back">
            <div className="flashcard-content">
              <h3>Answer</h3>
              <div className="flashcard-answer">{currentQuestion.answer}</div>
            </div>
            <div className="flashcard-hint">Click to flip</div>
          </div>
        </div>
      </div>

      <div className="flashcards-controls">
        <button className="flashcard-btn prev-btn" onClick={handlePrev} disabled={currentIndex === 0}>
          Previous
        </button>
        <div className="flashcard-mark-buttons">
          <button className="flashcard-btn mark-needs-practice" onClick={() => handleMark('needsPractice')}>
            Needs Practice
          </button>
          <button className="flashcard-btn mark-known" onClick={() => handleMark('known')}>
            Got It
          </button>
        </div>
        <button className="flashcard-btn next-btn" onClick={handleNext} disabled={currentIndex === questions.length - 1}>
          Next
        </button>
      </div>

      <div className="flashcards-stats">
        <div className="stat-item">
          <span className="stat-label">Known:</span>
          <span className="stat-value known">{progress.known.size}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Needs Practice:</span>
          <span className="stat-value practice">{progress.needsPractice.size}</span>
        </div>
      </div>
    </div>
  )
}

export default Flashcards
