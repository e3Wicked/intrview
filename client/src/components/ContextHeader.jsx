import './ContextHeader.css'

function ContextHeader({ companyName, roleTitle, progress }) {
  if (!companyName && !roleTitle && !progress) {
    return null
  }

  return (
    <div className="context-header">
      <div className="context-info">
        {companyName && (
          <div className="context-item">
            <span className="context-label">Company:</span>
            <span className="context-value">{companyName}</span>
          </div>
        )}
        {roleTitle && (
          <div className="context-item">
            <span className="context-label">Role:</span>
            <span className="context-value">{roleTitle}</span>
          </div>
        )}
      </div>
      {progress !== null && (
        <div className="context-progress">
          <span className="context-label">Progress:</span>
          <div className="progress-bar-mini">
            <div 
              className="progress-fill-mini" 
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="context-value">{Math.round(progress)}%</span>
        </div>
      )}
    </div>
  )
}

export default ContextHeader

