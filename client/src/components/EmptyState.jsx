import { useState, useEffect } from 'react'
import './EmptyState.css'
import { preloadedExamples } from '../data/preloadedExamples'
import RotatingAds from './RotatingAds'

// Logo component with multiple fallback options (same as RotatingAds)
function LogoWithFallbacks({ domain, name, logoUrl }) {
  const [currentSrc, setCurrentSrc] = useState(null)
  const [showPlaceholder, setShowPlaceholder] = useState(false)
  
  // Build fallback chain: try multiple logo services
  const getLogoUrls = () => {
    const urls = []
    
    // 1. Use provided logoUrl if it exists and isn't clearbit
    if (logoUrl && !logoUrl.includes('clearbit.com')) {
      urls.push(logoUrl)
    }
    
    // 2. Google Favicon API (high quality, works well)
    if (domain) {
      urls.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`)
    }
    
    // 3. DuckDuckGo icons
    if (domain) {
      urls.push(`https://icons.duckduckgo.com/ip3/${domain}.ico`)
    }
    
    // 4. logo.dev
    if (domain) {
      urls.push(`https://logo.dev/${domain}`)
    }
    
    // 5. Direct favicon from domain
    if (domain) {
      urls.push(`https://${domain}/favicon.ico`)
    }
    
    // 6. Clearbit (last resort, might be blocked)
    if (domain) {
      urls.push(`https://logo.clearbit.com/${domain}`)
    }
    
    return urls
  }
  
  useEffect(() => {
    const urls = getLogoUrls()
    if (urls.length > 0) {
      setCurrentSrc(urls[0])
      setShowPlaceholder(false)
    } else {
      setShowPlaceholder(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, logoUrl])
  
  const handleError = () => {
    const urls = getLogoUrls()
    const currentIndex = urls.indexOf(currentSrc)
    
    if (currentIndex < urls.length - 1) {
      // Try next fallback
      setCurrentSrc(urls[currentIndex + 1])
    } else {
      // All failed, show placeholder
      setShowPlaceholder(true)
    }
  }
  
  if (showPlaceholder) {
    return (
      <div className="logo-placeholder">
        {(name || '?').charAt(0).toUpperCase()}
      </div>
    )
  }
  
  return (
    <img 
      src={currentSrc}
      alt={name || 'Company'}
      className="example-logo"
      onError={handleError}
      onLoad={() => setShowPlaceholder(false)}
    />
  )
}

function EmptyState({ url, setUrl, handleSubmit, loading, user, onSelectPlan, onLoadExample }) {
  const exampleJds = [
    {
      key: 'stripe',
      name: 'Software Engineer at Stripe',
      company: 'Stripe',
      role: 'Software Engineer',
      logoUrl: 'https://logo.clearbit.com/stripe.com'
    },
    {
      key: 'notion',
      name: 'Product Manager at Notion',
      company: 'Notion',
      role: 'Product Manager',
      logoUrl: 'https://logo.clearbit.com/notion.so'
    },
    {
      key: 'apple',
      name: 'Senior iOS Engineer at Apple',
      company: 'Apple',
      role: 'Senior iOS Engineer',
      logoUrl: 'https://logo.clearbit.com/apple.com'
    }
  ]

  return (
    <div className="empty-state">
      {/* Mobile ads at top */}
      <div className="mobile-ads-container">
        <RotatingAds position="left" />
      </div>
      
      <div className="empty-state-hero">
        <h1 className="empty-title">intrview.io</h1>
        <p className="empty-subtitle">Transform job descriptions into personalized interview prep plans</p>
        
        {/* Prominent URL Input */}
        <form onSubmit={handleSubmit} className="empty-state-form">
          <div className="url-input-wrapper">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste job post URL here..."
              required
              disabled={loading}
              className="empty-url-input"
            />
            <button 
              type="submit" 
              disabled={loading || !url}
              className="empty-generate-btn"
              title={user ? `This will use 5 credits. You have ${user?.creditsRemaining || 0} credits remaining.` : 'Generate study plan'}
            >
              {loading ? 'Analyzing...' : (
                <>
                  Generate Study Plan
                  {user && <span className="credit-cost-badge">5 credits</span>}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
      
      {onLoadExample && (
        <div className="empty-examples">
          <h3>Try Example Job Posts</h3>
          <div className="examples-grid">
            {exampleJds.map((example, idx) => (
              <button
                key={idx}
                className="example-card"
                onClick={() => {
                  // Load pre-loaded example data
                  const preloaded = preloadedExamples[example.key]
                  if (preloaded && onLoadExample) {
                    onLoadExample(preloaded)
                  }
                }}
              >
                <LogoWithFallbacks
                  domain={example.company.toLowerCase() === 'stripe' ? 'stripe.com' : example.company.toLowerCase() === 'notion' ? 'notion.so' : 'apple.com'}
                  name={example.company}
                  logoUrl={example.logoUrl}
                />
                <div className="example-content">
                  <div className="example-company">{example.company}</div>
                  <div className="example-role">{example.role}</div>
                </div>
                <div className="example-arrow">→</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="empty-preview">
        <div className="preview-section">
          <div className="preview-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h3>Job & Company</h3>
          <p>Company insights, founders, funding timeline, and research</p>
        </div>

        <div className="preview-section">
          <div className="preview-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h3>Study Plan</h3>
          <p>AI-generated topics with resources, key points, and progress tracking</p>
        </div>

        <div className="preview-section">
          <div className="preview-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h3>Practice</h3>
          <p>Flashcards, quiz mode, and voice practice with AI feedback</p>
        </div>

        <div className="preview-section">
          <div className="preview-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3>Progress</h3>
          <p>Track your learning, quiz scores, and confidence levels</p>
        </div>
      </div>

      <div className="empty-features">
        <h2>What You'll Get</h2>
        <div className="features-grid">
          <div className="feature-item">
            <span className="feature-check">✓</span>
            <span>Comprehensive study plan organized by topics</span>
          </div>
          <div className="feature-item">
            <span className="feature-check">✓</span>
            <span>Interview questions with detailed answers</span>
          </div>
          <div className="feature-item">
            <span className="feature-check">✓</span>
            <span>Company research and insights</span>
          </div>
          <div className="feature-item">
            <span className="feature-check">✓</span>
            <span>Interactive practice modes</span>
          </div>
          <div className="feature-item">
            <span className="feature-check">✓</span>
            <span>Progress tracking and confidence scoring</span>
          </div>
          <div className="feature-item">
            <span className="feature-check">✓</span>
            <span>AI-powered feedback and evaluation</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default EmptyState

