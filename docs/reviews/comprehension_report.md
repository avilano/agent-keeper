# Stage 6 Review Report: Comprehension Test

* **Target File:** `docs/designs/eval_cicd_pipeline.md`
* **Reviewer:** Naive Reader (`egm-comprehension`)
* **Standard:** Self-Containment & Comprehension
* **Date:** 2026-11-11
* **Verdict:** Clarity & Dependency Gaps Identified

---

### What this proposes
This document specifies an automated multi-tier regression evaluation pipeline for an LLM-driven Customer Support Ticket Triage Service integrated into CI/CD. When code or prompt changes occur, GitHub Actions executes deterministic zero-token checks (Tier 1: Pydantic v2 validation, regex PII scanning, token ceilings), followed by a 15-case golden evaluation suite (Tier 2) using Groq (Llama 3.1) for triage inference and Google AI Studio (Gemini 1.5 Flash via DeepEval) as an LLM judge for factual consistency and hallucination thresholds. The architecture aims to stay within free-tier provider rate limits using concurrency semaphores, exponential backoff, and hash-based response caching, while deferring adversarial red-teaming (Tier 3) to off-PR nightly runs.

### How the existing system works, per this document
Per this document, there is no pre-existing production system or automated CI evaluation pipeline currently in place. The document describes a greenfield architecture where both the target reference application (the Customer Support Ticket Triage Service in `src/triage/`) and the evaluation harness (`evals/`) are designed and scaffolded from scratch according to a 5-phase roadmap.

---

### Comprehension Findings

#### 1. Missing Mechanism for PR Comments and "Score Diffs vs. Main Branch"
* **Severity:** 🟡 Major
* **Affected Scope:** Section 2 (Lines 49–53) & Section 7 (Lines 184–224)
* **Discrepancy Description & Rationale:**
  The architecture diagram explicitly promises a GitHub Actions step featuring a "Pass/Fail Matrix with Score Diffs vs. Main Branch" and "Detailed Judge Reasoning Trace on Regressed Scenarios" posted as a PR comment. However, Section 7 (`ci-pr-regression.yml`) only runs `pytest` and uploads an HTML artifact via `actions/upload-artifact@v4`. It contains no step, script, or action to post PR comments, nor any mechanism to fetch baseline scores from `main` or compute differential regressions. A reader attempting to build this cannot determine where baseline metric persistence or PR comment generation occurs.

#### 2. Undefined Mock Policy Document Location, Format, and Evaluation Context
* **Severity:** 🟡 Major
* **Affected Scope:** Section 5.1 (Lines 132–138)
* **Discrepancy Description & Rationale:**
  Section 5.1 states that factual consistency is measured by mapping statements in `draft_response` to "an authorized clause in the company's mock policy document." However, the document never defines where this mock policy document resides, what format it takes (e.g., markdown, JSON, vector index), how it is passed to the triage service or the DeepEval `FaithfulnessMetric`, or whether the service performs RAG. For a new team member, the source of truth for policy ground truth is undefined.

#### 3. Undefined Schema for Golden Dataset Records (`golden_15.jsonl`)
* **Severity:** 🟡 Major
* **Affected Scope:** Section 4 (Lines 106–127) & Section 8 (Line 240)
* **Discrepancy Description & Rationale:**
  Section 4 provides a summary table listing 15 scenario IDs, categories, failure modes, and invariants, but does not specify the schema of the underlying JSONL records in `evals/datasets/golden_15.jsonl`. It is unclear what keys each line must provide (e.g., `ticket_id`, `input_text`, `expected_category`, `customer_metadata`, `policy_context`). Without this schema specification, implementing Phase 4 requires guessing the input format consumed by `evals/test_pr_regression.py`.

#### 4. Omission of CI Cache Persistence for `.eval_cache/`
* **Severity:** 🟡 Major
* **Affected Scope:** Section 6 (Lines 162–164) & Section 7 (Lines 198–224)
* **Discrepancy Description & Rationale:**
  Section 6 highlights prompt-ticket hash caching in `.eval_cache/` as a core pillar for staying within free-tier API limits. However, GitHub Actions runners (`ubuntu-latest`) are ephemeral, and Section 7 does not configure `actions/cache` for `.eval_cache/`. As written, every PR run in CI starts with an empty cache and executes full external API calls, contradicting the claim that unchanged prompts consume 0 tokens in CI. The document should clarify whether caching is local-developer-only or specify the `actions/cache` path in the workflow.

#### 5. Ambiguity on Tokenizer Choice for Non-OpenAI Models
* **Severity:** 🟢 Nit
* **Affected Scope:** Section 2 (Line 34) & Section 5.3 (Line 146)
* **Discrepancy Description & Rationale:**
  Section 2 lists `Prompt Token Ceiling & Budget Assertions (tiktoken)`, while the inference models are Llama 3.1 (Groq) and Gemini 1.5 Flash. `tiktoken` is specific to OpenAI BPE tokenization. The document does not explain whether `tiktoken` (such as `cl100k_base` or `o200k_base`) is being intentionally used as a fast, zero-dependency heuristic approximation for Llama/Gemini tokens, or if provider-native token counts (e.g., Groq completion usage metadata) are intended.

#### 6. Discrepancy in PR Trigger Paths (`prompts/**` vs `src/triage/**`)
* **Severity:** 🟢 Nit
* **Affected Scope:** Section 2 (Line 26) & Section 7 (Lines 174–179)
* **Discrepancy Description & Rationale:**
  The architecture diagram lists `Paths: prompts/**, src/triage/**, evals/**`, whereas Section 7 lists `src/triage/**`, `evals/**`, and `pyproject.toml`, and Section 8 Phase 2 places prompt definitions inside `src/triage/prompts.py`. The standalone top-level `prompts/**` directory appears to be an orphaned reference from an earlier draft.

#### 7. Undefined Scope and Tooling for Tier 3 Adversarial Testing
* **Severity:** 🟢 Nit
* **Affected Scope:** Section 2 (Lines 55–60) & Section 8 (Roadmap)
* **Discrepancy Description & Rationale:**
  Tier 3 introduces `Garak / Adversarial JSONL` for off-PR injection probing. However, `garak` is not listed in `pyproject.toml` dependencies in Phase 1, no workflow file is scheduled for it, and it does not appear anywhere in the Step-by-Step Implementation Roadmap (Section 8). Tier 3 remains an ungrounded placeholder.
