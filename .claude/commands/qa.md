# QA Check

Invoke the `qa-test-guardian` agent to review recent code changes.

## Project Context

- **Stack**: React + Vite + Express + PostgreSQL
- **Frontend**: `client/src/` — pages in `client/src/pages/`, components in `client/src/components/`, CSS co-located
- **No test suite configured** — no vitest or jest set up yet. If tests are warranted, recommend and scaffold them rather than assuming they exist.
- **Key patterns to watch**: auth token handling, credit deduction middleware, SSE streaming (job analysis, focus chat), GamificationContext updates

## What to check

$ARGUMENTS

If no specific target is given, review all files modified since the last commit (`git diff HEAD`).

## QA Agent Instructions

1. Read the changed files and understand what was modified
2. Check for regressions in components that consume modified utilities or APIs
3. Verify auth/credit gating is correct on any new routes
4. If the change introduces new behavior, note whether tests should be added and provide starter scaffolding if so
5. Report a clear **PASS / FAIL / NEEDS ATTENTION** verdict with specific file:line callouts for any issues
