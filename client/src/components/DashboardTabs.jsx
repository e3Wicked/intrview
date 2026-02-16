import './DashboardTabs.css'

function DashboardTabs({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'study-plans', label: 'My Study Plans' },
    { id: 'progress', label: 'Progress' }
  ]
  
  return (
    <div className="dashboard-tabs">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`dashboard-tab ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export default DashboardTabs


