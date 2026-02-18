import { useState, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import CompanyResearch from '../components/CompanyResearch'
import ContextHeader from '../components/ContextHeader'
import StudyPlan from '../components/StudyPlan'
import Practice from '../components/Practice'
import ProgressTracker from '../components/ProgressTracker'

function JobAnalysisPage({ result, companyName, progress }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const activeArea = searchParams.get('tab') || 'job'

  const setActiveArea = (area) => {
    setSearchParams({ tab: area })
  }

  // Normalize study plan structure - handle both nested and flat formats
  // API returns { studyPlan: { topics: [...] }, interviewQuestions: { stages: [...] } }
  // But it's stored under result.studyPlan, so topics could be at:
  //   result.studyPlan.studyPlan.topics (nested) or result.studyPlan.topics (flat)
  const studyPlanData = useMemo(() => {
    if (!result?.studyPlan) return null
    const sp = result.studyPlan
    return {
      // Topics can be nested (sp.studyPlan.topics) or flat (sp.topics)
      topics: sp.studyPlan?.topics || sp.topics || [],
      // Interview questions can be at top level or nested
      interviewQuestions: sp.interviewQuestions || sp.studyPlan?.interviewQuestions || null,
      // Summary
      summary: sp.summary || sp.studyPlan?.summary || null,
      // Pass through the full object for components that need it
      raw: sp
    }
  }, [result?.studyPlan])

  // Extract questions from the normalized data
  const questions = useMemo(() => {
    if (!studyPlanData?.interviewQuestions?.stages) return []
    try {
      return studyPlanData.interviewQuestions.stages.flatMap(stage =>
        (stage.questions || []).map(q => ({
          question: q.question,
          answer: q.answer,
          category: q.category
        }))
      )
    } catch (e) {
      console.error('Error extracting questions:', e)
      return []
    }
  }, [studyPlanData])

  if (!result) {
    return (
      <div style={{ padding: '64px', textAlign: 'center', color: '#888' }}>
        <p>No job analysis found. Please analyze a job posting first.</p>
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            marginTop: '16px', padding: '10px 20px', background: '#f59e0b',
            color: '#0a0a0a', border: 'none', borderRadius: '6px',
            fontFamily: "'Inconsolata', monospace", fontWeight: 600,
            cursor: 'pointer', fontSize: '14px'
          }}
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  const hasStudyPlan = studyPlanData && (studyPlanData.topics.length > 0 || studyPlanData.interviewQuestions)

  return (
    <div>
      {/* Back button */}
      <button
        className="job-back-button"
        onClick={() => navigate('/dashboard')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Back to Dashboard
      </button>

      <ContextHeader
        companyName={companyName}
        roleTitle={result.companyInfo?.roleTitle}
        progress={progress}
      />

      {/* Navigation Tabs */}
      <div className="context-header-tabs">
        <button
          className={`context-header-tab ${activeArea === 'job' ? 'active' : ''}`}
          onClick={() => setActiveArea('job')}
        >
          Job & Company
        </button>
        {hasStudyPlan && (
          <button
            className={`context-header-tab ${activeArea === 'study' ? 'active' : ''}`}
            onClick={() => setActiveArea('study')}
          >
            Study Plan
          </button>
        )}
        {hasStudyPlan && questions.length > 0 && (
          <button
            className={`context-header-tab ${activeArea === 'practice' ? 'active' : ''}`}
            onClick={() => setActiveArea('practice')}
          >
            Questions
          </button>
        )}
        {hasStudyPlan && (
          <button
            className={`context-header-tab ${activeArea === 'progress' ? 'active' : ''}`}
            onClick={() => setActiveArea('progress')}
          >
            Progress
          </button>
        )}
      </div>

      {activeArea === 'job' && result && (
        <div className="area-content">
          <CompanyResearch
            companyName={result.companyInfo?.name || companyName}
            jobDescription={result.jobDescription}
          />
        </div>
      )}

      {activeArea === 'study' && hasStudyPlan && (
        <div className="area-content">
          <StudyPlan
            studyPlan={studyPlanData.raw}
            topics={studyPlanData.topics}
            jobDescriptionHash={result.jobDescriptionHash || result.url}
          />
        </div>
      )}

      {activeArea === 'practice' && hasStudyPlan && questions.length > 0 && (
        <div className="area-content">
          <Practice
            questions={questions}
            jobDescription={result.jobDescription}
            companyName={companyName}
            roleTitle={result.companyInfo?.roleTitle || result.company?.roleTitle}
            techStack={result.companyInfo?.techStack || result.company?.techStack}
            jobDescriptionHash={result.jobDescriptionHash || result.url}
            studyTopics={studyPlanData.topics.map(t => typeof t === 'string' ? t : t.topic || t.name || '').filter(Boolean)}
          />
        </div>
      )}

      {activeArea === 'progress' && hasStudyPlan && (
        <div className="area-content">
          <ProgressTracker
            topics={studyPlanData.topics}
            studyPlan={result}
            jobDescriptionHash={result.jobDescriptionHash || result.url}
          />
        </div>
      )}
    </div>
  )
}

export default JobAnalysisPage
