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
    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.groq_api_key = api_key or os.getenv("GROQ_API_KEY")
        self.gemini_api_key = os.getenv("GEMINI_API_KEY")

        if self.groq_api_key:
            self.provider = "groq"
            self.model = model or "openai/gpt-oss-20b"
        elif self.gemini_api_key:
            self.provider = "gemini"
            self.model = model or "gemini-3.8-flash"
        else:
            self.provider = "none"
            self.model = model or "llama-3.1-8b-instant"

        self._groq_client = None
        self._gemini_client = None

    @property
    def groq_client(self):
        if self._groq_client is None:
            if not self.groq_api_key:
                raise ValueError("GROQ_API_KEY environment variable is not set")
            from groq import Groq
            self._groq_client = Groq(api_key=self.groq_api_key)
        return self._groq_client

    @property
    def gemini_client(self):
        if self._gemini_client is None:
            if not self.gemini_api_key:
                raise ValueError("GEMINI_API_KEY environment variable is not set")
            from google import genai
            self._gemini_client = genai.Client(api_key=self.gemini_api_key)
        return self._gemini_client

    @retry(
        wait=wait_random_exponential(multiplier=1, max=30),
        stop=stop_after_attempt(4),
        reraise=True,
    )
    def _call_llm(self, system_prompt: str, user_prompt: str) -> str:
        if self.provider == "groq":
            completion = self.groq_client.chat.completions.create(
                model=self.model,
                temperature=0.0,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            return completion.choices[0].message.content
        elif self.provider == "gemini":
            response = self.gemini_client.models.generate_content(
                model=self.model,
                contents=[system_prompt, user_prompt],
                config={
                    "response_mime_type": "application/json",
                    "response_schema": TriageResult,
                    "temperature": 0.0,
                },
            )
            return response.text
        else:
            raise ValueError("Neither GROQ_API_KEY nor GEMINI_API_KEY is configured")

    def triage_ticket(self, ticket: TicketInput, use_cache: bool = True) -> TriageResult:
        user_prompt = format_user_prompt(ticket.subject, ticket.message, ticket.tier)
        cache_key = get_cache_key(self.model, TRIAGE_SYSTEM_PROMPT, user_prompt)

        if use_cache:
            cached = read_from_cache(cache_key)
            if cached:
                return TriageResult.model_validate(cached)

        raw_output = self._call_llm(TRIAGE_SYSTEM_PROMPT, user_prompt)
        parsed = json.loads(raw_output)
        validated = TriageResult.model_validate(parsed)

        if use_cache:
            write_to_cache(cache_key, validated.model_dump())

        return validated
