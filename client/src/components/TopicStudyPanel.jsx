import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import TopicChat from './TopicChat'
import Flashcards from './Flashcards'
import QuizMode from './QuizMode'
import './TopicStudyPanel.css'

function TopicStudyPanel({
  topic,
  mode,
  allQuestions,
  studyTopics,
  jobDescription,
  companyName,
  roleTitle,
  techStack,
  jobDescriptionHash,
  onBack,
}) {
  const [sessionId, setSessionId] = useState(null)
  const [activeMode, setActiveMode] = useState(mode)

  useEffect(() => {
    let sid = null
    const start = async () => {
      try {
        const res = await api.practice.startSession({
          jobDescriptionHash,
          mode: activeMode,
          companyName,
          roleTitle,
        })
        sid = res.data.sessionId
        setSessionId(sid)
      } catch (e) {
        // session tracking is best-effort
      }
    }
    start()
    return () => {
      if (sid) api.practice.endSession({ sessionId: sid }).catch(() => {})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const topicQuestions = allQuestions.filter(q => q.category === topic)
  const questionsForQuiz = topicQuestions.length > 0 ? topicQuestions : allQuestions

  const modes = [
    { key: 'chat', label: '💬 Chat' },
    { key: 'cards', label: '🃏 Cards' },
    { key: 'quiz', label: '📝 Quiz' },
  ]

  return (
    <div className="topic-study-panel">
      <div className="tsp-header">
        <button className="tsp-back-btn" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to Prep
        </button>

        <div className="tsp-topic-name">{topic || 'All Topics'}</div>

        <div className="tsp-mode-switcher">
          {modes.map(({ key, label }) => (
            <button
              key={key}
              className={`tsp-mode-btn ${activeMode === key ? 'active' : ''}`}
              onClick={() => setActiveMode(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="tsp-content">
        {activeMode === 'chat' && (
          <TopicChat
            initialTopic={topic}
            jobDescription={jobDescription}
            companyName={companyName}
            roleTitle={roleTitle}
            techStack={techStack}
            jobDescriptionHash={jobDescriptionHash}
            sessionId={sessionId}
            studyTopics={studyTopics}
          />
        )}
        {activeMode === 'cards' && (
          <Flashcards
            questions={allQuestions}
            initialCategory={topic}
            jobDescriptionHash={jobDescriptionHash}
            sessionId={sessionId}
          />
        )}
        {activeMode === 'quiz' && (
          <QuizMode
            questions={questionsForQuiz}
            jobDescription={jobDescription}
            jobDescriptionHash={jobDescriptionHash}
            sessionId={sessionId}
          />
        )}
      </div>
    </div>
  )
}

export default TopicStudyPanel
