import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../utils/api'
import './WeaknessPanel.css'

function WeaknessPanel({ onFocusPractice }) {
  const navigate = useNavigate()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.gamification.getWeaknessReport()
      .then(res => setReport(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return null

  // Not enough data yet
  if (!report || report.summary.totalCategories < 2) {
    return (
      <section className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">Focus Areas</h2>
        </div>
        <div className="empty-state-card">
          <p>Complete more practice sessions across different categories to see your weakness report.</p>
        </div>
      </section>
    )
  }

  const { weakCategories, top3Focus, strugglingQuestions, summary } = report

  // Only show categories with mastery < 80 (actual weaknesses)
  const displayCategories = weakCategories.filter(c => c.mastery < 80).slice(0, 5)

  if (displayCategories.length === 0 && strugglingQuestions.length === 0) {
    return (
      <section className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">Focus Areas</h2>
        </div>
        <div className="empty-state-card">
          <p>Great work! No major weaknesses detected. Keep practicing to stay sharp.</p>
        </div>
      </section>
    )
  }

  const getMasteryColor = (mastery) => {
    if (mastery < 40) return '#ef4444'
    if (mastery < 60) return '#f97316'
    if (mastery < 80) return '#eab308'
    return '#4ade80'
  }

  const getTrendIcon = (trend) => {
    if (trend === 'improving') return { icon: '\u2191', color: '#4ade80', label: 'improving' }
    if (trend === 'declining') return { icon: '\u2193', color: '#ef4444', label: 'declining' }
    if (trend === 'stable') return { icon: '\u2192', color: '#666', label: 'stable' }
    return { icon: '', color: '#444', label: 'new' }
  }

  return (
    <section className="dash-section">
      <div className="dash-section-header">
        <h2 className="dash-section-title">Focus Areas</h2>
        {top3Focus.length > 0 && (
          <button
            className="dash-section-action"
            onClick={() => navigate(`/focus-chat?skill=${encodeURIComponent(top3Focus[0])}`)}
          >
            Focus Practice &rarr;
          </button>
        )}
      </div>

      {/* Summary badges */}
      {(summary.weakCount > 0 || summary.staleCount > 0 || summary.decliningCount > 0) && (
        <div className="wp-summary">
          {summary.weakCount > 0 && (
            <span className="wp-badge wp-badge-weak">{summary.weakCount} weak</span>
          )}
          {summary.staleCount > 0 && (
            <span className="wp-badge wp-badge-stale">{summary.staleCount} stale</span>
          )}
          {summary.decliningCount > 0 && (
            <span className="wp-badge wp-badge-declining">{summary.decliningCount} declining</span>
          )}
        </div>
      )}

      {/* Weak categories list */}
      <div className="wp-categories">
        {displayCategories.map((cat, i) => {
          const color = getMasteryColor(cat.mastery)
          const trend = getTrendIcon(cat.trend)
          return (
            <div
              key={cat.category}
              className="wp-category-row wp-category-clickable"
              onClick={() => navigate(`/focus-chat?skill=${encodeURIComponent(cat.category)}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/focus-chat?skill=${encodeURIComponent(cat.category)}`)}
            >
              <span className="wp-rank">{i + 1}.</span>
              <div className="wp-category-info">
                <div className="wp-category-top">
                  <span className="wp-category-name">{cat.category}</span>
                  <div className="wp-category-tags">
                    {cat.isStale && <span className="wp-tag wp-tag-stale">STALE</span>}
                    {trend.icon && (
                      <span className="wp-trend" style={{ color: trend.color }} title={trend.label}>
                        {trend.icon}
                      </span>
                    )}
                  </div>
                </div>
                <div className="wp-bar-row">
                  <div className="wp-bar">
                    <div
                      className="wp-bar-fill"
                      style={{ width: `${cat.mastery}%`, background: color }}
                    />
                  </div>
                  <span className="wp-mastery" style={{ color }}>{cat.mastery}%</span>
                </div>
                <span className="wp-meta">{cat.totalAttempts} attempts &middot; avg {cat.avgScore}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Struggling questions */}
      {strugglingQuestions.length > 0 && (
        <div className="wp-struggling">
          <h3 className="wp-sub-title">Questions to Retry ({strugglingQuestions.length})</h3>
          <div className="wp-questions">
            {strugglingQuestions.slice(0, 5).map((q, i) => (
              <div key={i} className="wp-question-row">
                <span className="wp-q-text">
                  {q.questionText.length > 80
                    ? q.questionText.substring(0, 80) + '...'
                    : q.questionText}
                </span>
                <div className="wp-q-meta">
                  <span className="wp-q-category">{q.category}</span>
                  <span className="wp-q-score">Best: {q.bestScore}/100</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

export default WeaknessPanel
