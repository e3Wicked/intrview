---
name: ai-integration
description: Apply this skill when adding, modifying, or reviewing any OpenAI API call in intrview.io. Use when the user asks to add AI-generated content, a new analysis feature, a chat endpoint, or when touching server code that calls OpenAI. Ensures caching, streaming, cost control, and error handling are all correct.
version: 1.0.0
---

# AI Integration Patterns for intrview.io

Every OpenAI call in intrview.io must be: cached where possible, streamed when the response is long, credit-gated, and gracefully error-handled. An uncached, unbuffered AI call is a cost and UX bug.

## Decision Tree Before Writing Any AI Call

```
Is the output deterministic given the same input?
  YES → Cache it (hash the input, store in DB)
  NO  → Still consider caching with a short TTL

Will the response take > 2 seconds?
  YES → Stream via SSE
  NO  → Standard JSON response is fine

Does this action cost the user credits?
  YES → requireCredits middleware on the route (see credit-gate-pattern skill)
```

## Caching Pattern

intrview.io caches AI results by hashing the deterministic input. Existing examples: study plan (hashes job description), company research (keyed by company + role).

```js
import crypto from 'crypto'
import { getCachedResult, saveCachedResult } from './db.js'

function hashInput(input) {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

app.post('/api/your-ai-endpoint', requireAuth, requireCredits('your_action'), async (req, res) => {
  const cacheKey = hashInput(req.body)

  // 1. Check cache
  const cached = await getCachedResult(cacheKey)
  if (cached) {
    return res.json(cached)
  }

  // 2. Call OpenAI
  const result = await openai.chat.completions.create({ /* ... */ })
  const parsed = parseResult(result)

  // 3. Save to cache
  await saveCachedResult(cacheKey, parsed)

  res.json(parsed)
})
```

Add the cache table via a numbered migration in `server/migrations/`.

## Streaming Pattern (SSE)

Use SSE for any response that streams tokens to the client (focus chat, voice feedback, long analysis).

```js
// Server — SSE streaming endpoint
app.post('/api/your-stream-endpoint', requireAuth, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: req.body.messages,
      stream: true,
    })

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || ''
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`)
      }
    }

    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
    res.end()
  }
})
```

```js
// Client — consuming SSE
const response = await fetch('/api/your-stream-endpoint', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('session_token')}`,
  },
  body: JSON.stringify(payload),
})

const reader = response.body.getReader()
const decoder = new TextDecoder()

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  const lines = decoder.decode(value).split('\n')
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6))
      if (data.text) setOutput(prev => prev + data.text)
      if (data === '[DONE]') break
    }
  }
}
```

## Model Selection

| Use case | Model | Reason |
|---|---|---|
| Job analysis, study plan | `gpt-4o` | Needs strong reasoning over complex JDs |
| Grading quiz/voice answers | `gpt-4o-mini` | Structured output, cost-sensitive, high volume |
| Company research | `gpt-4o` | Synthesis quality matters |
| Conversational chat (TopicChat, FocusChat) | `gpt-4o` | Conversational quality |

Default to `gpt-4o-mini` for any grading or scoring task. Default to `gpt-4o` for generation.

## Prompt Design

- Always use a system prompt that constrains output format (JSON schema or structured text).
- For JSON output, use `response_format: { type: 'json_object' }` and describe the schema in the prompt.
- Keep prompts in the route handler for now (no separate prompt files) — they're small enough.
- Add `temperature: 0` for deterministic outputs (grading, analysis). Use `0.7` for generative content.

## Error Handling

```js
try {
  const result = await openai.chat.completions.create({ /* ... */ })
  // process result
} catch (err) {
  if (err.status === 429) {
    return res.status(503).json({ error: 'AI service busy — please try again in a moment' })
  }
  if (err.status === 500) {
    return res.status(502).json({ error: 'AI service error — please try again' })
  }
  console.error('OpenAI error:', err)
  return res.status(500).json({ error: 'Failed to generate response' })
}
```

Always refund credits if the OpenAI call fails after credit deduction (see credit-gate-pattern skill).

## Cost Awareness

- Log token usage in development: `console.log('tokens:', result.usage)`
- Aggressive cache hits are the primary cost control — don't skip caching for convenience.
- Set `max_tokens` explicitly; never let a single call run unbounded.
- For user-provided input (job descriptions, answers), trim and truncate to a safe max length before including in prompts.
