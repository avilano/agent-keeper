# ADR 001: Playwright + TypeScript over Cypress

## Status
Accepted

## Context
Our quality platform requires multi-browser coverage (Chromium + Mobile Safari/WebKit emulation), sub-50ms API-driven authentication state injection, native request/route interception for chaos testing, and high-concurrency sharding in GitHub Actions.

## Decision
We selected **Playwright (`@playwright/test`)** with strict **TypeScript** over Cypress.

## Consequences
- **Speed:** `request.post('/users/login')` + `storageState` eliminates repetitive UI login flows across specs.
- **Multi-Browser & Mobile Fidelity:** Native WebKit (`iPhone 14`) and Chromium engines run in parallel inside a single test runner.
- **First-Class Reporter Hooks:** Custom Reporter API (`AiTriageReporter`) enables direct extraction of failing steps, locators, and network logs for LLM root-cause classification.
