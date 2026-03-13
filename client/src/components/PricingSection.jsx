import { useState } from 'react'
import './PricingSection.css'

function PricingSection({ onSelectPlan, currentPlan, onManageBilling }) {
  const [billingInterval, setBillingInterval] = useState('month')
  const planOrder = ['free', 'starter', 'pro', 'elite']
  const currentIndex = planOrder.indexOf(currentPlan || 'free')

  const plans = [
    {
      key: 'starter',
      name: 'Starter',
      price: 9,
      jobAnalyses: '10',
      trainingCredits: '150',
      features: [
        'Full study plans',
        'Interview questions',
        'Flashcards & quizzes',
        'Company research',
        'Progress tracking'
      ],
      cta: 'Start Starter',
      popular: false
    },
    {
      key: 'pro',
      name: 'Pro',
      price: 19,
      jobAnalyses: '30',
      trainingCredits: '400',
      features: [
        'Everything in Starter',
        'Voice practice with AI feedback',
        'PDF export of study plans',
        'Priority AI speed'
      ],
      cta: 'Go Pro',
      popular: true
    },
    {
      key: 'elite',
      name: 'Elite',
      price: 39,
      jobAnalyses: 'Unlimited',
      trainingCredits: '800',
      features: [
        'Everything in Pro',
        'Advanced company insights (coming soon)',
        'Personalized recommendations (coming soon)',
        'Custom interview simulation (coming soon)',
        'Early access to new features'
      ],
      cta: 'Join Elite',
      popular: false,
      badge: 'Includes upcoming premium features'
    }
  ]

  return (
    <div className="pricing-section">
      <div className="pricing-header">
        <h2>Simple, transparent pricing</h2>
        <p>Choose a plan that fits your interview journey.</p>
      </div>

      <div className="pricing-toggle">
        <span className={`pricing-toggle-label ${billingInterval === 'month' ? 'active' : ''}`}>Monthly</span>
        <button
          className={`pricing-toggle-switch ${billingInterval === 'year' ? 'active' : ''}`}
          onClick={() => setBillingInterval(prev => prev === 'month' ? 'year' : 'month')}
          aria-label="Toggle billing interval"
        >
          <span className="pricing-toggle-knob" />
        </button>
        <span className={`pricing-toggle-label ${billingInterval === 'year' ? 'active' : ''}`}>
          Annual
          <span className="pricing-save-badge">Save 20%</span>
        </span>
      </div>

      <div className="pricing-cards">
        {plans.map((plan) => {
          const planIndex = planOrder.indexOf(plan.key)
          const isCurrent = plan.key === currentPlan
          const isDowngrade = planIndex < currentIndex && planIndex > 0

          return (
            <div
              key={plan.key}
              className={`pricing-card ${plan.popular ? 'popular' : ''} ${isCurrent ? 'current' : ''}`}
            >
              {isCurrent && (
                <div className="pricing-badge current-badge">Current Plan</div>
              )}
              {!isCurrent && plan.popular && (
                <div className="pricing-badge">Most Popular</div>
              )}

              <div className="pricing-card-header">
                <h3>{plan.name}</h3>
                {billingInterval === 'month' ? (
                  <div className="pricing-price">
                    <span className="pricing-amount">${plan.price}</span>
                    <span className="pricing-period">/month</span>
                  </div>
                ) : (
                  <>
                    <div className="pricing-price">
                      <span className="pricing-amount">${Math.round(plan.price * 12 * 0.8 / 12)}</span>
                      <span className="pricing-period">/mo</span>
                    </div>
                    <div className="pricing-annual-total">${Math.round(plan.price * 12 * 0.8)}/year</div>
                  </>
                )}
              </div>

              <div className="pricing-details">
                <div className="pricing-analyses">
                  <strong>{plan.jobAnalyses}</strong> job analyses / month
                </div>
                <div className="pricing-credits">
                  <strong>{plan.trainingCredits}</strong> training credits / month
                  <span className="pricing-tooltip" title="Training credits power AI chat, quizzes, voice practice, and company research.">
                    ?
                  </span>
                </div>
              </div>

              <ul className="pricing-features">
                {plan.features.map((feature, idx) => (
                  <li key={idx}>
                    <span className="feature-check">&#10003;</span>
                    {feature}
                  </li>
                ))}
              </ul>

              {plan.badge && (
                <div className="pricing-badge-small">{plan.badge}</div>
              )}

              {isCurrent ? (
                <button className="pricing-cta current" disabled>
                  Current Plan
                </button>
              ) : isDowngrade ? (
                <button
                  className="pricing-cta secondary"
                  onClick={() => onManageBilling?.()}
                >
                  Manage in Billing
                </button>
              ) : (
                <button
                  className="pricing-cta"
                  onClick={() => onSelectPlan(plan.key, billingInterval)}
                >
                  {plan.cta}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <p className="pricing-footer">
        All plans are for individual personal use.<br />
        Cancel anytime.
      </p>
    </div>
  )
}

export default PricingSection
