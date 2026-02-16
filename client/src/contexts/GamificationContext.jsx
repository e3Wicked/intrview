import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { api } from '../utils/api'
import { getLevelForXp } from '../utils/gamification'

const GamificationContext = createContext(null)

export function useGamification() {
  return useContext(GamificationContext)
}

export function GamificationProvider({ children, user }) {
  const [gamStats, setGamStats] = useState(null)
  const [pendingToasts, setPendingToasts] = useState([])
  const [loading, setLoading] = useState(false)

  const refreshStats = useCallback(async () => {
    if (!user) {
      setGamStats(null)
      return
    }
    try {
      setLoading(true)
      const res = await api.gamification.getStats()
      setGamStats(res.data)
    } catch (err) {
      console.error('Failed to load gamification stats:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  // Load on mount and when user changes
  useEffect(() => {
    if (user) {
      refreshStats()
    } else {
      setGamStats(null)
    }
  }, [user, refreshStats])

  // Optimistic XP update + queue toasts for achievements/level-ups
  const addXp = useCallback((xpEarned, newAchievements, levelUp, levelTitle) => {
    setGamStats(prev => {
      if (!prev) return prev
      const newTotalXp = prev.totalXp + xpEarned
      const levelInfo = getLevelForXp(newTotalXp)
      return {
        ...prev,
        totalXp: newTotalXp,
        level: levelInfo.level,
        levelTitle: levelInfo.title,
        xpIntoLevel: levelInfo.xpIntoLevel,
        xpNeededForNext: levelInfo.xpNeededForNext,
        xpProgress: levelInfo.progressPercent,
        todayStats: {
          ...prev.todayStats,
          questionsAnswered: (prev.todayStats?.questionsAnswered || 0) + 1,
          xpEarned: (prev.todayStats?.xpEarned || 0) + xpEarned,
        },
      }
    })

    // Queue achievement toasts
    if (newAchievements && newAchievements.length > 0) {
      setPendingToasts(prev => [
        ...prev,
        ...newAchievements.map(ach => ({
          id: `ach-${ach.id}-${Date.now()}`,
          type: 'achievement',
          achievement: ach,
        })),
      ])
    }

    // Queue level-up toast
    if (levelUp) {
      setPendingToasts(prev => [
        ...prev,
        {
          id: `levelup-${Date.now()}`,
          type: 'level_up',
          levelTitle: levelTitle,
        },
      ])
    }
  }, [])

  const dismissToast = useCallback((toastId) => {
    setPendingToasts(prev => prev.filter(t => t.id !== toastId))
  }, [])

  const showToast = useCallback((type, data) => {
    setPendingToasts(prev => [
      ...prev,
      { id: `${type}-${Date.now()}`, type, ...data },
    ])
  }, [])

  return (
    <GamificationContext.Provider value={{
      gamStats,
      loading,
      pendingToasts,
      refreshStats,
      addXp,
      dismissToast,
      showToast,
    }}>
      {children}
    </GamificationContext.Provider>
  )
}
