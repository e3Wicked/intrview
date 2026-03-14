import { useState } from 'react'
import { api } from '../utils/api'
import './CancelSubscriptionModal.css'

const REASONS = [
  { key: 'too_expensive', label: 'Too expensive' },
  { key: 'not_using_enough', label: 'Not using it enough' },
  { key: 'missing_features', label: 'Missing features I need' },
  { key: 'switching_competitor', label: 'Switching to another tool' },
  { key: 'temporary_break', label: 'Taking a break' },
  { key: 'other', label: 'Other' },
]

const PLAN_INFO = {
  starter: { name: 'Starter', price: 9 },
  pro: { name: 'Pro', price: 19 },
  elite: { name: 'Elite', price: 39 },
}

const PLAN_FEATURES = {
  starter: ['10 job analyses / mo', '150 training credits / mo'],
  pro: ['30 job analyses / mo', '400 training credits / mo', 'Voice practice', 'PDF export', 'Priority speed'],
  elite: ['Unlimited job analyses', '800 training credits / mo', 'Voice practice', 'PDF export', 'Priority speed'],
}

function getSuggestion(reason, plan) {
  const planOrder = ['free', 'starter', 'pro', 'elite']
  const currentIdx = planOrder.indexOf(plan)
  const lowerPlan = currentIdx > 1 ? planOrder[currentIdx - 1] : null
  const lowerInfo = lowerPlan ? PLAN_INFO[lowerPlan] : null

  switch (reason) {
    case 'too_expensive':
      if (lowerInfo) {
        return {
          type: 'downgrade',
          message: `Would you consider downgrading to ${lowerInfo.name} at $${lowerInfo.price}/mo instead?`,
          actionLabel: 'View plans',
        }
      }
      return null
    case 'not_using_enough':
    case 'temporary_break':
      return {
        type: 'reassure',
        message: 'Your study plans and progress will be saved. Come back anytime.',
      }
    case 'missing_features':
      return {
        type: 'feedback',
        message: "Thanks for the feedback. We're actively building new features.",
      }
    default:
      return null
  }
}

function CancelSubscriptionModal({ isOpen, onClose, user, onUserUpdate, onUpgrade }) {
  const [step, setStep] = useState(1)
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleClose = () => {
    setStep(1)
    setReason('')
    setComment('')
    setError('')
    setLoading(false)
    onClose()
  }

  const handleContinueToSuggestion = () => {
    if (!reason) return
    const suggestion = getSuggestion(reason, user.plan)
    if (suggestion) {
      setStep(2)
    } else {
      setStep(3)
    }
  }

  const handleConfirmCancel = async () => {
    setLoading(true)
    setError('')
    try {
      await api.subscription.cancel({ reason, comment: comment || undefined })
      // Refresh user data
      const axios = (await import('axios')).default
      const meRes = await axios.get('/api/auth/me')
      if (meRes.data.user && onUserUpdate) {
        onUserUpdate(meRes.data.user)
      }
      handleClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to cancel subscription. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const planLabel = PLAN_INFO[user.plan]?.name || user.plan
  const features = PLAN_FEATURES[user.plan] || []
  const suggestion = getSuggestion(reason, user.plan)
  const effectiveDateLabel = user.currentPeriodEnd
    ? new Date(user.currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'end of billing period'

  return (
    <div className="cancel-modal-overlay" onClick={handleClose}>
      <div className="cancel-modal" onClick={e => e.stopPropagation()}>
        <button className="cancel-modal-close" onClick={handleClose}>&times;</button>

        {step === 1 && (
          <div className="cancel-step">
            <div className="cancel-header">
              <h2>We're sorry to see you go</h2>
              <p>Help us understand why you're cancelling</p>
            </div>

            <div className="cancel-reasons">
              {REASONS.map(r => (
                <button
                  key={r.key}
                  className={`cancel-reason-btn ${reason === r.key ? 'active' : ''}`}
                  onClick={() => setReason(r.key)}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div className="cancel-comment-field">
              <textarea
                className="cancel-comment"
                placeholder={reason === 'other' ? 'Please tell us why (required)' : 'Any additional comments? (optional)'}
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={3}
              />
            </div>

            <div className="cancel-actions">
              <button
                className="cancel-btn cancel-btn--primary"
                onClick={handleContinueToSuggestion}
                disabled={!reason || (reason === 'other' && !comment.trim())}
              >
                Continue
              </button>
              <button className="cancel-btn cancel-btn--secondary" onClick={handleClose}>
                Never mind
              </button>
            </div>
          </div>
        )}

        {step === 2 && suggestion && (
          <div className="cancel-step">
            <div className="cancel-header">
              <h2>Before you go...</h2>
            </div>

            <div className="cancel-suggestion">
              <p>{suggestion.message}</p>
              {suggestion.type === 'downgrade' && onUpgrade && (
                <button
                  className="cancel-btn cancel-btn--suggestion"
                  onClick={() => { handleClose(); onUpgrade(); }}
                >
                  {suggestion.actionLabel}
                </button>
              )}
            </div>

            <div className="cancel-actions">
              <button
                className="cancel-btn cancel-btn--continue-cancel"
                onClick={() => setStep(3)}
              >
                Continue with cancellation
              </button>
              <button className="cancel-btn cancel-btn--secondary" onClick={handleClose}>
                Keep my plan
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="cancel-step">
            <div className="cancel-header">
              <h2>Confirm cancellation</h2>
            </div>

            <div className="cancel-summary">
              <div className="cancel-summary-row">
                <span className="cancel-summary-label">Current plan</span>
                <span className="cancel-summary-value">{planLabel}</span>
              </div>
              <div className="cancel-summary-row">
                <span className="cancel-summary-label">Effective date</span>
                <span className="cancel-summary-value">{effectiveDateLabel}</span>
              </div>
            </div>

            {features.length > 0 && (
              <div className="cancel-losing">
                <p className="cancel-losing-title">You'll lose access to:</p>
                <ul className="cancel-losing-list">
                  {features.map(f => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="cancel-reassurance">
              <p>Your study plans and progress data will be preserved.</p>
            </div>

            {error && <div className="cancel-error">{error}</div>}

            <div className="cancel-actions">
              <button
                className="cancel-btn cancel-btn--danger"
                onClick={handleConfirmCancel}
                disabled={loading}
              >
                {loading ? 'Cancelling...' : 'Cancel My Subscription'}
              </button>
              <button
                className="cancel-btn cancel-btn--secondary"
                onClick={handleClose}
                disabled={loading}
              >
                Keep My Plan
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CancelSubscriptionModal
