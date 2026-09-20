"""Unit tests for the PolicyEngine orchestrator."""

import pytest
from agentaudit.models import Verdict
from agentaudit.policy_engine import PolicyEngine


@pytest.fixture
def engine():
    return PolicyEngine(
        policy_file="policies/default_policies.yaml",
        enable_semantic=False,
    )


def test_policies_loaded(engine):
    rules = engine.get_rules()
    assert len(rules) > 0
    rule_names = [r.name for r in rules]
    assert "spend_cap_per_transaction" in rule_names
    assert "no_sensitive_file_deletion" in rule_names


@pytest.mark.asyncio
async def test_hard_rule_short_circuits_on_block(engine):
    entry = await engine.evaluate(
        tool_name="spend_money",
        arguments={"amount": 999.0, "vendor": "Luxury Cars"},
        session_id="session_short_circuit",
    )
    assert entry.decision == Verdict.BLOCK
    verdicts = [r.verdict for r in entry.check_results]
    assert Verdict.BLOCK in verdicts


@pytest.mark.asyncio
async def test_allowed_evaluation_returns_allow(engine):
    entry = await engine.evaluate(
        tool_name="send_email",
        arguments={"to": "bob@company.com", "subject": "Update", "body": "Weekly progress."},
        session_id="session_allow",
    )
    assert entry.decision == Verdict.ALLOW
    for r in entry.check_results:
        assert r.verdict == Verdict.ALLOW
