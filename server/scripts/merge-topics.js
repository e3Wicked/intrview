import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, normalizeTopicName } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const COMPANY_TOPIC_PATTERNS = [
  /\b(culture\s*(and|&)\s*values|company\s*(fit|culture)|corporate\s*values|mission\s*(and|&)\s*values)\b/i,
];

function isCompanySpecificTopic(topicName) {
  const lower = topicName.toLowerCase();
  return COMPANY_TOPIC_PATTERNS.some(p => p.test(lower));
}

async function mergeTopics() {
  console.log('Loading all topics...');
  const { rows: allTopics } = await pool.query('SELECT * FROM topics ORDER BY id');
  console.log(`Found ${allTopics.length} topics`);

  // Group by new normalized name
  const groups = new Map();
  for (const topic of allTopics) {
    const newNorm = normalizeTopicName(topic.name);
    if (!groups.has(newNorm)) groups.set(newNorm, []);
    groups.get(newNorm).push(topic);
  }

  let mergedCount = 0;
  let markedNotDrillable = 0;

  for (const [normName, topics] of groups) {
    // Mark company-specific topics as not drillable
    for (const topic of topics) {
      if (isCompanySpecificTopic(topic.name) && topic.is_drillable !== false) {
        await pool.query('UPDATE topics SET is_drillable = FALSE WHERE id = $1', [topic.id]);
        console.log(`  Marked not drillable: "${topic.name}"`);
        markedNotDrillable++;
      }
    }

    if (topics.length <= 1) {
      // Update normalized_name if it changed
      const topic = topics[0];
      if (topic.normalized_name !== normName) {
        await pool.query('UPDATE topics SET normalized_name = $1 WHERE id = $2', [normName, topic.id]);
        console.log(`  Updated normalized name: "${topic.normalized_name}" -> "${normName}"`);
      }
      continue;
    }

    // Find canonical topic (most job_topics links)
    let canonical = topics[0];
    let maxLinks = 0;
    for (const topic of topics) {
      const { rows } = await pool.query('SELECT COUNT(*) as cnt FROM job_topics WHERE topic_id = $1', [topic.id]);
      const cnt = parseInt(rows[0].cnt);
      if (cnt > maxLinks) {
        maxLinks = cnt;
        canonical = topic;
      }
    }

    console.log(`\nMerging group "${normName}" (${topics.length} topics) -> canonical: "${canonical.name}" (id=${canonical.id})`);

    // Update canonical's normalized_name
    await pool.query('UPDATE topics SET normalized_name = $1 WHERE id = $2', [normName, canonical.id]);

    const duplicates = topics.filter(t => t.id !== canonical.id);
    for (const dup of duplicates) {
      console.log(`  Merging duplicate: "${dup.name}" (id=${dup.id}) into canonical id=${canonical.id}`);

      // Reassign job_topics (skip conflicts)
      await pool.query(
        `UPDATE job_topics SET topic_id = $1 WHERE topic_id = $2
         AND NOT EXISTS (SELECT 1 FROM job_topics jt2 WHERE jt2.topic_id = $1 AND jt2.job_description_hash = job_topics.job_description_hash)`,
        [canonical.id, dup.id]
      );
      // Delete remaining conflicting job_topics
      await pool.query('DELETE FROM job_topics WHERE topic_id = $1', [dup.id]);

      // Reassign user_topic_scores: merge by keeping the one with more attempts
      const { rows: dupScores } = await pool.query('SELECT * FROM user_topic_scores WHERE topic_id = $1', [dup.id]);
      for (const ds of dupScores) {
        const { rows: existing } = await pool.query(
          'SELECT * FROM user_topic_scores WHERE user_id = $1 AND topic_id = $2',
          [ds.user_id, canonical.id]
        );
        if (existing.length > 0) {
          const es = existing[0];
          // Merge: combine attempts and weighted average scores
          const totalAttempts = es.attempts + ds.attempts;
          const mergedScore = totalAttempts > 0 ? (es.score * es.attempts + ds.score * ds.attempts) / totalAttempts : 0;
          const mergedCorrect = es.correct_count + ds.correct_count;
          const latestPracticed = es.last_practiced_at > ds.last_practiced_at ? es.last_practiced_at : ds.last_practiced_at;
          await pool.query(
            `UPDATE user_topic_scores SET score = $1, attempts = $2, correct_count = $3, last_practiced_at = $4, updated_at = NOW()
             WHERE user_id = $5 AND topic_id = $6`,
            [mergedScore, totalAttempts, mergedCorrect, latestPracticed, ds.user_id, canonical.id]
          );
        } else {
          await pool.query(
            'UPDATE user_topic_scores SET topic_id = $1 WHERE user_id = $2 AND topic_id = $3',
            [canonical.id, ds.user_id, dup.id]
          );
        }
      }
      // Clean up any remaining dup scores
      await pool.query('DELETE FROM user_topic_scores WHERE topic_id = $1', [dup.id]);

      // Reassign drill_sessions
      await pool.query('UPDATE drill_sessions SET topic_id = $1 WHERE topic_id = $2', [canonical.id, dup.id]);

      // Delete the duplicate topic
      await pool.query('DELETE FROM topics WHERE id = $1', [dup.id]);
      mergedCount++;
    }
  }

  console.log(`\nDone! Merged ${mergedCount} duplicate topics, marked ${markedNotDrillable} as not drillable.`);
  await pool.end();
}

mergeTopics().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
