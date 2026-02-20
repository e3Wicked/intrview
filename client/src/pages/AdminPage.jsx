import { useState, useEffect } from 'react'
import axios from 'axios'
import './AdminPage.css'

const PLAN_LABELS = {
  free:    { label: 'Free',    color: '#555' },
  starter: { label: 'Starter', color: '#3b82f6' },
  pro:     { label: 'Pro',     color: '#8b5cf6' },
  elite:   { label: 'Elite',   color: '#f59e0b' },
}

function PlanBadge({ plan }) {
  const { label, color } = PLAN_LABELS[plan] || { label: plan, color: '#555' }
  return (
    <span className="admin-badge" style={{ borderColor: color, color }}>
      {label}
    </span>
  )
}

export default function AdminPage({ user }) {
  const [users, setUsers]     = useState([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [search, setSearch]   = useState('')

  useEffect(() => {
    axios.get('/api/admin/users')
      .then(res => {
        setUsers(res.data.users)
        setTotal(res.data.total)
      })
      .catch(err => setError(err.response?.data?.error || 'Failed to load users'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.name || '').toLowerCase().includes(search.toLowerCase())
  )

  const byPlan = users.reduce((acc, u) => {
    acc[u.plan] = (acc[u.plan] || 0) + 1
    return acc
  }, {})

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Admin</h1>
          <p className="admin-subtitle">Signed in as <strong>{user.email}</strong></p>
        </div>
      </div>

      {/* Stats row */}
      <div className="admin-stats">
        <div className="admin-stat">
          <span className="admin-stat-value">{total}</span>
          <span className="admin-stat-label">Total users</span>
        </div>
        {Object.entries(PLAN_LABELS).map(([plan, { label, color }]) => (
          <div className="admin-stat" key={plan}>
            <span className="admin-stat-value" style={{ color }}>{byPlan[plan] || 0}</span>
            <span className="admin-stat-label">{label}</span>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="admin-toolbar">
        <input
          className="admin-search"
          placeholder="Search by email or name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading && <p className="admin-loading">Loading users…</p>}
      {error   && <p className="admin-error">{error}</p>}

      {!loading && !error && (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Plan</th>
                <th>Credits</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} className={u.isAdmin ? 'admin-row' : ''}>
                  <td>
                    <div className="admin-user-email">
                      {u.email}
                      {u.isAdmin && <span className="admin-tag">admin</span>}
                    </div>
                    {u.name && <div className="admin-user-name">{u.name}</div>}
                  </td>
                  <td><PlanBadge plan={u.plan} /></td>
                  <td className="admin-credits">
                    {u.isAdmin
                      ? <span className="admin-unlimited">∞</span>
                      : `${u.credits_remaining} / ${u.credits_monthly_allowance}`}
                  </td>
                  <td className="admin-date">
                    {new Date(u.created_at).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'short', day: 'numeric'
                    })}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="admin-empty">No users found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
