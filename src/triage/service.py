import hashlib
import json
import os
from pathlib import Path
from typing import Optional

from tenacity import (
    retry,
    stop_after_attempt,
    wait_random_exponential,
    retry_if_exception_type,
)

from src.triage.schemas import TriageResult, TicketInput
from src.triage.prompts import TRIAGE_SYSTEM_PROMPT, format_user_prompt

CACHE_DIR = Path(".eval_cache")


def get_cache_key(model: str, system_prompt: str, user_prompt: str) -> str:
    raw = f"{model}:{system_prompt}:{user_prompt}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def read_from_cache(cache_key: str) -> Optional[dict]:
    cache_file = CACHE_DIR / f"{cache_key}.json"
    if cache_file.exists():
        try:
            return json.loads(cache_file.read_text(encoding="utf-8"))
        except Exception:
            return None
    return None


def write_to_cache(cache_key: str, data: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_DIR / f"{cache_key}.json"
    cache_file.write_text(json.dumps(data, indent=2), encoding="utf-8")


class TriageService:
    def __init__(self, api_key: Optional[str] = None, model: str = "llama-3.1-8b-instant"):
        self.api_key = api_key or os.getenv("GROQ_API_KEY")
        self.model = model
        self._client = None

    @property
    def client(self):
        if self._client is None:
            if not self.api_key:
                raise ValueError("GROQ_API_KEY environment variable is not set")
            from groq import Groq
            self._client = Groq(api_key=self.api_key)
        return self._client

    @retry(
        wait=wait_random_exponential(multiplier=1, max=30),
        stop=stop_after_attempt(4),
        reraise=True,
    )
    def _call_groq(self, system_prompt: str, user_prompt: str) -> str:
        completion = self.client.chat.completions.create(
            model=self.model,
            temperature=0.0,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        return completion.choices[0].message.content

    def triage_ticket(self, ticket: TicketInput, use_cache: bool = True) -> TriageResult:
        user_prompt = format_user_prompt(ticket.subject, ticket.message, ticket.tier)
        cache_key = get_cache_key(self.model, TRIAGE_SYSTEM_PROMPT, user_prompt)

        if use_cache:
            cached = read_from_cache(cache_key)
            if cached:
                return TriageResult.model_validate(cached)

        raw_output = self._call_groq(TRIAGE_SYSTEM_PROMPT, user_prompt)
        parsed = json.loads(raw_output)
        validated = TriageResult.model_validate(parsed)

        if use_cache:
            write_to_cache(cache_key, validated.model_dump())

        return validated
