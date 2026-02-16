import { useState } from 'react'
import './SignInPrompt.css'

function SignInPrompt({ onSignIn, onSignUp }) {
  return (
    <div className="sign-in-prompt">
      <div className="sign-in-prompt-content">
        <div className="sign-in-prompt-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
            <polyline points="10 17 15 12 10 7"></polyline>
            <line x1="15" y1="12" x2="3" y2="12"></line>
          </svg>
        </div>
        <h2 className="sign-in-prompt-title">Sign In Required</h2>
        <p className="sign-in-prompt-message">
          Please sign in to access your dashboard and start analyzing job postings.
        </p>
        <div className="sign-in-prompt-actions">
          <button 
            className="sign-in-prompt-btn primary"
            onClick={onSignIn}
          >
            Sign In
          </button>
          <button 
            className="sign-in-prompt-btn secondary"
            onClick={onSignUp}
          >
            Sign Up
          </button>
        </div>
      </div>
    </div>
  )
}

export default SignInPrompt


