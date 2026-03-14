import { useState } from 'react'
import './PricingSection.css'

const PRICING = {
  starter:  { monthly: 9,  quarterly: 24,  annual: 86 },
  pro:      { monthly: 19, quarterly: 51,  annual: 182 },
  elite:    { monthly: 39, quarterly: 105, annual: 374 },
}

function PricingSection({ onSelectPlan }) {
  const [interval, setInterval] = useState('monthly')

  const plans = [
    {
      key: 'starter',
      name: 'Starter',
      jobAnalyses: '10',
      trainingCredits: '150',
      features: [
        'Full study plans',
        'Interview questions',
        'Flashcards & quizzes',
        'Company research',
        'Progress tracking'
      ],
      cta: 'Get Started',
      popular: false
    },
    {
      key: 'pro',
      name: 'Pro',
      jobAnalyses: '30',
      trainingCredits: '400',
      features: [
        'Everything in Starter',
        'Voice practice with AI feedback',
        'PDF export of study plans',
        'Priority AI speed'
      ],
      cta: 'Get Started',
      popular: true
    },
    {
      key: 'elite',
      name: 'Elite',
      jobAnalyses: 'Unlimited',
      trainingCredits: '800',
      features: [
        'Everything in Pro',
        'Advanced company insights (coming soon)',
        'Personalized recommendations (coming soon)',
        'Custom interview simulation (coming soon)',
        'Early access to new features'
      ],
      cta: 'Get Started',
      popular: false,
      badge: 'Includes upcoming premium features'
    }
  ]

  const getPeriodLabel = () => {
    if (interval === 'monthly') return '/month'
    if (interval === 'quarterly') return '/quarter'
    return '/year'
  }

  return (
    <div className="pricing-section">
      <div className="pricing-header">
        <h2>Simple, transparent pricing</h2>
        <p>Choose a plan that fits your interview journey.</p>
      </div>

      <div className="pricing-interval-toggle">
        {['monthly', 'quarterly', 'annual'].map((opt) => (
          <button
            key={opt}
            className={`pricing-interval-option ${interval === opt ? 'active' : ''}`}
            onClick={() => setInterval(opt)}
          >
            {opt.charAt(0).toUpperCase() + opt.slice(1)}
            {opt === 'quarterly' && <span className="pricing-save-badge">Save 10%</span>}
            {opt === 'annual' && <span className="pricing-save-badge">Save 20%</span>}
          </button>
        ))}
      </div>

      <div className="pricing-cards">
        {plans.map((plan) => (
          <div
            key={plan.key}
            className={`pricing-card ${plan.popular ? 'popular' : ''}`}
          >
            {plan.popular && (
              <div className="pricing-badge">Most Popular</div>
            )}

            <div className="pricing-card-header">
              <h3>{plan.name}</h3>
              <div className="pricing-price">
                <span className="pricing-amount">${PRICING[plan.key][interval]}</span>
                <span className="pricing-period">{getPeriodLabel()}</span>
              </div>
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

            <button
              className="pricing-cta"
              onClick={() => onSelectPlan({ plan: plan.key, interval })}
            >
              {plan.cta}
            </button>
          </div>
        ))}
      </div>

      <p className="pricing-footer">
        All plans are for individual personal use.<br />
        Cancel anytime.
      </p>
    </div>
  )
}

export default PricingSection
