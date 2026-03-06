import { useState, useRef, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom'
import axios from 'axios'
import './App.css'
import HomePage from './pages/HomePage'
import SignInPrompt from './components/SignInPrompt'
import Sidebar from './components/Sidebar'
import { GamificationProvider } from './contexts/GamificationContext'
import { api } from './utils/api'

// Lazy-loaded pages (not needed on initial homepage load)
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const JobAnalysisPage = lazy(() => import('./pages/JobAnalysisPage'))
const CompanyPage = lazy(() => import('./pages/CompanyPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const TrainingPage = lazy(() => import('./pages/TrainingPage'))
const ProgressPage = lazy(() => import('./pages/ProgressPage'))
const FocusChatPage = lazy(() => import('./pages/FocusChatPage'))
const MockInterviewPage = lazy(() => import('./pages/MockInterviewPage'))
const DrillsPage = lazy(() => import('./pages/DrillsPage'))
const LoadingOverlay = lazy(() => import('./components/LoadingOverlay'))
const LoginModal = lazy(() => import('./components/LoginModal'))
const UpgradeModal = lazy(() => import('./components/UpgradeModal'))
const AchievementToast = lazy(() => import('./components/AchievementToast'))

// Layout component with header and sidebars
function Layout({ children, user, setUser, showLoginModal, setShowLoginModal, loginModalMode, setLoginModalMode, showUpgradeModal, setShowUpgradeModal, handleSelectPlan, handleLoginSuccess, handleLogout }) {
  const navigate = useNavigate()
  const location = useLocation()

  const isHomepage = location.pathname === '/'
  const showSidebar = user && !isHomepage

  return (
    <div className={`app ${showSidebar ? 'app-with-sidebar' : ''}`}>
      {showSidebar ? (
        /* Authenticated layout: sidebar + content, no header */
        <div className="app-body">
          <Sidebar user={user} onLogout={handleLogout} onUpgrade={() => setShowUpgradeModal(true)} isAdmin={user?.isAdmin} />
          <main className="main-content">
            {children}
          </main>
        </div>
      ) : (
        /* Unauthenticated / homepage layout: just content */
        <div className="app-body app-body-no-sidebar">
          <main className="main-content main-content-full">
            {children}
          </main>
        </div>
      )}

      <Suspense fallback={null}>
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
      </Suspense>
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

  // Redirect unauthenticated users away from protected routes back to homepage
  useEffect(() => {
    if (!user && location.pathname !== '/' && !localStorage.getItem('session_token')) {
      navigate('/', { replace: true })
    }
  }, [user, location.pathname, navigate])


  useEffect(() => {
    if (!user) {
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
      // If on a protected route, redirect to homepage
      if (location.pathname !== '/') {
        navigate('/', { replace: true })
      }
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
          timestamp: new Date().toISOString()
        }

        const updatedHistory = [jdEntry, ...jdHistory.filter(jd => jd.url !== url)].slice(0, 10)
        setJdHistory(updatedHistory)
        setSelectedJdId(jdEntry.id)

        // Store result in sessionStorage (temporary, for immediate navigation)
        sessionStorage.setItem(`job_analysis_${jdEntry.id}`, JSON.stringify(analysisResult))

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
      sessionStorage.setItem(`job_analysis_${exampleData.id}`, JSON.stringify(exampleData.result))
      if (user && exampleData.result.companyInfo) {
        const jdEntry = {
          id: exampleData.id,
          url: exampleData.url,
          companyName: exampleData.companyName,
          roleTitle: exampleData.roleTitle,
          timestamp: exampleData.timestamp
        }
        const updatedHistory = [jdEntry, ...jdHistory.filter(jd => jd.id !== exampleData.id)].slice(0, 10)
        setJdHistory(updatedHistory)
        setSelectedJdId(jdEntry.id)
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
    // Progress is now tracked server-side per job via /api/progress/:hash
    // This is a fallback for the UI prop — actual progress shown in MissionDashboard
    return 0
  }

  const companyName = result?.companyInfo?.name || result?.company?.name
  const progress = calculateProgress()

  // Load result from URL params
  useEffect(() => {
    if (location.pathname.startsWith('/job/')) {
      const jobId = location.pathname.split('/job/')[1]
      if (jobId) {
        // Try sessionStorage first (temporary cache from recent navigation)
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

        // Fetch from server (primary source of truth)
        const token = localStorage.getItem('session_token')
        if (token && /^\d+$/.test(jobId)) {
          axios.get(`/api/user/analysis/${jobId}`)
            .then(res => {
              const analysisResult = res.data
              setResult(analysisResult)
              setUrl(analysisResult.url || '')
              setSelectedJdId(jobId)
              sessionStorage.setItem(`job_analysis_${jobId}`, JSON.stringify(analysisResult))
            })
            .catch(err => {
              console.error('Error loading analysis from server:', err)
            })
        }
      }
    }
  }, [location.pathname])

  // Clean up legacy localStorage keys from previous versions
  useEffect(() => {
    if (!user) return
    localStorage.removeItem('jd_history')
    localStorage.removeItem('selected_jd_id')
    localStorage.removeItem('interviewPrepperProgress')
    localStorage.removeItem('interviewPrepperConfidence')
    localStorage.removeItem('progressMigrated')
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
      <Suspense fallback={null}>
        <AchievementToast />
        <LoadingOverlay loading={loading} />
      </Suspense>

      <Suspense fallback={<div style={{ padding: '64px', textAlign: 'center', color: '#6b6b6b' }}>Loading...</div>}>
      <Routes>
        <Route
          path="/"
          element={
            <HomePage
              user={user}
              onLoginSuccess={handleLoginSuccess}
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
                setResult={setResult}
                setSelectedJdId={setSelectedJdId}
                jdHistory={jdHistory}
                setJdHistory={setJdHistory}
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
          path="/admin"
          element={
            user?.isAdmin
              ? <AdminPage user={user} />
              : <div style={{ padding: '64px', textAlign: 'center', color: '#6b6b6b' }}>Access denied.</div>
          }
        />
        <Route
          path="/focus-chat"
          element={
            user ? (
              <FocusChatPage user={user} />
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
        {/* /job/:jobId/train removed — training now via sidebar (Chat, Drills) */}
        <Route
          path="/job/:jobId"
          element={
            result ? (
              <JobAnalysisPage
                result={result}
                companyName={companyName}
                progress={progress}
                user={user}
              />
            ) : (
              <div style={{ padding: '64px', textAlign: 'center', color: '#6b6b6b' }}>
                <p>Loading job analysis...</p>
              </div>
            )
          }
        />
        <Route
          path="/progress"
          element={
            user ? (
              <ProgressPage user={user} />
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
          path="/study/mock-interview"
          element={
            user ? (
              <MockInterviewPage />
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
          path="/study/drills"
          element={
            user ? (
              <DrillsPage user={user} />
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
      </Routes>
      </Suspense>
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
