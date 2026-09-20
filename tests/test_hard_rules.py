"""Unit tests for the deterministic HardRuleEvaluator."""

import pytest
from agentaudit.hard_rules import HardRuleEvaluator
from agentaudit.models import CheckTier, PolicyRule, Verdict
from agentaudit.session import SessionState


@pytest.fixture
def evaluator():
    return HardRuleEvaluator(reference_lists={"trusted_domains": ["company.com", "partner.org"]})


@pytest.fixture
def session():
    return SessionState(session_id="test_session")


def test_numeric_gt_triggers_block(evaluator, session):
    rule = PolicyRule(
        name="spend_cap",
        description="Cap single transactions at $200",
        applies_to="spend_money",
        tier=CheckTier.HARD_RULE,
        condition={"type": "numeric_gt", "field": "amount", "threshold": 200},
        action=Verdict.BLOCK,
    )
    result = evaluator.evaluate(rule, {"amount": 250}, session)
    assert result.verdict == Verdict.BLOCK
    assert "exceeds threshold 200" in result.explanation


def test_numeric_gt_passes_under_threshold(evaluator, session):
    rule = PolicyRule(
        name="spend_cap",
        description="Cap single transactions at $200",
        applies_to="spend_money",
        tier=CheckTier.HARD_RULE,
        condition={"type": "numeric_gt", "field": "amount", "threshold": 200},
        action=Verdict.BLOCK,
    )
    result = evaluator.evaluate(rule, {"amount": 50}, session)
    assert result.verdict == Verdict.ALLOW


def test_domain_not_in_list_flags_external(evaluator, session):
    rule = PolicyRule(
        name="trusted_email",
        description="External emails require review",
        applies_to="send_email",
        tier=CheckTier.HARD_RULE,
        condition={"type": "domain_not_in_list", "field": "to", "list_name": "trusted_domains"},
        action=Verdict.FLAG_FOR_REVIEW,
    )
    result = evaluator.evaluate(rule, {"to": "stranger@gmail.com"}, session)
    assert result.verdict == Verdict.FLAG_FOR_REVIEW


def test_domain_not_in_list_allows_trusted(evaluator, session):
    rule = PolicyRule(
        name="trusted_email",
        description="External emails require review",
        applies_to="send_email",
        tier=CheckTier.HARD_RULE,
        condition={"type": "domain_not_in_list", "field": "to", "list_name": "trusted_domains"},
        action=Verdict.FLAG_FOR_REVIEW,
    )
    result = evaluator.evaluate(rule, {"to": "alice@company.com"}, session)
    assert result.verdict == Verdict.ALLOW


def test_path_starts_with_blocks_protected_files(evaluator, session):
    rule = PolicyRule(
        name="no_sys_delete",
        description="Cannot delete protected system paths",
        applies_to="delete_file",
        tier=CheckTier.HARD_RULE,
        condition={"type": "path_starts_with", "field": "file_path", "prefixes": ["/etc", "/var/secrets"]},
        action=Verdict.BLOCK,
    )
    result = evaluator.evaluate(rule, {"file_path": "/etc/shadow"}, session)
    assert result.verdict == Verdict.BLOCK


def test_path_starts_with_allows_safe_paths(evaluator, session):
    rule = PolicyRule(
        name="no_sys_delete",
        description="Cannot delete protected system paths",
        applies_to="delete_file",
        tier=CheckTier.HARD_RULE,
        condition={"type": "path_starts_with", "field": "file_path", "prefixes": ["/etc", "/var/secrets"]},
        action=Verdict.BLOCK,
    )
    result = evaluator.evaluate(rule, {"file_path": "/tmp/test.log"}, session)
    assert result.verdict == Verdict.ALLOW


def test_cumulative_spend_tracking(evaluator, session):
    rule = PolicyRule(
        name="session_budget",
        description="Session cumulative spend cap $500",
        applies_to="spend_money",
        tier=CheckTier.HARD_RULE,
        condition={
            "type": "cumulative_gt",
            "field": "amount",
            "session_field": "cumulative_session_spend",
            "threshold": 500,
        },
        action=Verdict.BLOCK,
    )
    # Under limit (300 + 100 = 400 <= 500)
    session.cumulative_session_spend = 300
    res1 = evaluator.evaluate(rule, {"amount": 100}, session)
    assert res1.verdict == Verdict.ALLOW

    # Over limit (350 + 200 = 550 > 500)
    session.cumulative_session_spend = 350
    res2 = evaluator.evaluate(rule, {"amount": 200}, session)
    assert res2.verdict == Verdict.BLOCK
