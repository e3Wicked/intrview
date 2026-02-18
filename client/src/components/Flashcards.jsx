import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { api } from '../utils/api'
import './Flashcards.css'

function Flashcards({ questions, jobDescriptionHash, sessionId, onXpGained, onGenerateMore, generating }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [progress, setProgress] = useState({ known: new Set(), needsPractice: new Set() })
  const [shuffled, setShuffled] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [focusWeak, setFocusWeak] = useState(false)
  const [xpToast, setXpToast] = useState(null)
  const saveTimerRef = useRef(null)
  const xpTimerRef = useRef(null)

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

  const getQuestionKey = useCallback((q, idx) => {
    const text = q.question || q
    return `${idx}-${text.substring(0, 50)}`
  }, [])

  // Category stats with per-category progress
  const categoryStats = useMemo(() => {
    const stats = {}
    questions.forEach((q, idx) => {
      const cat = q.category || 'General'
      if (!stats[cat]) stats[cat] = { total: 0, known: 0, needsPractice: 0 }
      stats[cat].total++
      const key = getQuestionKey(q, idx)
      if (progress.known.has(key)) stats[cat].known++
      else if (progress.needsPractice.has(key)) stats[cat].needsPractice++
    })
    // Sort by total count descending
    return Object.entries(stats)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, data]) => ({
        name,
        ...data,
        reviewed: data.known + data.needsPractice,
        percent: data.total > 0 ? Math.round(((data.known + data.needsPractice) / data.total) * 100) : 0,
      }))
  }, [questions, progress, getQuestionKey])

  // Filter and optionally shuffle questions
  const filteredQuestions = useMemo(() => {
    let filtered = questions.map((q, idx) => ({ ...q, _origIdx: idx }))

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(q => q.category === categoryFilter)
    }

    if (focusWeak) {
      filtered = filtered.filter(q => {
        const key = getQuestionKey(q, q._origIdx)
        return progress.needsPractice.has(key) || (!progress.known.has(key) && !progress.needsPractice.has(key))
      })
    }

    if (shuffled) {
      filtered = [...filtered].sort(() => Math.random() - 0.5)
    }

    return filtered
  }, [questions, categoryFilter, focusWeak, shuffled, progress, getQuestionKey])

  // Current category count info for the active card
  const currentCategoryInfo = useMemo(() => {
    if (!filteredQuestions[currentIndex]) return null
    const cat = filteredQuestions[currentIndex].category || 'General'
    const catQuestions = questions.filter(q => (q.category || 'General') === cat)
    const catIdx = categoryFilter === 'all'
      ? catQuestions.indexOf(questions[filteredQuestions[currentIndex]._origIdx]) + 1
      : currentIndex + 1
    return { name: cat, current: catIdx, total: catQuestions.length }
  }, [filteredQuestions, currentIndex, questions, categoryFilter])

  // Reset index when filters change
  useEffect(() => {
    setCurrentIndex(0)
    setIsFlipped(false)
  }, [categoryFilter, focusWeak, shuffled])

  if (!questions || questions.length === 0) {
    return <div className="flashcards-empty">No questions available for flashcards</div>
  }

  const currentQuestion = filteredQuestions[currentIndex] || filteredQuestions[0]
  const totalReviewed = progress.known.size + progress.needsPractice.size
  const progressPercent = questions.length > 0 ? (totalReviewed / questions.length) * 100 : 0
  const allReviewed = totalReviewed >= filteredQuestions.length && filteredQuestions.length > 0

  const handleFlip = () => setIsFlipped(!isFlipped)

  const showXpToast = (amount) => {
    if (xpTimerRef.current) clearTimeout(xpTimerRef.current)
    setXpToast(amount)
    xpTimerRef.current = setTimeout(() => setXpToast(null), 1500)
  }

  const handleMark = async (status) => {
    if (!currentQuestion) return
    const questionKey = getQuestionKey(currentQuestion, currentQuestion._origIdx)
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
          showXpToast(res.data.xpEarned)
        }
      } catch (err) {
        // Non-critical
      }
    }

    // Auto-advance
    setTimeout(() => {
      if (currentIndex < filteredQuestions.length - 1) {
        setCurrentIndex(currentIndex + 1)
        setIsFlipped(false)
      }
    }, 300)
  }

  const handleNext = () => {
    if (currentIndex < filteredQuestions.length - 1) {
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
      {/* Category pills */}
      <div className="category-pills">
        <button
          className={`category-pill ${categoryFilter === 'all' ? 'active' : ''}`}
          onClick={() => setCategoryFilter('all')}
        >
          All <span className="pill-count">{questions.length}</span>
          <div className="pill-progress" style={{ width: `${progressPercent}%` }} />
        </button>
        {categoryStats.map(cat => (
          <button
            key={cat.name}
            className={`category-pill ${categoryFilter === cat.name ? 'active' : ''}`}
            onClick={() => setCategoryFilter(cat.name)}
          >
            {cat.name} <span className="pill-count">{cat.total}</span>
            <div
              className={`pill-progress ${cat.percent === 100 ? 'complete' : ''}`}
              style={{ width: `${cat.percent}%` }}
            />
          </button>
        ))}
        {onGenerateMore && (
          <button
            className="category-pill generate-pill"
            onClick={onGenerateMore}
            disabled={generating}
          >
            {generating ? 'Generating...' : '+ More'}
          </button>
        )}
      </div>

      {/* Toolbar row */}
      <div className="fc-toolbar">
        <div className="fc-toolbar-left">
          <button
            className={`fc-tool-btn ${focusWeak ? 'active' : ''}`}
            onClick={() => setFocusWeak(!focusWeak)}
            title="Show only unreviewed or needs-practice cards"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {focusWeak ? 'Weak Only' : 'Focus Weak'}
          </button>
          <button
            className={`fc-tool-btn ${shuffled ? 'active' : ''}`}
            onClick={() => setShuffled(!shuffled)}
            title="Shuffle card order"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
              <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
              <line x1="4" y1="4" x2="9" y2="9"/>
            </svg>
            Shuffle
          </button>
        </div>
        <div className="fc-toolbar-right">
          <span className="fc-position">
            {filteredQuestions.length > 0 ? currentIndex + 1 : 0}/{filteredQuestions.length}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="fc-progress-bar">
        <div className="fc-progress-fill" style={{ width: `${progressPercent}%` }} />
      </div>

      {/* Completion summary */}
      {allReviewed && !focusWeak && filteredQuestions.length > 0 && (
        <div className="flashcards-complete-banner">
          <div className="complete-content">
            <strong>All cards reviewed!</strong>
            <span className="complete-stats">
              {progress.known.size} known &middot; {progress.needsPractice.size} need practice
            </span>
          </div>
          {progress.needsPractice.size > 0 && (
            <button
              className="review-weak-btn"
              onClick={() => { setFocusWeak(true); setCurrentIndex(0); setIsFlipped(false) }}
            >
              Review Weak Cards
            </button>
          )}
        </div>
      )}

      {filteredQuestions.length === 0 ? (
        <div className="flashcards-empty-filter">
          <p>No cards match your filters.</p>
          <button className="filter-btn" onClick={() => { setCategoryFilter('all'); setFocusWeak(false) }}>
            Clear Filters
          </button>
        </div>
      ) : (
        <>
          <div className="flashcard-wrapper">
            <div className={`flashcard ${isFlipped ? 'flipped' : ''}`} onClick={handleFlip}>
              <div className="flashcard-front">
                <div className="flashcard-content">
                  <div className="fc-card-header">
                    <h3>Question</h3>
                    {currentCategoryInfo && (
                      <span className="fc-card-meta">
                        {currentCategoryInfo.name}
                      </span>
                    )}
                  </div>
                  <p>{currentQuestion.question}</p>
                </div>
                <div className="flashcard-hint">Click to flip</div>
              </div>
              <div className="flashcard-back">
                <div className="flashcard-content">
                  <div className="fc-card-header">
                    <h3>Answer</h3>
                    {currentCategoryInfo && (
                      <span className="fc-card-meta">
                        {currentCategoryInfo.name}
                      </span>
                    )}
                  </div>
                  <div className="flashcard-answer">{currentQuestion.answer}</div>
                </div>
                <div className="flashcard-hint">Click to flip</div>
              </div>
            </div>
            {/* XP toast */}
            {xpToast && (
              <div className="xp-toast" key={Date.now()}>
                +{xpToast} XP
              </div>
            )}
          </div>

          <div className="flashcards-controls">
            <button className="flashcard-btn prev-btn" onClick={handlePrev} disabled={currentIndex === 0}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Prev
            </button>
            <div className="flashcard-mark-buttons">
              <button className="flashcard-btn mark-needs-practice" onClick={() => handleMark('needsPractice')}>
                Needs Practice
              </button>
              <button className="flashcard-btn mark-known" onClick={() => handleMark('known')}>
                Got It
              </button>
            </div>
            <button className="flashcard-btn next-btn" onClick={handleNext} disabled={currentIndex === filteredQuestions.length - 1}>
              Next
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>
        </>
      )}

      {/* Stats footer */}
      <div className="flashcards-stats">
        <div className="stat-item">
          <span className="stat-dot known-dot" />
          <span className="stat-label">Known</span>
          <span className="stat-value known">{progress.known.size}</span>
        </div>
        <div className="stat-item">
          <span className="stat-dot practice-dot" />
          <span className="stat-label">Practice</span>
          <span className="stat-value practice">{progress.needsPractice.size}</span>
        </div>
        <div className="stat-item">
          <span className="stat-dot unreviewed-dot" />
          <span className="stat-label">Unreviewed</span>
          <span className="stat-value">{Math.max(0, questions.length - totalReviewed)}</span>
        </div>
      </div>
    </div>
  )
}

export default Flashcards
