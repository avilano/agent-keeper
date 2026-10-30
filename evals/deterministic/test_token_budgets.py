import pytest
from src.triage.prompts import TRIAGE_SYSTEM_PROMPT, format_user_prompt

# Approximate token estimator: ~4 characters per token for English text
def estimate_tokens(text: str) -> int:
    return len(text) // 4


def test_system_prompt_within_budget():
    MAX_SYSTEM_TOKENS = 600
    token_est = estimate_tokens(TRIAGE_SYSTEM_PROMPT)
    assert token_est < MAX_SYSTEM_TOKENS, f"System prompt exceeds budget: {token_est} tokens"


def test_triage_user_prompt_within_budget():
    MAX_USER_TOKENS = 500
    sample_subject = "Urgent billing question regarding our Q3 enterprise invoice"
    sample_message = "A" * 800  # 200 tokens
    user_prompt = format_user_prompt(sample_subject, sample_message, "enterprise")
    token_est = estimate_tokens(user_prompt)
    assert token_est < MAX_USER_TOKENS, f"User prompt exceeds ceiling: {token_est} tokens"
