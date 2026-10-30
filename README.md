# Agent Keeper: Automated AI Regression CI/CD Quality Gate

A production-grade evaluation harness and CI/CD quality gate designed to bridge QA automation engineering with AI reliability engineering.

Treat prompt templates, model versions, and LLM configurations like production software with **deterministic fast gates** and **LLM-as-a-judge regression suites**.

---

## Architecture & Tiered Execution

```text
Pull Request (prompts/**, src/triage/**, evals/**)
  │
  ├── Tier 1: Deterministic Quality Gate (< 10s, 0 tokens, 0 API calls)
  │     ├── Pydantic v2 Schema validation & field constraints
  │     ├── High-risk PII scanning (SSN, credit cards, JWT tokens)
  │     └── Token budget ceiling checks (tiktoken)
  │
  └── Tier 2: Golden LLM Regression Suite (< 90s, Free-Tier Models)
        ├── 15 Stratified reference scenarios (evals/datasets/golden_15.jsonl)
        ├── Triage generation via Groq (llama-3.1-8b-instant)
        ├── Evaluation judge via Google Gemini 1.5 Flash
        │     ├── Factual Consistency Metric (Hard-fail < 0.85)
        │     └── Hallucination Score (Hard-fail > 0.10)
        └── Free-tier safety: sha256 prompt caching & tenacity backoff
```

---

## Repository Structure

```text
agent-keeper/
├── .github/
│   └── workflows/
│       └── ci-pr-regression.yml       # GitHub Actions 2-Tier PR Gate
├── src/
│   └── triage/
│       ├── schemas.py                 # Pydantic v2 TriageResult & TicketInput
│       ├── prompts.py                 # Versioned system prompt & authorized policies
│       └── service.py                 # Triage inference with caching & backoff
├── evals/
│   ├── datasets/
│   │   └── golden_15.jsonl            # Stratified 15-case test suite
│   ├── deterministic/
│   │   ├── test_schemas.py            # Pydantic schema validation tests
│   │   ├── test_pii.py                # Regex-based PII leak scanner
│   │   └── test_token_budgets.py      # Token ceiling tests
│   ├── judges/
│   │   └── metrics.py                 # Gemini 1.5 Flash evaluation judge
│   └── test_pr_regression.py          # Pytest regression suite
├── docs/
│   └── designs/
│       └── eval_cicd_pipeline.md      # Full architecture specification
└── pyproject.toml                     # Project dependencies & pytest configuration
```

---

## Quickstart & Local Execution

### 1. Install Dependencies
```bash
pip install -e .[test]
```

### 2. Run Tier 1 Deterministic Gate (Fast, Zero Tokens)
```bash
pytest evals/deterministic/ -v
```

### 3. Run Tier 2 Golden Regression Suite (Requires API Keys)
Set your free-tier keys for Groq and Google AI Studio:
```bash
export GROQ_API_KEY="your-groq-key"
export GEMINI_API_KEY="your-gemini-key"

pytest evals/test_pr_regression.py -v --html=eval_report.html --self-contained-html
```
*(If keys are not set, tests gracefully skip to allow zero-credential local runs).*

---

## Why This Matters in AI Engineering
* **Prevents Silent Regressions:** Catch hallucinated policy promises before prompts reach production.
* **Eliminates CI Flakiness:** Temperature `0.0`, strict Chain-of-Thought scoring rubrics, and automated boundary retries ensure reproducible outcomes.
* **Respects Free Tiers:** Concurrency throttling, exponential jitter, and SHA-256 prompt-ticket hashing keep GitHub Actions completely within free provider tiers.
