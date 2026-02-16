import { useState } from 'react'
import axios from 'axios'
import PricingSection from './PricingSection'
import './UpgradeModal.css'

function UpgradeModal({ isOpen, onClose, currentPlan, onLoginRequired }) {
  const [loading, setLoading] = useState(null)

  const handleSelectPlan = async (planKey) => {
    if (planKey === currentPlan) {
      onClose()
      return
    }

    // Check if user needs to login first
    try {
      const meResponse = await axios.get('/api/auth/me')
      if (!meResponse.data.user) {
        // User not logged in, show login modal
        onClose()
        if (onLoginRequired) {
          onLoginRequired()
        }
        return
      }
    } catch (error) {
      // If auth check fails, assume not logged in
      onClose()
      if (onLoginRequired) {
        onLoginRequired()
      }
      return
    }

    setLoading(planKey)

    try {
      const response = await axios.post('/api/stripe/create-checkout', { plan: planKey })
      if (response.data.url) {
        window.location.href = response.data.url
      }
    } catch (error) {
      console.error('Error creating checkout:', error)
      if (error.response?.status === 401) {
        // Not authenticated, show login
        onClose()
        if (onLoginRequired) {
          onLoginRequired()
        }
      } else {
        alert('Failed to start checkout. Please try again.')
        setLoading(null)
      }
    }
  }

  if (!isOpen) return null

  return (
    <div className="upgrade-modal-overlay" onClick={onClose}>
      <div className="upgrade-modal" onClick={(e) => e.stopPropagation()}>
        <button className="upgrade-modal-close" onClick={onClose}>×</button>
        
        <div className="upgrade-modal-header">
          <h2>Upgrade Your Plan</h2>
          <p>Choose a plan to unlock more features and credits</p>
        </div>

        <div className="upgrade-modal-content">
          <PricingSection onSelectPlan={handleSelectPlan} />
        </div>

        {loading && (
          <div className="upgrade-loading">
            Redirecting to checkout...
          </div>
        )}
      </div>
    </div>
  )
}

export default UpgradeModal

