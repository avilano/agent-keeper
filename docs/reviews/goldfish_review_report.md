# Goldfish Annotated Review Report
Status: resolved

**Target:** `docs/designs/eval_cicd_pipeline.md` (Lines 228–244: `DetailedRange`)

## Prioritized Findings & AI Suggestions

### Issue 1 [`egm-codebase-details` / `egm-implementation-readiness`] - Severity: High
* **Affected Scope:** [Lines 238-241](docs/designs/eval_cicd_pipeline.md#L238-L241) (`Phase 4: Golden Dataset & DeepEval Evaluator`)
* **Discrepancy Description:** Phase 4 is titled `Phase 4: Golden Dataset & DeepEval Evaluator`, specifying evaluation via DeepEval. However, the codebase (`evals/judges/metrics.py` and `evals/test_pr_regression.py`) implements a native `GeminiJudge` using Google GenAI SDK (`google.genai.Client`) with structured JSON rubrics and native pytest assertions.
* **Rationale:** Contradicts the implemented codebase architecture and introduces confusion and unnecessary dependency bloat.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Align the roadmap with the native Gemini SDK judge architecture.
* ***Proposed Edit:***
  * Location: Line 238
  * Change: Retitle Phase 4 to `Phase 4: Golden Dataset & Native Gemini Judge` and specify `evals/judges/metrics.py` implementing `GeminiJudge` via `google.genai.Client`.

---

### Issue 2 [`egm-implementation-readiness`] - Severity: High
* **Affected Scope:** [Lines 238-239](docs/designs/eval_cicd_pipeline.md#L238-L239) (`Phase 4: Golden Dataset`)
* **Discrepancy Description:** Phase 4 instructs to "Author `evals/datasets/golden_15.jsonl` with all 15 scenarios" without defining the JSONL record schema or providing concrete inputs.
* **Rationale:** Violates the Zero-Decision Rule by requiring the implementer to invent dataset schemas and test payloads.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Specify the exact JSONL record schema matching `evals/datasets/golden_15.jsonl` (`id`, `tier`, `subject`, `message`, `expected_category`, `expected_priority`, `expected_sentiment`, `expected_escalation`, `invariants`).
* ***Proposed Edit:***
  * Location: Line 239
  * Change: Document the JSONL record structure with all required fields matching `TicketInput` and validation invariants.

---

### Issue 3 [`egm-implementation-readiness`] - Severity: High
* **Affected Scope:** [Lines 233-234](docs/designs/eval_cicd_pipeline.md#L233-L234) (`Phase 2: Reference Triage Service`)
* **Discrepancy Description:** Phase 2 specifies implementing `src/triage/prompts.py` without detailing prompt templates, few-shot rules, or mock policy text.
* **Rationale:** Leaves critical prompt engineering and policy definitions to the implementer.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Document the `COMPANY_POLICY` text, `TRIAGE_SYSTEM_PROMPT` structured output rules, and `format_user_prompt` helper.
* ***Proposed Edit:***
  * Location: Line 234
  * Change: Specify `COMPANY_POLICY` (authorized refund, SLA, security, and escalation rules) and `TRIAGE_SYSTEM_PROMPT` JSON enforcement contract.

---

### Issue 4 [`egm-codebase-details`] - Severity: Medium
* **Affected Scope:** [Lines 230-244](docs/designs/eval_cicd_pipeline.md#L230-L244) (Phases 1–5)
* **Discrepancy Description:** File paths lack explicit action markers (`[Create]`, `[Modify]`, `[Delete]`).
* **Rationale:** Violates the Implementation Readiness Standard requirement for explicit target action markers.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Prefix each file in the roadmap with `[Create]`.
* ***Proposed Edit:***
  * Location: Lines 230–244
  * Change: Explicitly mark all target files with `[Create]`.

---

### Issue 5 [`egm-implementation-readiness`] - Severity: Medium
* **Affected Scope:** [Lines 233-235](docs/designs/eval_cicd_pipeline.md#L233-L235) (`Phase 2: Reference Triage Service`)
* **Discrepancy Description:** Phase 2 does not specify function signatures, structured output extraction mode, or pinned model identifiers for `TriageService`.
* **Rationale:** Leaves service contracts to implementer discretion.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Document `TriageService(model="llama-3.1-8b-instant")`, `triage_ticket(ticket: TicketInput, use_cache: bool = True) -> TriageResult`, and `response_format={"type": "json_object"}`.
* ***Proposed Edit:***
  * Location: Line 235
  * Change: Add exact signatures, default model pin, and JSON object response formatting.

---

### Issue 6 [`egm-codebase-details` / `egm-implementation-readiness` / `egm-style`] - Severity: Medium
* **Affected Scope:** [Lines 231-232](docs/designs/eval_cicd_pipeline.md#L231-L232) (`Phase 1: Environment & Scaffolding`)
* **Discrepancy Description:** Phase 1 dependency list omits `tiktoken>=0.7.0`, `pytest-html>=4.1.0`, and `pytest-asyncio>=0.21.0`, while retaining `deepeval`.
* **Rationale:** Causes test execution or CI report generation failures in clean virtual environments.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Pin the complete dependency set matching `pyproject.toml` and remove `deepeval`.
* ***Proposed Edit:***
  * Location: Line 231
  * Change: Update dependency declaration to match `pyproject.toml`: `pydantic>=2.5.0`, `tenacity>=8.2.0`, `groq>=0.9.0`, `google-genai>=0.1.1`, `tiktoken>=0.7.0`, and test extras `pytest>=7.4.0`, `pytest-asyncio>=0.21.0`, `pytest-html>=4.1.0`.

---

### Issue 7 [`egm-codebase-details`] - Severity: Medium
* **Affected Scope:** [Lines 234-235](docs/designs/eval_cicd_pipeline.md#L234-L235) (`Phase 2: Reference Triage Service`)
* **Discrepancy Description:** Phase 2 omits the SHA-256 disk cache (`.eval_cache/`) and tenacity retry mechanics that protect free-tier rate limits.
* **Rationale:** Omitting caching from the implementation steps risks running un-cached CI test executions.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Document the `get_cache_key`, `read_from_cache`, and `write_to_cache` disk-caching functions and tenacity exponential backoff decorator in Phase 2.
* ***Proposed Edit:***
  * Location: Line 235
  * Change: Add explicit caching and retry implementation steps to Phase 2.

---

### Issue 8 [`egm-codebase-details`] - Severity: Medium
* **Affected Scope:** [Lines 242-244](docs/designs/eval_cicd_pipeline.md#L242-L244) (`Phase 5: GitHub Actions Workflow & Verification`)
* **Discrepancy Description:** Phase 5 omits the two-stage CI architecture separating deterministic checks from live LLM regression runs.
* **Rationale:** Risks monolithic CI job execution where live LLM API calls are triggered even when Tier 1 checks fail.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Explicitly specify `tier1-deterministic` (zero token/API cost) and `tier2-llm-regression` (`needs: tier1-deterministic`, `actions/cache@v4` on `.eval_cache/`, and live report upload) in Phase 5.
* ***Proposed Edit:***
  * Location: Line 243
  * Change: Document both distinct CI jobs and caching integration in Phase 5.

---

### Issue 9 [`egm-implementation-readiness` / `egm-codebase-details`] - Severity: Low
* **Affected Scope:** [Lines 230-244](docs/designs/eval_cicd_pipeline.md#L230-L244) (Phases 1–5)
* **Discrepancy Description:** Missing explicit terminal exit verification commands per phase.
* **Rationale:** Violates the Phasing & Checkpoints requirement of the Implementation Readiness Standard.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Add concrete verification commands (e.g. `pip check`, import verification, `pytest evals/deterministic/ -v`, `pytest evals/test_pr_regression.py -v`) to each phase.
* ***Proposed Edit:***
  * Location: Lines 230–244
  * Change: Add a `* Verification:*` command line for each phase.

---

### Issue 10 [`egm-style`] - Severity: Low
* **Affected Scope:** [Lines 228-244](docs/designs/eval_cicd_pipeline.md#L228-L244) (Roadmap Heading and Phrasing)
* **Discrepancy Description:** Redundant heading phrasing ("Step-by-Step"), redundant numbering, informal "folder", and dangling participles.
* **Rationale:** Style and readability refinement.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Adopt concise, imperative engineering phrasing.
* ***Proposed Edit:***
  * Location: Lines 228–244
  * Change: Retitle to `## 8. Implementation Roadmap` and use imperative action verbs.
