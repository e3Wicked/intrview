# intrview.io — Product Memory

## Product Summary

**intrview.io** is an AI-powered interview preparation app. Users paste a job description, get a personalized study plan + company research, then practice with AI-driven Q&A, a focus coach, and progress tracking.

## Core User Flow

1. **Analyze job** — User pastes a JD → server generates study plan + company brief (cached in DB)
2. **Train** — Practice page with 4 modes: Flash Cards, Q&A, Mock Interview, Coach (FocusChat)
3. **Track progress** — Heatmap, XP/levels, achievements, weak spots panel

## Monetization

- **Plans**: `free`, `starter`, `pro`, `elite`
- **Credits**: Each AI action costs credits defined in `CREDIT_COSTS` (server/auth.js). Free plan has limited credits.
- **Stripe**: Checkout, webhooks, and customer portal via `server/stripe.js`
- **Auth**: Passwordless email OTP — no password friction at sign-up

## Key Routes (post-UX redesign)

| Route | Purpose |
|-------|---------|
| `/dashboard` | Compact status bar, job cards, nudge banner |
| `/job/:jobId` | Job Brief — single scroll, no tabs |
| `/job/:jobId/train` | Training page with 2x2 mode picker |
| `/progress` | Progress hub: heatmap, achievements, weak spots |
| `/company/:name` | Redirects to `/job/:id` for single-role companies |

## Design System

- Dark theme: `#0a0a0a` background, `#1a1a1a` cards, `#f59e0b` amber accent, `#22c55e` success green
- Font: Inconsolata (monospace) throughout all UI
- Plain CSS co-located with each component — no CSS-in-JS, no Tailwind

## Gamification

XP, levels, streaks, and achievements tracked per user. State exposed via `GamificationContext`. Logic in `server/utils/gamification.js` and `server/utils/achievements.js`.

## PRD Guidelines

When writing PRDs for this app:
- Consider credit cost implications for any AI-powered feature
- Specify which plan tier gates the feature (if any)
- User flows should feel fast — prefer streaming (SSE) for AI responses
- Keep UI minimal and keyboard-friendly — the target user is a focused job seeker, not a casual browser
- New pages need a route entry; new components need a co-located CSS file
