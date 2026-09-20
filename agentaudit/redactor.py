"""
PII & Sensitive Data Redactor for AgentAudit.

Scrubs credit card numbers, Social Security Numbers, API keys,
bearer tokens, and sensitive password patterns from tool arguments,
execution results, and audit logs.
"""

from __future__ import annotations

import re
from typing import Any

# Regex patterns for sensitive data
CREDIT_CARD_REGEX = re.compile(r"\b(?:\d[ -]*?){13,16}\b")
SSN_REGEX = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
API_KEY_PATTERNS = [
    # OpenAI / Groq style tokens
    re.compile(r"(gsk_[a-zA-Z0-9]{32,})"),
    re.compile(r"(sk-[a-zA-Z0-9]{32,})"),
    # GitHub personal tokens
    re.compile(r"(ghp_[a-zA-Z0-9]{36,})"),
    # Generic bearer tokens
    re.compile(r"(?i)bearer\s+([a-zA-Z0-9_.\-~+/]{20,})"),
]

# Sensitive keys to redact regardless of format
SENSITIVE_KEY_NAMES = {
    "password",
    "passwd",
    "secret",
    "api_key",
    "token",
    "access_token",
    "private_key",
    "credentials",
    "authorization",
    "credit_card",
    "ssn",
}


def mask_credit_card(match: re.Match) -> str:
    digits = re.sub(r"\D", "", match.group(0))
    if len(digits) >= 13 and len(digits) <= 16:
        return f"****-****-****-{digits[-4:]}"
    return match.group(0)


def redact_text(text: str) -> str:
    """Mask credentials, SSNs, and card numbers inside text."""
    if not isinstance(text, str):
        return text

    # Redact SSN
    text = SSN_REGEX.sub("***-**-****", text)

    # Redact Credit Cards
    text = CREDIT_CARD_REGEX.sub(mask_credit_card, text)

    # Redact known API key patterns
    for pattern in API_KEY_PATTERNS:
        text = pattern.sub("[REDACTED_API_KEY]", text)

    return text


def redact_data(data: Any) -> Any:
    """
    Recursively redact sensitive information from dicts, lists, and strings.
    Leaves non-string primitives intact.
    """
    if isinstance(data, dict):
        redacted_dict: dict[str, Any] = {}
        for k, v in data.items():
            key_lower = str(k).lower()
            if any(sens in key_lower for sens in SENSITIVE_KEY_NAMES):
                redacted_dict[k] = "********"
            else:
                redacted_dict[k] = redact_data(v)
        return redacted_dict

    if isinstance(data, list):
        return [redact_data(item) for item in data]

    if isinstance(data, str):
        return redact_text(data)

    return data
