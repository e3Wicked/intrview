import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import Flashcards from './Flashcards'
import QuizMode from './QuizMode'
import VoicePractice from './VoicePractice'
import XPBar from './XPBar'
import StreakCounter from './StreakCounter'
import SessionSummary from './SessionSummary'
import { useGamification } from '../contexts/GamificationContext'
import { api } from '../utils/api'
import './Practice.css'

function Practice({ questions, jobDescription, companyName, roleTitle, techStack, jobDescriptionHash }) {
  const [practiceMode, setPracticeMode] = useState('flashcards')
  const [voiceMode, setVoiceMode] = useState(false)
  const [allQuestions, setAllQuestions] = useState(questions || [])
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [sessionStats, setSessionStats] = useState({ questionsAnswered: 0, totalXp: 0 })
  const [showSummary, setShowSummary] = useState(false)
  const [summaryData, setSummaryData] = useState(null)
  const [smartMode, setSmartMode] = useState(false)
  const [lastXpGain, setLastXpGain] = useState(0)
  const sessionIdRef = useRef(null)
  const { refreshStats, addXp } = useGamification() || {}

  // Start session on mount
  useEffect(() => {
    if (!jobDescriptionHash) return
    const startSession = async () => {
      try {
        const res = await api.practice.startSession({
          jobDescriptionHash,
          mode: practiceMode,
        })
        setSessionId(res.data.sessionId)
        sessionIdRef.current = res.data.sessionId
      } catch (err) {
        console.error('Failed to start practice session:', err)
      }
    }
    startSession()

    // End session on unmount
    return () => {
      if (sessionIdRef.current) {
        api.practice.endSession({ sessionId: sessionIdRef.current }).catch(() => {})
      }
    }
  }, [jobDescriptionHash])

  // Smart practice ordering
  useEffect(() => {
    if (!smartMode || !jobDescriptionHash || !allQuestions.length) return
    const reorder = async () => {
      try {
        const res = await api.practice.getSmartOrder({
          jobDescriptionHash,
          questions: allQuestions,
        })
        if (res.data.questions) {
          setAllQuestions(res.data.questions)
        }
      } catch (err) {
        console.error('Smart ordering failed:', err)
      }
    }
    reorder()
  }, [smartMode, jobDescriptionHash])

  const handleXpGained = useCallback((xpData) => {
    if (!xpData) return
    setLastXpGain(xpData.xpEarned || 0)
    setSessionStats(prev => ({
      questionsAnswered: prev.questionsAnswered + 1,
      totalXp: prev.totalXp + (xpData.xpEarned || 0),
    }))
    if (addXp) {
      addXp(xpData.xpEarned || 0, xpData.newAchievements, xpData.levelUp, xpData.levelTitle)
    }
  }, [addXp])

  const handleEndSession = async () => {
    if (!sessionId) {
      setShowSummary(false)
      return
    }
    try {
      const res = await api.practice.endSession({ sessionId })
      setSummaryData({
        questionsAttempted: res.data.session?.questions_attempted || sessionStats.questionsAnswered,
        questionsCorrect: res.data.session?.questions_correct || 0,
        averageScore: res.data.session?.average_score || 0,
        totalXpEarned: res.data.xpEarned || sessionStats.totalXp,
        achievements: res.data.achievements || [],
        streakUpdate: res.data.streakUpdate,
      })
      setShowSummary(true)
      sessionIdRef.current = null
      if (refreshStats) refreshStats()
    } catch (err) {
      console.error('Failed to end session:', err)
      setShowSummary(false)
    }
  }

  const handleContinuePractice = async () => {
    setShowSummary(false)
    setSummaryData(null)
    setSessionStats({ questionsAnswered: 0, totalXp: 0 })
    try {
      const res = await api.practice.startSession({
        jobDescriptionHash,
        mode: practiceMode,
      })
      setSessionId(res.data.sessionId)
      sessionIdRef.current = res.data.sessionId
    } catch (err) {
      console.error('Failed to restart session:', err)
    }
  }

  const handleGenerateMore = async () => {
    if (!jobDescriptionHash) {
      setGenerateError('Job description hash is required')
      return
    }
    setGenerating(true)
    setGenerateError(null)
    try {
      const response = await axios.post('/api/questions/generate-more', {
        jobDescriptionHash,
        existingQuestions: allQuestions,
        companyName,
        roleTitle,
        techStack
      })
      if (response.data.success && response.data.questions) {
        setAllQuestions(prev => [...prev, ...response.data.questions])
      } else {
        setGenerateError('Failed to generate questions')
      }
    } catch (error) {
      setGenerateError(error.response?.data?.error || 'Failed to generate questions')
    } finally {
      setGenerating(false)
    }
  }

  if (!allQuestions || allQuestions.length === 0) {
    return <div className="practice-empty">No questions available for practice</div>
  }

  return (
    <div className="practice-container">
      {showSummary && summaryData && (
        <SessionSummary
          session={summaryData}
          onContinue={handleContinuePractice}
          onEnd={() => setShowSummary(false)}
        />
      )}

      <div className="practice-header">
        <div>
          <h2>Practice</h2>
          <p className="practice-question-count">
            {allQuestions.length} questions available
            {sessionStats.questionsAnswered > 0 && (
              <span> &middot; {sessionStats.questionsAnswered} answered this session</span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <StreakCounter compact />
          <XPBar xpGained={lastXpGain} compact />
          <button
            className="generate-more-btn"
            onClick={handleGenerateMore}
            disabled={generating || !jobDescriptionHash}
            title="Generate 10-15 more unique questions"
          >
            {generating ? 'Generating...' : '+ More Questions'}
          </button>
        </div>
      </div>

      {generateError && (
        <div className="practice-error" style={{ marginBottom: '16px', padding: '12px', background: '#3a1a1a', border: '1px solid #5a2a2a', borderRadius: '6px', color: '#ff6b6b' }}>
          {generateError}
        </div>
      )}

      <div className="practice-mode-toggle">
        <button
          className={`mode-btn ${practiceMode === 'flashcards' ? 'active' : ''}`}
          onClick={() => setPracticeMode('flashcards')}
        >
          Flashcards
        </button>
        <button
          className={`mode-btn ${practiceMode === 'quiz' ? 'active' : ''}`}
          onClick={() => setPracticeMode('quiz')}
        >
          Quiz
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            className={`mode-btn ${smartMode ? 'active' : ''}`}
            onClick={() => setSmartMode(!smartMode)}
            title="Prioritize questions you scored low on"
            style={{ fontSize: '12px', padding: '8px 14px' }}
          >
            {smartMode ? '🧠 Smart' : '🧠 Smart'}
          </button>
          <button
            className="mode-btn"
            onClick={handleEndSession}
            style={{ fontSize: '12px', padding: '8px 14px', borderColor: '#f59e0b33', color: '#f59e0b' }}
          >
            End Session
          </button>
        </div>
      </div>

      <div className="practice-content">
        {practiceMode === 'flashcards' && (
          <Flashcards
            questions={allQuestions}
            jobDescriptionHash={jobDescriptionHash}
            sessionId={sessionId}
            onXpGained={handleXpGained}
          />
        )}
        {practiceMode === 'quiz' && (
          <div className="quiz-with-voice">
            <div className="voice-toggle-header">
              <button
                className={`voice-toggle-btn ${voiceMode ? 'active' : ''}`}
                onClick={() => setVoiceMode(!voiceMode)}
                title={voiceMode ? "Switch to text input" : "Switch to voice practice"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
                <span>{voiceMode ? 'Voice' : 'Text'}</span>
              </button>
            </div>
            {voiceMode ? (
              <VoicePractice
                questions={allQuestions}
                jobDescription={jobDescription}
                jobDescriptionHash={jobDescriptionHash}
                sessionId={sessionId}
                onXpGained={handleXpGained}
              />
            ) : (
              <QuizMode
                questions={allQuestions}
                jobDescription={jobDescription}
                jobDescriptionHash={jobDescriptionHash}
                sessionId={sessionId}
                onXpGained={handleXpGained}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default Practice
