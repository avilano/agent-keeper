# Stage 8 Review Report: Intermediate Zoom Out Review

* **Target File:** `docs/designs/eval_cicd_pipeline.md`
* **Reviewer:** Skeptical Architect (`egm-zoom-out`)
* **Standard:** `Zoom-Out Standard` (`resources/document_standards/zoom-out-standard.md`)
* **Evaluation Context:** Cross-audit of findings from Stage 5 (Initial Zoom-Out), Stage 6 (Comprehension), and Stage 7 (Critic).
* **Date:** 2026-11-11
* **Verdict:** Approved with Simplification Directives (Reject Critic Bloat & Strip Speculative Weeds)

---

## Executive Summary & High-Altitude Directives

The proposed CI/CD evaluation pipeline has a solid, well-defined core: a fast deterministic Tier 1 gate paired with a 15-case golden regression Tier 2 gate. However, as the specification prepares to incorporate feedback from the Comprehension (Stage 6) and Critic (Stage 7) stages, there is a severe risk of **over-engineering bloat**.

Reviewers in earlier stages requested complex additions—such as multi-pass majority voting, dynamic token-bucket rate limiters, VCR/cassette recording fixtures for fork PRs, and speculative baseline score diffing. **We must firmly reject these over-engineered proposals.**

The simplest, cleanest system is one that:
1. Replaces fictitious concurrency and heavy rate-limiting infrastructure with **pure sequential execution** (~10–12 RPM), fitting natively into Gemini's 15 RPM free tier.
2. Discards heavyweight third-party frameworks (`deepeval`) in favor of the **70-line native Gemini judge** already proven in the codebase.
3. Solves Fork PR security by executing **Tier 1 deterministic checks only** and gracefully skipping live cloud calls (`pytest.skip`) without complex cassette recording tools (`vcrpy`).
4. Replaces speculative PR comment diffing and Tier 3 fuzzing with standard **pytest HTML/JUnit CI artifacts**.

---

## Findings & Simplicity Directives

### Finding 1: Over-Engineering Anti-Pattern – Multi-Pass Judge Voting & Flakiness Retries
* **Severity:** 🟡 Major
* **Affected Scope:** Section 1 (Line 16), Section 5.1 & 5.2 (Lines 132–142)
* **Simplicity Rationale:**
  Critic Finding 6 recommended adding "3-pass majority vote or median for scores in [0.80, 0.89]" to mitigate judge non-determinism. This is a classic over-engineering trap. Tripling judge calls (from 15 to 45 calls per CI run) instantly breaks the free-tier rate limit (15 RPM on Google AI Studio) that Critic Finding 4 simultaneously warned against.
  In a 15-case regression suite, the simplest and most sustainable approach is prompt hardening: explicit Chain-of-Thought rubrics, strict Few-Shot examples in the judge prompt, and `temperature=0.0`. If a test is borderline, engineers must refine the evaluation rubric or golden dataset case, rather than masking ambiguity behind expensive statistical retry layers.

### Finding 2: YAGNI – Speculative PR Commenter & Score Diffing vs. Main
* **Severity:** 🟡 Major
* **Affected Scope:** Section 2 (Lines 49–53: Architecture diagram)
* **Simplicity Rationale:**
  The architecture diagram specifies a "Pass/Fail Matrix with Score Diffs vs. Main Branch" and "Detailed Judge Reasoning Trace on Regressed Scenarios" posted as a PR comment. Computing score diffs against `main` requires external state persistence (e.g., S3 buckets, GitHub Pages, or DynamoDB), baseline retrieval scripting, and write-permission tokens for PR comments.
  For a PR regression gate, this is pure YAGNI. The gate is a binary invariant assertion (thresholds >= 0.85, <= 0.10). Standard GitHub Actions job summaries, pytest stdout failure traces in the runner console, and the uploaded `eval_report.html` artifact already provide 100% of the diagnostic value without any stateful diffing infrastructure.

### Finding 3: Fictitious Concurrency vs. Zero-Overhead Sequential Execution
* **Severity:** 🟡 Major
* **Affected Scope:** Section 2 (Line 45), Section 6 (Lines 152–153)
* **Simplicity Rationale:**
  Section 6 specifies an `asyncio.Semaphore(2)` concurrency pool, and Critic Finding 4 suggested adding token-bucket request pacing and concurrency throttlers.
  In reality, the entire test suite in `evals/test_pr_regression.py` executes sequentially via standard `pytest`. Furthermore, the native judge evaluates both factual consistency and hallucination in a **single** LLM prompt request (15 requests total, not 30). Sequential execution across 15 cases naturally paces requests to ~10–12 RPM, comfortably below Google AI Studio's 15 RPM limit with zero custom pacing logic.
  Documenting fictitious `asyncio` abstractions or building complex rate-limiting queues introduces phantom complexity. Sequential execution paired with `tenacity` exponential backoff is the minimalist, battle-tested solution.

### Finding 4: Inlined Implementation Weeds & Documentation Drift
* **Severity:** 🟡 Major
* **Affected Scope:** Section 3.1 (Lines 71–102), Section 6 (Lines 155–160), Section 7 (Lines 170–224)
* **Simplicity Rationale:**
  The document violates Section 3 of the Zoom-Out Standard (*Anti-Weeds / Altitude Control*) by copy-pasting 30+ lines of raw Python Pydantic classes, concrete `@retry` decorators, and a 55-line verbatim GitHub Actions YAML file.
  This inlining has already resulted in documentation drift:
  - The design inlines `TicketPriority.P0_CRITICAL` and `max_length=1000`, while the working repository code in `src/triage/schemas.py` uses `TicketPriority.P0` and `max_length=1500`.
  - The design omits `TicketInput`, which is essential to the service boundary.
  The design document must describe contracts, schema fields, validation invariants, and workflow step objectives conceptually rather than dumping raw code syntax.

### Finding 5: Framework Redundancy – DeepEval vs. Native Gemini Judge
* **Severity:** 🟡 Major
* **Affected Scope:** Section 2 (Line 42), Section 5.1 (Line 132), Section 8 (Lines 231, 239)
* **Simplicity Rationale:**
  The specification commits to `deepeval` and DeepEval's `FaithfulnessMetric`. In reality, `evals/judges/metrics.py` already contains a clean, self-contained 70-line native Gemini 1.5 Flash judge using Google's direct SDK and structured JSON output. Adding DeepEval pulls in hundreds of megabytes of third-party dependencies (LangChain, ChromaDB, etc.) for zero added functionality. Standardizing on the native Gemini judge aligns with Section 4 (*Leverage Existing*) and keeps the CI build light and fast.

### Finding 6: Pragmatic Fork PR Boundary vs. Heavyweight Cassette/VCR Tooling
* **Severity:** 🟡 Major
* **Affected Scope:** Section 7 (Lines 173–205)
* **Simplicity Rationale:**
  Critic Finding 3 noted that fork PRs cannot access repository secrets (`GROQ_API_KEY`, `GEMINI_API_KEY`) on `pull_request` triggers. However, the critic's proposed remedies (recording fixtures via `vcrpy`/`pytest-recording` or complex two-phase multi-repo workflows) introduce massive fixture maintenance, cassette desynchronization, and secret scrubbing burdens.
  The simplest, zero-dependency architectural solution is:
  1. Fork PRs run Tier 1 (deterministic zero-token checks: schemas, PII, token budget).
  2. Tier 2 live LLM tests gracefully skip when credentials are missing (`pytest.skip("Skipping live LLM eval: API keys not set")`), which is already implemented in `evals/test_pr_regression.py`.
  3. Maintainers trigger live Tier 2 runs upon internal branch push or pre-merge approval.
  This provides complete secret safety without adding a single line of recording or mocking infrastructure.

### Finding 7: Speculative Scope Bloat – Tier 3 Nightly Adversarial Testing
* **Severity:** 🟢 Nit
* **Affected Scope:** Section 2 (Lines 55–60: Tier 3), Section 8 (Roadmap)
* **Simplicity Rationale:**
  The architecture diagram introduces "Tier 3: Adversarial Red-Teaming & Fuzzing (Garak / Adversarial JSONL)". However, it is never defined, has no workflow in Section 7, and does not appear in the roadmap. It introduces speculative scope that distracts from the core PR regression gate. Tier 3 should be explicitly listed under **Non-Goals / Future Work** rather than cluttering the active pipeline architecture.

### Finding 8: Minimalist Fulfillment of Mandatory Critic Sections
* **Severity:** 🟢 Nit
* **Affected Scope:** New sections demanded by Critic (Alternatives Considered & Risks/Mitigations)
* **Simplicity Rationale:**
  To satisfy Critic Blockers 1 & 2 without bloating the document:
  - **Alternatives Considered:** Keep this concise. Contrast 3 practical approaches: (1) Local SLMs (Ollama/ONNX) vs. Cloud Free-Tier APIs, (2) Heavyweight eval frameworks (DeepEval/Ragas) vs. Lightweight Native Gemini Judge, and (3) Heuristic AST rules vs. LLM-as-a-judge.
  - **Risks & Mitigations:** Use a concise 4-row matrix covering Upstream Rate Limits, Judge Non-Determinism, Fork PR Secret Isolation, and Upstream API Outages. Avoid theoretical essays.
