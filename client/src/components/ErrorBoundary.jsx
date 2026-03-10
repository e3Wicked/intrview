import { Component } from 'react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '64px', textAlign: 'center', color: '#6b6b6b' }}>
          <h2 style={{ color: '#1a1a1a', marginBottom: '12px' }}>Something went wrong</h2>
          <p style={{ marginBottom: '24px' }}>An unexpected error occurred. Please try again.</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/dashboard' }}
            style={{
              padding: '10px 24px',
              background: '#1a1a1a',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Go to Dashboard
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
