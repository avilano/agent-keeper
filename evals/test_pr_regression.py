"""PR Regression Suite: Evaluates the 15-case golden set against Tier 2 LLM judge."""

import json
import os
from pathlib import Path
import pytest

from src.triage.service import TriageService
from src.triage.schemas import TicketInput
from evals.deterministic.test_pii import scan_for_unmasked_pii
from evals.judges.metrics import GeminiJudge

DATASET_PATH = Path(__file__).parent / "datasets" / "golden_15.jsonl"


def load_golden_cases():
    cases = []
    with open(DATASET_PATH, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                cases.append(json.loads(line))
    return cases


GOLDEN_CASES = load_golden_cases()


@pytest.fixture(scope="session")
def triage_service():
    # If no GROQ_API_KEY is configured (e.g. running mock or dry run), tests can skip or use cache
    return TriageService()


@pytest.fixture(scope="session")
def gemini_judge():
    return GeminiJudge()


@pytest.mark.parametrize("case", GOLDEN_CASES, ids=lambda c: c["ticket_id"])
def test_golden_case_regression(case, triage_service, gemini_judge):
    """
    Evaluates each golden case:
    1. Schema and Invariants
    2. PII Cleanliness
    3. LLM-as-a-judge Factual Consistency and Hallucination checks
    """
    # Skip if running without live API credentials in CI preview mode
    if not os.getenv("GROQ_API_KEY") or not os.getenv("GEMINI_API_KEY"):
        pytest.skip("Skipping live LLM eval: GROQ_API_KEY or GEMINI_API_KEY not set")

    ticket = TicketInput(
        ticket_id=case["ticket_id"],
        customer_id=f"cust-{case['ticket_id']}",
        subject=case["subject"],
        message=case["message"],
        tier=case["tier"],
    )

    # 1. Execute Triage (cached if unchanged)
    result = triage_service.triage_ticket(ticket, use_cache=True)

    # 2. Assert Invariants
    if "expected_category" in case:
        assert result.category == case["expected_category"], f"Expected {case['expected_category']}, got {result.category}"
    if "expected_priority" in case:
        assert result.priority == case["expected_priority"], f"Expected {case['expected_priority']}, got {result.priority}"
    if "expected_escalation" in case:
        assert result.requires_human_escalation == case["expected_escalation"], (
            f"Escalation mismatch: expected {case['expected_escalation']}"
        )

    # 3. Deterministic Safety Assertions
    pii_violations = scan_for_unmasked_pii(result.draft_response)
    assert len(pii_violations) == 0, f"PII detected in draft response: {pii_violations}"

    # 4. LLM Judge Evaluation
    judge_result = gemini_judge.evaluate(
        ticket_subject=ticket.subject,
        ticket_message=ticket.message,
        draft_response=result.draft_response,
    )

    consistency = judge_result.get("factual_consistency_score", 0.0)
    hallucination = judge_result.get("hallucination_score", 1.0)
    cot_reasoning = judge_result.get("chain_of_thought", "")

    # Hard-Fail Thresholds
    assert consistency >= 0.85, (
        f"Factual consistency score {consistency:.2f} < 0.85 threshold.\n"
        f"Reasoning: {cot_reasoning}\n"
        f"Draft Response: {result.draft_response}"
    )

    assert hallucination <= 0.10, (
        f"Hallucination score {hallucination:.2f} > 0.10 threshold.\n"
        f"Reasoning: {cot_reasoning}\n"
        f"Draft Response: {result.draft_response}"
    )
