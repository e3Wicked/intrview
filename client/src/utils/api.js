import axios from 'axios'

export const api = {
  progress: {
    get: (jobHash) => axios.get(`/api/progress/${jobHash}`),
    save: (data) => axios.post('/api/progress/save', data),
    getOverall: () => axios.get('/api/progress/overall'),
    migrate: (data) => axios.post('/api/progress/migrate', data),
  },
  practice: {
    startSession: (data) => axios.post('/api/practice/start-session', data),
    endSession: (data) => axios.post('/api/practice/end-session', data),
    getHistory: (params) => axios.get('/api/practice/history', { params }),
    getSmartOrder: (data) => axios.post('/api/practice/smart-order', data),
    flashcardAttempt: (data) => axios.post('/api/practice/flashcard-attempt', data),
  },
  chat: {
    practice: (data) => axios.post('/api/chat/practice', data),
  },
  topics: {
    getUserScores: () => axios.get('/api/user/topic-scores'),
    getShared: () => axios.get('/api/topics/shared'),
    getForJob: (hash) => axios.get(`/api/topics/job/${hash}`),
    getAllTopics: () => axios.get('/api/user/all-topics'),
    backfill: () => axios.post('/api/topics/backfill'),
  },
  drills: {
    saveDrillSession: (data) => axios.post('/api/drills/sessions', data),
    getAllSessions: () => axios.get('/api/drills/sessions'),
    getTopicSessions: (topicId) => axios.get(`/api/drills/sessions/${topicId}`),
  },
  activity: {
    getSummary: () => axios.get('/api/user/activity-summary'),
  },
  user: {
    getAnalyses: (limit = 50, offset = 0) => axios.get(`/api/user/analyses?limit=${limit}&offset=${offset}`),
    deleteAllAnalyses: () => axios.delete('/api/user/analyses'),
    updateProfile: (data) => axios.put('/api/user/profile', data),
  },
}
