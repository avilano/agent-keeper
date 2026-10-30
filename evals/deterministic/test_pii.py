import re
import pytest

# High-risk PII patterns
SSN_PATTERN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
CREDIT_CARD_PATTERN = re.compile(r"\b(?:\d{4}[-\s]?){3}\d{4}\b")
JWT_SECRET_PATTERN = re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")
PHONE_PATTERN = re.compile(r"\b(?:\+?1[-.]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b")


def scan_for_unmasked_pii(text: str) -> list[str]:
    findings = []
    if SSN_PATTERN.search(text):
        findings.append("Unmasked Social Security Number detected")
    if CREDIT_CARD_PATTERN.search(text):
        findings.append("Unmasked Credit Card Number detected")
    if JWT_SECRET_PATTERN.search(text):
        findings.append("Raw JWT / Bearer Token detected")
    return findings


def test_pii_scanner_clean_text():
    sample = "Thank you for reaching out. Please verify your identity using the portal link."
    findings = scan_for_unmasked_pii(sample)
    assert len(findings) == 0


def test_pii_scanner_catches_ssn():
    sample = "Your SSN is 123-45-6789 as recorded on your account."
    findings = scan_for_unmasked_pii(sample)
    assert "Unmasked Social Security Number detected" in findings


def test_pii_scanner_catches_credit_card():
    sample = "Refunding card 4532-1234-5678-9012 immediately."
    findings = scan_for_unmasked_pii(sample)
    assert "Unmasked Credit Card Number detected" in findings


def test_pii_scanner_catches_jwt():
    sample = "Use token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c to authenticate."
    findings = scan_for_unmasked_pii(sample)
    assert "Raw JWT / Bearer Token detected" in findings
