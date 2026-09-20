import pytest
from agentaudit.redactor import redact_text, redact_data


def test_redact_credit_cards():
    text = "Please charge 4532 0123 4567 8910 for invoice 123"
    redacted = redact_text(text)
    assert "4532" not in redacted
    assert "****-****-****-8910" in redacted


def test_redact_ssn():
    text = "Applicant SSN is 000-12-3456 verified"
    redacted = redact_text(text)
    assert "000-12-3456" not in redacted
    assert "***-**-****" in redacted


def test_redact_api_keys():
    text = "Use key gsk_12345678901234567890123456789012 for inference"
    redacted = redact_text(text)
    assert "gsk_123" not in redacted
    assert "[REDACTED_API_KEY]" in redacted


def test_redact_dict_data():
    payload = {
        "user": "alice",
        "password": "SuperSecretPassword123!",
        "api_key": "sk-12345678901234567890123456789012",
        "nested": {
            "credit_card": "4111111111111111",
            "normal_field": "hello world",
        },
    }
    redacted = redact_data(payload)
    assert redacted["password"] == "********"
    assert redacted["api_key"] == "********"
    assert redacted["nested"]["credit_card"] == "********"
    assert redacted["nested"]["normal_field"] == "hello world"
