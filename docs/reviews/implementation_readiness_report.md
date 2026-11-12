# Stage 9 Review Report: Implementation Readiness Test

* **Target File:** `docs/designs/eval_cicd_pipeline.md`
* **Target Range:** Lines 228–244 (`DetailedRange`: Implementation Roadmap)
* **Reviewers:**
  * Pragmatic Tech Lead (`egm-implementation-readiness`)
  * Codebase Details Auditor (`egm-codebase-details`)
  * Technical Copy Editor (`egm-style`)
* **Standard:** `Implementation Readiness Standard` (`resources/document_standards/implementation-readiness-standard.md`)
* **Date:** 2026-11-11
* **Verdict:** Fails Zero-Decision Rule (Roadmap is high-level milestone summary, not an actionable implementation plan)

---

## Findings Summary

### 🔴 Blockers

#### 1. Contradiction of Judge Architecture: DeepEval vs. Native Gemini SDK
* **Reviewers:** `egm-codebase-details`, `egm-implementation-readiness`
* **Affected Scope:** Section 8, Phase 4 (Lines 238–241)
* **Discrepancy Description & Rationale:**
  * **Roadmap Statement:** Phase 4 is titled `Phase 4: Golden Dataset & DeepEval Evaluator`, implying evaluation is driven by DeepEval's framework classes (`FaithfulnessMetric`, `LLMTestCase`).
  * **Actual Codebase:** In `evals/judges/metrics.py` and `evals/test_pr_regression.py`, DeepEval is not used. The judge is implemented directly as `GeminiJudge` using the Google GenAI SDK (`google.genai.Client`) with structured JSON schema evaluation, and evaluated with native pytest assertions.
  * **Impact:** Implementers are misled into integrating heavy DeepEval adapter boilerplate that directly contradicts the actual codebase implementation.

#### 2. Undefined Dataset Schema and Concrete Inputs for `golden_15.jsonl`
* **Reviewer:** `egm-implementation-readiness`
* **Affected Scope:** Section 8, Phase 4 (Lines 238–239), referenced in Section 4 (Lines 106–127)
* **Discrepancy Description & Rationale:**
  Phase 4 instructs the engineer to "Author `evals/datasets/golden_15.jsonl` with all 15 scenarios." However, neither Section 4 nor Section 8 defines the JSONL record schema (e.g., keys for `ticket_id`, `input_prompt`, `expected_category`, `reference_policy`) or provides the verbatim text for the 15 customer tickets. An implementer must invent synthetic test data and file schema from scratch.

#### 3. Undefined Prompt Templates and Mock Policy Text in `src/triage/prompts.py`
* **Reviewer:** `egm-implementation-readiness`
* **Affected Scope:** Section 8, Phase 2 (Lines 233–234)
* **Discrepancy Description & Rationale:**
  Phase 2 mandates implementing `src/triage/prompts.py`, but the document contains neither system prompt templates, few-shot examples, nor reference mock policy text. Because classification accuracy, sentiment extraction, and faithfulness judge scoring depend strictly on this text, leaving this to the implementer violates the Zero-Decision Rule.

---

### 🟡 Majors

#### 4. Missing Explicit Action Markers (`[Create]`, `[Modify]`, `[Delete]`)
* **Reviewer:** `egm-codebase-details`
* **Affected Scope:** Section 8, Phases 1–5 (Lines 230–244)
* **Discrepancy Description & Rationale:**
  Under the Implementation Readiness Standard, an implementation plan must explicitly label every target file with an action marker (`[Create]`, `[Modify]`, or `[Delete]`). The roadmap currently uses high-level prose verbs ("Initialize", "Implement", "Author", "Add").

#### 5. Missing Function Signatures, Structured Output Mode, and Model Pinning in `src/triage/service.py`
* **Reviewer:** `egm-implementation-readiness`
* **Affected Scope:** Section 8, Phase 2 (Lines 233–235)
* **Discrepancy Description & Rationale:**
  The roadmap instructs to "Implement `src/triage/service.py` with Groq inference and rate-limited client" without specifying method signatures (e.g., `async def triage_ticket(ticket_input: TicketInput) -> TriageResult`), pinning the exact Groq model identifier (e.g., `llama-3.1-8b-instant`), or specifying the structured JSON enforcement method.

#### 6. Incomplete Dependency Specification in Phase 1 Scaffolding
* **Reviewers:** `egm-codebase-details`, `egm-implementation-readiness`, `egm-style`
* **Affected Scope:** Section 8, Phase 1 (Lines 230–232)
* **Discrepancy Description & Rationale:**
  Phase 1 lists `(pydantic, pytest, deepeval, groq, google-genai, tenacity)`. It omits `tiktoken>=0.7.0` (required for Tier 1 token budgeting), `pytest-html>=4.1.0` (required for CI HTML report generation), and `pytest-asyncio>=0.21.0`. `deepeval` should be removed.

#### 7. Undocumented SHA-256 Disk Caching and Tenacity Retry Mechanics in Service Phase
* **Reviewer:** `egm-codebase-details`
* **Affected Scope:** Section 8, Phase 2 (Lines 234–235)
* **Discrepancy Description & Rationale:**
  Phase 2 omits the concrete SHA-256 disk cache (`.eval_cache/`) and tenacity retry specification (`wait_random_exponential`, max 30s, 4 attempts) that protect free-tier quotas and enable zero-token repeated runs.

#### 8. Undocumented Two-Stage CI Job Separation in Phase 5
* **Reviewer:** `egm-codebase-details`
* **Affected Scope:** Section 8, Phase 5 (Lines 242–244)
* **Discrepancy Description & Rationale:**
  Phase 5 mentions adding `ci-pr-regression.yml` without documenting the two decoupled jobs: `tier1-deterministic` (zero-API-key fast gate) and `tier2-llm-regression` (`needs: tier1-deterministic`, mounting `.eval_cache`, executing live tests).

---

### 🟢 Nits

#### 9. Missing Concrete Exit Verification Commands Per Phase
* **Reviewers:** `egm-implementation-readiness`, `egm-codebase-details`
* **Affected Scope:** Section 8, Phases 1–4 (Lines 230–241)
* **Discrepancy Description & Rationale:**
  Each phase must have concrete terminal verification commands (e.g., `pip check` for Phase 1, `pytest evals/deterministic/ -v` for Phase 3, and `pytest evals/test_pr_regression.py` for Phase 4) to verify that the codebase remains buildable and stable after each step.

#### 10. Heading and Editorial Refinements
* **Reviewer:** `egm-style`
* **Affected Scope:** Section 8 (Lines 228, 230–244)
* **Discrepancy Description & Rationale:**
  Simplify heading to `## 8. Implementation Roadmap` (strip "Step-by-Step"), replace redundant enumeration (`1. **Phase 1: ...**`), remove informal "folder", and replace dangling participles with imperative action verbs.
