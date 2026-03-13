import './UpgradeSuccessModal.css'

const PLAN_INFO = {
  free:    { name: 'Free',    jobAnalyses: '3 lifetime',  trainingCredits: '15 lifetime' },
  starter: { name: 'Starter', jobAnalyses: '10 / mo',     trainingCredits: '150 / mo' },
  pro:     { name: 'Pro',     jobAnalyses: '30 / mo',     trainingCredits: '400 / mo' },
  elite:   { name: 'Elite',   jobAnalyses: 'Unlimited',   trainingCredits: '800 / mo' },
}

function UpgradeSuccessModal({ upgradeInfo, onClose }) {
  if (!upgradeInfo) return null

  const { previousPlan, newPlan } = upgradeInfo
  const prevInfo = PLAN_INFO[previousPlan] || PLAN_INFO.free
  const newInfo = PLAN_INFO[newPlan] || PLAN_INFO.free

  return (
    <div className="success-modal-overlay" onClick={onClose}>
      <div className="success-modal" onClick={(e) => e.stopPropagation()}>
        <div className="success-modal-check">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="24" fill="#22c55e" opacity="0.12" />
            <circle cx="24" cy="24" r="18" fill="#22c55e" opacity="0.2" />
            <path d="M16 24l6 6 10-12" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </div>

        <h2 className="success-modal-heading">Welcome to {newInfo.name}!</h2>
        <p className="success-modal-subtitle">Your plan has been upgraded successfully.</p>

        <div className="success-modal-comparison">
          <div className="success-modal-row success-modal-row--header">
            <span></span>
            <span>Before</span>
            <span>Now</span>
          </div>
          <div className="success-modal-row">
            <span>Plan</span>
            <span>{prevInfo.name}</span>
            <span className="success-modal-new">{newInfo.name}</span>
          </div>
          <div className="success-modal-row">
            <span>Job Analyses</span>
            <span>{prevInfo.jobAnalyses}</span>
            <span className="success-modal-new">{newInfo.jobAnalyses}</span>
          </div>
          <div className="success-modal-row">
            <span>Training Credits</span>
            <span>{prevInfo.trainingCredits}</span>
            <span className="success-modal-new">{newInfo.trainingCredits}</span>
          </div>
        </div>

        <button className="success-modal-btn" onClick={onClose}>Got it</button>
      </div>
    </div>
  )
}

export default UpgradeSuccessModal
