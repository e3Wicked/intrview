import { useState } from 'react'
import { api } from '../utils/api'
import axios from 'axios'
import './SettingsPage.css'

function SettingsPage({ user, setUser, onUpgrade, onLogout }) {
  const [name, setName] = useState(user.name || '')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const handleSaveName = async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      const res = await api.user.updateProfile({ name })
      setUser(prev => ({ ...prev, name: res.data.user.name }))
      setSaveMsg('Saved')
      setTimeout(() => setSaveMsg(''), 2000)
    } catch {
      setSaveMsg('Failed to save')
    } finally {
      setSaving(false)
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

  const planLabel = (user.plan || 'free').charAt(0).toUpperCase() + (user.plan || 'free').slice(1)

  return (
    <div className="settings-page">
      <h1 className="settings-title">Settings</h1>

      <div className="settings-card">
        <h2 className="settings-section-title">Profile</h2>
        <div className="settings-field">
          <label className="settings-label">Email</label>
          <input className="settings-input" value={user.email} disabled />
        </div>
        <div className="settings-field">
          <label className="settings-label">Name</label>
          <div className="settings-input-row">
            <input
              className="settings-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
            />
            <button className="settings-save-btn" onClick={handleSaveName} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
          {saveMsg && <span className={`settings-save-msg ${saveMsg === 'Saved' ? 'success' : 'error'}`}>{saveMsg}</span>}
        </div>
      </div>

      <div className="settings-card">
        <h2 className="settings-section-title">Subscription</h2>
        <div className="settings-plan-row">
          <span className="settings-plan-badge">{planLabel}</span>
        </div>
        <div className="settings-usage">
          <div className="settings-usage-row">
            <span className="settings-usage-label">Job Analyses</span>
            <span className="settings-usage-value">
              {user.jobAnalysesMonthlyAllowance === -1
                ? 'Unlimited'
                : `${user.jobAnalysesRemaining ?? 0}${user.isLifetimePlan ? ' remaining' : ` / ${user.jobAnalysesMonthlyAllowance ?? 0} per month`}`}
            </span>
          </div>
          <div className="settings-usage-row">
            <span className="settings-usage-label">Training Credits</span>
            <span className="settings-usage-value">
              {user.trainingCreditsRemaining ?? 0}{user.isLifetimePlan ? ' remaining' : ` / ${user.trainingCreditsMonthlyAllowance ?? 0} per month`}
            </span>
          </div>
        </div>
        <div className="settings-plan-actions">
          {user.plan !== 'elite' && (
            <button className="settings-btn" onClick={onUpgrade}>Upgrade Plan</button>
          )}
          {user.stripeCustomerId && (
            <button className="settings-btn secondary" onClick={handleManageBilling}>Manage Billing</button>
          )}
        </div>
      </div>

      <div className="settings-card">
        <h2 className="settings-section-title">Account</h2>
        <button className="settings-btn danger" onClick={onLogout}>Sign Out</button>
      </div>
    </div>
  )
}

export default SettingsPage
