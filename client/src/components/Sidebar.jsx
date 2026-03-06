import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import CreditBar from './CreditBar'
import './Sidebar.css'

function Sidebar({ user, onLogout, onUpgrade, isAdmin }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true'
  })
  const [studyExpanded, setStudyExpanded] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', collapsed)
  }, [collapsed])

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const isActive = (path) => location.pathname === path

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: 'grid' },
  ]

  const studyItems = [
    { path: '/focus-chat', label: 'Chat', icon: 'message' },
    { path: '/study/mock-interview', label: 'Mock Interview', icon: 'mic' },
    { path: '/study/drills', label: 'Drills', icon: 'zap' },
  ]

  const bottomItems = [
    { path: '/progress', label: 'Progress', icon: 'bar-chart' },
  ]

  const renderIcon = (name) => {
    switch (name) {
      case 'grid':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>
          </svg>
        )
      case 'message':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )
      case 'mic':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        )
      case 'zap':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        )
      case 'bar-chart':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>
          </svg>
        )
      case 'book':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
        )
      case 'chevron':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points={studyExpanded ? "6 9 12 15 18 9" : "9 18 15 12 9 6"}/>
          </svg>
        )
      default:
        return null
    }
  }

  const sidebarContent = (
    <>
      {/* Logo */}
      <button className="sidebar-logo" onClick={() => navigate('/dashboard')}>
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="6" fill="#fff"/>
          <path d="M16 8L20 14H22L18 20H14L10 14H12L16 8Z" fill="#0a0a0a"/>
          <path d="M16 24L12 18H10L14 12H18L22 18H20L16 24Z" fill="#0a0a0a"/>
        </svg>
        {!collapsed && <span className="sidebar-logo-text">intrview.io</span>}
      </button>

      {/* Main nav */}
      <nav className="sidebar-nav">
        {navItems.map(item => (
          <button
            key={item.path}
            className={`sidebar-nav-item ${isActive(item.path) ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
            title={collapsed ? item.label : undefined}
          >
            {renderIcon(item.icon)}
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}

        {/* Study With section */}
        <div className="sidebar-section">
          <button
            className="sidebar-section-header"
            onClick={() => !collapsed && setStudyExpanded(!studyExpanded)}
            title={collapsed ? 'Study With' : undefined}
          >
            {renderIcon('book')}
            {!collapsed && (
              <>
                <span>Study With</span>
                <span className="sidebar-section-chevron">{renderIcon('chevron')}</span>
              </>
            )}
          </button>
          {(studyExpanded || collapsed) && (
            <div className="sidebar-section-items">
              {studyItems.map(item => (
                <button
                  key={item.path}
                  className={`sidebar-nav-item sub-item ${isActive(item.path) ? 'active' : ''}`}
                  onClick={() => navigate(item.path)}
                  title={collapsed ? item.label : undefined}
                >
                  {renderIcon(item.icon)}
                  {!collapsed && <span>{item.label}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Bottom section */}
      <div className="sidebar-bottom">
        {bottomItems.map(item => (
          <button
            key={item.path}
            className={`sidebar-nav-item ${isActive(item.path) ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
            title={collapsed ? item.label : undefined}
          >
            {renderIcon(item.icon)}
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}

        {user && !collapsed && (
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">
              {user.email?.charAt(0).toUpperCase()}
            </div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-email">{user.email}</span>
            </div>
          </div>
        )}

        {user && !collapsed && (
          <div className="sidebar-credits">
            <CreditBar user={user} onUpgrade={onUpgrade} />
          </div>
        )}

        {user && collapsed && (
          <div className="sidebar-user collapsed-user" title={user.email}>
            <div className="sidebar-user-avatar">
              {user.email?.charAt(0).toUpperCase()}
            </div>
          </div>
        )}

        {user && !collapsed && (
          <div className="sidebar-actions">
            {isAdmin && (
              <button className="sidebar-action-btn" onClick={() => navigate('/admin')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                <span>Admin</span>
              </button>
            )}
            <button className="sidebar-action-btn" onClick={onUpgrade}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              <span>Upgrade</span>
            </button>
            <button className="sidebar-action-btn" onClick={onLogout}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span>Sign Out</span>
            </button>
          </div>
        )}

        {/* Collapse toggle at bottom */}
        <button
          className="sidebar-collapse-btn"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points={collapsed ? "9 18 15 12 9 6" : "15 18 9 12 15 6"}/>
          </svg>
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="sidebar-mobile-toggle"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {mobileOpen
            ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
            : <><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></>
          }
        </svg>
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        {sidebarContent}
      </aside>
    </>
  )
}

export default Sidebar
