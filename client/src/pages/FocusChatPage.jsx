import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../utils/api'
import FocusChat from '../components/FocusChat'
import './FocusChatPage.css'

// Lightweight seniority detection from role title
const SENIORITY_RANK = { intern: 0, junior: 1, mid: 2, senior: 3, staff: 4, lead: 5 }

function detectSeniority(roleTitle) {
  const t = (roleTitle || '').toLowerCase()
  if (/\b(intern|internship)\b/.test(t)) return 'intern'
  if (/\b(junior|jr\.?|entry[- ]level|associate)\b/.test(t)) return 'junior'
  if (/\b(staff|principal)\b/.test(t)) return 'staff'
  if (/\b(lead|architect|head|director|vp|vice president)\b/.test(t)) return 'lead'
  if (/\b(senior|sr\.?)\b/.test(t)) return 'senior'
  return 'mid'
}

// Derive seniority from multiple role titles — take the highest level
function deriveSeniorityFromRoles(roleTitles) {
  if (!roleTitles || roleTitles.length === 0) return 'mid'
  let highest = 'mid'
  for (const title of roleTitles) {
    const level = detectSeniority(title)
    if ((SENIORITY_RANK[level] || 0) > (SENIORITY_RANK[highest] || 0)) {
      highest = level
    }
  }
  return highest
}

function FocusChatPage({ user }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const skill = searchParams.get('skill') || ''
  const [seniorityLevel, setSeniorityLevel] = useState(searchParams.get('seniority') || 'mid')
  const [questionGoal, setQuestionGoal] = useState(parseInt(searchParams.get('goal')) || 10)
  const [topics, setTopics] = useState([])
  const [jobs, setJobs] = useState([])
  const [allJobTopics, setAllJobTopics] = useState([])
  const [expandedJob, setExpandedJob] = useState(null)
  const [jobTopics, setJobTopics] = useState({})
  const [loadingJobTopics, setLoadingJobTopics] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (skill) return
    const fetchData = async () => {
      try {
        const [topicsRes, jobsRes, allJobTopicsRes] = await Promise.all([
          api.topics.getUserScores().catch(() => ({ data: [] })),
          api.user.getAnalyses().catch(() => ({ data: [] })),
          api.topics.getAllTopics().catch(() => ({ data: [] })),
        ])
        const jobsList = jobsRes.data || []
        setTopics(topicsRes.data || [])
        setJobs(jobsList)
        setAllJobTopics(allJobTopicsRes.data || [])
        // Auto-detect seniority from most recent job
        if (jobsList.length > 0 && !searchParams.get('seniority')) {
          const detected = detectSeniority(jobsList[0].role_title)
          setSeniorityLevel(detected)
        }
      } catch (err) {
        console.error('Error loading chat topics:', err)
      } finally {
        setLoading(false)
      }
    }
    if (user) fetchData()
    else setLoading(false)
  }, [user, skill])

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

  if (skill) {
    const goalParam = parseInt(searchParams.get('goal')) || 10
    const seniorityParam = searchParams.get('seniority') || seniorityLevel
    return <FocusChat skill={skill} user={user} seniorityLevel={seniorityParam} onSeniorityChange={setSeniorityLevel} questionGoal={goalParam} />
  }

  const startChat = (topicName, jobRoleTitle) => {
    let level = seniorityLevel
    if (jobRoleTitle) {
      level = detectSeniority(jobRoleTitle)
      setSeniorityLevel(level)
    } else {
      const topicData = allJobTopics.find(t =>
        (t.topic_name || t.name) === topicName
      )
      if (topicData?.role_titles?.length > 0) {
        level = deriveSeniorityFromRoles(topicData.role_titles)
        setSeniorityLevel(level)
      }
    }
    setSearchParams({ skill: topicName, seniority: level, goal: questionGoal.toString() })
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
            <div className="focus-chat-config">
              <div className="focus-chat-config-item">
                <label>Level</label>
                <select value={seniorityLevel} onChange={(e) => setSeniorityLevel(e.target.value)}>
                  <option value="intern">Intern</option>
                  <option value="junior">Junior</option>
                  <option value="mid">Mid</option>
                  <option value="senior">Senior</option>
                  <option value="staff">Staff</option>
                  <option value="lead">Lead+</option>
                </select>
              </div>
              <div className="focus-chat-config-item">
                <label>Goal</label>
                <select value={questionGoal} onChange={(e) => setQuestionGoal(Number(e.target.value))}>
                  <option value={5}>5 Qs</option>
                  <option value={10}>10 Qs</option>
                  <option value={15}>15 Qs</option>
                  <option value={20}>20 Qs</option>
                </select>
              </div>
            </div>

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
                                    onClick={() => startChat(t.topic_name || t.name, job.role_title)}
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
