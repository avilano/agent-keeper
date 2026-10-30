import pytest
from pydantic import ValidationError
from src.triage.schemas import (
    TriageResult,
    TicketPriority,
    TicketCategory,
    CustomerSentiment,
)


def test_valid_triage_result_schema():
    payload = {
        "category": "technical_support",
        "priority": "P0",
        "sentiment": "frustrated",
        "routing_team": "Reliability Engineering",
        "extracted_claims": ["Database connection pool exhausted", "500 errors on microservices"],
        "requires_human_escalation": True,
        "draft_response": "We have escalated this issue to our Reliability Engineering team immediately.",
    }
    result = TriageResult.model_validate(payload)
    assert result.priority == TicketPriority.P0
    assert result.category == TicketCategory.TECHNICAL_SUPPORT
    assert result.requires_human_escalation is True


def test_invalid_category_fails_validation():
    payload = {
        "category": "unknown_category",
        "priority": "P1",
        "sentiment": "neutral",
        "routing_team": "Support",
        "extracted_claims": [],
        "requires_human_escalation": False,
        "draft_response": "We will look into your request shortly.",
    }
    with pytest.raises(ValidationError):
        TriageResult.model_validate(payload)


def test_invalid_priority_fails_validation():
    payload = {
        "category": "billing",
        "priority": "URGENT_CRITICAL",  # Must be P0, P1, P2, P3
        "sentiment": "neutral",
        "routing_team": "Billing",
        "extracted_claims": [],
        "requires_human_escalation": False,
        "draft_response": "Checking your billing statement.",
    }
    with pytest.raises(ValidationError):
        TriageResult.model_validate(payload)


def test_missing_required_fields_fails_validation():
    payload = {
        "category": "billing",
        "priority": "P2",
        # missing sentiment, routing_team, draft_response, etc.
    }
    with pytest.raises(ValidationError):
        TriageResult.model_validate(payload)
