import { useState, useEffect } from 'react'
import './LoadingOverlay.css'

function LoadingOverlay({ loading, progress }) {
  const [displayProgress, setDisplayProgress] = useState(0)

  useEffect(() => {
    if (loading) {
      // Simulate progress if not provided
      const interval = setInterval(() => {
        setDisplayProgress(prev => {
          if (prev >= 90) return prev
          return prev + Math.random() * 5
        })
      }, 500)
      return () => clearInterval(interval)
    } else {
      setDisplayProgress(0)
    }
  }, [loading])

  useEffect(() => {
    if (progress !== null && progress !== undefined) {
      setDisplayProgress(progress)
    }
  }, [progress])

  if (!loading) return null

  return (
    <div className="loading-overlay">
      <div className="loading-content">
        <div className="loading-spinner">
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
        </div>
        <h3 className="loading-title">Analyzing Job Description</h3>
        <div className="loading-progress">
          <div className="progress-bar-container">
            <div 
              className="progress-bar-fill" 
              style={{ width: `${Math.min(displayProgress, 100)}%` }}
            />
          </div>
          <span className="progress-text">{Math.round(Math.min(displayProgress, 100))}%</span>
        </div>
        <p className="loading-message">
          {displayProgress < 30 && 'Scraping job description...'}
          {displayProgress >= 30 && displayProgress < 60 && 'Extracting company information...'}
          {displayProgress >= 60 && displayProgress < 90 && 'Generating study plan...'}
          {displayProgress >= 90 && 'Finalizing...'}
        </p>
      </div>
    </div>
  )
}

export default LoadingOverlay

