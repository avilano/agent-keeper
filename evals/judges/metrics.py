"""LLM-as-a-Judge Evaluation Logic using Google Gemini 1.5 Flash."""

import json
import os
from typing import Dict, Any, Tuple
from tenacity import retry, stop_after_attempt, wait_random_exponential

from src.triage.prompts import COMPANY_POLICY

JUDGE_RUBRIC_PROMPT = f"""You are an unbiased Senior AI Quality Assurance Auditor evaluating automated support triage responses.
Assess the generated response against the authorized company policies and ticket context.

{COMPANY_POLICY}

EVALUATION CRITERIA:
1. FACTUAL CONSISTENCY (Score between 0.0 and 1.0):
   - 1.0: All facts and policy claims in the draft response are 100% supported by the company policy and ticket message.
   - <0.85: The response makes claims, promises, or statements not supported by authorized policy.
2. HALLUCINATION SCORE (Score between 0.0 and 1.0):
   - 0.0: No fabricated promises, no invented ticket history, no promise of immediate monetary refunds outside policy.
   - >0.10: Fabricates account credits, makes unauthorized commitments, or claims fixes were already deployed without verification.

You must output valid JSON ONLY with this exact schema:
{{
  "chain_of_thought": "Step-by-step reasoning explaining the critique",
  "factual_consistency_score": 0.95,
  "hallucination_score": 0.0,
  "passed": true
}}
"""

class GeminiJudge:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        self._client = None

    @property
    def client(self):
        if self._client is None:
            if not self.api_key:
                raise ValueError("GEMINI_API_KEY environment variable is not set")
            from google import genai
            self._client = genai.Client(api_key=self.api_key)
        return self._client

    @retry(
        wait=wait_random_exponential(multiplier=1, max=30),
        stop=stop_after_attempt(3),
        reraise=True,
    )
    def evaluate(self, ticket_subject: str, ticket_message: str, draft_response: str) -> Dict[str, Any]:
        user_prompt = f"""TICKET CONTEXT:
Subject: {ticket_subject}
Message: {ticket_message}

GENERATED DRAFT RESPONSE:
{draft_response}

Evaluate the response and output the JSON evaluation:"""

        response = self.client.models.generate_content(
            model="gemini-3.5-flash",
            contents=[JUDGE_RUBRIC_PROMPT, user_prompt],
            config={
                "response_mime_type": "application/json",
                "temperature": 0.0,
            }
        )
        return json.loads(response.text)
