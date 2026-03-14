import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../utils/api'
import FocusChat from '../components/FocusChat'
import './FocusChatPage.css'

// Lightweight seniority detection from role title
const SENIORITY_RANK = { intern: 0, junior: 1, mid: 2, senior: 3, staff: 4, lead: 5 }

const SENIORITY_OPTIONS = [
  { value: 'intern', label: 'Intern' },
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid' },
  { value: 'senior', label: 'Senior' },
  { value: 'staff', label: 'Staff' },
  { value: 'lead', label: 'Lead+' },
]

function detectSeniority(roleTitle) {
  const t = (roleTitle || '').toLowerCase()
  if (/\b(intern|internship)\b/.test(t)) return 'intern'
  if (/\b(junior|jr\.?|entry[- ]level|associate)\b/.test(t)) return 'junior'
  if (/\b(staff|principal)\b/.test(t)) return 'staff'
  if (/\b(lead|architect|head|director|vp|vice president)\b/.test(t)) return 'lead'
  if (/\b(senior|sr\.?)\b/.test(t)) return 'senior'
  return 'mid'
}

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

function timeAgo(dateStr) {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function getSavedSession(topicName) {
  try {
    const raw = sessionStorage.getItem(`focus_chat_${topicName}`)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (data.messages?.length > 0) return data
    return null
  } catch { return null }
}

function FocusChatPage({ user }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const skill = searchParams.get('skill') || ''
  const [seniorityLevel, setSeniorityLevel] = useState(searchParams.get('seniority') || 'mid')
  const [questionGoal, setQuestionGoal] = useState(parseInt(searchParams.get('goal')) || 10)
  const [topics, setTopics] = useState([])
  const [jobs, setJobs] = useState([])
  const [allJobTopics, setAllJobTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('practice')
  const [chatSessions, setChatSessions] = useState([])
  const [historyLimit, setHistoryLimit] = useState(15)
  const [jobFilter, setJobFilter] = useState('all')

  useEffect(() => {
    if (skill) return
    const fetchData = async () => {
      try {
        const [topicsRes, jobsRes, allJobTopicsRes, historyRes] = await Promise.all([
          api.topics.getUserScores().catch(() => ({ data: [] })),
          api.user.getAnalyses().catch(() => ({ data: [] })),
          api.topics.getAllTopics().catch(() => ({ data: [] })),
          api.practice.getHistory({ limit: 100 }).catch(() => ({ data: { sessions: [] } })),
        ])
        const jobsList = jobsRes.data || []
        setTopics(topicsRes.data || [])
        setJobs(jobsList)
        setAllJobTopics(allJobTopicsRes.data || [])
        const sessions = (historyRes.data?.sessions || []).filter(s => s.mode === 'focus')
        setChatSessions(sessions)
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

  // Chat count per topic
  const chatCountByTopic = useMemo(() => {
    const map = {}
    for (const s of chatSessions) {
      const key = (s.skill || '').toLowerCase().trim()
      if (!key) continue
      map[key] = (map[key] || 0) + 1
    }
    return map
  }, [chatSessions])

  // Merged & filtered topics
  const filteredTopics = useMemo(() => {
    const scoreMap = new Map(topics.map(t => [t.topic_name, t]))
    let merged = allJobTopics.map(topic => {
      const name = topic.topic_name || topic.name
      const scored = scoreMap.get(name)
      return {
        ...topic,
        topicName: name,
        score: scored?.score ?? scored?.average_score ?? null,
        attempts: scored ? Number(scored.attempts) : 0,
        last_practiced_at: scored?.last_practiced_at || topic.last_practiced_at,
      }
    })

    if (jobFilter !== 'all') {
      merged = merged.filter(t => (t.job_hashes || []).includes(jobFilter))
    }

    return merged.sort((a, b) => {
      const aActive = getSavedSession(a.topicName) ? 1 : 0
      const bActive = getSavedSession(b.topicName) ? 1 : 0
      if (bActive !== aActive) return bActive - aActive
      const aP = a.last_practiced_at ? new Date(a.last_practiced_at).getTime() : 0
      const bP = b.last_practiced_at ? new Date(b.last_practiced_at).getTime() : 0
      if (bP !== aP) return bP - aP
      return (a.topicName || '').localeCompare(b.topicName || '')
    })
  }, [allJobTopics, topics, jobFilter])

  if (skill) {
    const goalParam = parseInt(searchParams.get('goal')) || 10
    const seniorityParam = searchParams.get('seniority') || seniorityLevel
    return <FocusChat skill={skill} user={user} seniorityLevel={seniorityParam} onSeniorityChange={setSeniorityLevel} questionGoal={goalParam} />
  }

  const startChat = (topicName) => {
    const topicData = allJobTopics.find(t => (t.topic_name || t.name) === topicName)
    let level = seniorityLevel
    if (topicData?.role_titles?.length > 0) {
      level = deriveSeniorityFromRoles(topicData.role_titles)
      setSeniorityLevel(level)
    }
    setSearchParams({ skill: topicName, seniority: level, goal: questionGoal.toString() })
  }

  return (
    <div className="focus-chat-page">
      <div className="focus-chat-picker">
        <div className="focus-page-header">
          <div className="focus-page-header-left">
            <h1>Chat Practice</h1>
            <p>Learn with an AI tutor — no scoring, just understanding.</p>
          </div>
          {activeTab === 'practice' && (
            <div className="focus-page-header-config">
              <select value={questionGoal} onChange={e => setQuestionGoal(Number(e.target.value))}>
                <option value={5}>5 Qs</option>
                <option value={10}>10 Qs</option>
                <option value={15}>15 Qs</option>
                <option value={20}>20 Qs</option>
              </select>
            </div>
          )}
        </div>

        <div className="focus-page-tabs">
          <button className={`focus-page-tab ${activeTab === 'practice' ? 'active' : ''}`} onClick={() => setActiveTab('practice')}>
            Practice
          </button>
          <button className={`focus-page-tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
            Chat History
          </button>
        </div>

        {activeTab === 'practice' && (loading ? (
          <div className="focus-chat-loading">Loading topics...</div>
        ) : (
          <>
            <div className="focus-page-filters">
              <span className="focus-page-filter-label">Seniority</span>
              {SENIORITY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`focus-page-filter${seniorityLevel === opt.value ? ' active' : ''}`}
                  onClick={() => setSeniorityLevel(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
              {jobs.length > 0 && (
                <select
                  className="focus-job-filter-select"
                  value={jobFilter}
                  onChange={e => setJobFilter(e.target.value)}
                >
                  <option value="all">All Jobs</option>
                  {jobs.map(job => (
                    <option key={job.job_description_hash} value={job.job_description_hash}>
                      {job.role_title || 'Unknown Role'}{job.company_name ? ` — ${job.company_name}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {allJobTopics.length > 0 ? (
              <div className="focus-topic-list">
                <div className="focus-topic-list-header">
                  <span className="focus-col-name">Topic</span>
                  <span className="focus-col-chats">Chats</span>
                  <span className="focus-col-status">Status</span>
                  <span className="focus-col-action" />
                </div>
                {filteredTopics.map((topic, idx) => {
                  const session = getSavedSession(topic.topicName)
                  const chats = chatCountByTopic[(topic.topicName || '').toLowerCase().trim()] || 0
                  const lastPracticed = timeAgo(topic.last_practiced_at)

                  return (
                    <div
                      key={topic.id || idx}
                      className={`focus-topic-list-row ${session ? 'has-session' : ''}`}
                      onClick={() => startChat(topic.topicName)}
                    >
                      <div className="focus-col-name">
                        <div className="focus-row-name-line">
                          {session && <span className="focus-active-dot" />}
                          <span className="focus-row-name">{topic.topicName}</span>
                        </div>
                        {session && (
                          <span className="focus-session-info">
                            {session.exchangeCount} {session.exchangeCount === 1 ? 'message' : 'messages'}
                          </span>
                        )}
                      </div>
                      <div className="focus-col-chats">
                        <span className="focus-row-value">{chats > 0 ? chats : '--'}</span>
                      </div>
                      <div className="focus-col-status">
                        {session ? (
                          <span className="focus-row-active-tag">In progress</span>
                        ) : lastPracticed ? (
                          <span className="focus-row-last has-date">{lastPracticed}</span>
                        ) : (
                          <span className="focus-row-last">Not started</span>
                        )}
                      </div>
                      <div className="focus-col-action">
                        <button
                          className={`focus-practice-btn ${session ? 'resume' : chats > 0 ? 'continue' : ''}`}
                          onClick={(e) => { e.stopPropagation(); startChat(topic.topicName) }}
                        >
                          {session ? 'Resume' : chats > 0 ? 'Continue' : 'Start'}
                        </button>
                      </div>
                    </div>
                  )
                })}
                <form
                  className="focus-topic-list-row focus-custom-row"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const val = e.target.elements.customTopic.value.trim()
                    if (val) startChat(val)
                  }}
                >
                  <div className="focus-col-name">
                    <input
                      name="customTopic"
                      type="text"
                      className="focus-custom-input"
                      placeholder="Type any topic — e.g. System Design, React Hooks..."
                    />
                  </div>
                  <div className="focus-col-chats" />
                  <div className="focus-col-status" />
                  <div className="focus-col-action">
                    <button type="submit" className="focus-practice-btn">Start</button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="focus-chat-empty">
                <p>No topics yet. Analyze a job post from the dashboard to get started.</p>
              </div>
            )}

            {filteredTopics.length === 0 && allJobTopics.length > 0 && (
              <div className="focus-no-results">No topics match this filter.</div>
            )}
          </>
        ))}

        {activeTab === 'history' && (
          chatSessions.length === 0 ? (
            <div className="focus-tab-empty">
              <p>No chat sessions yet. Start practicing to see your history here.</p>
            </div>
          ) : (
            <>
              <div className="focus-history-list">
                <div className="focus-history-header">
                  <span>Date</span>
                  <span>Topic</span>
                  <span>Messages</span>
                  <span>Duration</span>
                </div>
                {chatSessions.slice(0, historyLimit).map((session, i) => {
                  const duration = session.started_at && session.ended_at
                    ? Math.round((new Date(session.ended_at) - new Date(session.started_at)) / 60000)
                    : null
                  return (
                    <div key={session.id || i} className="focus-history-row">
                      <span className="focus-history-date">{timeAgo(session.ended_at)}</span>
                      <span className="focus-history-topic">{session.skill || 'Chat'}</span>
                      <span className="focus-history-answers">{session.questions_attempted || '—'}</span>
                      <span className="focus-history-duration">{duration != null ? `${duration}m` : '—'}</span>
                    </div>
                  )
                })}
              </div>
              {historyLimit < chatSessions.length && (
                <button className="focus-load-more" onClick={() => setHistoryLimit(prev => prev + 15)}>
                  Load more ({chatSessions.length - historyLimit} remaining)
                </button>
              )}
            </>
          )
        )}
      </div>
    </div>
  )
}

export default FocusChatPage
