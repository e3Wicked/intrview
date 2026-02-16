import { useState, useEffect } from 'react';
import axios from 'axios';
import './AdminDashboard.css';
import DashboardTabs from './DashboardTabs';
import ProgressTracker from './ProgressTracker';

function ProgressView({ analyses, studyPlans, loadStudyPlan }) {
  const [loadedPlans, setLoadedPlans] = useState({});

  useEffect(() => {
    const loadAllPlans = async () => {
      const plans = {};
      for (const analysis of analyses) {
        if (!loadedPlans[analysis.job_description_hash]) {
          const plan = await loadStudyPlan(analysis);
          if (plan) {
            plans[analysis.job_description_hash] = plan;
          }
        }
      }
      if (Object.keys(plans).length > 0) {
        setLoadedPlans(prev => ({ ...prev, ...plans }));
      }
    };
    loadAllPlans();
  }, [analyses]);

  if (analyses.length === 0) {
    return (
      <div className="dashboard-progress">
        <h2>Your Progress</h2>
        <div className="admin-empty">No analyses yet. Start by analyzing a job posting!</div>
      </div>
    );
  }

  return (
    <div className="dashboard-progress">
      <h2>Your Progress</h2>
      <div className="progress-list">
        {analyses.map((analysis) => {
          const studyPlan = loadedPlans[analysis.job_description_hash] || studyPlans[analysis.job_description_hash];
          if (!studyPlan?.studyPlan?.topics) {
            return (
              <div key={analysis.id} className="progress-item">
                <h3 className="progress-item-title">
                  {analysis.company_name} - {analysis.role_title}
                </h3>
                <div className="progress-item-url">
                  <a href={analysis.url} target="_blank" rel="noopener noreferrer">
                    {analysis.url}
                  </a>
                </div>
                <div className="admin-empty">No progress data available yet.</div>
              </div>
            );
          }
          
          return (
            <div key={analysis.id} className="progress-item">
              <h3 className="progress-item-title">
                {analysis.company_name} - {analysis.role_title}
              </h3>
              <div className="progress-item-url">
                <a href={analysis.url} target="_blank" rel="noopener noreferrer">
                  {analysis.url}
                </a>
              </div>
              <ProgressTracker
                topics={studyPlan.studyPlan.topics}
                studyPlan={studyPlan}
                jobDescriptionHash={analysis.job_description_hash}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UserDashboard({ onSelectAnalysis, onClose, showAnalyzeButton = true }) {
  const [stats, setStats] = useState(null);
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [studyPlans, setStudyPlans] = useState({}); // Cache study plans for progress view

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsRes, analysesRes] = await Promise.all([
        axios.get('/api/user/stats'),
        axios.get('/api/user/analyses?limit=100')
      ]);
      setStats(statsRes.data);
      setAnalyses(analysesRes.data);
      setError(null);
    } catch (err) {
      console.error('Error loading user data:', err);
      setError(err.response?.data?.error || 'Failed to load your data');
    } finally {
      setLoading(false);
    }
  };

  const loadStudyPlan = async (analysis) => {
    if (studyPlans[analysis.job_description_hash]) {
      return studyPlans[analysis.job_description_hash];
    }
    try {
      const studyPlanRes = await axios.get(`/api/user/study-plan/${analysis.job_description_hash}`);
      const studyPlan = studyPlanRes.data;
      setStudyPlans(prev => ({
        ...prev,
        [analysis.job_description_hash]: studyPlan
      }));
      return studyPlan;
    } catch (err) {
      console.error('Error loading study plan:', err);
      return null;
    }
  };

  const handleLoadStudyPlan = async (analysis) => {
    const studyPlan = await loadStudyPlan(analysis);
    if (!studyPlan) {
      alert('Failed to load study plan: ' + (err.response?.data?.error || 'Unknown error'));
      return;
    }
    
    // Construct a result object similar to what /api/analyze returns
    const result = {
      success: true,
      jobDescription: '', // We don't store the full JD, but we have the hash
      companyInfo: {
        name: analysis.company_name || 'Company',
        roleTitle: analysis.role_title || null,
        logo: null,
        logoUrl: null
      },
      studyPlan: studyPlan,
      url: analysis.url
    };
    
    if (onSelectAnalysis) {
      onSelectAnalysis(result);
    }
  };

  // Group analyses by company
  const groupedAnalyses = analyses.reduce((acc, analysis) => {
    const company = analysis.company_name || 'Unknown Company';
    if (!acc[company]) {
      acc[company] = [];
    }
    acc[company].push(analysis);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="admin-loading">Loading your dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-dashboard">
        <div className="admin-error">
          <p>Error: {error}</p>
          <button onClick={loadData}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1>My Dashboard</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="admin-refresh-btn" onClick={loadData}>
            Refresh
          </button>
          {onClose && (
            <button 
              className="admin-refresh-btn" 
              onClick={onClose}
              style={{ background: '#2a2a2a' }}
            >
              Back to Home
            </button>
          )}
        </div>
      </div>

      <DashboardTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'overview' && (
        <>
          {stats && (
            <div className="admin-stats">
              <div className="stat-card">
                <div className="stat-value">{stats.total_analyses || 0}</div>
                <div className="stat-label">Job Posts Analyzed</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.unique_study_plans || 0}</div>
                <div className="stat-label">Study Plans</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.unique_companies || 0}</div>
                <div className="stat-label">Companies</div>
              </div>
            </div>
          )}

          <div className="admin-analyses">
            <h2>Recent Job Analyses</h2>
            {analyses.length === 0 ? (
              <div className="admin-empty">
                <p style={{ marginBottom: '16px' }}>No analyses yet. Use the form above to analyze your first job posting!</p>
              </div>
            ) : (
              <div className="analyses-list">
                {analyses.slice(0, 5).map((analysis) => (
                  <div key={analysis.id} className="analysis-card">
                    <div className="analysis-header">
                      <div className="analysis-company">
                        {analysis.company_name || 'Unknown Company'}
                      </div>
                      {analysis.role_title && (
                        <div className="analysis-role">{analysis.role_title}</div>
                      )}
                    </div>
                    <div className="analysis-url">
                      <a href={analysis.url} target="_blank" rel="noopener noreferrer">
                        {analysis.url.length > 60 ? analysis.url.substring(0, 60) + '...' : analysis.url}
                      </a>
                    </div>
                    <div className="analysis-meta">
                      <span className="analysis-date">
                        {new Date(analysis.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <button
                      className="analysis-load-btn"
                      onClick={() => handleLoadStudyPlan(analysis)}
                      disabled={!analysis.study_plan_created_at}
                    >
                      {analysis.study_plan_created_at ? 'View Study Plan' : 'No Study Plan'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'study-plans' && (
        <div className="admin-analyses">
          <h2>Your Job Analyses ({analyses.length})</h2>
          {analyses.length === 0 ? (
            <div className="admin-empty">No analyses yet.</div>
          ) : (
            <div className="analyses-list-grouped">
              {Object.entries(groupedAnalyses).map(([company, companyAnalyses]) => (
                <div key={company} className="company-group">
                  <h3 className="company-group-header">
                    {company} ({companyAnalyses.length} {companyAnalyses.length === 1 ? 'role' : 'roles'})
                  </h3>
                  <div className="analyses-list">
                    {companyAnalyses.map((analysis) => (
                      <div key={analysis.id} className="analysis-card">
                        <div className="analysis-header">
                          {analysis.role_title && (
                            <div className="analysis-role">{analysis.role_title}</div>
                          )}
                        </div>
                        <div className="analysis-url">
                          <a href={analysis.url} target="_blank" rel="noopener noreferrer">
                            {analysis.url.length > 60 ? analysis.url.substring(0, 60) + '...' : analysis.url}
                          </a>
                        </div>
                        <div className="analysis-meta">
                          <span className="analysis-date">
                            {new Date(analysis.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <button
                          className="analysis-load-btn"
                          onClick={() => handleLoadStudyPlan(analysis)}
                          disabled={!analysis.study_plan_created_at}
                        >
                          {analysis.study_plan_created_at ? 'View Study Plan' : 'No Study Plan'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'progress' && (
        <ProgressView analyses={analyses} studyPlans={studyPlans} loadStudyPlan={loadStudyPlan} />
      )}
    </div>
  );
}

export default UserDashboard;

