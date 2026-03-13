import { useState, useEffect } from 'react'
import axios from 'axios'
import './SubscriptionAnalytics.css'

const EVENT_COLORS = {
  'checkout.session.completed': '#22c55e',
  'invoice.payment_succeeded': '#3b82f6',
  'invoice.payment_failed': '#ef4444',
  'customer.subscription.deleted': '#f59e0b',
  'customer.subscription.updated': '#8b5cf6',
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export default function SubscriptionAnalytics() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    axios.get('/api/admin/analytics')
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load analytics'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="analytics-loading">Loading analytics...</p>
  if (error) return <p className="analytics-error">{error}</p>
  if (!data) return null

  const totalPaidSubs = Object.values(data.subscribers).reduce(
    (sum, plan) => sum + (plan.active || 0), 0
  )
  const totalPastDue = Object.values(data.subscribers).reduce(
    (sum, plan) => sum + (plan.past_due || 0), 0
  )

  // Growth chart max value
  const maxSignups = Math.max(...data.growth.map(g => g.signups), 1)

  return (
    <div className="analytics">
      {/* KPI Cards */}
      <div className="analytics-kpis">
        <div className="analytics-kpi">
          <span className="analytics-kpi-value">{formatCurrency(data.mrr.total)}</span>
          <span className="analytics-kpi-label">MRR</span>
        </div>
        <div className="analytics-kpi">
          <span className="analytics-kpi-value">{totalPaidSubs}</span>
          <span className="analytics-kpi-label">Paid Subscribers</span>
        </div>
        <div className="analytics-kpi">
          <span className="analytics-kpi-value">{data.advertisers.active}</span>
          <span className="analytics-kpi-label">Active Advertisers</span>
        </div>
        <div className="analytics-kpi">
          <span className="analytics-kpi-value">{data.churn}</span>
          <span className="analytics-kpi-label">30-day Churn</span>
        </div>
        <div className="analytics-kpi analytics-kpi--warning">
          <span className="analytics-kpi-value">{totalPastDue}</span>
          <span className="analytics-kpi-label">Past Due</span>
        </div>
      </div>

      {/* MRR Breakdown Table */}
      <div className="analytics-section">
        <h3 className="analytics-section-title">Revenue Breakdown</h3>
        <table className="analytics-table">
          <thead>
            <tr>
              <th>Plan</th>
              <th>Active</th>
              <th>MRR</th>
              <th>% of Total</th>
            </tr>
          </thead>
          <tbody>
            {['starter', 'pro', 'elite'].map(plan => {
              const planMrr = data.mrr.breakdown[plan] || 0
              const pct = data.mrr.total > 0 ? ((planMrr / data.mrr.total) * 100).toFixed(1) : '0.0'
              return (
                <tr key={plan}>
                  <td className="analytics-plan-name">{plan.charAt(0).toUpperCase() + plan.slice(1)}</td>
                  <td>{data.subscribers[plan]?.active || 0}</td>
                  <td>{formatCurrency(planMrr)}</td>
                  <td>{pct}%</td>
                </tr>
              )
            })}
            <tr className="analytics-row-highlight">
              <td className="analytics-plan-name">Advertisers</td>
              <td>{data.advertisers.active}</td>
              <td>{formatCurrency(data.mrr.advertiser)}</td>
              <td>{data.mrr.total > 0 ? ((data.mrr.advertiser / data.mrr.total) * 100).toFixed(1) : '0.0'}%</td>
            </tr>
            <tr className="analytics-row-total">
              <td><strong>Total</strong></td>
              <td><strong>{totalPaidSubs + data.advertisers.active}</strong></td>
              <td><strong>{formatCurrency(data.mrr.total)}</strong></td>
              <td><strong>100%</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Growth Chart */}
      {data.growth.length > 0 && (
        <div className="analytics-section">
          <h3 className="analytics-section-title">New Signups (Last 6 Months)</h3>
          <div className="analytics-chart">
            {data.growth.map((g, i) => (
              <div className="analytics-bar-group" key={i}>
                <div className="analytics-bar-value">{g.signups}</div>
                <div
                  className="analytics-bar"
                  style={{ height: `${(g.signups / maxSignups) * 120}px` }}
                />
                <div className="analytics-bar-label">
                  {new Date(g.month).toLocaleDateString('en-US', { month: 'short' })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Events */}
      {data.recentEvents.length > 0 && (
        <div className="analytics-section">
          <h3 className="analytics-section-title">Recent Webhook Events</h3>
          <div className="analytics-events">
            {data.recentEvents.map((evt, i) => (
              <div className="analytics-event" key={i}>
                <span
                  className="analytics-event-dot"
                  style={{ background: EVENT_COLORS[evt.event_type] || '#888' }}
                />
                <span className="analytics-event-type">{evt.event_type}</span>
                <span className="analytics-event-time">
                  {new Date(evt.created_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
