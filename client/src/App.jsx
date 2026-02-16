import { useState, useRef, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom'
import axios from 'axios'
import './App.css'
import HomePage from './pages/HomePage'
import DashboardPage from './pages/DashboardPage'
import JobAnalysisPage from './pages/JobAnalysisPage'
import CompanyPage from './pages/CompanyPage'
import RotatingAds from './components/RotatingAds'
import LoadingOverlay from './components/LoadingOverlay'
import LoginModal from './components/LoginModal'
import CreditBar from './components/CreditBar'
import UpgradeModal from './components/UpgradeModal'
import SignInPrompt from './components/SignInPrompt'
import { preloadedExamples } from './data/preloadedExamples'
import { GamificationProvider } from './contexts/GamificationContext'
import AchievementToast from './components/AchievementToast'
import { api } from './utils/api'

// Layout component with header and sidebars
function Layout({ children, user, setUser, showLoginModal, setShowLoginModal, loginModalMode, setLoginModalMode, showUpgradeModal, setShowUpgradeModal, handleSelectPlan, handleLoginSuccess, handleLogout }) {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            <button 
              className="header-logo"
              onClick={() => navigate(user ? '/dashboard' : '/')}
              title={user ? "Go to Dashboard" : "Go to Home"}
            >
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" rx="6" fill="#fff"/>
                <path d="M16 8L20 14H22L18 20H14L10 14H12L16 8Z" fill="#0a0a0a"/>
                <path d="M16 24L12 18H10L14 12H18L22 18H20L16 24Z" fill="#0a0a0a"/>
              </svg>
              <span className="header-logo-text">Interview Prepper</span>
            </button>
          </div>
          
          <div className="header-right">
            {user ? (
              <>
                <CreditBar user={user} onUpgrade={() => setShowUpgradeModal(true)} />
                <div className="header-user-info">
                  <span className="header-user-email">{user.email}</span>
                </div>
                <button className="header-btn primary" onClick={() => handleSelectPlan('starter')}>
                  Pricing
                </button>
                <button 
                  className="header-btn"
                  onClick={handleLogout}
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <button className="header-btn" onClick={() => {
                  setLoginModalMode('signin')
                  setShowLoginModal(true)
                }}>
                  Sign In
                </button>
                <button className="header-btn" onClick={() => {
                  setLoginModalMode('signup')
                  setShowLoginModal(true)
                }}>
                  Sign Up
                </button>
                <button className="header-btn primary" onClick={() => handleSelectPlan('starter')}>
                  Pricing
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      

        {/* Mobile Ad Bars - Top and Bottom */}
        <div className="mobile-ad-bar mobile-ad-bar-top">
          <RotatingAds position="top" />
        </div>

        <div className="app-body">
          {/* Left Sidebar - Desktop Only */}
          <aside className="sidebar">
            <div className="sidebar-content">
              <div className="sidebar-logo-header">
                <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="32" height="32" rx="6" fill="#fff"/>
                  <path d="M16 8L20 14H22L18 20H14L10 14H12L16 8Z" fill="#0a0a0a"/>
                  <path d="M16 24L12 18H10L14 12H18L22 18H20L16 24Z" fill="#0a0a0a"/>
                </svg>
              </div>
              
              {location.pathname.startsWith('/job/') && (
                <button 
                  className="back-to-home-btn"
                  onClick={() => navigate(user ? '/dashboard' : '/')}
                  title={user ? "Back to Dashboard" : "Back to Home"}
                >
                  <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  <span>Back</span>
                </button>
              )}
              
 
              <RotatingAds position="left" />
            </div>
          </aside>

          <main className="main-content">
            {children}
          </main>

          {/* Right Sidebar - Desktop Only */}
          <aside className="right-sidebar">
            <div className="right-sidebar-content">
              <RotatingAds position="right" />
            </div>
          </aside>
        </div>

        {/* Mobile Ad Bar - Bottom */}
        <div className="mobile-ad-bar mobile-ad-bar-bottom">
          <RotatingAds position="bottom" />
        </div>

      <LoginModal 
        isOpen={showLoginModal}
        mode={loginModalMode}
        onClose={() => setShowLoginModal(false)}
        onSuccess={handleLoginSuccess}
      />
      
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        user={user}
        onSelectPlan={handleSelectPlan}
        onLoginRequired={() => setShowLoginModal(true)}
      />
    </div>
  )
}

// Main App component with routing
function App() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [activeArea, setActiveArea] = useState('job')
  const [user, setUser] = useState(null)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [loginModalMode, setLoginModalMode] = useState('signin')
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [jdHistory, setJdHistory] = useState([])
  const [selectedJdId, setSelectedJdId] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    checkAuth()
  }, [])

  // Redirect signed-in users from homepage to dashboard
  useEffect(() => {
    if (user && location.pathname === '/') {
      navigate('/dashboard', { replace: true })
    }
  }, [user, location.pathname, navigate])

  // Also redirect immediately after checkAuth completes
  useEffect(() => {
    const redirectIfLoggedIn = async () => {
      const sessionToken = localStorage.getItem('session_token')
      if (sessionToken && !user) {
        // Check if user is logged in but state not loaded yet
        try {
          const response = await axios.get('/api/auth/me', {
            headers: { Authorization: `Bearer ${sessionToken}` }
          })
          if (response.data.user && location.pathname === '/') {
            setUser(response.data.user)
            navigate('/dashboard', { replace: true })
          }
        } catch (e) {
          // Not logged in
        }
      }
    }
    redirectIfLoggedIn()
  }, [location.pathname, navigate])


  useEffect(() => {
    if (user) {
      const savedHistory = localStorage.getItem('jd_history')
      if (savedHistory) {
        try {
          const history = JSON.parse(savedHistory)
          setJdHistory(history)
        } catch (e) {
          console.error('Error loading JD history:', e)
        }
      }
    } else {
      setJdHistory([])
      setSelectedJdId(null)
      setResult(null)
    }
  }, [user])

  const checkAuth = async () => {
    try {
      const sessionToken = localStorage.getItem('session_token')
      if (sessionToken) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${sessionToken}`
      }
      const response = await axios.get('/api/auth/me')
      if (response.data.user) {
        setUser(response.data.user)
        // Redirect to dashboard if on homepage
        if (location.pathname === '/') {
          navigate('/dashboard', { replace: true })
        }
      }
    } catch (error) {
      console.log('Not authenticated')
      localStorage.removeItem('session_token')
      delete axios.defaults.headers.common['Authorization']
    }
  }

  const handleLoginSuccess = (userData, sessionToken) => {
    setUser(userData)
    localStorage.setItem('session_token', sessionToken)
    axios.defaults.headers.common['Authorization'] = `Bearer ${sessionToken}`
    navigate('/dashboard')
  }

  const handleLogout = async () => {
    try {
      setUser(null)
      setResult(null)
      setJdHistory([])
      setSelectedJdId(null)
      localStorage.removeItem('session_token')
      localStorage.removeItem('jd_history')
      localStorage.removeItem('selected_jd_id')
      delete axios.defaults.headers.common['Authorization']
      await axios.post('/api/auth/logout').catch(err => {
        console.error('Logout API error (non-critical):', err)
      })
      navigate('/')
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  const handleSelectPlan = (planKey) => {
    // Show pricing to everyone - UpgradeModal handles auth check when they actually subscribe
    setShowUpgradeModal(true)
  }

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) {
      e.preventDefault()
    }
    if (!url || url.trim() === '') {
      setError('Please enter a job post URL')
      return
    }
    
    if (!user) {
      setShowLoginModal(true)
      setError('Please sign up or log in to generate a study plan')
      return
    }
    
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem('session_token')}` }
      const response = await axios.post('/api/analyze', { url }, { headers })
      const analysisResult = response.data
      setResult(analysisResult)
      
      // Save to JD history and navigate
      if (analysisResult && analysisResult.companyInfo) {
        const jdEntry = {
          id: Date.now().toString(),
          url: url,
          companyName: analysisResult.companyInfo?.name || 'Unknown Company',
          roleTitle: analysisResult.companyInfo?.roleTitle || analysisResult.roleTitle || 'Unknown Role',
          result: analysisResult,
          timestamp: new Date().toISOString()
        }
        
        const updatedHistory = [jdEntry, ...jdHistory.filter(jd => jd.url !== url)].slice(0, 10)
        setJdHistory(updatedHistory)
        setSelectedJdId(jdEntry.id)
        localStorage.setItem('jd_history', JSON.stringify(updatedHistory))
        localStorage.setItem('selected_jd_id', jdEntry.id)
        
        // Navigate to job analysis page
        navigate(`/job/${jdEntry.id}`)
      }
    } catch (err) {
      if (err.response?.status === 401) {
        setShowLoginModal(true)
      } else if (err.response?.status === 402) {
        setShowUpgradeModal(true)
      } else {
        setError(err.response?.data?.error || 'An error occurred. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleLoadExample = async (exampleData) => {
    if (exampleData && exampleData.result) {
      setResult(exampleData.result)
      setUrl(exampleData.url)
      // Save to sessionStorage so the job page can load it even without auth
      sessionStorage.setItem(`job_analysis_${exampleData.id}`, JSON.stringify(exampleData.result))
      if (user && exampleData.result.companyInfo) {
        const jdEntry = {
          id: exampleData.id,
          url: exampleData.url,
          companyName: exampleData.companyName,
          roleTitle: exampleData.roleTitle,
          result: exampleData.result,
          timestamp: exampleData.timestamp
        }
        const updatedHistory = [jdEntry, ...jdHistory.filter(jd => jd.id !== exampleData.id)].slice(0, 10)
        setJdHistory(updatedHistory)
        setSelectedJdId(jdEntry.id)
        localStorage.setItem('jd_history', JSON.stringify(updatedHistory))
        localStorage.setItem('selected_jd_id', jdEntry.id)
      }
      navigate(`/job/${exampleData.id}`)
    }
  }

  const handleSelectAnalysis = (analysisResult) => {
    setResult(analysisResult)
    setUrl(analysisResult.url || '')
    navigate(`/job/${analysisResult.id || Date.now()}`)
  }

  const calculateProgress = () => {
    if (!result?.studyPlan?.studyPlan?.topics) return null
    
    const saved = localStorage.getItem('interviewPrepperProgress')
    if (!saved) return 0
    
    try {
      const progress = JSON.parse(saved)
      const topicsStudied = new Set(progress.topicsStudied || [])
      const totalTopics = result.studyPlan.studyPlan.topics.length
      
      if (totalTopics === 0) return 0
      
      const currentTopicNames = new Set(result.studyPlan.studyPlan.topics.map(t => t.topic))
      const validStudied = Array.from(topicsStudied).filter(topic => currentTopicNames.has(topic))
      
      const progressPercent = (validStudied.length / totalTopics) * 100
      return Math.min(100, Math.round(progressPercent))
    } catch (error) {
      console.error('Error calculating progress:', error)
      return 0
    }
  }

  const companyName = result?.companyInfo?.name || result?.company?.name
  const progress = calculateProgress()

  // Load result from URL params
  useEffect(() => {
    if (location.pathname.startsWith('/job/')) {
      const jobId = location.pathname.split('/job/')[1]
      if (jobId) {
        // First try to get from sessionStorage (most recent)
        const sessionData = sessionStorage.getItem(`job_analysis_${jobId}`)
        if (sessionData) {
          try {
            const analysisResult = JSON.parse(sessionData)
            setResult(analysisResult)
            setUrl(analysisResult.url || '')
            setSelectedJdId(jobId)
            return
          } catch (e) {
            console.error('Error parsing sessionStorage data:', e)
          }
        }
        
        // Fallback to jdHistory
        if (jdHistory.length > 0) {
          const job = jdHistory.find(jd => jd.id === jobId)
          if (job && job.result) {
            setResult(job.result)
            setUrl(job.url)
            setSelectedJdId(job.id)
            return
          }
        }
        
        // If not found, try loading from localStorage
        const savedHistory = localStorage.getItem('jd_history')
        if (savedHistory) {
          try {
            const history = JSON.parse(savedHistory)
            const job = history.find(jd => jd.id === jobId)
            if (job && job.result) {
              setResult(job.result)
              setUrl(job.url)
              setSelectedJdId(job.id)
              setJdHistory(history)
            }
          } catch (e) {
            console.error('Error loading from localStorage:', e)
          }
        }
      }
    }
  }, [location.pathname, jdHistory])

  // Migrate localStorage progress to server on first login
  useEffect(() => {
    if (!user) return
    const hasMigrated = localStorage.getItem('progressMigrated')
    const hasOldProgress = localStorage.getItem('interviewPrepperProgress')
    const hasOldConfidence = localStorage.getItem('interviewPrepperConfidence')
    if (hasMigrated || (!hasOldProgress && !hasOldConfidence)) return

    const migrate = async () => {
      try {
        const savedHistory = localStorage.getItem('jd_history')
        const history = savedHistory ? JSON.parse(savedHistory) : []
        const recentJob = history[0]
        const hash = recentJob?.result?.jobDescriptionHash
        if (hash) {
          await api.progress.migrate({
            localStorage: {
              interviewPrepperProgress: hasOldProgress || '{}',
              interviewPrepperConfidence: hasOldConfidence || '{}',
            },
            jobDescriptionHash: hash,
          })
        }
        localStorage.setItem('progressMigrated', 'true')
      } catch (err) {
        console.error('Progress migration error (non-critical):', err)
      }
    }
    migrate()
  }, [user])

  return (
    <GamificationProvider user={user}>
    <Layout
      user={user}
      setUser={setUser}
      showLoginModal={showLoginModal}
      setShowLoginModal={setShowLoginModal}
      loginModalMode={loginModalMode}
      setLoginModalMode={setLoginModalMode}
      showUpgradeModal={showUpgradeModal}
      setShowUpgradeModal={setShowUpgradeModal}
      handleSelectPlan={handleSelectPlan}
      handleLoginSuccess={handleLoginSuccess}
      handleLogout={handleLogout}
    >
      <AchievementToast />
      <LoadingOverlay loading={loading} />

      <Routes>
        <Route 
          path="/" 
          element={
            <HomePage 
              url={url}
              setUrl={setUrl}
              handleSubmit={handleSubmit}
              loading={loading}
              user={user}
              onSelectPlan={handleSelectPlan}
              onLoadExample={handleLoadExample}
            />
          } 
        />
        <Route 
          path="/dashboard" 
          element={
            user ? (
              <DashboardPage 
                user={user}
                setUser={setUser}
                url={url}
                setUrl={setUrl}
                handleSubmit={handleSubmit}
                loading={loading}
                onSelectPlan={handleSelectPlan}
              />
            ) : (
              <SignInPrompt 
                onSignIn={() => {
                  setLoginModalMode('signin')
                  setShowLoginModal(true)
                }}
                onSignUp={() => {
                  setLoginModalMode('signup')
                  setShowLoginModal(true)
                }}
              />
            )
          } 
        />
        <Route 
          path="/company/:companyName" 
          element={
            <CompanyPage user={user} />
          } 
        />
        <Route 
          path="/job/:jobId" 
          element={
            result ? (
              <JobAnalysisPage 
                result={result}
                companyName={companyName}
                progress={progress}
              />
            ) : (
              <div style={{ padding: '64px', textAlign: 'center', color: '#888' }}>
                <p>Loading job analysis...</p>
              </div>
            )
          } 
        />
      </Routes>
    </Layout>
    </GamificationProvider>
  )
}

// Wrapper to provide router context
function AppWithRouter() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  )
}

export default AppWithRouter
