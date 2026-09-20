import pytest
from datetime import datetime, timezone
from sqlalchemy import text

from agentaudit.database import AuditDatabase
from agentaudit.models import AuditEntry, CheckResult, CheckTier, Verdict


@pytest.mark.asyncio
async def test_hash_chain_creation_and_verification(tmp_path):
    db_file = tmp_path / "chain_test.db"
    db_url = f"sqlite+aiosqlite:///{db_file}"
    db = AuditDatabase(database_url=db_url)
    await db.init_db()

    # Insert 3 entries
    for i in range(3):
        entry = AuditEntry(
            agent_id="test_agent",
            session_id="test_sess",
            tool_name="spend_money",
            arguments={"amount": 10 * (i + 1)},
            decision=Verdict.ALLOW,
            check_results=[
                CheckResult(
                    rule_name="spend_cap",
                    tier=CheckTier.HARD_RULE,
                    verdict=Verdict.ALLOW,
                    explanation="Within cap",
                    confidence=1.0,
                    latency_ms=0.1,
                )
            ],
        )
        await db.insert_entry(entry)

    # Verify integrity
    res = await db.verify_chain_integrity()
    assert res.verified is True
    assert res.total_entries == 3
    assert res.chain_head is not None
    assert len(res.tampered_entry_ids) == 0


@pytest.mark.asyncio
async def test_hash_chain_tamper_detection(tmp_path):
    db_file = tmp_path / "chain_tamper.db"
    db_url = f"sqlite+aiosqlite:///{db_file}"
    db = AuditDatabase(database_url=db_url)
    await db.init_db()

    # Insert 2 entries
    for i in range(2):
        entry = AuditEntry(
            agent_id="test_agent",
            session_id="test_sess",
            tool_name="spend_money",
            arguments={"amount": 25 * (i + 1)},
            decision=Verdict.ALLOW,
            check_results=[],
        )
        await db.insert_entry(entry)

    # Tamper directly with entry in the database
    async with db._session_factory() as session:
        await session.execute(
            text("UPDATE audit_log SET arguments_json = '{\"amount\": 999999}' WHERE arguments_json LIKE '%25%'")
        )
        await session.commit()

    # Verify integrity should now catch the tamper!
    res = await db.verify_chain_integrity()
    assert res.verified is False
    assert len(res.tampered_entry_ids) > 0
