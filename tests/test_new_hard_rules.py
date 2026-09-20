import pytest
from agentaudit.hard_rules import HardRuleEvaluator
from agentaudit.models import CheckTier, PolicyCondition, PolicyRule, Verdict
from agentaudit.session import SessionState


def test_numeric_lt_and_between():
    evaluator = HardRuleEvaluator()
    session = SessionState(session_id="test")

    # numeric_lt rule: block if balance < 100
    rule_lt = PolicyRule(
        name="min_balance",
        description="Minimum account balance requirement",
        applies_to="transfer_money",
        tier=CheckTier.HARD_RULE,
        action=Verdict.BLOCK,
        condition=PolicyCondition(
            type="numeric_lt",
            field="balance",
            threshold=100.0,
        ),
    )

    res_pass = evaluator.evaluate(rule_lt, {"balance": 150.0}, session)
    assert res_pass.verdict == Verdict.ALLOW

    res_fail = evaluator.evaluate(rule_lt, {"balance": 45.0}, session)
    assert res_fail.verdict == Verdict.BLOCK

    # numeric_between: block if amount is between 500 and 1000
    rule_between = PolicyRule(
        name="forbidden_band",
        description="Forbidden transaction band",
        applies_to="spend_money",
        tier=CheckTier.HARD_RULE,
        action=Verdict.BLOCK,
        condition=PolicyCondition(
            type="numeric_between",
            field="amount",
            min_threshold=500.0,
            max_threshold=1000.0,
        ),
    )

    assert evaluator.evaluate(rule_between, {"amount": 250}, session).verdict == Verdict.ALLOW
    assert evaluator.evaluate(rule_between, {"amount": 750}, session).verdict == Verdict.BLOCK
    assert evaluator.evaluate(rule_between, {"amount": 1200}, session).verdict == Verdict.ALLOW


def test_private_ip_ssrf_protection():
    evaluator = HardRuleEvaluator()
    session = SessionState(session_id="test")

    rule_ssrf = PolicyRule(
        name="ssrf_guard",
        description="SSRF metadata protection",
        applies_to="web_search",
        tier=CheckTier.HARD_RULE,
        action=Verdict.BLOCK,
        condition=PolicyCondition(
            type="private_ip_denied",
            field="query",
        ),
    )

    # Legitimate queries
    assert evaluator.evaluate(rule_ssrf, {"query": "https://example.com/api"}, session).verdict == Verdict.ALLOW
    assert evaluator.evaluate(rule_ssrf, {"query": "how to implement policy engines"}, session).verdict == Verdict.ALLOW

    # SSRF queries
    assert evaluator.evaluate(rule_ssrf, {"query": "http://169.254.169.254/latest/meta-data/"}, session).verdict == Verdict.BLOCK
    assert evaluator.evaluate(rule_ssrf, {"query": "http://localhost:8080/admin"}, session).verdict == Verdict.BLOCK
    assert evaluator.evaluate(rule_ssrf, {"query": "http://127.0.0.1:5000"}, session).verdict == Verdict.BLOCK
    assert evaluator.evaluate(rule_ssrf, {"query": "http://10.0.0.5/internal"}, session).verdict == Verdict.BLOCK


def test_rate_limiting():
    evaluator = HardRuleEvaluator()
    session = SessionState(session_id="test_rate")

    rule_rate = PolicyRule(
        name="rate_limit",
        description="Max 2 calls per window",
        applies_to="api_call",
        tier=CheckTier.HARD_RULE,
        action=Verdict.BLOCK,
        condition=PolicyCondition(
            type="rate_limit_exceeded",
            field="api_call",
            max_calls=2,
            window_seconds=10.0,
        ),
    )

    # First call - OK
    session.record_action("api_call", {})
    assert evaluator.evaluate(rule_rate, {}, session).verdict == Verdict.ALLOW

    # Second call - exceeds limit (>= 2 recorded calls)
    session.record_action("api_call", {})
    assert evaluator.evaluate(rule_rate, {}, session).verdict == Verdict.BLOCK
