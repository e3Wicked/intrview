import { useState, useEffect } from 'react'
import axios from 'axios'
import './CompanyIntel.css'

function CompanyIntel({ analyses, studyPlans }) {
  const [companyData, setCompanyData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (analyses.length > 0) {
      loadCompanyData()
    }
  }, [analyses])

  const loadCompanyData = async () => {
    try {
      setLoading(true)
      const companyName = analyses[0].company_name
      const response = await axios.post('/api/company/research', {
        companyName,
        jobDescription: ''
      })
      
      if (response.data.success && response.data.research) {
        // Also fetch company info (founders, funding)
        let companyInfo = { founders: [], fundingRounds: [], description: null, founded: null }
        try {
          const companyInfoRes = await axios.get(`/api/company/info/${encodeURIComponent(companyName)}`)
          companyInfo = {
            founders: companyInfoRes.data?.founders || [],
            fundingRounds: companyInfoRes.data?.fundingRounds || [],
            description: companyInfoRes.data?.description,
            founded: companyInfoRes.data?.founded
          }
        } catch (e) {
          // Endpoint might not exist, use research data only
          console.log('Company info endpoint not available, using research data only')
        }
        setCompanyData({
          ...response.data.research,
          ...companyInfo
        })
      } else {
        setCompanyData({
          techStack: [],
          teamSize: null,
          values: [],
          founders: [],
          fundingRounds: []
        })
      }
    } catch (err) {
      console.error('Error loading company data:', err)
      setCompanyData({
        techStack: [],
        teamSize: null,
        values: [],
        founders: [],
        fundingRounds: []
      })
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="company-intel-loading">Loading company intelligence...</div>
  }

  if (!companyData) {
    return <div className="company-intel-empty">No company data available</div>
  }

  // Extract tech stack from study plans if not in research
  const techStack = companyData.techStack && companyData.techStack.length > 0
    ? companyData.techStack
    : (() => {
        const allTech = new Set()
        Object.values(studyPlans).forEach(plan => {
          if (plan.studyPlan?.topics) {
            plan.studyPlan.topics.forEach(topic => {
              // Extract tech names from topic titles
              const techKeywords = ['React', 'Python', 'AWS', 'Docker', 'Kubernetes', 'PostgreSQL', 'MongoDB', 'Node.js', 'TypeScript', 'JavaScript', 'GraphQL', 'Redis']
              techKeywords.forEach(tech => {
                if (topic.topic.toLowerCase().includes(tech.toLowerCase())) {
                  allTech.add(tech)
                }
              })
            })
          }
        })
        return Array.from(allTech)
      })()

  return (
    <div className="company-intel">
      <div className="intel-layout">
        {/* Left Column */}
        <div className="intel-left">
          <div className="intel-section">
            <h3 className="intel-section-title">Company Overview</h3>
            {companyData.description && (
              <p className="intel-description">{companyData.description}</p>
            )}
            {companyData.founded && (
              <div className="intel-meta">
                <span className="intel-label">Founded:</span>
                <span className="intel-value">{companyData.founded}</span>
              </div>
            )}
            {companyData.teamSize && (
              <div className="intel-meta">
                <span className="intel-label">Team Size:</span>
                <span className="intel-value">{companyData.teamSize}</span>
              </div>
            )}
          </div>

          {companyData.founders && companyData.founders.length > 0 && (
            <div className="intel-section">
              <h3 className="intel-section-title">Founders</h3>
              <div className="founders-list">
                {companyData.founders.map((founder, idx) => (
                  <div key={idx} className="founder-card">
                    <div className="founder-name">{founder.name}</div>
                    {founder.background && (
                      <div className="founder-background">{founder.background}</div>
                    )}
                    {founder.linkedin && (
                      <a href={founder.linkedin} target="_blank" rel="noopener noreferrer" className="founder-linkedin">
                        LinkedIn →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {companyData.fundingRounds && companyData.fundingRounds.length > 0 && (
            <div className="intel-section">
              <h3 className="intel-section-title">Funding Rounds</h3>
              <div className="funding-timeline">
                {companyData.fundingRounds.map((round, idx) => (
                  <div key={idx} className="funding-round">
                    <div className="round-header">
                      <span className="round-type">{round.type}</span>
                      {round.amount && (
                        <span className="round-amount">{round.amount}</span>
                      )}
                    </div>
                    {round.year && (
                      <div className="round-date">{round.month || ''} {round.year}</div>
                    )}
                    {round.leadInvestors && round.leadInvestors.length > 0 && (
                      <div className="round-investors">
                        Lead: {round.leadInvestors.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {companyData.values && companyData.values.length > 0 && (
            <div className="intel-section">
              <h3 className="intel-section-title">Values & Mission</h3>
              <div className="values-list">
                {companyData.values.map((value, idx) => (
                  <div key={idx} className="value-tag">{value}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="intel-right">
          <div className="intel-section">
            <h3 className="intel-section-title">Tech Stack</h3>
            {techStack.length > 0 ? (
              <div className="tech-stack-grid">
                {techStack.map((tech, idx) => (
                  <div key={idx} className="tech-badge">
                    {tech}
                  </div>
                ))}
              </div>
            ) : (
              <p className="intel-empty">Tech stack information not available</p>
            )}
          </div>

          <div className="intel-section">
            <h3 className="intel-section-title">Interview Focus Areas</h3>
            <div className="focus-areas">
              {companyData.interviewTips && companyData.interviewTips.length > 0 ? (
                companyData.interviewTips.map((tip, idx) => (
                  <div key={idx} className="focus-area-item">
                    {tip}
                  </div>
                ))
              ) : (
                <p className="intel-empty">Focus areas will be determined from job description</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CompanyIntel

