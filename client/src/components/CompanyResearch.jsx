import { useState, useEffect } from 'react'
import axios from 'axios'
import './CompanyResearch.css'

function CompanyResearch({ companyName, jobDescription }) {
  const [research, setResearch] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (companyName && companyName !== 'Company' && companyName !== 'UNKNOWN') {
      fetchResearch()
    }
  }, [companyName])

  const fetchResearch = async () => {
    setLoading(true)
    setError(null)
    
    try {
      console.log('Fetching company research for:', companyName)
      console.log('Request URL will be: /api/company/research')
      
      const response = await axios.post('/api/company/research', {
        companyName,
        jobDescription: jobDescription || ''
      }, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        },
        validateStatus: function (status) {
          return status < 500; // Don't throw for 4xx errors
        }
      })
      
      console.log('Response status:', response.status)
      console.log('Response data:', response.data)
      
      if (response.status === 404) {
        throw new Error('API endpoint not found. Please check server logs.')
      }
      
      console.log('Company research response:', response.data)
      
      // Handle different response formats
      if (response.data.success) {
        // Check if research exists (could be in different formats)
        const researchData = response.data.research || response.data
        if (researchData && (researchData.recentNews || researchData.culture || researchData.techStack)) {
          setResearch(researchData)
          
          // If we have extracted funding rounds, notify parent to merge them
          if (response.data.extractedFundingRounds && response.data.extractedFundingRounds.length > 0) {
            // Trigger a custom event to merge funding rounds
            window.dispatchEvent(new CustomEvent('mergeFundingRounds', {
              detail: { fundingRounds: response.data.extractedFundingRounds }
            }))
          }
        } else {
          // If no research data but success, set empty research
          setResearch({
            recentNews: [],
            culture: null,
            techStack: [],
            teamSize: null,
            achievements: [],
            uniqueAspects: [],
            interviewTips: [],
            values: []
          })
        }
      } else {
        throw new Error(response.data.error || 'Invalid response format')
      }
    } catch (err) {
      console.error('Error fetching company research:', err)
      console.error('Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        statusText: err.response?.statusText
      })
      const errorMessage = err.response?.data?.error || err.message || 'Failed to load company research'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  if (!companyName || companyName === 'Company') {
    return null
  }

  if (loading) {
    return (
      <div className="company-research-container">
        <h2>Company Research</h2>
        <div className="research-loading">Loading research...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="company-research-container">
        <h2>Company Research</h2>
        <div className="research-error">{error}</div>
      </div>
    )
  }

  if (!research) {
    return null
  }

  return (
    <div className="company-research-container">
      <h2>Company Research</h2>
      
      {research.recentNews && research.recentNews.length > 0 && (
        <div className="research-section">
          <h3>📰 Recent News</h3>
          <ul className="research-list">
            {research.recentNews.map((news, idx) => (
              <li key={idx}>{news}</li>
            ))}
          </ul>
        </div>
      )}

      {research.culture && (
        <div className="research-section">
          <h3>🏢 Company Culture</h3>
          <p className="research-text">{research.culture}</p>
        </div>
      )}

      {research.techStack && research.techStack.length > 0 && (
        <div className="research-section">
          <h3>💻 Tech Stack</h3>
          <div className="tech-tags">
            {research.techStack.map((tech, idx) => (
              <span key={idx} className="tech-tag">{tech}</span>
            ))}
          </div>
        </div>
      )}

      {research.teamSize && (
        <div className="research-section">
          <h3>👥 Team Size</h3>
          <p className="research-text">{research.teamSize}</p>
        </div>
      )}

      {research.achievements && research.achievements.length > 0 && (
        <div className="research-section">
          <h3>🏆 Recent Achievements</h3>
          <ul className="research-list">
            {research.achievements.map((achievement, idx) => (
              <li key={idx}>{achievement}</li>
            ))}
          </ul>
        </div>
      )}

      {research.uniqueAspects && research.uniqueAspects.length > 0 && (
        <div className="research-section">
          <h3>✨ What Makes Them Unique</h3>
          <ul className="research-list">
            {research.uniqueAspects.map((aspect, idx) => (
              <li key={idx}>{aspect}</li>
            ))}
          </ul>
        </div>
      )}

      {research.values && research.values.length > 0 && (
        <div className="research-section">
          <h3>💎 Company Values</h3>
          <div className="values-list">
            {research.values.map((value, idx) => (
              <span key={idx} className="value-tag">{value}</span>
            ))}
          </div>
        </div>
      )}

      {research.interviewTips && research.interviewTips.length > 0 && (
        <div className="research-section">
          <h3>💡 Interview Tips</h3>
          <ul className="research-list tips">
            {research.interviewTips.map((tip, idx) => (
              <li key={idx}>{tip}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default CompanyResearch

