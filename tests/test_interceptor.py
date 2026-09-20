"""Integration tests for the @audited_tool interceptor decorator."""

import pytest
import pytest_asyncio
from agentaudit.database import AuditDatabase
from agentaudit.interceptor import (
    ActionBlockedError,
    AuditContext,
    audited_tool,
    initialize,
    reset,
)
from agentaudit.models import Verdict
from agentaudit.policy_engine import PolicyEngine


@pytest_asyncio.fixture(autouse=True)
async def setup_environment(tmp_path):
    reset()
    db_file = tmp_path / "test_audit.db"
    db = AuditDatabase(f"sqlite+aiosqlite:///{db_file}")
    await db.init_db()

    engine = PolicyEngine(
        policy_file="policies/default_policies.yaml",
        enable_semantic=False,
    )
    await initialize(policy_engine=engine, database=db)
    yield
    reset()


@audited_tool("send_email")
def dummy_send_email(to: str, subject: str, body: str) -> dict:
    return {"status": "sent", "to": to}


@audited_tool("spend_money")
def dummy_spend_money(amount: float, vendor: str) -> dict:
    return {"status": "paid", "amount": amount, "vendor": vendor}


def test_allowed_action_executes_and_returns_result():
    with AuditContext(agent_id="test_agent", session_id="test_session"):
        result = dummy_send_email(
            to="alice@company.com",
            subject="Status Report",
            body="All systems nominal.",
        )
    assert result == {"status": "sent", "to": "alice@company.com"}


def test_blocked_action_raises_action_blocked_error():
    with pytest.raises(ActionBlockedError) as exc_info:
        with AuditContext(agent_id="test_agent", session_id="test_session"):
            dummy_spend_money(amount=500.0, vendor="MegaCorp")

    assert exc_info.value.entry.tool_name == "spend_money"
    blocked_rules = [cr.rule_name for cr in exc_info.value.entry.check_results if cr.verdict == Verdict.BLOCK]
    assert "spend_cap_per_transaction" in blocked_rules


def test_flagged_action_still_executes():
    with AuditContext(agent_id="test_agent", session_id="test_session"):
        # External domain flags for review in default policies
        result = dummy_send_email(
            to="external@gmail.com",
            subject="Hello",
            body="Meeting tomorrow.",
        )
    assert result["status"] == "sent"
