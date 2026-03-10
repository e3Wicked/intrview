import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../utils/api'
import FocusChat from '../components/FocusChat'
import './FocusChatPage.css'

const DIFFICULTY_META = {
  junior: { label: 'Junior', desc: 'Fundamentals & basics' },
  mid: { label: 'Mid', desc: 'Practical patterns' },
  senior: { label: 'Senior', desc: 'Architecture & edge cases' },
  staff: { label: 'Staff', desc: 'Cross-system design' },
}

function FocusChatPage({ user }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const skill = searchParams.get('skill') || ''
  const paramDifficulty = searchParams.get('difficulty') || null
  const [topics, setTopics] = useState([])
  const [jobs, setJobs] = useState([])
  const [allJobTopics, setAllJobTopics] = useState([])
  const [expandedJob, setExpandedJob] = useState(null)
  const [jobTopics, setJobTopics] = useState({})
  const [loadingJobTopics, setLoadingJobTopics] = useState({})
  const [loading, setLoading] = useState(true)
  const [difficulty, setDifficulty] = useState(paramDifficulty)
  const [inferredDifficulty, setInferredDifficulty] = useState(null)

  useEffect(() => {
    if (skill) return
    const fetchData = async () => {
      try {
        const [topicsRes, jobsRes, allJobTopicsRes] = await Promise.all([
          api.topics.getUserScores().catch(() => ({ data: [] })),
          api.user.getAnalyses().catch(() => ({ data: [] })),
          api.topics.getAllTopics().catch(() => ({ data: [] })),
        ])
        setTopics(topicsRes.data || [])
        setJobs(jobsRes.data || [])
        setAllJobTopics(allJobTopicsRes.data || [])
      } catch (err) {
        console.error('Error loading chat topics:', err)
      } finally {
        setLoading(false)
      }
    }
    if (user) fetchData()
    else setLoading(false)
  }, [user, skill])

  // When skill is set but no difficulty, check stored or fetch inferred
  useEffect(() => {
    if (!skill || difficulty) return
    // Check if topic has stored difficulty from allJobTopics
    const topicData = allJobTopics.find(t => (t.topic_name || t.name) === skill)
    if (topicData?.difficulty) {
      setDifficulty(topicData.difficulty)
      return
    }
    // Fetch inferred difficulty
    api.topics.getInferredDifficulty()
      .then(res => setInferredDifficulty(res.data?.difficulty || 'mid'))
      .catch(() => setInferredDifficulty('mid'))
  }, [skill, difficulty, allJobTopics])

  const toggleJob = async (hash) => {
    if (expandedJob === hash) {
      setExpandedJob(null)
      return
    }
    setExpandedJob(hash)

    if (jobTopics[hash]) return

    setLoadingJobTopics(prev => ({ ...prev, [hash]: true }))
    try {
      const res = await api.topics.getForJob(hash)
      setJobTopics(prev => ({ ...prev, [hash]: res.data || [] }))
    } catch {
      setJobTopics(prev => ({ ...prev, [hash]: [] }))
    } finally {
      setLoadingJobTopics(prev => ({ ...prev, [hash]: false }))
    }
  }

  const handleDifficultySelect = (level) => {
    const topicData = allJobTopics.find(t => (t.topic_name || t.name) === skill)
    if (topicData?.id) {
      api.topics.setTopicDifficulty({ topicId: topicData.id, difficulty: level }).catch(() => {})
    }
    setDifficulty(level)
  }

  const handleDifficultyChange = () => {
    try { sessionStorage.removeItem(`focus_chat_${skill}`) } catch {}
    setDifficulty(null)
  }

  if (skill) {
    if (difficulty) {
      return <FocusChat skill={skill} user={user} difficulty={difficulty} onDifficultyChange={handleDifficultyChange} />
    }
    // Show difficulty picker
    return (
      <div className="focus-chat-page">
        <div className="difficulty-picker-container">
          <h2>Choose Your Level</h2>
          <p>Training for: <strong>{skill}</strong></p>
          <div className="difficulty-pills">
            {Object.entries(DIFFICULTY_META).map(([level, meta]) => (
              <button
                key={level}
                className={`difficulty-pill${inferredDifficulty === level ? ' inferred' : ''}`}
                onClick={() => handleDifficultySelect(level)}
              >
                <span className="difficulty-pill-label">{meta.label}</span>
                <span className="difficulty-pill-desc">{meta.desc}</span>
              </button>
            ))}
          </div>
          {inferredDifficulty && (
            <p className="difficulty-inferred-note">
              Suggested: <strong>{DIFFICULTY_META[inferredDifficulty]?.label}</strong> based on your recent role
            </p>
          )}
        </div>
      </div>
    )
  }

  const startChat = (topicName) => {
    setDifficulty(null)
    setSearchParams({ skill: topicName })
  }

  return (
    <div className="focus-chat-page">
      <div className="focus-chat-picker">
        <h1>Study Chat</h1>
        <p>Pick a topic to start a focused study conversation.</p>

        {loading ? (
          <div className="focus-chat-loading">Loading topics...</div>
        ) : (
          <>
            {topics.length > 0 && (
              <div className="focus-chat-section">
                <h2>Your Topics</h2>
                <div className="focus-chat-topics-grid">
                  {topics.map(topic => (
                    <button
                      key={topic.id}
                      className="focus-chat-topic-card"
                      onClick={() => startChat(topic.topic_name)}
                    >
                      <span className="focus-chat-topic-name">{topic.topic_name}</span>
                      {topic.category && (
                        <span className="focus-chat-topic-category">{topic.category}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {allJobTopics.length > 0 && (
              <div className="focus-chat-section">
                <h2>All Job Topics</h2>
                <div className="focus-chat-pills">
                  {allJobTopics.map((topic, idx) => (
                    <button
                      key={topic.id || idx}
                      className="focus-chat-pill"
                      onClick={() => startChat(topic.topic_name || topic.name)}
                    >
                      {topic.topic_name || topic.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {jobs.length > 0 && (
              <div className="focus-chat-section">
                <h2>From Your Jobs</h2>
                <div className="focus-chat-jobs-list">
                  {jobs.map(job => {
                    const hash = job.job_description_hash
                    const isExpanded = expandedJob === hash
                    const topicsForJob = jobTopics[hash]
                    const isLoadingTopics = loadingJobTopics[hash]

                    return (
                      <div key={hash} className={`focus-chat-job-accordion${isExpanded ? ' expanded' : ''}`}>
                        <button
                          className="focus-chat-job-header"
                          onClick={() => toggleJob(hash)}
                        >
                          <div className="focus-chat-job-info">
                            <span className="focus-chat-topic-name">{job.role_title || 'Unknown Role'}</span>
                            <span className="focus-chat-topic-category">{job.company_name || 'Unknown Company'}</span>
                          </div>
                          <svg
                            className={`focus-chat-chevron${isExpanded ? ' rotated' : ''}`}
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>

                        {isExpanded && (
                          <div className="focus-chat-job-topics">
                            {isLoadingTopics ? (
                              <span className="focus-chat-job-topics-loading">Loading topics...</span>
                            ) : topicsForJob && topicsForJob.length > 0 ? (
                              <div className="focus-chat-pills">
                                {topicsForJob.map((t, idx) => (
                                  <button
                                    key={t.id || idx}
                                    className="focus-chat-pill"
                                    onClick={() => startChat(t.topic_name || t.name)}
                                  >
                                    {t.topic_name || t.name}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <span className="focus-chat-job-topics-empty">No topics extracted for this job.</span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {topics.length === 0 && jobs.length === 0 && allJobTopics.length === 0 && (
              <div className="focus-chat-empty">
                <p>No topics yet. Analyze a job post from the dashboard to get started.</p>
              </div>
            )}

            <div className="focus-chat-section">
              <h2>Or type any topic</h2>
              <form
                className="focus-chat-custom"
                onSubmit={(e) => {
                  e.preventDefault()
                  const val = e.target.elements.customTopic.value.trim()
                  if (val) startChat(val)
                }}
              >
                <input
                  name="customTopic"
                  type="text"
                  placeholder="e.g. System Design, React Hooks, SQL Joins..."
                  autoFocus
                />
                <button type="submit">Start Chat</button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default FocusChatPage
