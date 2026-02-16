import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import CompanyResearch from '../components/CompanyResearch'
import ContextHeader from '../components/ContextHeader'
import StudyPlan from '../components/StudyPlan'
import Practice from '../components/Practice'
import ProgressTracker from '../components/ProgressTracker'

function JobAnalysisPage({ result, companyName, progress }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeArea = searchParams.get('tab') || 'job'

  const setActiveArea = (area) => {
    setSearchParams({ tab: area })
  }

  if (!result) {
    return (
      <div style={{ padding: '64px', textAlign: 'center', color: '#888' }}>
        <p>No job analysis found. Please analyze a job posting first.</p>
      </div>
    )
  }

  return (
    <div>
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
        {result.studyPlan && (
          <button
            className={`context-header-tab ${activeArea === 'study' ? 'active' : ''}`}
            onClick={() => setActiveArea('study')}
          >
            Study Plan
          </button>
        )}
        {result.studyPlan && (
          <button
            className={`context-header-tab ${activeArea === 'practice' ? 'active' : ''} ${!result.studyPlan ? 'disabled' : ''}`}
            onClick={() => result.studyPlan && setActiveArea('practice')}
            disabled={!result.studyPlan}
          >
            Questions
          </button>
        )}
        {result.studyPlan && (
          <button
            className={`context-header-tab ${activeArea === 'progress' ? 'active' : ''} ${!result.studyPlan ? 'disabled' : ''}`}
            onClick={() => result.studyPlan && setActiveArea('progress')}
            disabled={!result.studyPlan}
          >
            Progress
          </button>
        )}
      </div>

      {activeArea === 'job' && result && (
        <div className="area-content">
          <CompanyResearch companyInfo={result.companyInfo} />
        </div>
      )}

      {activeArea === 'study' && result.studyPlan && (
        <div className="area-content">
          <StudyPlan studyPlan={result.studyPlan} jobDescriptionHash={result.jobDescriptionHash || result.url} />
        </div>
      )}

      {activeArea === 'practice' && result.studyPlan && (
        <div className="area-content">
          <Practice 
            questions={result.studyPlan.interviewQuestions.stages.flatMap(stage => 
              stage.questions.map(q => ({
                question: q.question,
                answer: q.answer,
                category: q.category
              }))
            )}
            jobDescription={result.jobDescription}
            companyName={companyName}
            roleTitle={result.companyInfo?.roleTitle || result.company?.roleTitle}
            techStack={result.companyInfo?.techStack || result.company?.techStack}
            jobDescriptionHash={result.jobDescriptionHash || result.url}
          />
        </div>
      )}

      {activeArea === 'progress' && result.studyPlan && (
        <div className="area-content">
          <ProgressTracker
            topics={result.studyPlan.topics}
            studyPlan={result}
            jobDescriptionHash={result.jobDescriptionHash || result.url}
          />
        </div>
      )}
    </div>
  )
}

export default JobAnalysisPage
