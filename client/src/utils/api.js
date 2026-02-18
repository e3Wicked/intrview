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
    flashcardXp: (data) => axios.post('/api/practice/flashcard-xp', data),
  },
  chat: {
    practice: (data) => axios.post('/api/chat/practice', data),
  },
  gamification: {
    getStats: () => axios.get('/api/gamification/stats'),
    getSkillStats: () => axios.get('/api/gamification/skill-stats'),
    checkAchievements: (context) => axios.post('/api/gamification/check-achievements', { context }),
  },
}
