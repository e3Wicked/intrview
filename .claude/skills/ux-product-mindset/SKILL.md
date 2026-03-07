---
name: ux-product-mindset
description: Apply this skill when designing or building any user-facing feature for intrview.io — a gamified AI interview prep app. Use when the user asks to add a page, component, flow, or interaction, or when discussing what to build and why. Ensures product decisions optimize for user motivation, retention, and conversion.
version: 1.0.0
---

# UX & Product Mindset for intrview.io

intrview.io is a **gamified interview prep tool** whose core value loop is: analyze a job → study topics → practice (quiz/voice/flashcards) → earn XP and level up → get hired. Every feature decision should strengthen this loop.

## Product Principles

### 1. Reduce time-to-value
- Users arrive with a specific job in mind. Get them to the first practice question as fast as possible.
- Never gate the "aha moment" behind sign-up friction. Show value first, capture auth second.
- Empty states should never be dead ends — always provide a CTA or preloaded example.

### 2. Make progress feel real
- Gamification (XP, streaks, levels, achievements) only works if users *see* progress at every step.
- After any practice action (quiz answer, voice response, flashcard), show immediate feedback: score, XP earned, streak status.
- Never let a session end without a summary (SessionSummary component exists for this).

### 3. Upgrade prompts must feel helpful, not punitive
- A 402 / out-of-credits state is a conversion moment. Frame it as "you're doing great, here's more".
- Show what the user was trying to do, show what plan unlocks it, and make the CTA obvious.
- Never leave the user stuck — if they hit a credit wall, show what free options remain.

### 4. Friction inventory — check every new flow
For any new feature, explicitly answer:
- What happens on first visit (no data yet)?
- What happens when the API call fails or is slow?
- What happens on mobile (sidebar collapses, touch targets >= 44px)?
- What does a free-tier user see vs. paid?

## UX Patterns Already in Place

| Situation | Existing solution |
|---|---|
| User not signed in | `SignInPrompt` component |
| User out of credits | `UpgradeModal` (triggered by 402) |
| Achievements unlocked | `AchievementToast` (via GamificationContext) |
| Long AI generation | `LoadingOverlay` + SSE streaming |
| Post-practice recap | `SessionSummary` component |

Always use these before inventing new patterns.

## Design Decisions

### Visual language
- Dark theme: `#0a0a0a` background, `#1a1a1a` cards, `#f59e0b` amber accent (primary CTA color).
- Font: Inconsolata throughout (monospace, technical, consistent with "coding interview" context).
- Every component in `client/src/components/` has a co-located `.css` file — never use inline styles for layout.

### Motion and feedback
- Use CSS transitions for hover states, not JavaScript.
- XP/level-up animations should feel earned — don't animate trivial interactions.
- Loading skeletons > spinners for content areas that take > 300ms.

## Product Questions to Ask Before Building

1. Does this feature strengthen the study loop or distract from it?
2. Will a user understand what to do within 3 seconds of seeing this screen?
3. Is there a cheaper implementation that delivers 80% of the value?
4. Does this work for a free user, a paid user, and a first-time user?
5. What metric would tell us this feature is working?
