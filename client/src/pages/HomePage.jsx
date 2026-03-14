import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import './HomePage.css'

function HomePage({ user, onLoginSuccess }) {
  const navigate = useNavigate()
  const [showAuth, setShowAuth] = useState(false)
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState('email')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [billingInterval, setBillingInterval] = useState('monthly')
  const featuresRef = useRef(null)
  const pricingRef = useRef(null)
  const googleBtnContainerRef = useRef(null)

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  useEffect(() => {
    const sessionToken = localStorage.getItem('session_token')
    if (sessionToken && !user) navigate('/dashboard', { replace: true })
  }, [])

  // Scroll-triggered fade-in animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible')
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    )
    document.querySelectorAll('.animate-on-scroll').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  const scrollTo = (ref) => {
    ref.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Initialize Google Sign-In when auth modal opens and render a hidden button.
  // Clicking our custom button forwards to the hidden Google button, which is
  // more reliable than prompt() (One Tap is silently suppressed in many contexts).
  useEffect(() => {
    if (!showAuth) return

    const initGoogle = () => {
      if (!window.google?.accounts?.id || !googleBtnContainerRef.current) return

      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          try {
            setLoading(true)
            setError(null)
            const res = await axios.post('/api/auth/google', { credential })
            if (res.data.success && onLoginSuccess) {
              onLoginSuccess(res.data.user, res.data.sessionToken)
            }
          } catch (err) {
            const detail = err.response?.data?.detail
            setError((err.response?.data?.error || 'Google sign-in failed') + (detail ? `: ${detail}` : ''))
          } finally {
            setLoading(false)
          }
        },
      })

      window.google.accounts.id.renderButton(googleBtnContainerRef.current, {
        type: 'standard',
        size: 'large',
        width: 1,
      })
    }

    if (window.google?.accounts?.id) {
      initGoogle()
    } else {
      // Script loads async — poll until ready
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval)
          initGoogle()
        }
      }, 100)
      return () => clearInterval(interval)
    }
  }, [showAuth])

  const handleGoogleSignIn = () => {
    const btn = googleBtnContainerRef.current?.querySelector('[role=button]')
    if (btn) {
      btn.click()
    } else {
      setError('Google Sign-In is not available. Please try the email option.')
    }
  }

  const handleRequestCode = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const response = await axios.post('/api/auth/request-code', {
        email,
        name: mode === 'signup' ? name : undefined,
        isSignIn: mode === 'signin'
      })
      if (response.data.success) {
        setStep('code')
        if (response.data.code) console.log('Verification code (dev):', response.data.code)
      }
    } catch (err) {
      if (err.response?.status === 404) setError('No account found. Please sign up first.')
      else setError(err.response?.data?.error || 'Failed to send code')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const response = await axios.post('/api/auth/verify-code', { email, code, name })
      if (response.data.success && onLoginSuccess) {
        onLoginSuccess(response.data.user, response.data.sessionToken)
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  if (user) return null

  const features = [
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
      ),
      title: 'Smart Job Analysis',
      desc: 'Paste any job URL and get an AI-generated study plan with key topics, company intel, and interview strategies.'
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      ),
      title: 'AI Study Chat',
      desc: 'Practice with a focused AI coach that adapts to your skill level and drills you on weak spots.'
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
      ),
      title: 'Topic Drills',
      desc: 'MCQ quizzes and open-ended questions on specific topics extracted from your target roles.'
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>
        </svg>
      ),
      title: 'Progress Tracking',
      desc: 'See your mastery across topics and track improvement as you prepare.'
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      ),
      title: 'Company Intel',
      desc: 'Get funding data, culture insights, and recent news about your target companies automatically.'
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        </svg>
      ),
      title: 'Mock Interviews',
      desc: 'Voice-based practice sessions with AI evaluation of your answers. Coming soon.'
    },
  ]

  const pricing = {
    starter: { monthly: 9, quarterly: 24, annual: 86 },
    pro:     { monthly: 19, quarterly: 51, annual: 182 },
    elite:   { monthly: 39, quarterly: 105, annual: 374 },
  }

  const periodLabel = billingInterval === 'monthly' ? '/mo' : billingInterval === 'quarterly' ? '/qtr' : '/yr'

  const plans = [
    { name: 'Free', price: '$0', period: '/forever', features: ['3 job analyses', '15 training credits', 'Study plans & flashcards', 'Progress tracking'], cta: 'Get Started' },
    { name: 'Starter', price: `$${pricing.starter[billingInterval]}`, period: periodLabel, features: ['10 job analyses/mo', '150 training credits/mo', 'AI study chat', 'Company research', 'Smart practice ordering'], cta: 'Start Free Trial' },
    { name: 'Pro', price: `$${pricing.pro[billingInterval]}`, period: periodLabel, features: ['30 job analyses/mo', '400 training credits/mo', 'Voice practice & mock interviews', 'Priority AI speed', 'PDF export'], cta: 'Start Free Trial', popular: true },
    { name: 'Elite', price: `$${pricing.elite[billingInterval]}`, period: periodLabel, features: ['Unlimited job analyses', '800 training credits/mo', 'Everything in Pro', 'Advanced company insights', 'Early access to new features'], cta: 'Start Free Trial' },
  ]

  return (
    <div className="landing">
      {/* Sticky Nav */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-nav-left">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="6" fill="#fff"/>
              <path d="M16 8L20 14H22L18 20H14L10 14H12L16 8Z" fill="#0a0a0a"/>
              <path d="M16 24L12 18H10L14 12H18L22 18H20L16 24Z" fill="#0a0a0a"/>
            </svg>
            <span className="landing-nav-brand">intrview.io</span>
          </div>
          <div className="landing-nav-links">
            <button onClick={() => scrollTo(featuresRef)}>Features</button>
            <button onClick={() => scrollTo(pricingRef)}>Pricing</button>
          </div>
          <div className="landing-nav-right">
            <button className="landing-nav-signin" onClick={() => { setMode('signin'); setShowAuth(true) }}>Sign In</button>
            <button className="landing-nav-signup" onClick={() => { setMode('signup'); setShowAuth(true) }}>Get Started</button>
          </div>
        </div>
      </nav>

      {/* Hero - Full viewport */}
      <section className="landing-hero">
        <div className="landing-hero-bg" />
        <div className="landing-hero-inner">
          <span className="landing-hero-badge animate-on-scroll">
            <span className="landing-hero-badge-dot" />
            AI-Powered Interview Prep
          </span>
          <h1 className="landing-hero-title animate-on-scroll">
            Prepare smarter.<br />
            <span className="landing-hero-accent">Land offers.</span>
          </h1>
          <p className="landing-hero-subtitle animate-on-scroll">
            Analyze any job posting, get a personalized study plan, practice with AI coaching, and track your progress — all in one place.
          </p>
          <div className="landing-hero-actions animate-on-scroll">
            <button className="landing-hero-cta" onClick={() => { setMode('signup'); setShowAuth(true) }}>
              Start Preparing Free
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
            <button className="landing-hero-secondary" onClick={() => scrollTo(featuresRef)}>
              See How It Works
            </button>
          </div>
          <div className="landing-hero-proof animate-on-scroll">
            <div className="landing-hero-avatars">
              <span className="landing-avatar">A</span>
              <span className="landing-avatar">M</span>
              <span className="landing-avatar">S</span>
              <span className="landing-avatar">J</span>
            </div>
            <span className="landing-hero-proof-text">Join hundreds of candidates preparing smarter</span>
          </div>
        </div>
        <div className="landing-hero-scroll-indicator">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </section>

      {/* How it works */}
      <section className="landing-how-it-works">
        <div className="landing-section-inner">
          <span className="landing-section-label animate-on-scroll">How It Works</span>
          <h2 className="landing-section-title animate-on-scroll">Three steps to interview ready</h2>
          <div className="landing-steps">
            <div className="landing-step animate-on-scroll">
              <div className="landing-step-number">1</div>
              <h3>Paste a Job URL</h3>
              <p>Drop in any job posting link. Our AI analyzes the role, company, and requirements in seconds.</p>
            </div>
            <div className="landing-step-connector" />
            <div className="landing-step animate-on-scroll">
              <div className="landing-step-number">2</div>
              <h3>Get Your Study Plan</h3>
              <p>Receive a personalized roadmap with topics to master, company intel, and interview strategies.</p>
            </div>
            <div className="landing-step-connector" />
            <div className="landing-step animate-on-scroll">
              <div className="landing-step-number">3</div>
              <h3>Practice & Track</h3>
              <p>Drill with AI coaching, take quizzes, and watch your mastery grow across every topic.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="landing-features" ref={featuresRef}>
        <div className="landing-section-inner">
          <span className="landing-section-label animate-on-scroll">Features</span>
          <h2 className="landing-section-title animate-on-scroll">Everything you need to ace any interview</h2>
          <p className="landing-section-subtitle animate-on-scroll">From job analysis to mock interviews, we cover every step of your preparation.</p>
          <div className="landing-features-grid">
            {features.map((f, i) => (
              <div key={i} className="landing-feature-card animate-on-scroll" style={{ transitionDelay: `${i * 60}ms` }}>
                <div className="landing-feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="landing-pricing" ref={pricingRef}>
        <div className="landing-section-inner">
          <span className="landing-section-label animate-on-scroll">Pricing</span>
          <h2 className="landing-section-title animate-on-scroll">Simple, transparent pricing</h2>
          <p className="landing-section-subtitle animate-on-scroll">Start free. Upgrade when you're ready to go all in.</p>
          <div className="landing-billing-toggle animate-on-scroll">
            {['monthly', 'quarterly', 'annual'].map((opt) => (
              <button
                key={opt}
                className={`landing-billing-option ${billingInterval === opt ? 'active' : ''}`}
                onClick={() => setBillingInterval(opt)}
              >
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
                {opt === 'quarterly' && <span className="landing-billing-save">-10%</span>}
                {opt === 'annual' && <span className="landing-billing-save">-20%</span>}
              </button>
            ))}
          </div>
          <div className="landing-pricing-grid">
            {plans.map((plan, i) => (
              <div key={i} className={`landing-pricing-card animate-on-scroll ${plan.popular ? 'popular' : ''}`} style={{ transitionDelay: `${i * 80}ms` }}>
                {plan.popular && <span className="landing-pricing-badge">Most Popular</span>}
                <h3>{plan.name}</h3>
                <div className="landing-pricing-price">
                  <span className="landing-pricing-amount">{plan.price}</span>
                  <span className="landing-pricing-period">{plan.period}</span>
                </div>
                <ul>
                  {plan.features.map((f, j) => (
                    <li key={j}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  className={`landing-pricing-cta ${plan.popular ? 'primary' : ''}`}
                  onClick={() => { setMode('signup'); setShowAuth(true) }}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="landing-final-cta">
        <div className="landing-section-inner">
          <h2 className="animate-on-scroll">Ready to land your next role?</h2>
          <p className="animate-on-scroll">Join candidates who are preparing smarter, not harder.</p>
          <button className="landing-final-cta-btn animate-on-scroll" onClick={() => { setMode('signup'); setShowAuth(true) }}>
            Get Started Free
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <p>intrview.io &mdash; AI-powered interview preparation</p>
      </footer>

      {/* Auth Modal Overlay */}
      {showAuth && (
        <div className="landing-auth-overlay" onClick={() => !loading && setShowAuth(false)}>
          <div className="landing-auth-modal" onClick={(e) => e.stopPropagation()}>
            {!loading && (
              <button className="landing-auth-close" onClick={() => setShowAuth(false)}>&times;</button>
            )}
            <div className="landing-auth-logo">
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="6" fill="#1a1a1a"/>
                <path d="M16 8L20 14H22L18 20H14L10 14H12L16 8Z" fill="#ffffff"/>
                <path d="M16 24L12 18H10L14 12H18L22 18H20L16 24Z" fill="#ffffff"/>
              </svg>
              <span>intrview.io</span>
            </div>
            <h2>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h2>

            {/* Hidden container for Google's rendered button — click is forwarded from our custom button */}
            <div ref={googleBtnContainerRef} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', height: 0, overflow: 'hidden' }} aria-hidden="true" />

            <button
              className="homepage-google-btn"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            <div className="homepage-divider"><span>or</span></div>

            {error && <div className="homepage-error">{error}</div>}

            {step === 'email' ? (
              <form onSubmit={handleRequestCode} className="homepage-form">
                <div className="homepage-input-group">
                  <label>Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required disabled={loading} autoFocus />
                </div>
                {mode === 'signup' && (
                  <div className="homepage-input-group">
                    <label>Name <span className="homepage-optional">(optional)</span></label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" disabled={loading} />
                  </div>
                )}
                <button type="submit" className="homepage-submit-btn" disabled={loading || !email}>
                  {loading ? 'Sending...' : 'Send verification code'}
                </button>
                <p className="homepage-toggle">
                  {mode === 'signin' ? (
                    <>Don't have an account? <button type="button" onClick={() => setMode('signup')}>Sign up</button></>
                  ) : (
                    <>Already have an account? <button type="button" onClick={() => setMode('signin')}>Sign in</button></>
                  )}
                </p>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="homepage-form">
                <p className="homepage-code-sent">Code sent to <strong>{email}</strong></p>
                <div className="homepage-input-group">
                  <label>Verification Code</label>
                  <input type="text" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" required disabled={loading} maxLength={6} autoFocus className="homepage-code-input" />
                </div>
                <button type="submit" className="homepage-submit-btn" disabled={loading || code.length !== 6}>
                  {loading ? 'Verifying...' : 'Verify'}
                </button>
                <button type="button" className="homepage-back-link" onClick={() => { setStep('email'); setCode(''); setError(null) }}>
                  Change email or resend
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default HomePage
