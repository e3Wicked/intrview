import { useState } from 'react'
import axios from 'axios'
import './SponsorModal.css'

function SponsorModal({ onClose }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')

  const handleAdvertise = async (e) => {
    e.preventDefault()
    if (!email) {
      setError('Email is required')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await axios.post('/api/stripe/create-advertiser-checkout', {
        companyName: companyName || undefined,
        email
      })
      
      if (response.data.url) {
        // Redirect to Stripe checkout
        window.location.href = response.data.url
      } else {
        setError('Failed to create checkout session')
      }
    } catch (err) {
      console.error('Error creating checkout:', err)
      setError(err.response?.data?.error || 'Failed to create checkout session')
      setLoading(false)
    }
  }

  return (
    <div className="sponsor-modal-overlay" onClick={onClose}>
      <div className="sponsor-modal" onClick={(e) => e.stopPropagation()}>
        <button className="sponsor-modal-close" onClick={onClose}>
          ×
        </button>
        
        <div className="sponsor-modal-header">
          <h2 className="sponsor-modal-title">Advertise on intrview.io</h2>
          <p className="sponsor-modal-subtitle">Reach 120K+ job seekers and engineers every month</p>
        </div>

        <div className="sponsor-modal-stats">
          <div className="sponsor-stat-card">
            <div className="sponsor-stat-icon">👥</div>
            <div className="sponsor-stat-value">120K+</div>
            <div className="sponsor-stat-label">Monthly visitors</div>
          </div>
          <div className="sponsor-stat-card">
            <div className="sponsor-stat-icon">🎯</div>
            <div className="sponsor-stat-value">High-intent</div>
            <div className="sponsor-stat-label">Job seekers, not browsers</div>
          </div>
          <div className="sponsor-stat-card">
            <div className="sponsor-stat-icon">⚡</div>
            <div className="sponsor-stat-value">0/20</div>
            <div className="sponsor-stat-label">Spots left</div>
          </div>
        </div>

        <div className="sponsor-modal-section">
          <h3 className="sponsor-section-title">How it works</h3>
          <p className="sponsor-section-text">
            Your company appears in rotating sponsor slots on desktop sidebars and mobile banners across all intrview.io pages. 
            Sponsors rotate every 10 seconds to ensure fair visibility among all advertisers.
          </p>
        </div>

        <div className="sponsor-modal-pricing">
          <h3 className="sponsor-section-title">Pricing</h3>
          <div className="pricing-info">
            <div className="pricing-rate">Monthly rate: $999/month</div>
            <div className="pricing-offer">
              Reserve your advertising spot for next month. 
              Your subscription will start on the first of next month.
            </div>
          </div>
        </div>

        {error && (
          <div className="sponsor-error" style={{ marginBottom: '16px', padding: '12px', background: '#3a1a1a', border: '1px solid #5a2a2a', borderRadius: '6px', color: '#ff6b6b' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleAdvertise} className="sponsor-form">
          <div className="sponsor-form-group">
            <label htmlFor="sponsor-email">Email *</label>
            <input
              id="sponsor-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              disabled={loading}
            />
          </div>
          <div className="sponsor-form-group">
            <label htmlFor="sponsor-company">Company Name (optional)</label>
            <input
              id="sponsor-company"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Your Company"
              disabled={loading}
            />
          </div>
          <button 
            type="submit"
            className="sponsor-cta-button"
            disabled={loading || !email}
          >
            {loading ? 'Processing...' : 'Lock spot for next month ($999/month)'}
            {!loading && (
              <svg className="external-link-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

export default SponsorModal



