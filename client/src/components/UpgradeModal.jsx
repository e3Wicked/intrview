import { useState } from 'react'
import axios from 'axios'
import PricingSection from './PricingSection'
import './UpgradeModal.css'

const PLAN_INFO = {
  free:    { name: 'Free',    price: 0,  jobAnalyses: '3 lifetime',  trainingCredits: '15 lifetime' },
  starter: { name: 'Starter', price: 9,  jobAnalyses: '10 / mo',     trainingCredits: '150 / mo' },
  pro:     { name: 'Pro',     price: 19, jobAnalyses: '30 / mo',     trainingCredits: '400 / mo' },
  elite:   { name: 'Elite',   price: 39, jobAnalyses: 'Unlimited',   trainingCredits: '800 / mo' },
}

  const handleSelectPlan = async ({ plan: planKey, interval }) => {
    if (planKey === currentPlan) {
      onClose()
      return
    }

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

    // Paid user with active subscription → show confirmation step
    if (user?.subscriptionStatus === 'active' && user?.stripeSubscriptionId) {
      setConfirmingPlan({ planKey, interval })
      return
    }

    // Free user → go to Stripe Checkout (has its own review page)
    setLoading(planKey)
    try {
      const response = await axios.post('/api/stripe/create-checkout', { plan: planKey, interval })
      if (response.data.url) {
        window.location.href = response.data.url
      }
    } catch (error) {
      console.error('Error starting checkout:', error)
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

  const handleConfirmUpgrade = async () => {
    if (!confirmingPlan) return
    const { planKey, interval } = confirmingPlan
    const previousPlan = user?.plan || 'free'
    setLoading(planKey)

    try {
      const response = await axios.post('/api/stripe/upgrade-subscription', { plan: planKey, interval })
      if (response.data.success) {
        const meRes = await axios.get('/api/auth/me')
        if (meRes.data.user && onUserUpdate) {
          onUserUpdate(meRes.data.user)
        }
        if (onUpgradeSuccess) {
          onUpgradeSuccess(previousPlan, planKey)
        }
        setConfirmingPlan(null)
        setLoading(null)
        onClose()
      }
    } catch (error) {
      console.error('Error upgrading:', error)
      setLoading(null)
      if (error.response?.status === 401) {
        onClose()
        if (onLoginRequired) {
          onLoginRequired()
        }
      } else {
        alert(error.response?.data?.error || 'Failed to upgrade. Please try again.')
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

  const handleSelectDowngrade = (planKey, interval) => {
    setConfirmingDowngrade({ planKey, interval })
  }

  const handleConfirmDowngrade = async () => {
    if (!confirmingDowngrade) return
    const { planKey, interval } = confirmingDowngrade
    setLoading(planKey)

    try {
      const response = await axios.post('/api/stripe/downgrade-subscription', { plan: planKey, interval })
      if (response.data.success) {
        const meRes = await axios.get('/api/auth/me')
        if (meRes.data.user && onUserUpdate) {
          onUserUpdate(meRes.data.user)
        }
        setConfirmingDowngrade(null)
        setLoading(null)
        onClose()
      }
    } catch (error) {
      console.error('Error scheduling downgrade:', error)
      setLoading(null)
      alert(error.response?.data?.error || 'Failed to schedule downgrade. Please try again.')
    }
  }

  const handleClose = () => {
    setConfirmingPlan(null)
    setConfirmingDowngrade(null)
    setLoading(null)
    onClose()
  }

  if (!isOpen) return null

  const currentPlanKey = user?.plan || 'free'
  const currentInfo = PLAN_INFO[currentPlanKey] || PLAN_INFO.free
  const newInfo = confirmingPlan ? PLAN_INFO[confirmingPlan.planKey] : null
  const downgradeInfo = confirmingDowngrade ? PLAN_INFO[confirmingDowngrade.planKey] : null

  return (
    <div className="upgrade-modal-overlay" onClick={handleClose}>
      <div className={`upgrade-modal ${confirmingPlan || confirmingDowngrade ? 'upgrade-modal--confirm' : ''}`} onClick={(e) => e.stopPropagation()}>
        <button className="upgrade-modal-close" onClick={handleClose}>×</button>

        {confirmingDowngrade ? (
          // Confirmation view for downgrade scheduling
          <div className="upgrade-confirm downgrade-confirm">
            <div className="upgrade-confirm-header">
              <h2>Schedule Downgrade</h2>
              <p>Review the changes to your plan</p>
            </div>

            <div className="upgrade-confirm-plans">
              <div className="upgrade-confirm-plan">
                <span className="upgrade-confirm-plan-label">Current</span>
                <span className="upgrade-confirm-plan-name">{currentInfo.name}</span>
              </div>
              <div className="upgrade-confirm-arrow">&rarr;</div>
              <div className="upgrade-confirm-plan downgrade-confirm-plan--new">
                <span className="upgrade-confirm-plan-label">New</span>
                <span className="upgrade-confirm-plan-name">{downgradeInfo.name}</span>
              </div>
            </div>

            <div className="upgrade-confirm-comparison">
              <table className="upgrade-confirm-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Current</th>
                    <th>New</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Job Analyses</td>
                    <td>{currentInfo.jobAnalyses}</td>
                    <td className="downgrade-confirm-lower">{downgradeInfo.jobAnalyses}</td>
                  </tr>
                  <tr>
                    <td>Training Credits</td>
                    <td>{currentInfo.trainingCredits}</td>
                    <td className="downgrade-confirm-lower">{downgradeInfo.trainingCredits}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="downgrade-confirm-billing">
              <p>Your <strong>{currentInfo.name}</strong> features remain active until your next billing date. Starting next cycle: <strong>${downgradeInfo.price}/mo</strong> with {downgradeInfo.name} limits.</p>
            </div>

            <div className="upgrade-confirm-actions">
              <button
                className="upgrade-confirm-btn downgrade-confirm-btn--primary"
                onClick={handleConfirmDowngrade}
                disabled={loading}
              >
                {loading ? 'Scheduling...' : 'Schedule Downgrade'}
              </button>
              <button
                className="upgrade-confirm-btn upgrade-confirm-btn--secondary"
                onClick={() => setConfirmingDowngrade(null)}
                disabled={loading}
              >
                Go Back
              </button>
            </div>
          </div>
        ) : confirmingPlan ? (
          // Confirmation view for paid→paid upgrade
          <div className="upgrade-confirm">
            <div className="upgrade-confirm-header">
              <h2>Confirm Your Upgrade</h2>
              <p>Review the changes to your plan</p>
            </div>

            <div className="upgrade-confirm-plans">
              <div className="upgrade-confirm-plan">
                <span className="upgrade-confirm-plan-label">Current</span>
                <span className="upgrade-confirm-plan-name">{currentInfo.name}</span>
              </div>
              <div className="upgrade-confirm-arrow">&rarr;</div>
              <div className="upgrade-confirm-plan upgrade-confirm-plan--new">
                <span className="upgrade-confirm-plan-label">New</span>
                <span className="upgrade-confirm-plan-name">{newInfo.name}</span>
              </div>
            </div>

            <div className="upgrade-confirm-comparison">
              <table className="upgrade-confirm-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Current</th>
                    <th>New</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Job Analyses</td>
                    <td>{currentInfo.jobAnalyses}</td>
                    <td className="upgrade-confirm-highlight">{newInfo.jobAnalyses}</td>
                  </tr>
                  <tr>
                    <td>Training Credits</td>
                    <td>{currentInfo.trainingCredits}</td>
                    <td className="upgrade-confirm-highlight">{newInfo.trainingCredits}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="upgrade-confirm-billing">
              <p>You'll be charged <strong>immediately</strong> for the prorated amount covering the remainder of your current billing period. Starting next cycle: <strong>${newInfo.price}/mo</strong>.</p>
            </div>

            <div className="upgrade-confirm-actions">
              <button
                className="upgrade-confirm-btn upgrade-confirm-btn--primary"
                onClick={handleConfirmUpgrade}
                disabled={loading}
              >
                {loading ? 'Upgrading...' : 'Confirm Upgrade'}
              </button>
              <button
                className="upgrade-confirm-btn upgrade-confirm-btn--secondary"
                onClick={() => setConfirmingPlan(null)}
                disabled={loading}
              >
                Go Back
              </button>
            </div>
          </div>
        ) : (
          // Plan selection view (existing)
          <>
            <div className="upgrade-modal-header">
              <h2>Upgrade Your Plan</h2>
              <p>Choose a plan that fits your interview journey</p>
            </div>

            <div className="upgrade-modal-content">
              <PricingSection
                onSelectPlan={handleSelectPlan}
                onDowngrade={handleSelectDowngrade}
                currentPlan={user?.plan}
                scheduledDowngradePlan={user?.scheduledDowngradePlan}
                onManageBilling={handleManageBilling}
              />
            </div>

            {loading && (
              <div className="upgrade-loading">
                Redirecting to checkout...
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default UpgradeModal
