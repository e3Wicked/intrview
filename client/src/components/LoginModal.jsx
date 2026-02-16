import { useState } from 'react'
import axios from 'axios'
import './LoginModal.css'

function LoginModal({ isOpen, onClose, onSuccess, mode = 'signin' }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState('email') // 'email' or 'code' (only for signup)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleRequestCodeSignIn = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await axios.post('/api/auth/request-code', { email, isSignIn: true })
      if (response.data.success) {
        setStep('code')
        // In development, show the code in console
        if (response.data.code) {
          console.log('🔑 Verification code (dev mode):', response.data.code)
        }
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setError('No account found with this email. Please sign up first.')
      } else {
        setError(err.response?.data?.error || 'Failed to send verification code')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRequestCode = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await axios.post('/api/auth/request-code', { email, name })
      if (response.data.success) {
        setStep('code')
        // In development, show the code in console
        if (response.data.code) {
          console.log('🔑 Verification code (dev mode):', response.data.code)
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send verification code')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await axios.post('/api/auth/verify-code', { email, code, name })
      if (response.data.success) {
        onSuccess(response.data.user, response.data.sessionToken)
        onClose()
        // Clear form
        setEmail('')
        setName('')
        setCode('')
        setStep('email')
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid verification code')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setEmail('')
    setName('')
    setCode('')
    setStep('email')
    setError(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="login-modal-overlay" onClick={handleClose}>
      <div className="login-modal" onClick={(e) => e.stopPropagation()}>
        <button className="login-modal-close" onClick={handleClose}>×</button>
        
        <h2>{step === 'email' ? (mode === 'signup' ? 'Sign Up' : 'Sign In') : 'Enter Verification Code'}</h2>
        <p className="login-subtitle">
          {step === 'email' 
            ? (mode === 'signup' 
                ? 'Create an account - we\'ll send you a verification code'
                : 'Enter your email and we\'ll send you a verification code')
            : 'Enter the code we sent to your email'
          }
        </p>

        {error && <div className="login-error">{error}</div>}

        {step === 'email' ? (
          <form onSubmit={mode === 'signin' ? handleRequestCodeSignIn : handleRequestCode} className="login-form">
            <div className="login-input-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                disabled={loading}
                autoFocus
              />
            </div>

            {mode === 'signup' && (
              <div className="login-input-group">
                <label>Name <span style={{ color: '#666', fontWeight: 'normal' }}>(optional)</span></label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  disabled={loading}
                />
              </div>
            )}

            <button type="submit" className="login-button" disabled={loading || !email}>
              {loading ? 'Sending code...' : 'Send Code →'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="login-form">
            <p style={{ marginBottom: '20px', color: '#888', fontSize: '14px', textAlign: 'center' }}>
              We sent a 6-digit code to<br />
              <strong style={{ color: '#fff' }}>{email}</strong>
            </p>

            <div className="login-input-group">
              <label>Verification Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6)
                  setCode(value)
                }}
                placeholder="000000"
                required
                disabled={loading}
                maxLength={6}
                autoFocus
                style={{ 
                  textAlign: 'center', 
                  fontSize: '28px', 
                  letterSpacing: '12px',
                  fontFamily: 'monospace',
                  fontWeight: '600'
                }}
              />
            </div>

            <button 
              type="submit" 
              className="login-button" 
              disabled={loading || code.length !== 6}
            >
              {loading ? 'Verifying...' : 'Verify Code →'}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep('email')
                setCode('')
                setError(null)
              }}
              style={{ 
                marginTop: '16px', 
                background: 'none', 
                border: 'none', 
                color: '#888',
                cursor: 'pointer',
                fontSize: '14px',
                textDecoration: 'underline'
              }}
            >
              ← Change email or resend code
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default LoginModal
