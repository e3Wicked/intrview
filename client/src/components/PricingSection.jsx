import './PricingSection.css'

function PricingSection({ onSelectPlan }) {
  console.log('PricingSection rendering', { onSelectPlan: typeof onSelectPlan })
  const plans = [
    {
      key: 'starter',
      name: 'Starter',
      price: 9,
      credits: 120,
      jobAnalyses: 3,
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
      credits: 300,
      jobAnalyses: 'Unlimited',
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
      credits: 600,
      jobAnalyses: 'Unlimited',
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
                <span className="pricing-amount">${plan.price}</span>
                <span className="pricing-period">/month</span>
              </div>
            </div>

            <div className="pricing-details">
              <div className="pricing-credits">
                <strong>{plan.credits}</strong> Prep Credits / month
                <span className="pricing-tooltip" title="Prep credits power AI-generated study plans, questions, and feedback.">
                  ℹ️
                </span>
              </div>
              <div className="pricing-analyses">
                <strong>{plan.jobAnalyses}</strong> job analyses / month
              </div>
            </div>

            <ul className="pricing-features">
              {plan.features.map((feature, idx) => (
                <li key={idx}>
                  <span className="feature-check">✓</span>
                  {feature}
                </li>
              ))}
            </ul>

            {plan.badge && (
              <div className="pricing-badge-small">{plan.badge}</div>
            )}

            <button 
              className="pricing-cta"
              onClick={() => onSelectPlan(plan.key)}
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

