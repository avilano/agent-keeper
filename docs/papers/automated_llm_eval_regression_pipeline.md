# Treating Prompts as Code: Architectural Patterns, Multi-Agent Stress-Testing, and Free-Tier Realities in Automated LLM CI/CD Quality Gates

**Author:** Alberto Vilano Reyna  
**Date:** November 2026  
**Repository:** `agent-keeper`  
**Classification:** Applied AI Engineering / MLOps Architecture  

---

## Abstract

As Large Language Model (LLM) applications transition from experimental prototypes to mission-critical software, engineering teams face a critical gap in traditional CI/CD workflows: prompt edits, model quantization updates, and retrieval parameter tuning introduce non-deterministic, semantic regressions that traditional unit tests cannot detect and manual human review cannot scale to prevent. 

This paper presents the end-to-end design, multi-agent peer review, and empirical validation of **Agent Keeper**, an automated, tiered evaluation and regression quality gate for pull-request workflows. We detail:
1. A **Two-Tier CI Architecture** combining a zero-token deterministic gate (<10s) with a rate-limited golden regression suite (<90s).
2. The practical deployment of the **Elephant-Goldfish Model (EGM)**, utilizing isolated, stateless multi-agent personas (Skeptical Architect, Naive Reader, Hostile Design Critic, Document Architect, Technical Copy Editor, Pragmatic Tech Lead, and Codebase Auditor) to audit system design against the *Zero-Decision Rule* and *Anti-Weeds* standards.
3. Empirical lessons from real-world execution across **Groq** (`openai/gpt-oss-20b`) and **Google Gemini** (`gemini-3.5-flash`), uncovering severe free-tier API rate-limit bottlenecks (e.g., Google AI Studio's 20 requests/day cap), structured Pydantic schema validation failures, and the necessity of SHA-256 prompt-ticket response caching.
4. A granular failure analysis of 15 stratified test scenarios, demonstrating how automated gates catch subtle classification drifts, priority escalations, and edge-case hallucinations before deployment.

---

## 1. Introduction: The LLM Software Engineering Dilemma

In traditional software systems, deterministic inputs produce deterministic outputs. Unit tests, static linters, and integration suites provide unambiguous pass/fail signals. When developing LLM-driven features—such as customer support triage, automated document extraction, or code generation—changes to a single sentence in a system prompt or a minor upstream provider model deprecation can silently degrade system behavior.

### 1.1 The Regressive Failure Modes
In an enterprise customer support triage service, silent regressions manifest across several distinct vectors:
* **Hallucinated Commitments:** The model promises unauthorized refunds or guarantees immediate engineering fixes outside of authorized company policies.
* **Security & PII Leakage:** The model exposes internal API keys, echoes back prompt injection attacks, or leaks unmasked Personally Identifiable Information (SSNs, credit card numbers, JWT tokens).
* **Escalation & SLA Misrouting:** Critical P0 outages or legal threats are downgraded to routine feedback, bypassing incident response escalation paths.
* **Schema Invalidation:** The model outputs markdown code blocks or omits required fields, crashing downstream microservices expecting strict JSON.

### 1.2 Core Architectural Principles of Agent Keeper
To solve these challenges without incurring massive cloud compute bills, Agent Keeper implements four foundational principles:
1. **Tiered Quality Gates:** Decouple cheap, zero-token deterministic checks from expensive semantic LLM evaluations.
2. **Local-to-CI Parity:** Developers run the exact same `pytest` command locally in seconds that executes in GitHub Actions.
3. **Zero-Token Cache Replay:** Use deterministic SHA-256 hashing of prompts and inputs to ensure unchanged scenarios consume zero API tokens across repeated commits.
4. **Dual-Provider Free-Tier Sustainability:** Decouple the system-under-test from the evaluation judge across distinct providers to bypass shared quota collisions.

---

## 2. System Architecture & The Two-Tier Quality Gate

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Pull Request Event (Paths: src/triage/**, evals/**, pyproject.toml)   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Tier 1: Deterministic Fast Gate (< 10s, Zero Tokens, Zero API Cost)    │
│ ├─ Pydantic v2 Schema Conformance & Type Invariants                    │
│ ├─ High-Risk Regex PII Scanner (SSNs, 16-Digit Cards, JWT Tokens)      │
│ └─ Prompt Token Ceiling & Budget Assertions (tiktoken cl100k <= 1,500) │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ (Passes)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Tier 2: PR Golden Evaluation Gate (< 90s, Free-Tier Dual Providers)    │
│ ├─ 15 Stratified Reference Tickets (evals/datasets/golden_15.jsonl)    │
│ ├─ Triage Inference via Groq (openai/gpt-oss-20b, temp=0.0)            │
│ ├─ Native Gemini Judge via Google AI Studio (gemini-3.5-flash)         │
│ │   ├─ Factual Consistency Score (Hard-fail threshold: >= 0.85)        │
│ │   └─ Hallucination Score       (Hard-fail threshold: <= 0.10)        │
│ └─ Execution Pacing: Sequential (~10–12 RPM), Tenacity Jitter Backoff  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ (Generates Artifacts)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ GitHub Actions Summary & Artifacts                                     │
│ ├─ Standalone HTML Report (eval_report.html via pytest-html)           │
│ ├─ JUnit XML Failure Diagnostics (eval_results.xml)                    │
│ └─ Runner Cache Sync (.eval_cache/ restored via actions/cache@v4)      │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Tier 1: The Deterministic Fast Gate
Tier 1 runs locally or in CI in under 10 seconds without making external network calls or consuming API tokens:
* **Pydantic v2 Schema Enforcement:** Validates that data structures (`TicketInput`, `TriageResult`) strictly parse field types, string length bounds (`draft_response` 10–1500 chars), and enum invariants (`P0`–`P3`, `billing`, `account_security`, etc.).
* **Regex PII Screening:** Executes fast regex scans over generated text to detect unmasked SSNs (`\d{3}-\d{2}-\d{4}`), credit card numbers, and JWT authorization headers (`ey...`).
* **Token Budget Verification:** Uses `tiktoken` (`cl100k_base`) to assert that prompts and completions remain strictly within budgeted context windows (<= 1,500 tokens).

### 2.2 Tier 2: The Golden LLM Regression Suite
Tier 2 evaluates a curated 15-case stratified test suite representing the operational spectrum: P0 database outages, security credential dumps, billing disputes > $500, lost 2FA devices, SAML SSO failures, vague messages, profane legal threats, and adversarial prompt injection probes.

The suite executes two decoupled evaluation steps per ticket:
1. **Inference Execution:** The ticket is processed by `TriageService` using Groq (`openai/gpt-oss-20b` or `llama-3.1-8b-instant`).
2. **LLM-as-a-Judge Evaluation:** The generated draft response is evaluated by `GeminiJudge` (`gemini-3.5-flash`) against `COMPANY_POLICY` using structured Chain-of-Thought rubrics:
   $$\text{Factual Consistency Score} = \frac{\text{Supported Claims in Draft Response}}{\text{Total Factual Claims Extracted}}$$
   $$\text{Hallucination Score} = \frac{\text{Fabricated Promises / Policy Violations}}{\text{Total Claims}}$$

---

## 3. Multi-Agent Design Review: The Elephant-Goldfish Model (EGM)

Before executing code, the architecture was subjected to the **Elephant-Goldfish Model (EGM)** review protocol. EGM balances two complementary agent cognitive models:
* **The Elephant (Persistent Resolver):** The primary context containing institutional memory, historical decisions, and repair implementation capabilities.
* **The Goldfish (Adversarial Auditors):** Ephemeral, stateless subagents spawned in fresh context windows with zero conversational history to audit documents without confirmation bias.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                     THE EGM REVIEW PIPELINE                             │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
    Stage 5: Initial Zoom-Out        ▼  (Skeptical Architect)
    ├─ Enforce high-altitude simplicity, strip inlined weeds, flag bloat.
                                     │
    Stage 6: Comprehension Test      ▼  (Naive Reader)
    ├─ Paraphrase-first audit, test self-containment, flag unstated context.
                                     │
    Stage 7: Antagonistic Critic     ▼  (Design, Structural & Style Critics)
    ├─ Mandate Alternatives Considered, Risks & Mitigations, Non-Goals.
                                     │
    Stage 8: Intermediate Zoom-Out   ▼  (Skeptical Architect)
    ├─ Synthesize findings, REJECT reviewer over-engineering, keep clean core.
                                     │
    Stage 9: Implementation Readiness▼  (Tech Lead & Codebase Auditor)
    ├─ Enforce Zero-Decision Rule, action markers, verify doc vs code.
                                     │
    Stage 10: Elephant Resolution    ▼  (Primary Context)
    └─ Classify (PROPOSE FIX / CONTEST), write report, apply text repairs.
```

### 3.1 Reviewer Personas and Their Discoveries

| Stage & Persona | Core Mandate | Key Discoveries & Interventions |
| :--- | :--- | :--- |
| **Stage 5: Skeptical Architect** (`egm-zoom-out`) | Anti-Weeds, YAGNI, Leverage Existing | • Flagged altitude drops: inlined 30-line Python Pydantic classes and 55-line YAML dumps.<br>• Flagged speculative features: score diffing vs. `main` and Tier 3 Garak fuzzing.<br>• Identified framework redundancy: `deepeval` vs. lightweight native Gemini judge. |
| **Stage 6: Naive Reader** (`egm-comprehension`) | Paraphrase-first, Self-containment | • Exposed missing location and schema for `golden_15.jsonl`.<br>• Identified undefined source of truth for the company's mock policy document.<br>• Flagged that ephemeral GitHub Actions runners would evaporate `.eval_cache/` without `actions/cache`. |
| **Stage 7: Design Critic** (`egm-design`) | Scalability, Economics, Failure Modes | • **Blocker:** Missing mandatory *Alternatives Considered* section.<br>• **Blocker:** Missing *Risks & Mitigations* matrix.<br>• **Security Flaw:** Fork PRs cannot access repository secrets; live cloud calls would crash external contributions.<br>• **Math Contradiction:** 30 Gemini calls in <90s requires 20 RPM, exceeding Gemini's 15 RPM free-tier limit. |
| **Stage 7: Structural Validator** (`egm-structural`) | Heading Symmetry, Template Compliance | • Mandated formal *Goals & Non-Goals* and *Problem Statement* headers.<br>• Flagged missing language specifiers on code fences and inconsistent subsection numbering. |
| **Stage 7: Style Editor** (`egm-style`) | Objective Prose, Stripping Fluff | • Stripped portfolio signaling ("Hiring Managers" in metadata).<br>• Removed corporate buzzwords ("modeled after enterprise CI/CD standards").<br>• Corrected hyperbolic claims ("Zero-Flakiness Guarantee" -> "Flakiness Mitigation"). |
| **Stage 8: Skeptical Architect** (`egm-zoom-out`) | Intermediate Synthesis & Simplification | • **CRUCIAL INTERVENTION: Rejected Reviewer Bloat.** Firmly rejected adding 3-pass majority voting, dynamic token-bucket limiters, and VCR recording fixtures.<br>• Directed pure sequential execution (~10–12 RPM) to stay within free tiers natively.<br>• Directed graceful skipping (`pytest.skip`) for Fork PR secret safety. |
| **Stage 9: Pragmatic Tech Lead** (`egm-implementation-readiness`) | Zero-Decision Rule | • Prohibited leaving prompt engineering, JSON schemas, or adapter classes to implementers.<br>• Mandated exit verification commands (`pip check`, `pytest`) for every roadmap phase. |
| **Stage 9: Codebase Auditor** (`egm-codebase-details`) | Doc-vs-Code Compliance | • Exposed that codebase used native `google.genai.Client` while roadmap cited `DeepEval`.<br>• Mandated explicit `[Create]` action markers on all target files. |

---

## 4. Empirical Implementation & Real-World Failure Analysis

Following the EGM review, the design specification in `docs/designs/eval_cicd_pipeline.md` was updated, and the live pipeline was executed. Real-world execution uncovered three critical engineering insights.

### 4.1 The Free-Tier Quota Reality: The 20 Requests/Day Trap
During the initial live execution, `TriageService` was configured with a fallback to run both ticket generation and evaluation judging through a single `GEMINI_API_KEY`:
```python
# Initial Fallback Attempt
triage_service = TriageService(model="gemini-3.8-flash")
gemini_judge = GeminiJudge(model="gemini-3.8-flash")
```

Execution immediately halted on `TC-01` with HTTP 429:
```text
google.genai.errors.ClientError: 429 RESOURCE_EXHAUSTED
Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests
Limit: 20 requests per day for model: gemini-3.8-flash
Please retry in 10h20m55s.
```

#### The Engineering Finding
Google AI Studio restricts the newest preview/flash models (`gemini-3.8-flash`) to **20 requests per day per project** on free tiers. Evaluating 15 test cases (each requiring 1 triage generation + 1 judge evaluation = 30 calls) is mathematically impossible on a single-model, single-provider free account.

#### The Architectural Solution
1. **Decouple Providers:** Route triage generation to Groq (`openai/gpt-oss-20b` or `llama-3.1-8b-instant`), which offers **14,400 requests per day** (30 RPM) on its free tier.
2. **Select Multi-Model Quotas:** Switch the Gemini Judge to `gemini-3.5-flash`, which operates on an independent quota pool.
3. **Persist Inferences:** Implement deterministic SHA-256 caching in `.eval_cache/`. Once generated, unchanged tickets consume **0 API calls** on subsequent runs.

```python
def get_cache_key(model: str, system_prompt: str, user_prompt: str) -> str:
    raw = f"{model}:{system_prompt}:{user_prompt}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()
```

### 4.2 Structured Output Enforcement via Pydantic Schema
In early test runs, the LLM returned valid JSON that failed Pydantic validation:
```text
pydantic_core._pydantic_core.ValidationError: 1 validation error for TriageResult
routing_team: Field required [type=missing]
```
While standard prompting (`"Output valid JSON"`) produced syntactically valid JSON, the model frequently omitted optional-looking fields like `routing_team` or `extracted_claims`.

#### The Fix: SDK Schema Injection
By passing the Pydantic model directly into the Google GenAI SDK configuration, the API compiler enforces grammar-constrained decoding:
```python
response = self.gemini_client.models.generate_content(
    model=self.model,
    contents=[system_prompt, user_prompt],
    config={
        "response_mime_type": "application/json",
        "response_schema": TriageResult,  # Enforces Pydantic grammar
        "temperature": 0.0,
    },
)
```
This guaranteed 100% field presence across all 15 scenarios.

### 4.3 Granular Failure Analysis: The 6 Regression Discrepancies
When the full 15-case suite was executed against Groq (`openai/gpt-oss-20b`) and Gemini 3.5 Flash, the pipeline completed in **3 minutes and 8 seconds**:
* **9 PASSED**
* **6 FAILED**

All 15 cases passed Schema Conformance, PII screening, and LLM-as-a-judge Factual Consistency ($\ge 0.85$) and Hallucination ($\le 0.10$). The 6 failures represented **exact boundary regressions** between system prompt instructions and test suite expectations:

```text
┌─────────┬───────────────────────────────┬──────────────────┬──────────────────┬────────────────────────────────────────────────────────┐
│ Case ID │ Scenario Tested               │ Expected Value   │ Model Output     │ Root Cause & Architectural Insight                     │
├─────────┼───────────────────────────────┼──────────────────┼──────────────────┼────────────────────────────────────────────────────────┤
│ TC-08   │ Phishing email inquiry        │ Escalation:False │ Escalation:True  │ Model over-escalated on suspected security incident.   │
│ TC-09   │ Unauthorized API token access │ Priority: P1     │ Priority: P0     │ Model treated leaked token as emergency breach (P0).   │
│ TC-10   │ API 429 rate limit error      │ Category: tech   │ Category: general│ Model classified API troubleshooting as general query. │
│ TC-11   │ SSO SAML parsing error        │ Priority: P1     │ Priority: P2     │ Model treated configuration error as non-blocking (P2).│
│ TC-12   │ "System broken" (vague query) │ Priority: P3     │ Priority: P1     │ Model over-indexed on word "broken" without context.  │
│ TC-14   │ Hostile legal threat          │ Category: general│ Category: tech   │ Model classified legal outage complaint as tech issue. │
└─────────┴───────────────────────────────┴──────────────────┴──────────────────┴────────────────────────────────────────────────────────┘
```

#### Diagnostic Value for AI Teams
In conventional software testing, 6 failures indicate broken code. In AI evaluation engineering, these 6 failures demonstrate the exact power of the quality gate:
1. **Ambiguous Policy Calibration:** The system prompt instructed the model that *"Security breaches or lost 2FA must escalate"*. In `TC-08`, the customer forwarded a phishing email asking if it was authentic. The model defensively flagged it as a security event and escalated. The test failure forces the team to formally decide: *Should customer phishing inquiries trigger on-call human escalation?*
2. **Defensive Model Biases:** In `TC-09`, the customer reported an unauthorized API token. The model classified it as `P0` (emergency), while the dataset expected `P1`. The pipeline successfully detected model conservatism that would have overwhelmed on-call rotations.

---

## 5. Practitioner Lessons & Implementation Guidelines

For engineering teams seeking to deploy LLM regression testing in enterprise CI/CD environments, this project yields five essential architectural guidelines:

### 1. Reject Reviewer Bloat & Statistical Complexity
When designing evaluation pipelines, critics frequently recommend complex statistical layers: multi-pass majority voting (e.g., calling the judge 3 to 5 times per test) or dynamic token-bucket rate limiters. In free-tier or cost-constrained CI, tripling API calls instantly exhausts quotas. Prioritize prompt hardening (`temperature=0.0`, explicit few-shot Chain-of-Thought rubrics) and sequential execution (~10–12 RPM) over expensive statistical retries.

### 2. Isolate Fork PRs from Secrets
GitHub Actions strictly isolates pull requests originating from forks by denying access to repository secrets. Never use `pull_request_target` to bypass this, as it allows untrusted fork code to exfiltrate API keys. Instead, implement graceful degradation:
* Fork PRs run Tier 1 deterministic tests unconditionally.
* Tier 2 live cloud tests gracefully call `pytest.skip("Credentials not set")`.
* Maintainers run Tier 2 upon merging to an internal branch.

### 3. Native SDKs Beat Heavyweight Frameworks
Adopting third-party evaluation frameworks (e.g., DeepEval, Ragas) often introduces hundreds of megabytes of transitive dependencies (LangChain, ChromaDB, HuggingFace transformers) and assumes default OpenAI endpoints. A self-contained, 70-line judge module using the direct provider SDK (`google-genai`) provides complete transparency, zero dependency bloat, and bit-exact JSON schema validation.

### 4. Cache Early, Cache Deterministically
Ephemeral CI runners wipe the disk clean on every run. Always configure workflow caching (`actions/cache@v4`) for local evaluation caches:
```yaml
- name: Restore Eval Cache
  uses: actions/cache@v4
  with:
    path: .eval_cache
    key: eval-cache-${{ hashFiles('src/triage/prompts.py', 'evals/datasets/golden_15.jsonl') }}
```
When prompt templates and golden datasets are untouched, test runs execute in under 1 second and consume 0 tokens.

### 5. Pair Deterministic Invariants with LLM Judges
An LLM judge should not waste tokens verifying enum strings, schema types, or regex patterns. Use Pydantic v2 and regex fixtures in Tier 1 to catch structural bugs immediately. Reserve the LLM judge solely for semantic nuance: factual consistency, policy adherence, and hallucination detection.

---

## 6. Publication Roadmap & Distillation Strategy

To maximize the impact of this work across developer communities, this technical paper can be distilled into three tailored publications:

### Article 1: "The Two-Tier LLM Quality Gate: How to Stop Prompt Regressions in CI"
* **Target Audience:** MLOps Engineers, DevOps Leads, Platform Teams.
* **Focus:** Deep dive into GitHub Actions workflow design, ephemeral caching, fork PR security isolation, and comparing deterministic fast gates (<10s) vs. golden evaluation suites (<90s).
* **Key Artifacts:** Architecture diagram, YAML workflow snippets, and cache performance benchmarks.

### Article 2: "Stress-Testing AI System Designs: What Happened When 7 Subagents Audited Our Code"
* **Target Audience:** AI Architects, Tech Leads, Engineering Managers.
* **Focus:** The Elephant-Goldfish Model (EGM) in practice. How naive readers, design critics, and skeptical architects caught architectural weeds, rate-limit contradictions, and framework bloat before a line of code was executed.
* **Key Artifacts:** The EGM stage diagram, Goldfish audit findings table, and the intermediate zoom-out intervention.

### Article 3: "Free-Tier AI Engineering: Surviving Rate Limits, 429s, and Pydantic Schemas"
* **Target Audience:** Indie Hackers, Applied AI Developers, Startups.
* **Focus:** Real-world failure analysis. Surviving Google AI Studio's 20 requests/day cap, pairing Groq with Gemini, using Pydantic models for grammar-constrained decoding, and analyzing the 6 classification failures.
* **Key Artifacts:** The 6-failure regression table, Pydantic grammar configuration code, and cache key implementation.

---

## 7. Conclusion

Treating prompts as production software requires shifting from subjective human "vibes" to rigorous, automated regression testing. By combining a zero-token deterministic fast gate with a dual-provider LLM-as-a-judge evaluation suite, **Agent Keeper** proves that enterprise-grade quality gates can operate sustainably within free-tier rate limits. Furthermore, subjecting system specifications to stateless multi-agent peer review via the Elephant-Goldfish Model eliminates architectural blind spots and weeds before implementation begins, ensuring robust, production-ready AI software systems.
