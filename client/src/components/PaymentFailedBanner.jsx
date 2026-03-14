import { useState } from 'react'
import axios from 'axios'
import './PaymentFailedBanner.css'

export default function PaymentFailedBanner({ user }) {
  const [loading, setLoading] = useState(false)

  if (user?.subscriptionStatus !== 'past_due') return null

  const handleUpdatePayment = async () => {
    setLoading(true)
    try {
      const res = await axios.post('/api/stripe/create-portal', {
        returnUrl: window.location.href
      })
      window.location.href = res.data.url
    } catch (err) {
      console.error('Failed to open billing portal:', err)
      setLoading(false)
    }
  }

  const gracePeriodEnd = user?.gracePeriodEnd ? new Date(user.gracePeriodEnd) : null;
  const daysRemaining = gracePeriodEnd
    ? Math.max(0, Math.ceil((gracePeriodEnd.getTime() - Date.now()) / 86400000))
    : null;

  return (
    <div className="payment-failed-banner">
      <span className="payment-failed-icon">⚠</span>
      <span className="payment-failed-text">
        {daysRemaining !== null
          ? `Your last payment failed. You have ${daysRemaining} day(s) to update your payment before your plan is downgraded.`
          : 'Your last payment failed. Update your payment method to keep your plan active.'}
      </span>
      <button
        className="payment-failed-btn"
        onClick={handleUpdatePayment}
        disabled={loading}
      >
        {loading ? 'Opening...' : 'Update Payment'}
      </button>
    </div>
  )
}
