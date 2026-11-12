# Stage 5 Review Report: Initial Zoom Out Review

* **Target File:** `docs/designs/eval_cicd_pipeline.md`
* **Reviewer:** Skeptical Architect (`egm-zoom-out`)
* **Standard:** `Zoom-Out Standard` (`resources/document_standards/zoom-out-standard.md`)
* **Date:** 2026-10-30
* **Verdict:** Needs Simplification & Weed Removal

---

## Findings Summary

### Finding 1: Altitude Drops & Implementation Code Weeds
* **Severity:** 🟡 Major
* **Affected Scope:**
  * Section 3.1: `src/triage/schemas.py` (Lines 71–102)
  * Section 6: Rate Limiting Decorator (Lines 155–160)
  * Section 7: `.github/workflows/ci-pr-regression.yml` (Lines 170–224)
* **Simplicity Rationale:**
  The document frequently loses architectural altitude by copy-pasting 30+ lines of raw Python Pydantic classes, concrete `@retry` decorators, and a 55-line verbatim GitHub Actions YAML workflow. According to Section 3 (*Anti-Weeds / Altitude Control*) of the Zoom-Out Standard, a high-level design specification must define architectural contracts, data entity boundaries, and pipeline stages, rather than becoming an implementation dump. Furthermore, inlining concrete syntax has already caused documentation drift: the inlined schema uses `TicketPriority.P0_CRITICAL` and `max_length=1000`, whereas the actual repository code in `src/triage/schemas.py` uses `TicketPriority.P0` and `max_length=1500`.
* **Recommendation:**
  Replace code blocks with conceptual entity definitions (field names, semantic meaning, validation invariants) and describe the CI stages functionally instead of inlining entire YAML files.

---

### Finding 2: YAGNI & Speculative Features (Diffing vs Main & Tier 3 Garak)
* **Severity:** 🟡 Major
* **Affected Scope:**
  * Section 2: Architecture & Execution Tiers (Lines 49–60)
* **Simplicity Rationale:**
  The architecture diagram introduces two speculative capabilities that violate Section 2 (*Simplicity & YAGNI*):
  1. **Score Diffs vs. Main Branch & PR Comments (Lines 50–52):** The diagram specifies a PR comment with a "Pass/Fail Matrix with Score Diffs vs. Main Branch". However, neither the detailed workflow in Section 7 nor the repository provides a mechanism to persist, retrieve, or diff baseline scores against `main`, nor does the workflow configure GitHub tokens for PR comment posting.
  2. **Tier 3 Adversarial Red-Teaming (Lines 55–60):** The diagram introduces a speculative nightly Garak red-teaming tier. It has no corresponding requirements, data models, or implementation plan in the document, adding unnecessary architectural surface area.
* **Recommendation:**
  Trim Tier 3 and the "Score Diffs vs. Main" PR commenter from the core design. If PR reporting is desired, limit it to publishing the pytest HTML artifact, or define the exact baseline storage and commenting mechanism without speculative hand-waving.

---

### Finding 3: Framework Redundancy & Dependency Bloat (DeepEval vs Native Gemini Judge)
* **Severity:** 🟡 Major
* **Affected Scope:**
  * Section 2: Architecture & Execution Tiers (Line 42)
  * Section 5.1: Factual Consistency Metric (Lines 132–137)
  * Section 8: Roadmap Phase 1 & 4 (Lines 231, 239)
* **Simplicity Rationale:**
  The design specifies `deepeval` as a core dependency and references DeepEval's `FaithfulnessMetric`. In reality, the codebase implements a clean, deterministic, 70-line native Gemini 1.5 Flash evaluation judge in `evals/judges/metrics.py` using Google's direct SDK and structured JSON output. Adding DeepEval pulls in a massive dependency footprint (e.g., langchain, chromadb, etc.) without providing tangible benefits over the existing native judge. Claiming both creates confusion and violates Section 2 (*Simplicity*) and Section 4 (*Platform Standards / Leverage Existing*).
* **Recommendation:**
  Standardize the design on the lightweight native Gemini structured-prompt judge. Remove `deepeval` from the specification and from `pyproject.toml`.

---

### Finding 4: Fictitious Concurrency Abstraction
* **Severity:** 🟢 Nit
* **Affected Scope:**
  * Section 6: Rate Limiting, Backoff & Caching Strategy (Lines 152–153)
* **Simplicity Rationale:**
  Section 6 states: *"Concurrency Pool: Capped at max_workers = 2 via asyncio.Semaphore(2)"*. However, the test suite in `evals/test_pr_regression.py` is purely synchronous, evaluating each golden case sequentially. Sequential execution naturally protects free-tier rate limits and eliminates race conditions. Documenting an `asyncio.Semaphore(2)` that is neither used nor necessary introduces phantom complexity.
* **Recommendation:**
  Clarify that test execution is sequential by default, which naturally guarantees rate-limit compliance on free tiers when paired with exponential backoff and SHA-256 caching.
