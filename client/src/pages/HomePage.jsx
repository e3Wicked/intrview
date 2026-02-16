import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import EmptyState from '../components/EmptyState'

function HomePage({ url, setUrl, handleSubmit, loading, user, onSelectPlan, onLoadExample }) {
  const navigate = useNavigate()

  // Redirect logged-in users immediately
  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true })
    }
  }, [user, navigate])

  // Also check session token on mount
  useEffect(() => {
    const sessionToken = localStorage.getItem('session_token')
    if (sessionToken && !user) {
      // User might be logged in but state not loaded yet - redirect anyway
      // The App component will handle setting the user state
      navigate('/dashboard', { replace: true })
    }
  }, [])

  if (user) {
    return null // Don't render anything while redirecting
  }

  return (
    <EmptyState 
      url={url}
      setUrl={setUrl}
      handleSubmit={handleSubmit}
      loading={loading}
      user={user}
      onSelectPlan={onSelectPlan} 
      onLoadExample={onLoadExample}
    />
  )
}

export default HomePage

