# Stage 7 Review Report: Critic Review

* **Target File:** `docs/designs/eval_cicd_pipeline.md`
* **Target Range:** Lines 1–227 (`FeatureRange`)
* **Reviewers:**
  * Hostile Design Critic (`egm-design`)
  * Document Architect (`egm-structural`)
  * Technical Copy Editor (`egm-style`)
* **Target Standard:** `Feature Specification Standard` (`resources/document_standards/feature-spec-standard.md`)
* **Date:** 2026-11-11
* **Verdict:** Rejected against Feature Specification Standard (Mandatory Sections Missing & Scalability/Security Gaps)

---

## Findings Summary

### 🔴 Blockers

#### 1. Missing Mandatory Section: Alternatives Considered
* **Reviewers:** `egm-design`, `egm-structural`
* **Affected Scope:** Entire `FeatureRange`
* **Discrepancy Description & Rationale:**
  The document breaches *The Alternatives Rule* of the Feature Specification Standard: *"The specification must include a mandatory evaluation of alternatives. It fails this standard if it proposes a single path without proving that other viable designs were considered and rejected for specific, documented reasons."*
  The current specification commits directly to Groq + Gemini 1.5 Flash via DeepEval on GitHub Actions without documenting alternatives considered and rejected, such as:
  1. Local Small Language Models (SLMs) via Ollama / ONNX / vLLM for zero-cost, offline, reproducible CI execution.
  2. Alternative evaluation frameworks (Promptfoo, Ragas, or native pytest fixtures vs. DeepEval).
  3. Deterministic AST/rule-based heuristics vs. remote LLM-as-a-judge for classification triage.
* **Recommendation:**
  Add an `Alternatives Considered` section documenting trade-offs regarding cost, latency, complexity, and determinism.

#### 2. Missing Mandatory Section: Risks & Mitigations
* **Reviewers:** `egm-structural`, `egm-design`
* **Affected Scope:** Entire `FeatureRange`
* **Discrepancy Description & Rationale:**
  The Feature Specification Standard requires explicit identification of constraints, failure modes, security implications, scalability limits, and corresponding mitigations. The document lacks a dedicated `Risks & Mitigations` section addressing critical operational failure modes (e.g., judge non-determinism, free-tier rate exhaustion during PR bursts, upstream API outages halting CI, system prompt leakage).
* **Recommendation:**
  Add a dedicated `Risks & Mitigations` section mapping each identified risk to concrete architectural safeguards.

#### 3. Secret Invalidation & Vulnerability in Fork PR Workflows
* **Reviewer:** `egm-design`
* **Affected Scope:** Section 7 (Lines 173–178, 201–205)
* **Discrepancy Description & Rationale:**
  The GitHub Actions workflow triggers on `on: pull_request` and directly accesses repository secrets (`GROQ_API_KEY`, `GEMINI_API_KEY`). In GitHub Actions, workflows triggered by pull requests from forks do not have access to secrets for isolation. Any PR from a fork will fail immediately at Tier 2 due to null API keys. Conversely, using `pull_request_target` would introduce severe security vulnerabilities by executing untrusted code with repository secret access.
* **Recommendation:**
  Define the security boundary: state whether fork PRs run Tier 1 only, fall back to offline recorded fixtures (e.g., `pytest-recording` / `vcrpy`), or gate live API evaluation behind maintainer approval (`run-evals` label / GitHub Environment protection).

---

### 🟡 Majors

#### 4. Free-Tier Rate Limit Contradiction
* **Reviewer:** `egm-design`
* **Affected Scope:** Section 1 (Line 17), Section 2 (Lines 39–46), Section 6 (Lines 150–161)
* **Discrepancy Description & Rationale:**
  Objective 3 claims 100% of CI runs execute within free rate limits, while Tier 2 promises completion in `< 90s` for 15 cases. 15 cases require 15 Groq calls and 30 Gemini judge inferences (Faithfulness + Hallucination). 30 Gemini judge requests in 90 seconds requires ~20 RPM, which exceeds Google AI Studio's free-tier rate limit of 15 RPM. Multi-PR triggers share account quota and will cause 429 rate limit failures.
* **Recommendation:**
  Calculate peak RPM/RPD/TPM budgets, implement request pacing (e.g., throttled at 12 RPM), or enforce singleton workflow concurrency.

#### 5. Ephemeral CI Runners Invalidate Local File-Based Caching
* **Reviewers:** `egm-design`, `egm-comprehension`
* **Affected Scope:** Section 6 (Lines 162–164), Section 7 (Lines 184–224)
* **Discrepancy Description & Rationale:**
  Section 6 claims prompt-ticket hash caching in `.eval_cache/` allows unchanged prompts to consume 0 tokens. However, GitHub Actions runners (`ubuntu-latest`) are ephemeral, and Section 7 does not configure `actions/cache` to persist `.eval_cache/`. Every CI run starts with an empty cache.
* **Recommendation:**
  Add `actions/cache` to `.github/workflows/ci-pr-regression.yml` keyed on prompt and dataset hashes, or clarify that caching is local-developer-only.

#### 6. Unbacked "Zero-Flakiness Guarantee" vs. Probabilistic Judge Drift
* **Reviewers:** `egm-design`, `egm-style`
* **Affected Scope:** Section 1 (Line 16), Section 5.1 & 5.2 (Lines 132–142)
* **Discrepancy Description & Rationale:**
  Setting `temperature=0` does not guarantee bit-exact determinism across cloud GPU clusters. Setting a hard pass/fail threshold (e.g., `Faithfulness < 0.85`) on continuous judge scores will cause flaky CI failures on borderline scores (e.g., 0.84 vs 0.86).
* **Recommendation:**
  Replace "Zero-Flakiness Guarantee" with "Flakiness Mitigation", and define a boundary retry policy for borderline bands (e.g., 3-pass majority vote or median for scores in `[0.80, 0.89]`).

#### 7. Missing Explicit Goals & Non-Goals and Problem Statement
* **Reviewers:** `egm-structural`
* **Affected Scope:** Section 1 (Lines 10–20)
* **Discrepancy Description & Rationale:**
  The standard mandates explicit "Goals & Non-Goals" and a distinct "Problem Statement". Section 1 opens immediately with a system overview and lists positive objectives without defining out-of-scope boundaries (e.g., multi-turn evaluation, human-in-the-loop review, production telemetry).
* **Recommendation:**
  Add a dedicated `Problem Statement` and explicit `Goals & Non-Goals` subsections under Section 1.

---

### 🟢 Nits

#### 8. Resume / Portfolio Signaling in Metadata
* **Reviewer:** `egm-style`
* **Affected Scope:** Line 6 (`Target Audience`)
* **Discrepancy Description & Rationale:**
  Listing "Hiring Managers" in the target audience injects portfolio signaling into an engineering design document. Restrict audience to engineering stakeholders (`AI / MLOps Engineers, QA Automation Leads`).

#### 9. Corporate Buzzwords & Marketing Phrasing
* **Reviewer:** `egm-style`
* **Affected Scope:** Line 12 (`modeled after enterprise CI/CD standards`), Line 108 (`overfitting` test suite), Line 117 (`Zero hallucination`)
* **Discrepancy Description & Rationale:**
  Replace promotional filler with objective engineering prose. "Enterprise CI/CD standards" is vague; "overfitting" misapplies model training concepts to a 15-case test suite; "Zero hallucination" is colloquial shorthand.

#### 10. Missing Code Fence Language Tag & Subsection Numbering
* **Reviewer:** `egm-structural`
* **Affected Scope:** Lines 24–61, Section 1 vs 3/5
* **Discrepancy Description & Rationale:**
  Code fence at line 24 lacks a language specifier (`text`). Subsection numbering is inconsistent between Section 1 (unnumbered) and Sections 3/5 (decimal numbered).
