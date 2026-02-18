import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';
import {
  calculateXpForAttempt,
  getLevelForXp,
  getStreakMultiplier,
  ACHIEVEMENTS,
  DAILY_LOGIN_BONUS
} from '../utils/gamification.js';
import { checkAndUnlockAchievements } from '../utils/achievements.js';

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
    const { jobDescriptionHash, mode } = req.body;

    if (!jobDescriptionHash) {
      return res.status(400).json({ error: 'jobDescriptionHash is required' });
    }

    // Auto-end any previous active session for this user
    await pool.query(
      'UPDATE practice_sessions SET is_active = false, ended_at = NOW() WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    const result = await pool.query(`
      INSERT INTO practice_sessions (user_id, job_description_hash, mode)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [userId, jobDescriptionHash, mode || 'quiz']);

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
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    // Compute session stats from question_attempts
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as questions_attempted,
        COUNT(*) FILTER (WHERE score >= 70) as questions_correct,
        COALESCE(AVG(score) FILTER (WHERE score IS NOT NULL), 0) as average_score,
        COALESCE(SUM(xp_earned), 0) as total_xp_earned
      FROM question_attempts
      WHERE session_id = $1 AND user_id = $2
    `, [sessionId, userId]);

    const stats = statsResult.rows[0];

    // Update session
    await pool.query(`
      UPDATE practice_sessions SET
        ended_at = NOW(),
        is_active = false,
        questions_attempted = $2,
        questions_correct = $3,
        average_score = $4,
        total_xp_earned = $5
      WHERE id = $1 AND user_id = $6
    `, [
      sessionId,
      parseInt(stats.questions_attempted),
      parseInt(stats.questions_correct),
      parseFloat(stats.average_score),
      parseInt(stats.total_xp_earned),
      userId,
    ]);

    // Update streak
    const streakUpdate = await updateStreak(userId);

    // Check achievements
    const newAchievements = await checkAndUnlockAchievements(userId);

    // Award XP for newly unlocked achievements
    let achievementXp = 0;
    for (const ach of newAchievements) {
      achievementXp += ach.xpReward;
      await awardXp(userId, ach.xpReward, 'achievement', null, `Achievement: ${ach.name}`);
    }

    // Get updated session
    const sessionResult = await pool.query(
      'SELECT * FROM practice_sessions WHERE id = $1',
      [sessionId]
    );

    res.json({
      session: sessionResult.rows[0],
      xpEarned: parseInt(stats.total_xp_earned) + achievementXp,
      achievements: newAchievements,
      streakUpdate,
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

// ============================================================
// GAMIFICATION ENDPOINTS
// ============================================================

// Get full gamification stats
router.get('/api/gamification/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const [userRes, streakRes, achievementsRes, todayRes] = await Promise.all([
      pool.query('SELECT total_xp, current_level FROM users WHERE id = $1', [userId]),
      pool.query('SELECT * FROM user_streaks WHERE user_id = $1', [userId]),
      pool.query('SELECT * FROM user_achievements WHERE user_id = $1 ORDER BY unlocked_at DESC', [userId]),
      pool.query(`
        SELECT
          COUNT(*) as questions_answered,
          COALESCE(SUM(xp_earned), 0) as xp_earned
        FROM question_attempts
        WHERE user_id = $1 AND created_at >= CURRENT_DATE
      `, [userId]),
    ]);

    const totalXp = userRes.rows[0]?.total_xp || 0;
    const levelInfo = getLevelForXp(totalXp);
    const streak = streakRes.rows[0] || { current_streak: 0, longest_streak: 0, last_practice_date: null, streak_multiplier: 1.0 };

    const todaySessionsRes = await pool.query(
      'SELECT COUNT(*) as count FROM practice_sessions WHERE user_id = $1 AND started_at >= CURRENT_DATE AND ended_at IS NOT NULL',
      [userId]
    );

    // Map achievements with full info
    const earnedIds = new Set(achievementsRes.rows.map(r => r.achievement_id));
    const achievements = ACHIEVEMENTS.map(a => ({
      ...a,
      unlocked: earnedIds.has(a.id),
      unlockedAt: achievementsRes.rows.find(r => r.achievement_id === a.id)?.unlocked_at || null,
    }));

    res.json({
      totalXp,
      level: levelInfo.level,
      levelTitle: levelInfo.title,
      xpForCurrentLevel: levelInfo.xpForCurrentLevel,
      xpForNextLevel: levelInfo.xpForNextLevel,
      xpIntoLevel: levelInfo.xpIntoLevel,
      xpNeededForNext: levelInfo.xpNeededForNext,
      xpProgress: levelInfo.progressPercent,
      streak: {
        current: streak.current_streak,
        longest: streak.longest_streak,
        multiplier: parseFloat(streak.streak_multiplier) || 1.0,
        lastPracticeDate: streak.last_practice_date,
      },
      achievements,
      todayStats: {
        questionsAnswered: parseInt(todayRes.rows[0]?.questions_answered) || 0,
        xpEarned: parseInt(todayRes.rows[0]?.xp_earned) || 0,
        sessionsCompleted: parseInt(todaySessionsRes.rows[0]?.count) || 0,
      },
    });
  } catch (error) {
    console.error('Error getting gamification stats:', error);
    res.status(500).json({ error: 'Failed to get gamification stats' });
  }
});

// Get skill-level stats for dashboard heatmap
router.get('/api/gamification/skill-stats', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Aggregate question_attempts by category
    const skillsRes = await pool.query(`
      SELECT
        question_category,
        COUNT(*) as total_attempts,
        COUNT(DISTINCT question_text) as unique_questions,
        ROUND(AVG(score)::numeric, 1) as avg_score,
        COUNT(CASE WHEN score >= 70 THEN 1 END) as correct_count,
        MAX(created_at) as last_practiced
      FROM question_attempts
      WHERE user_id = $1 AND question_category IS NOT NULL AND question_category != ''
      GROUP BY question_category
      ORDER BY total_attempts DESC
    `, [userId]);

    const skills = skillsRes.rows.map(row => {
      const totalAttempts = parseInt(row.total_attempts) || 0;
      const correctCount = parseInt(row.correct_count) || 0;
      const avgScore = parseFloat(row.avg_score) || 0;
      const correctPercent = totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 100) : 0;
      // Mastery = correct % capped at avg_score if lower
      const mastery = Math.min(correctPercent, Math.round(avgScore));

      return {
        category: row.question_category,
        totalAttempts,
        uniqueQuestions: parseInt(row.unique_questions) || 0,
        avgScore,
        correctCount,
        mastery,
        lastPracticed: row.last_practiced,
      };
    });

    // Weekly stats: questions this week vs last week
    const weeklyRes = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE)) as this_week,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE) - interval '7 days' AND created_at < date_trunc('week', CURRENT_DATE)) as last_week
      FROM question_attempts
      WHERE user_id = $1
    `, [userId]);

    const thisWeek = parseInt(weeklyRes.rows[0]?.this_week) || 0;
    const lastWeek = parseInt(weeklyRes.rows[0]?.last_week) || 0;
    const changePercent = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : (thisWeek > 0 ? 100 : 0);

    res.json({
      skills,
      weeklyStats: {
        questionsThisWeek: thisWeek,
        questionsLastWeek: lastWeek,
        changePercent,
      },
    });
  } catch (error) {
    console.error('Error getting skill stats:', error);
    res.status(500).json({ error: 'Failed to get skill stats' });
  }
});

// Check and unlock achievements
router.post('/api/gamification/check-achievements', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const newAchievements = await checkAndUnlockAchievements(userId);

    let totalNewXp = 0;
    for (const ach of newAchievements) {
      totalNewXp += ach.xpReward;
      await awardXp(userId, ach.xpReward, 'achievement', null, `Achievement: ${ach.name}`);
    }

    res.json({
      newAchievements,
      totalNewXp,
    });
  } catch (error) {
    console.error('Error checking achievements:', error);
    res.status(500).json({ error: 'Failed to check achievements' });
  }
});

// Record a flashcard XP event
router.post('/api/practice/flashcard-xp', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { jobDescriptionHash, questionText, mark, sessionId } = req.body;

    const mode = mark === 'known' ? 'flashcard_known' : 'flashcard_practice';
    const streak = await getOrCreateStreak(userId);
    const isFirstToday = await isFirstPracticeToday(userId);
    const { xp } = calculateXpForAttempt(mode, 0, streak.current_streak, isFirstToday);

    // Insert attempt record
    await pool.query(`
      INSERT INTO question_attempts (user_id, job_description_hash, session_id, question_text, attempt_type, score, xp_earned)
      VALUES ($1, $2, $3, $4, 'flashcard', $5, $6)
    `, [userId, jobDescriptionHash, sessionId || null, questionText || '', mark === 'known' ? 100 : 0, xp]);

    await awardXp(userId, xp, 'flashcard', null, `Flashcard: ${mark}`);

    if (isFirstToday) {
      await updateStreak(userId);
    }

    const userRes = await pool.query('SELECT total_xp FROM users WHERE id = $1', [userId]);
    const totalXp = userRes.rows[0]?.total_xp || 0;
    const levelInfo = getLevelForXp(totalXp);

    res.json({ success: true, xpEarned: xp, totalXp, level: levelInfo.level, levelTitle: levelInfo.title });
  } catch (error) {
    console.error('Error recording flashcard XP:', error);
    res.status(500).json({ error: 'Failed to record flashcard XP' });
  }
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

async function getOrCreateStreak(userId) {
  const result = await pool.query('SELECT * FROM user_streaks WHERE user_id = $1', [userId]);
  if (result.rows.length > 0) return result.rows[0];

  const insert = await pool.query(
    'INSERT INTO user_streaks (user_id) VALUES ($1) RETURNING *',
    [userId]
  );
  return insert.rows[0];
}

async function isFirstPracticeToday(userId) {
  const result = await pool.query(`
    SELECT COUNT(*) as count FROM question_attempts
    WHERE user_id = $1 AND created_at >= CURRENT_DATE
  `, [userId]);
  return parseInt(result.rows[0].count) === 0;
}

async function updateStreak(userId) {
  const streak = await getOrCreateStreak(userId);
  const today = new Date().toISOString().split('T')[0];
  const lastDate = streak.last_practice_date;

  let newStreak = streak.current_streak;
  let isNewDay = false;

  if (!lastDate || lastDate.toISOString?.().split('T')[0] !== today) {
    isNewDay = true;
    if (lastDate) {
      const lastDateStr = typeof lastDate === 'string' ? lastDate : lastDate.toISOString().split('T')[0];
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (lastDateStr === yesterdayStr) {
        newStreak = streak.current_streak + 1;
      } else {
        newStreak = 1; // Streak broken
      }
    } else {
      newStreak = 1; // First ever practice
    }
  }

  const longestStreak = Math.max(newStreak, streak.longest_streak);
  const multiplier = getStreakMultiplier(newStreak);

  await pool.query(`
    UPDATE user_streaks SET
      current_streak = $2,
      longest_streak = $3,
      last_practice_date = $4,
      streak_multiplier = $5,
      updated_at = NOW()
    WHERE user_id = $1
  `, [userId, newStreak, longestStreak, today, multiplier]);

  return { currentStreak: newStreak, longestStreak, multiplier, isNewDay };
}

export async function awardXp(userId, amount, source, sourceId, description) {
  // Log XP
  await pool.query(
    'INSERT INTO user_xp_log (user_id, xp_amount, source, source_id, description) VALUES ($1, $2, $3, $4, $5)',
    [userId, amount, source, sourceId || null, description || null]
  );

  // Update user's total XP and level
  const result = await pool.query(
    'UPDATE users SET total_xp = total_xp + $2 RETURNING total_xp',
    [userId, amount]
  );

  const newTotalXp = result.rows[0].total_xp;
  const levelInfo = getLevelForXp(newTotalXp);

  await pool.query(
    'UPDATE users SET current_level = $2 WHERE id = $1',
    [userId, levelInfo.level]
  );

  return { totalXp: newTotalXp, level: levelInfo.level, title: levelInfo.title };
}

// Export helper for use in index.js quiz/voice evaluate modifications
export async function recordAttemptAndAwardXp(userId, { jobDescriptionHash, sessionId, questionText, questionCategory, attemptType, userAnswer, score, evaluation }) {
  const streak = await getOrCreateStreak(userId);
  const isFirstToday = await isFirstPracticeToday(userId);
  const { xp, base, scoreBonus, multiplier, dailyBonus } = calculateXpForAttempt(attemptType, score, streak.current_streak, isFirstToday);

  // Insert attempt
  const attemptResult = await pool.query(`
    INSERT INTO question_attempts (user_id, job_description_hash, session_id, question_text, question_category, attempt_type, user_answer, score, evaluation, xp_earned)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id
  `, [userId, jobDescriptionHash, sessionId || null, questionText, questionCategory || null, attemptType, userAnswer, score, JSON.stringify(evaluation), xp]);

  const attemptId = attemptResult.rows[0].id;

  // Award XP
  const { totalXp, level, title } = await awardXp(userId, xp, attemptType, attemptId, `${attemptType} answer: score ${score}`);

  // Update streak if first today
  if (isFirstToday) {
    await updateStreak(userId);
  }

  // Check previous level for level-up detection
  const prevLevelInfo = getLevelForXp(totalXp - xp);
  const levelUp = level > prevLevelInfo.level;

  // Check achievements
  const newAchievements = await checkAndUnlockAchievements(userId);
  let achievementXp = 0;
  for (const ach of newAchievements) {
    achievementXp += ach.xpReward;
    await awardXp(userId, ach.xpReward, 'achievement', null, `Achievement: ${ach.name}`);
  }

  return {
    attemptId,
    xpEarned: xp + achievementXp,
    xpBreakdown: { base, scoreBonus, multiplier, dailyBonus, achievementXp },
    totalXp: totalXp + achievementXp,
    level,
    levelTitle: title,
    levelUp,
    newAchievements,
  };
}

export default router;
