# intrview.io Codebase Memory

## Architecture
- **Frontend**: React + Vite, plain CSS (no CSS-in-JS), `client/src/`
- **Backend**: Express, `server/index.js`, routes in `server/routes/`
- **Font**: 'Inconsolata' monospace throughout all UI
- **Color scheme**: Dark theme, #0a0a0a bg, #1a1a1a cards, #f59e0b accent (amber), #22c55e success

## Key Routing (post-UX redesign)
- `/dashboard` - Compact status bar + job cards + nudge banner
- `/job/:jobId` - Job Brief (single scroll, no tabs)
- `/job/:jobId/train` - Training page with 2x2 mode picker
- `/progress` - Consolidated progress hub (heatmap, achievements, weak spots)
- `/company/:name` - Redirects to /job/:id for single-role companies

## State Management
- No Redux/Zustand - uses React useState + Context (GamificationContext)
- Job data loaded from: sessionStorage > localStorage (jd_history) > server API
- Auth: session_token in localStorage, axios Bearer header

## API Utils
- `client/src/utils/api.js` - Centralized API calls (progress, practice, chat, gamification)
- SSE streaming used for: job analysis, focus chat

## Component Patterns
- LogoWithFallbacks: multi-source logo loading with fallback chain
- Practice.jsx: accepts `initialMode` prop, smart ordering always on
- FocusChat.jsx: streaming chat with SSE, used as "Coach" mode in Training
- AchievementsBadgeGrid: shared between Progress page and old ProgressTracker

## File Naming
- Pages: `client/src/pages/` (PascalCase, e.g., TrainingPage.jsx)
- Components: `client/src/components/` (PascalCase)
- CSS: Co-located with component (same name, .css extension)
