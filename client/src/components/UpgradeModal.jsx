import { useState } from 'react'
import axios from 'axios'
import PricingSection from './PricingSection'
import './UpgradeModal.css'

function UpgradeModal({ isOpen, onClose, user, onLoginRequired, onUserUpdate }) {
  const [loading, setLoading] = useState(null)

  const handleSelectPlan = async (planKey) => {
    // Check if user needs to login first
    try {
      const meResponse = await axios.get('/api/auth/me')
      if (!meResponse.data.user) {
        onClose()
        if (onLoginRequired) {
          onLoginRequired()
        }
        return
      }
    } catch (error) {
      onClose()
      if (onLoginRequired) {
        onLoginRequired()
      }
      return
    }

    setLoading(planKey)

    try {
      // Paid user with active subscription → use upgrade endpoint (instant, no redirect)
      if (user?.subscriptionStatus === 'active' && user?.stripeSubscriptionId) {
        const response = await axios.post('/api/stripe/upgrade-subscription', { plan: planKey })
        if (response.data.success) {
          // Refresh user data to reflect the new plan
          const meRes = await axios.get('/api/auth/me')
          if (meRes.data.user && onUserUpdate) {
            onUserUpdate(meRes.data.user)
          }
          onClose()
        }
      } else {
        // Free user → use checkout (needs payment info)
        const response = await axios.post('/api/stripe/create-checkout', { plan: planKey })
        if (response.data.url) {
          window.location.href = response.data.url
        }
      }
    } catch (error) {
      console.error('Error upgrading:', error)
      if (error.response?.status === 401) {
        onClose()
        if (onLoginRequired) {
          onLoginRequired()
        }
      } else {
        alert(error.response?.data?.error || 'Failed to start checkout. Please try again.')
        setLoading(null)
      }
    }
  }

  const handleManageBilling = async () => {
    try {
      const res = await axios.post('/api/stripe/create-portal')
      window.location.href = res.data.url
    } catch (err) {
      console.error('Portal error:', err)
    }
  }

  if (!isOpen) return null

  return (
    <div className="upgrade-modal-overlay" onClick={onClose}>
      <div className="upgrade-modal" onClick={(e) => e.stopPropagation()}>
        <button className="upgrade-modal-close" onClick={onClose}>×</button>

        <div className="upgrade-modal-header">
          <h2>Upgrade Your Plan</h2>
          <p>Choose a plan that fits your interview journey</p>
        </div>

        <div className="upgrade-modal-content">
          <PricingSection
            onSelectPlan={handleSelectPlan}
            currentPlan={user?.plan}
            onManageBilling={handleManageBilling}
          />
        </div>

        {loading && (
          <div className="upgrade-loading">
            {user?.subscriptionStatus === 'active' && user?.stripeSubscriptionId
              ? 'Upgrading your plan...'
              : 'Redirecting to checkout...'}
          </div>
        )}
      </div>
    </div>
  )
}

export default UpgradeModal
