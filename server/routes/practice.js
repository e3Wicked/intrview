import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';

const router = express.Router();

// ============================================================
// PROGRESS ENDPOINTS
// ============================================================

// Save progress (upsert - merges, not replaces)
router.post('/api/progress/save', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { jobDescriptionHash, topicsStudied, topicsCompleted, confidenceScores, flashcardProgress } = req.body;

    if (!jobDescriptionHash) {
      return res.status(400).json({ error: 'jobDescriptionHash is required' });
    }

    // Build dynamic upsert merging arrays and JSONB
    const result = await pool.query(`
      INSERT INTO user_progress (user_id, job_description_hash, topics_studied, topics_completed, confidence_scores, flashcard_progress, last_updated)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (user_id, job_description_hash) DO UPDATE SET
        topics_studied = CASE
          WHEN $3::text[] IS NOT NULL THEN (
            SELECT ARRAY(SELECT DISTINCT unnest FROM unnest(user_progress.topics_studied || $3::text[]))
          )
          ELSE user_progress.topics_studied
        END,
        topics_completed = CASE
          WHEN $4::text[] IS NOT NULL THEN (
            SELECT ARRAY(SELECT DISTINCT unnest FROM unnest(user_progress.topics_completed || $4::text[]))
          )
          ELSE user_progress.topics_completed
        END,
        confidence_scores = CASE
          WHEN $5::jsonb IS NOT NULL THEN user_progress.confidence_scores || $5::jsonb
          ELSE user_progress.confidence_scores
        END,
        flashcard_progress = CASE
          WHEN $6::jsonb IS NOT NULL THEN user_progress.flashcard_progress || $6::jsonb
          ELSE user_progress.flashcard_progress
        END,
        last_updated = NOW()
      RETURNING *
    `, [
      userId,
      jobDescriptionHash,
      topicsStudied || '{}',
      topicsCompleted || '{}',
      confidenceScores ? JSON.stringify(confidenceScores) : null,
      flashcardProgress ? JSON.stringify(flashcardProgress) : null,
    ]);

    res.json({ success: true, progress: result.rows[0] });
  } catch (error) {
    console.error('Error saving progress:', error);
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

// Get progress for a specific job
router.get('/api/progress/:jobHash', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { jobHash } = req.params;

    const result = await pool.query(
      'SELECT * FROM user_progress WHERE user_id = $1 AND job_description_hash = $2',
      [userId, jobHash]
    );

    if (result.rows.length === 0) {
      return res.json({
        topicsStudied: [],
        topicsCompleted: [],
        confidenceScores: {},
        flashcardProgress: {},
        lastUpdated: null,
      });
    }

    const row = result.rows[0];
    res.json({
      topicsStudied: row.topics_studied || [],
      topicsCompleted: row.topics_completed || [],
      confidenceScores: row.confidence_scores || {},
      flashcardProgress: row.flashcard_progress || {},
      lastUpdated: row.last_updated,
    });
  } catch (error) {
    console.error('Error getting progress:', error);
    res.status(500).json({ error: 'Failed to get progress' });
  }
});

// Get aggregated progress across all jobs
router.get('/api/progress/overall', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      'SELECT * FROM user_progress WHERE user_id = $1',
      [userId]
    );

    let totalTopicsStudied = 0;
    let totalTopicsCompleted = 0;
    let totalConfidence = 0;
    let confidenceCount = 0;

    const jobProgresses = result.rows.map(row => {
      totalTopicsStudied += (row.topics_studied || []).length;
      totalTopicsCompleted += (row.topics_completed || []).length;

      const scores = row.confidence_scores || {};
      for (const key of Object.keys(scores)) {
        if (scores[key]?.score) {
          totalConfidence += scores[key].score;
          confidenceCount++;
        }
      }

      return {
        jobDescriptionHash: row.job_description_hash,
        topicsStudied: row.topics_studied || [],
        topicsCompleted: row.topics_completed || [],
        confidenceScores: row.confidence_scores || {},
        flashcardProgress: row.flashcard_progress || {},
      };
    });

    res.json({
      totalTopicsStudied,
      totalTopicsCompleted,
      averageConfidence: confidenceCount > 0 ? Math.round((totalConfidence / confidenceCount) * 10) / 10 : 0,
      jobProgresses,
    });
  } catch (error) {
    console.error('Error getting overall progress:', error);
    res.status(500).json({ error: 'Failed to get overall progress' });
  }
});

// One-time migration from localStorage to server
router.post('/api/progress/migrate', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { localStorage: localData, jobDescriptionHash } = req.body;

    if (!localData || !jobDescriptionHash) {
      return res.status(400).json({ error: 'localStorage and jobDescriptionHash are required' });
    }

    const progressData = localData.interviewPrepperProgress ? JSON.parse(localData.interviewPrepperProgress) : {};
    const confidenceData = localData.interviewPrepperConfidence ? JSON.parse(localData.interviewPrepperConfidence) : {};

    await pool.query(`
      INSERT INTO user_progress (user_id, job_description_hash, topics_studied, topics_completed, confidence_scores, last_updated)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id, job_description_hash) DO UPDATE SET
        topics_studied = (
          SELECT ARRAY(SELECT DISTINCT unnest FROM unnest(user_progress.topics_studied || $3::text[]))
        ),
        topics_completed = (
          SELECT ARRAY(SELECT DISTINCT unnest FROM unnest(user_progress.topics_completed || $4::text[]))
        ),
        confidence_scores = user_progress.confidence_scores || $5::jsonb,
        last_updated = NOW()
    `, [
      userId,
      jobDescriptionHash,
      progressData.topicsStudied || '{}',
      progressData.topicsCompleted || '{}',
      JSON.stringify(confidenceData),
    ]);

    res.json({
      success: true,
      migrated: {
        topicsStudied: (progressData.topicsStudied || []).length,
        topicsCompleted: (progressData.topicsCompleted || []).length,
        confidenceScores: Object.keys(confidenceData).length,
      },
    });
  } catch (error) {
    console.error('Error migrating progress:', error);
    res.status(500).json({ error: 'Failed to migrate progress' });
  }
});

// ============================================================
// PRACTICE SESSION ENDPOINTS
// ============================================================

// Start a practice session
router.post('/api/practice/start-session', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { jobDescriptionHash, mode, skill } = req.body;

    if (!jobDescriptionHash && !skill) {
      return res.status(400).json({ error: 'jobDescriptionHash or skill is required' });
    }

    // Auto-end any previous active session for this user
    await pool.query(
      'UPDATE practice_sessions SET is_active = false, ended_at = NOW() WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    const result = await pool.query(`
      INSERT INTO practice_sessions (user_id, job_description_hash, mode, skill)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [userId, jobDescriptionHash || '', mode || 'quiz', skill || null]);

    res.json({
      sessionId: result.rows[0].id,
      startedAt: result.rows[0].started_at,
    });
  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

// End a practice session
router.post('/api/practice/end-session', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId, questionsAttempted } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    // If caller passes questionsAttempted directly (e.g. focus chat), use it.
    // Otherwise compute from question_attempts table (drills/quiz mode).
    let attempted = 0, correct = 0, avgScore = 0;

    if (questionsAttempted != null) {
      attempted = questionsAttempted;
    } else {
      const statsResult = await pool.query(`
        SELECT
          COUNT(*) as questions_attempted,
          COUNT(*) FILTER (WHERE score >= 70) as questions_correct,
          COALESCE(AVG(score) FILTER (WHERE score IS NOT NULL), 0) as average_score
        FROM question_attempts
        WHERE session_id = $1 AND user_id = $2
      `, [sessionId, userId]);
      const stats = statsResult.rows[0];
      attempted = parseInt(stats.questions_attempted);
      correct = parseInt(stats.questions_correct);
      avgScore = parseFloat(stats.average_score);
    }

    // Update session
    await pool.query(`
      UPDATE practice_sessions SET
        ended_at = NOW(),
        is_active = false,
        questions_attempted = $2,
        questions_correct = $3,
        average_score = $4
      WHERE id = $1 AND user_id = $5
    `, [
      sessionId,
      attempted,
      correct,
      avgScore,
      userId,
    ]);

    // Get updated session
    const sessionResult = await pool.query(
      'SELECT * FROM practice_sessions WHERE id = $1',
      [sessionId]
    );

    res.json({
      session: sessionResult.rows[0],
    });
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

// Get practice history
router.get('/api/practice/history', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const jobHash = req.query.jobHash;

    let query = `
      SELECT * FROM practice_sessions
      WHERE user_id = $1 AND ended_at IS NOT NULL
    `;
    const params = [userId];

    if (jobHash) {
      query += ' AND job_description_hash = $2';
      params.push(jobHash);
    }

    query += ' ORDER BY started_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const result = await pool.query(query, params);

    const countQuery = jobHash
      ? 'SELECT COUNT(*) FROM practice_sessions WHERE user_id = $1 AND ended_at IS NOT NULL AND job_description_hash = $2'
      : 'SELECT COUNT(*) FROM practice_sessions WHERE user_id = $1 AND ended_at IS NOT NULL';
    const countResult = await pool.query(countQuery, jobHash ? [userId, jobHash] : [userId]);

    res.json({
      sessions: result.rows,
      total: parseInt(countResult.rows[0].count),
    });
  } catch (error) {
    console.error('Error getting practice history:', error);
    res.status(500).json({ error: 'Failed to get practice history' });
  }
});

// Smart practice ordering - reorder questions by weakness
router.post('/api/practice/smart-order', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { jobDescriptionHash, questions } = req.body;

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'questions array is required' });
    }

    // Get all attempts for this user + job
    const attemptsResult = await pool.query(`
      SELECT question_text,
             AVG(score) as avg_score,
             COUNT(*) as attempt_count,
             MAX(created_at) as last_attempted
      FROM question_attempts
      WHERE user_id = $1 AND job_description_hash = $2
      GROUP BY question_text
    `, [userId, jobDescriptionHash]);

    const attemptMap = {};
    for (const row of attemptsResult.rows) {
      attemptMap[row.question_text] = {
        avgScore: parseFloat(row.avg_score) || 0,
        attemptCount: parseInt(row.attempt_count) || 0,
        lastAttempted: row.last_attempted,
      };
    }

    // Score each question for priority
    const now = new Date();
    const scored = questions.map(q => {
      const text = q.question || q;
      const attempt = attemptMap[text];

      let priority = 0;
      if (!attempt) {
        priority = 100; // Never attempted: highest
      } else if (attempt.avgScore < 50) {
        priority = 90; // Weak
      } else if (attempt.avgScore < 70) {
        priority = 70; // Moderate
      } else if (attempt.avgScore < 85) {
        priority = 40; // Decent
      } else {
        priority = 10; // Mastered
      }

      // Recency decay
      if (attempt?.lastAttempted) {
        const daysSince = (now - new Date(attempt.lastAttempted)) / (1000 * 60 * 60 * 24);
        if (daysSince > 7) priority += 30;
        else if (daysSince > 3) priority += 15;
      }

      return {
        ...q,
        _priority: priority,
        _attemptData: attempt || null,
        _status: !attempt ? 'new' : attempt.avgScore < 50 ? 'needs_work' : attempt.avgScore < 80 ? 'improving' : 'mastered',
      };
    });

    scored.sort((a, b) => b._priority - a._priority);

    res.json({ questions: scored });
  } catch (error) {
    console.error('Error getting smart order:', error);
    res.status(500).json({ error: 'Failed to get smart order' });
  }
});

// Record a flashcard attempt
router.post('/api/practice/flashcard-attempt', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { jobDescriptionHash, questionText, mark, sessionId } = req.body;

    // Insert attempt record
    await pool.query(`
      INSERT INTO question_attempts (user_id, job_description_hash, session_id, question_text, attempt_type, score)
      VALUES ($1, $2, $3::integer, $4, 'flashcard', $5)
    `, [userId, jobDescriptionHash, sessionId || null, questionText || '', mark === 'known' ? 100 : 0]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error recording flashcard attempt:', error);
    res.status(500).json({ error: 'Failed to record flashcard attempt' });
  }
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

export async function recordAttempt(userId, { jobDescriptionHash, sessionId, questionText, questionCategory, attemptType, userAnswer, score, evaluation }) {
  // Insert attempt (explicit casts on nullable params to avoid PG type inference errors)
  const attemptResult = await pool.query(`
    INSERT INTO question_attempts (user_id, job_description_hash, session_id, question_text, question_category, attempt_type, user_answer, score, evaluation)
    VALUES ($1, $2, $3::integer, $4, $5::varchar, $6, $7, $8::integer, $9::jsonb)
    RETURNING id
  `, [userId, jobDescriptionHash, sessionId || null, questionText, questionCategory || null, attemptType, userAnswer, score, JSON.stringify(evaluation)]);

  return {
    attemptId: attemptResult.rows[0].id,
  };
}

export default router;
