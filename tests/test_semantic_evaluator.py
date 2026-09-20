"""Unit tests for the semantic evaluator tier."""

import pytest
from agentaudit.models import CheckTier, PolicyRule, Verdict
from agentaudit.semantic_evaluator import MockSemanticEvaluator


@pytest.fixture
def mock_evaluator():
    return MockSemanticEvaluator()


@pytest.mark.asyncio
async def test_mock_evaluator_catches_aggressive_email(mock_evaluator):
    rule = PolicyRule(
        name="email_tone",
        description="Appropriate tone",
        applies_to="send_email",
        tier=CheckTier.SEMANTIC,
        policy_intent="Email must be professional and empathetic.",
        action=Verdict.FLAG_FOR_REVIEW,
    )
    res = await mock_evaluator.evaluate(
        rule=rule,
        tool_name="send_email",
        arguments={"to": "user@example.com", "body": "Your incompetence is unacceptable, idiot."},
    )
    assert res.verdict == Verdict.FLAG_FOR_REVIEW
    assert res.tier == CheckTier.SEMANTIC
    assert res.confidence >= 0.7


@pytest.mark.asyncio
async def test_mock_evaluator_allows_friendly_email(mock_evaluator):
    rule = PolicyRule(
        name="email_tone",
        description="Appropriate tone",
        applies_to="send_email",
        tier=CheckTier.SEMANTIC,
        policy_intent="Email must be professional and empathetic.",
        action=Verdict.FLAG_FOR_REVIEW,
    )
    res = await mock_evaluator.evaluate(
        rule=rule,
        tool_name="send_email",
        arguments={"to": "user@example.com", "body": "Hi there, hope you are having a wonderful day!"},
    )
    assert res.verdict == Verdict.ALLOW
