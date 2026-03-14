import express from 'express';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db.js';
import {
  requireAuth,
  requireTrainingCredits,
  hasFeatureAccess,
  TRAINING_CREDIT_COSTS,
  deductTrainingCredits,
} from '../auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const VALID_ROUND_TYPES = [
  'comprehensive',
  'phone-screen',
  'role-specific',
  'situational',
  'behavioral',
];

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function synthesizeSpeech(text, voiceId) {
  const ttsResponse = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_flash_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );

  if (!ttsResponse.ok) {
    const errorBody = await ttsResponse.text().catch(() => 'unknown');
    throw new Error(`ElevenLabs TTS failed (${ttsResponse.status}): ${errorBody}`);
  }

  const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());
  return audioBuffer.toString('base64');
}

// Ensure the mock_interview tables exist
async function ensureMockInterviewTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mock_interview_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        job_description_hash VARCHAR(64) NOT NULL,
        job_title VARCHAR(255),
        company_name VARCHAR(255),
        round_type VARCHAR(50) NOT NULL,
        voice_id VARCHAR(255),
        questions JSONB NOT NULL,
        current_question_index INTEGER DEFAULT 0,
        scorecard JSONB,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS mock_interview_responses (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES mock_interview_sessions(id) ON DELETE CASCADE,
        question_index INTEGER NOT NULL,
        question_text TEXT NOT NULL,
        user_transcript TEXT,
        ai_response_text TEXT,
        score INTEGER,
        brief TEXT,
        is_follow_up BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure columns exist (migration may have created table with different schema)
    const alterStatements = [
      `ALTER TABLE mock_interview_responses ADD COLUMN IF NOT EXISTS user_transcript TEXT`,
      `ALTER TABLE mock_interview_responses ADD COLUMN IF NOT EXISTS ai_response_text TEXT`,
      `ALTER TABLE mock_interview_responses ADD COLUMN IF NOT EXISTS score INTEGER`,
      `ALTER TABLE mock_interview_responses ADD COLUMN IF NOT EXISTS brief TEXT`,
      `ALTER TABLE mock_interview_sessions ADD COLUMN IF NOT EXISTS overall_score INTEGER`,
    ];
    for (const stmt of alterStatements) {
      try { await pool.query(stmt); } catch (e) { /* column may already exist */ }
    }

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_mock_sessions_user ON mock_interview_sessions(user_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_mock_responses_session ON mock_interview_responses(session_id)
    `);

    console.log('mock_interview tables ensured');
  } catch (error) {
    console.error('Error ensuring mock_interview tables:', error.message);
  }
}

// Run on import
ensureMockInterviewTables();

// ---------------------------------------------------------------------------
// POST /start — Begin a new mock interview session
// ---------------------------------------------------------------------------
router.post(
  '/start',
  requireAuth,
  requireTrainingCredits('mockInterview'),
  async (req, res) => {
    try {
      const { jobDescriptionHash, roundType, voiceId } = req.body;

      if (!jobDescriptionHash || !roundType || !voiceId) {
        return res.status(400).json({
          error: 'jobDescriptionHash, roundType, and voiceId are required',
        });
      }

      if (!VALID_ROUND_TYPES.includes(roundType)) {
        return res.status(400).json({
          error: `Invalid roundType. Must be one of: ${VALID_ROUND_TYPES.join(', ')}`,
        });
      }

      // Check voicePractice feature access
      if (!hasFeatureAccess(req.user.plan, 'voicePractice', req.user.email)) {
        return res.status(403).json({
          error: 'Voice practice is not available on your current plan',
          upgradeRequired: true,
        });
      }

      // 1. Fetch study plan + job metadata
      const studyPlanResult = await pool.query(
        'SELECT * FROM study_plans WHERE job_description_hash = $1',
        [jobDescriptionHash]
      );

      if (studyPlanResult.rows.length === 0) {
        return res.status(400).json({
          error: "This job hasn't been fully analyzed yet.",
        });
      }

      const studyPlanRow = studyPlanResult.rows[0];
      const studyPlan =
        typeof studyPlanRow.study_plan === 'string'
          ? JSON.parse(studyPlanRow.study_plan)
          : studyPlanRow.study_plan;

      // Get job title & company from job_analyses (study_plans doesn't have them)
      const jobAnalysis = await pool.query(
        'SELECT role_title, company_name FROM job_analyses WHERE job_description_hash = $1 LIMIT 1',
        [jobDescriptionHash]
      );
      const jobRow = jobAnalysis.rows[0] || {};
      const jobTitle = jobRow.role_title || studyPlan.roleTitle || 'Unknown Role';
      const companyName = jobRow.company_name || studyPlan.companyName || 'Unknown Company';

      // 2. Fetch user topic scores
      const topicScoresResult = await pool.query(
        'SELECT * FROM user_topic_scores WHERE user_id = $1',
        [req.user.id]
      );
      const topicScores = topicScoresResult.rows;

      // 3. Fetch company research if available
      let companyResearch = null;
      try {
        const researchResult = await pool.query(
          `SELECT cr.* FROM company_research cr
           JOIN companies c ON c.id = cr.company_id
           WHERE c.normalized_name = LOWER(TRIM($1))
             AND cr.expires_at > NOW()`,
          [companyName]
        );
        if (researchResult.rows.length > 0) {
          const r = researchResult.rows[0];
          companyResearch = {
            culture: r.culture,
            techStack: r.tech_stack,
            values: r.values,
            recentNews: r.recent_news,
            interviewTips: r.interview_tips,
          };
        }
      } catch {
        // Non-critical — proceed without research
      }

      // 4. Build topic summary for the prompt
      const topicSummary = (studyPlan.topics || []).map((topic) => {
        const userScore = topicScores.find(
          (ts) =>
            ts.topic_name?.toLowerCase() === topic.name?.toLowerCase() ||
            ts.topic_id === topic.id
        );
        return {
          name: topic.name || topic,
          mastery: userScore ? userScore.score : 0,
          attempts: userScore ? userScore.attempts : 0,
        };
      });

      // 5. Generate questions via GPT-4o
      const openai = getOpenAIClient();

      const companyResearchBlock =
        companyResearch && ['phone-screen', 'behavioral', 'comprehensive'].includes(roundType)
          ? `\nCompany Research:\n- Culture: ${companyResearch.culture || 'N/A'}\n- Values: ${JSON.stringify(companyResearch.values || [])}\n- Tech Stack: ${JSON.stringify(companyResearch.techStack || [])}\n- Interview Tips: ${JSON.stringify(companyResearch.interviewTips || [])}`
          : '';

      const questionGenPrompt = `You are an expert interviewer preparing questions for a mock interview.

Job Title: ${jobTitle}
Company: ${companyName}
Round Type: ${roundType}
${companyResearchBlock}

Study Plan Topics with User Mastery Scores:
${topicSummary.map((t) => `- ${t.name}: mastery ${Math.round(t.mastery)}% (${t.attempts} attempts)`).join('\n')}

Instructions:
- Generate 8-12 conversational interview questions for a "${roundType.replace('-', ' ')}" round.
- Weight questions toward the user's weak areas (low mastery scores).
- For phone-screen rounds, focus on motivation, background, and culture fit.
- For behavioral rounds, use STAR-format questions about past experiences, teamwork, and leadership.
- For role-specific rounds, deep-dive into the core skills and knowledge required for the position.
- For situational rounds, present scenario-based questions testing problem-solving and decision-making.
- For comprehensive rounds, mix all of the above for a well-rounded interview.
- Adapt to the job type — these could be any kind of role (engineering, marketing, sales, design, operations, etc.).
- Make questions realistic and progressively more challenging.

Return a JSON array of question objects:
[{ "text": "...", "topic": "...", "type": "role-specific|behavioral|situational|screening" }]

Return ONLY the JSON array, no other text.`;

      const questionCompletion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You generate interview questions. Return only valid JSON.' },
          { role: 'user', content: questionGenPrompt },
        ],
        temperature: 0.8,
        max_tokens: 2000,
      });

      const questionsRaw = questionCompletion.choices[0].message.content.trim();
      let questions;
      try {
        const jsonMatch = questionsRaw.match(/\[[\s\S]*\]/);
        questions = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(questionsRaw);
      } catch {
        return res.status(500).json({ error: 'Failed to generate interview questions' });
      }

      if (!Array.isArray(questions) || questions.length === 0) {
        return res.status(500).json({ error: 'Failed to generate interview questions' });
      }

      // 6. Build opening text and synthesize speech
      const firstQuestion = questions[0].text;
      const openingText = `Hi there! Welcome to your ${roundType.replace('-', ' ')} interview for the ${jobTitle} role at ${companyName}. Let's get started. ${firstQuestion}`;

      // Deduct credits now that we're committed to the session
      await deductTrainingCredits(req.user.id, TRAINING_CREDIT_COSTS.mockInterview);

      const openingAudioBase64 = await synthesizeSpeech(openingText, voiceId);

      // 7. Create session
      const sessionResult = await pool.query(
        `INSERT INTO mock_interview_sessions
           (user_id, job_description_hash, job_title, company_name, round_type, voice_id, questions, current_question_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
         RETURNING id`,
        [
          req.user.id,
          jobDescriptionHash,
          jobTitle,
          companyName,
          roundType,
          voiceId,
          JSON.stringify(questions),
        ]
      );

      const sessionId = sessionResult.rows[0].id;

      res.json({
        sessionId,
        questionCount: questions.length,
        openingAudioBase64,
        openingText,
        firstQuestionText: firstQuestion,
      });
    } catch (error) {
      console.error('Error in POST /api/mock-interview/start:', error);
      res.status(500).json({
        error: error.message || 'Failed to start mock interview',
      });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /respond — Process a user's spoken answer and return AI response
// ---------------------------------------------------------------------------
router.post(
  '/respond',
  requireAuth,
  express.json({ limit: '10mb' }),
  async (req, res) => {
    let tempFilePath = null;
    try {
      const { sessionId, audioBase64 } = req.body;

      if (!sessionId || !audioBase64) {
        return res.status(400).json({ error: 'sessionId and audioBase64 are required' });
      }

      // 1. Load session and verify ownership
      const sessionResult = await pool.query(
        'SELECT * FROM mock_interview_sessions WHERE id = $1',
        [sessionId]
      );

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const session = sessionResult.rows[0];

      if (session.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (session.completed_at) {
        return res.status(400).json({ error: 'Session already completed' });
      }

      const questions =
        typeof session.questions === 'string'
          ? JSON.parse(session.questions)
          : session.questions;

      const currentIndex = session.current_question_index;
      const currentQuestion = questions[currentIndex];

      if (!currentQuestion) {
        return res.status(400).json({ error: 'No more questions in this session' });
      }

      // 2. Whisper transcription
      const openai = getOpenAIClient();
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      tempFilePath = path.join(__dirname, `../temp_mock_audio_${Date.now()}.webm`);
      fs.writeFileSync(tempFilePath, audioBuffer);

      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: 'whisper-1',
        language: 'en',
      });

      const transcript = transcription.text;

      // 3. Load conversation history for context
      const historyResult = await pool.query(
        `SELECT question_text, user_transcript, ai_response_text, is_follow_up
         FROM mock_interview_responses
         WHERE session_id = $1
         ORDER BY created_at ASC`,
        [sessionId]
      );

      const conversationHistory = historyResult.rows.map((r) => [
        { role: 'assistant', content: r.question_text },
        { role: 'user', content: r.user_transcript || '(no response)' },
        ...(r.ai_response_text
          ? [{ role: 'assistant', content: r.ai_response_text }]
          : []),
      ]).flat();

      // 4. Evaluate answer with GPT-4o-mini
      const isLastPregenerated = currentIndex >= questions.length - 1;

      const evalPrompt = `You are a real interviewer (not an AI) conducting a ${session.round_type.replace('-', ' ')} interview for the role of ${session.job_title} at ${session.company_name}.

Current question: "${currentQuestion.text}"
Candidate's answer: "${transcript}"

SCORING CALIBRATION — THIS IS CRITICAL:
The role is "${session.job_title}". Score relative to what a STRONG candidate for THIS EXACT role would say.
- 90-100: Exceptional — specific metrics, concrete examples, strategic depth, would impress any hiring manager
- 70-89: Good — solid answer with real examples and clear thinking
- 50-69: Mediocre — generic, surface-level, or missing key elements expected at this level
- 30-49: Weak — vague, no examples, no depth, clearly unprepared for this role level
- 0-29: Very poor — one sentence, irrelevant, or essentially a non-answer

For senior/director/VP roles: generic answers like "we prioritized and communicated with stakeholders" with no specifics should score 20-35. At this level, interviewers expect concrete examples, metrics, frameworks, and strategic thinking.
For junior roles: the same answer might score 45-55 since less depth is expected.

BE HARSH AND REALISTIC. Real interviewers don't give 60s for vague answers. A vague one-liner scores 15-30.

Evaluate the answer and decide whether to ask a follow-up or move on.

IMPORTANT for the "acknowledgment" field: Sound like a real human interviewer. Vary naturally. Examples:
- "Interesting, I like that approach."
- "Got it."
- "Right, makes sense."
- "" (empty — just move to next question)
Do NOT start with "Thank you for sharing..." or similar. Keep under 10 words.

Return ONLY valid JSON:
{
  "score": <0-100>,
  "brief": "<1-2 sentence evaluation>",
  "shouldFollowUp": <true|false>,
  "followUpQuestion": "<follow-up question text or null>",
  "acknowledgment": "<very brief, natural human acknowledgment — or empty string>"
}`;

      const evalMessages = [
        {
          role: 'system',
          content:
            'You are a real human interviewer — natural, conversational, never robotic. Vary your tone and transitions. Score HARSHLY and realistically — vague or generic answers score low. Return only valid JSON.',
        },
        ...conversationHistory,
        { role: 'assistant', content: currentQuestion.text },
        { role: 'user', content: transcript },
        { role: 'user', content: evalPrompt },
      ];

      const evalCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: evalMessages,
        temperature: 0.7,
        max_tokens: 500,
      });

      const evalRaw = evalCompletion.choices[0].message.content.trim();
      let evaluation;
      try {
        const jsonMatch = evalRaw.match(/\{[\s\S]*\}/);
        evaluation = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(evalRaw);
      } catch {
        evaluation = {
          score: 40,
          brief: 'Answer received.',
          shouldFollowUp: false,
          followUpQuestion: null,
          acknowledgment: "Got it.",
        };
      }

      // 5. Determine next response text
      const isFollowUp = evaluation.shouldFollowUp && evaluation.followUpQuestion;
      let responseText;
      let nextIndex = currentIndex;

      const ack = evaluation.acknowledgment ? evaluation.acknowledgment.trim() + ' ' : '';

      if (isFollowUp) {
        responseText = `${ack}${evaluation.followUpQuestion}`;
      } else if (!isLastPregenerated) {
        const nextQuestion = questions[currentIndex + 1];
        responseText = `${ack}${nextQuestion.text}`;
        nextIndex = currentIndex + 1;
      } else {
        responseText = `${ack}That wraps up all our questions. Great job!`;
        nextIndex = currentIndex + 1; // Past the last question
      }

      const isLastQuestion = nextIndex >= questions.length;

      // 6. Synthesize speech
      const responseAudioBase64 = await synthesizeSpeech(
        responseText,
        session.voice_id
      );

      // 7. Store response
      await pool.query(
        `INSERT INTO mock_interview_responses
           (session_id, question_index, question_text, user_transcript, ai_response_text, score, brief, is_follow_up)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          sessionId,
          currentIndex,
          currentQuestion.text,
          transcript,
          responseText,
          evaluation.score || 0,
          evaluation.brief || '',
          !!isFollowUp,
        ]
      );

      // 8. Update session question index
      if (!isFollowUp) {
        await pool.query(
          'UPDATE mock_interview_sessions SET current_question_index = $1 WHERE id = $2',
          [nextIndex, sessionId]
        );
      }

      // Clean up temp file
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }

      res.json({
        transcript,
        responseAudioBase64,
        responseText,
        turnEvaluation: {
          score: evaluation.score,
          brief: evaluation.brief,
        },
        isFollowUp: !!isFollowUp,
        isLastQuestion,
        questionProgress: `${Math.min(nextIndex + 1, questions.length)}/${questions.length}`,
      });
    } catch (error) {
      console.error('Error in POST /api/mock-interview/respond:', error);
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      res.status(500).json({
        error: error.message || 'Failed to process response',
      });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /end — End the session and generate a comprehensive scorecard
// ---------------------------------------------------------------------------
router.post('/end', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    // 1. Load session + responses, verify ownership
    const sessionResult = await pool.query(
      'SELECT * FROM mock_interview_sessions WHERE id = $1',
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];

    if (session.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (session.completed_at) {
      return res.json({ scorecard: session.scorecard });
    }

    const responsesResult = await pool.query(
      `SELECT * FROM mock_interview_responses
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    );

    const responses = responsesResult.rows;

    // 2. Build transcript for GPT-4o scorecard generation
    const transcriptSummary = responses
      .map(
        (r, i) =>
          `Q${i + 1} (${r.is_follow_up ? 'follow-up' : 'main'}): ${r.question_text}\nCandidate: ${r.user_transcript || '(no response)'}\nTurn Score: ${r.score}/100`
      )
      .join('\n\n');

    const openai = getOpenAIClient();

    const totalQuestions = Array.isArray(session.questions) ? session.questions.length : 0;
    const answeredCount = responses.filter(r => !r.is_follow_up).length;
    const completionPct = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 100;
    const endedEarly = completionPct < 70;

    const scorecardPrompt = `You are an expert interview coach generating a comprehensive scorecard for a completed mock interview.

Role: ${session.job_title} at ${session.company_name}
Round: ${session.round_type.replace('-', ' ')}
Questions answered: ${answeredCount} out of ${totalQuestions} planned (${completionPct}% completion)
${endedEarly ? `\nNOTE: The candidate ended the interview early. This MUST significantly lower the overall score. An incomplete interview cannot score above 50 regardless of answer quality — the ability to see an interview through matters. Mention this in the summary.` : ''}

SENIORITY-AWARE SCORING: The role is "${session.job_title}". Calibrate your scoring expectations to the seniority level:
- For senior/director/VP/C-level roles: expect strategic thinking, concrete metrics, leadership examples, industry depth. Generic or surface-level answers should score low (30-50).
- For mid-level roles: expect solid technical depth, clear examples, some leadership. Good but not exceptional answers score 60-70.
- For junior/entry-level roles: expect enthusiasm, willingness to learn, basic competency. Reasonable answers can score 70-80.
Score relative to what a strong candidate AT THIS LEVEL would say, not in absolute terms.

Full Transcript:
${transcriptSummary}

Generate a detailed scorecard. Return ONLY valid JSON:
{
  "overallScore": <0-100>,
  "summary": "<3-4 sentence overall assessment>",
  "communicationSkills": {
    "clarity": <0-100>,
    "confidence": <0-100>,
    "relevance": <0-100>,
    "structure": <0-100>
  },
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "improvements": ["<improvement 1>", "<improvement 2>", ...],
  "keyMoments": {
    "bestAnswer": { "questionIndex": <0-based index>, "highlight": "<why this was the strongest answer>" },
    "weakestAnswer": { "questionIndex": <0-based index>, "highlight": "<why this needed improvement>" }
  },
  "recommendations": ["<actionable recommendation 1>", "<recommendation 2>", ...],
  "questionResults": [
    {
      "question": "<question text>",
      "score": <0-100>,
      "feedback": "<specific feedback>",
      "transcript": "<candidate's answer>",
      "modelAnswer": "<A strong answer would include: ...>"
    }
  ]
}

Important:
- communicationSkills should assess clarity (how clear and articulate), confidence (how assured and decisive), relevance (how on-topic and focused), and structure (how well-organized the responses were).
- keyMoments.bestAnswer.questionIndex and keyMoments.weakestAnswer.questionIndex are 0-based indices into questionResults.
- modelAnswer for each question should describe what an excellent response would include for THIS seniority level, not a generic template.`;

    const scorecardCompletion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert interview coach. Generate fair, actionable scorecards. Return only valid JSON.',
        },
        { role: 'user', content: scorecardPrompt },
      ],
      temperature: 0.7,
      max_tokens: 5000,
    });

    const scorecardRaw = scorecardCompletion.choices[0].message.content.trim();
    let scorecard;
    try {
      const jsonMatch = scorecardRaw.match(/\{[\s\S]*\}/);
      scorecard = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(scorecardRaw);
    } catch {
      scorecard = {
        overallScore: Math.round(
          responses.reduce((sum, r) => sum + (r.score || 0), 0) / (responses.length || 1)
        ),
        summary: 'Interview completed. Detailed scoring unavailable.',
        strengths: [],
        improvements: [],
        recommendations: [],
        questionResults: responses.map((r) => ({
          question: r.question_text,
          score: r.score || 0,
          feedback: r.brief || '',
          transcript: r.user_transcript || '',
        })),
      };
    }

    // 3. Mark session completed and store scorecard
    await pool.query(
      `UPDATE mock_interview_sessions
       SET completed_at = CURRENT_TIMESTAMP, scorecard = $1
       WHERE id = $2`,
      [JSON.stringify(scorecard), sessionId]
    );

    res.json({ scorecard });
  } catch (error) {
    console.error('Error in POST /api/mock-interview/end:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate scorecard',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /history — List past mock interview sessions for the user
// ---------------------------------------------------------------------------
router.get('/history', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, job_title, company_name, round_type,
              scorecard->'overallScore' as overall_score,
              current_question_index as question_count,
              completed_at, started_at
       FROM mock_interview_sessions
       WHERE user_id = $1
       ORDER BY started_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error in GET /api/mock-interview/history:', error);
    res.status(500).json({ error: 'Failed to fetch interview history' });
  }
});

// ---------------------------------------------------------------------------
// GET /session/:id — Get full detail of a specific session
// ---------------------------------------------------------------------------
router.get('/session/:id', requireAuth, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);

    if (isNaN(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    const sessionResult = await pool.query(
      'SELECT * FROM mock_interview_sessions WHERE id = $1',
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];

    if (session.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const responsesResult = await pool.query(
      `SELECT * FROM mock_interview_responses
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    );

    res.json({
      ...session,
      responses: responsesResult.rows,
    });
  } catch (error) {
    console.error('Error in GET /api/mock-interview/session/:id:', error);
    res.status(500).json({ error: 'Failed to fetch session details' });
  }
});

export default router;
