# ADR 003: Changed-File Risk Engine & AI Failure Triage

## Status
Accepted

## Context
Running every end-to-end test on every commit increases CI cost, and investigating test failures across sharded CI logs slows down developer velocity.

## Decision
1. **Risk Engine (`scripts/risk-engine.ts`):** Inspects `git diff` on PRs and maps modified file paths to Playwright tags (`@smoke`, `@pay`, `@a11y`, `@api`, `@community`).
2. **AI Triage Reporter (`src/reporters/ai-triage-reporter.ts`):** Captures the failing locator, stack trace, recent HTTP status codes (`network-log.json`), and `git diff`, classifying failures into `APP_BUG`, `SELECTOR_DRIFT`, `FLAKY_RACE_CONDITION`, or `A11Y_VIOLATION` via Gemini/OpenAI with a deterministic heuristic fallback when API keys are absent.
