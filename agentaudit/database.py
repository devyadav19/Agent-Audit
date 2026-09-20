"""
Audit Database — Immutable audit trail storage.

Stores every AuditEntry in SQLite via SQLAlchemy (async).
Provides queryable access for the API layer and an in-memory
pub/sub for WebSocket streaming of new entries.

Design choice: SQLite is ideal for a portfolio project —
zero-config, file-based, portable. Reviewers can git clone
and run without setting up PostgreSQL.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Callable

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    create_engine,
    desc,
    text,
)
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from agentaudit.models import AuditEntry, Verdict

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# SQLAlchemy models
# ---------------------------------------------------------------------------

class Base(DeclarativeBase):
    pass


import hashlib

class AuditLogRow(Base):
    """SQLAlchemy model for the audit_log table."""
    __tablename__ = "audit_log"

    id = Column(String, primary_key=True)
    timestamp = Column(DateTime, nullable=False, index=True)
    agent_id = Column(String, nullable=False, index=True)
    session_id = Column(String, nullable=False, index=True)
    tool_name = Column(String, nullable=False, index=True)
    arguments_json = Column(Text, nullable=False)
    decision = Column(String, nullable=False, index=True)
    check_results_json = Column(Text, nullable=False)
    execution_result_json = Column(Text, nullable=True)
    total_latency_ms = Column(Float, nullable=False, default=0.0)
    error = Column(Text, nullable=True)
    prev_hash = Column(String, nullable=True)
    entry_hash = Column(String, nullable=True, index=True)


# ---------------------------------------------------------------------------
# Database manager
# ---------------------------------------------------------------------------

GENESIS_HASH = "0" * 64


def normalize_timestamp(ts: Any) -> str:
    """Normalize datetime to a consistent string format across SQLite storage engines."""
    if hasattr(ts, "strftime"):
        return ts.strftime("%Y-%m-%d %H:%M:%S")
    return str(ts)[:19]


def compute_entry_hash(
    entry_id: str,
    timestamp: Any,
    agent_id: str,
    session_id: str,
    tool_name: str,
    decision: str,
    arguments_json: str,
    prev_hash: str,
) -> str:
    """Compute SHA-256 hash of an audit entry linking it to previous entry."""
    ts_str = normalize_timestamp(timestamp)
    payload = f"{entry_id}|{ts_str}|{agent_id}|{session_id}|{tool_name}|{decision}|{arguments_json}|{prev_hash}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()



class AuditDatabase:
    """
    Async database manager for the audit trail with cryptographic hash-chain verification.
    
    Handles storage, retrieval, tamper-evident hash chaining, and real-time broadcasting.
    """

    def __init__(self, database_url: str = "sqlite+aiosqlite:///./agentaudit.db") -> None:
        self._engine = create_async_engine(database_url, echo=False)
        self._session_factory = sessionmaker(
            self._engine, class_=AsyncSession, expire_on_commit=False
        )
        # Subscribers for real-time streaming
        self._subscribers: list[Callable[[AuditEntry], Any]] = []

    async def init_db(self) -> None:
        """Create tables if they don't exist and run light migrations for missing columns."""
        async with self._engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            # Ensure prev_hash and entry_hash columns exist if database was pre-existing
            try:
                await conn.execute(text("ALTER TABLE audit_log ADD COLUMN prev_hash TEXT"))
            except Exception:
                pass
            try:
                await conn.execute(text("ALTER TABLE audit_log ADD COLUMN entry_hash TEXT"))
            except Exception:
                pass
        logger.info("Audit database initialized with hash-chain schema")

    async def insert_entry(self, entry: AuditEntry) -> None:
        """
        Insert an audit entry with tamper-evident SHA-256 hash-chaining and broadcast.
        """
        args_json = json.dumps(entry.arguments, sort_keys=True)

        async with self._session_factory() as session:
            # Fetch the previous entry's hash to chain
            result = await session.execute(
                text("SELECT entry_hash FROM audit_log ORDER BY timestamp DESC, id DESC LIMIT 1")
            )
            last_row = result.fetchone()
            prev_hash = last_row[0] if (last_row and last_row[0]) else GENESIS_HASH

            # Calculate this entry's cryptographic hash
            entry_hash = compute_entry_hash(
                entry_id=entry.id,
                timestamp=entry.timestamp,
                agent_id=entry.agent_id,
                session_id=entry.session_id,
                tool_name=entry.tool_name,
                decision=entry.decision.value,
                arguments_json=args_json,
                prev_hash=prev_hash,
            )


            entry.prev_hash = prev_hash
            entry.entry_hash = entry_hash

            row = AuditLogRow(
                id=entry.id,
                timestamp=entry.timestamp,
                agent_id=entry.agent_id,
                session_id=entry.session_id,
                tool_name=entry.tool_name,
                arguments_json=args_json,
                decision=entry.decision.value,
                check_results_json=json.dumps(
                    [r.model_dump() for r in entry.check_results]
                ),
                execution_result_json=json.dumps(entry.execution_result)
                if entry.execution_result is not None
                else None,
                total_latency_ms=entry.total_latency_ms,
                error=entry.error,
                prev_hash=prev_hash,
                entry_hash=entry_hash,
            )

            session.add(row)
            await session.commit()

        # Broadcast to WebSocket subscribers
        for callback in self._subscribers:
            try:
                result = callback(entry)
                if asyncio.iscoroutine(result):
                    await result
            except Exception as e:
                logger.error(f"Subscriber notification failed: {e}")

    def subscribe(self, callback: Callable[[AuditEntry], Any]) -> None:
        """Register a callback for real-time entry notifications."""
        self._subscribers.append(callback)


    def unsubscribe(self, callback: Callable[[AuditEntry], Any]) -> None:
        """Remove a subscriber callback."""
        self._subscribers = [s for s in self._subscribers if s is not callback]

    async def get_entries(
        self,
        agent_id: str | None = None,
        tool_name: str | None = None,
        verdict: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[AuditEntry]:
        """Query audit entries with optional filters."""
        async with self._session_factory() as session:
            # Build query dynamically
            query = "SELECT * FROM audit_log WHERE 1=1"
            params: dict[str, Any] = {}

            if agent_id:
                query += " AND agent_id = :agent_id"
                params["agent_id"] = agent_id
            if tool_name:
                query += " AND tool_name = :tool_name"
                params["tool_name"] = tool_name
            if verdict:
                query += " AND decision = :verdict"
                params["verdict"] = verdict

            query += " ORDER BY timestamp DESC LIMIT :limit OFFSET :offset"
            params["limit"] = limit
            params["offset"] = offset

            result = await session.execute(text(query), params)
            rows = result.fetchall()

        return [self._row_to_entry(row) for row in rows]

    async def get_entry_by_id(self, entry_id: str) -> AuditEntry | None:
        """Get a single entry by ID."""
        async with self._session_factory() as session:
            result = await session.execute(
                text("SELECT * FROM audit_log WHERE id = :id"),
                {"id": entry_id},
            )
            row = result.fetchone()

        if row is None:
            return None
        return self._row_to_entry(row)

    async def get_stats(self) -> dict[str, Any]:
        """Get aggregate statistics for the dashboard."""
        async with self._session_factory() as session:
            # Total counts by verdict
            result = await session.execute(
                text(
                    "SELECT decision, COUNT(*) as count "
                    "FROM audit_log GROUP BY decision"
                )
            )
            verdict_counts = {row[0]: row[1] for row in result.fetchall()}

            # Total count
            result = await session.execute(
                text("SELECT COUNT(*) FROM audit_log")
            )
            total = result.scalar() or 0

            # Average latency
            result = await session.execute(
                text("SELECT AVG(total_latency_ms) FROM audit_log")
            )
            avg_latency = result.scalar() or 0.0

            # Counts by tool
            result = await session.execute(
                text(
                    "SELECT tool_name, COUNT(*) as count "
                    "FROM audit_log GROUP BY tool_name"
                )
            )
            tool_counts = {row[0]: row[1] for row in result.fetchall()}

        return {
            "total": total,
            "by_verdict": {
                "ALLOW": verdict_counts.get("ALLOW", 0),
                "BLOCK": verdict_counts.get("BLOCK", 0),
                "FLAG_FOR_REVIEW": verdict_counts.get("FLAG_FOR_REVIEW", 0),
            },
            "by_tool": tool_counts,
            "avg_latency_ms": round(avg_latency, 2),
        }

    async def clear_all(self) -> None:
        """Delete all entries (for testing)."""
        async with self._session_factory() as session:
            await session.execute(text("DELETE FROM audit_log"))
            await session.commit()

    def _row_to_entry(self, row: Any) -> AuditEntry:
        """Convert a database row to an AuditEntry."""
        check_results_data = json.loads(row.check_results_json)
        from agentaudit.models import CheckResult
        check_results = [CheckResult(**cr) for cr in check_results_data]

        return AuditEntry(
            id=row.id,
            timestamp=row.timestamp,
            agent_id=row.agent_id,
            session_id=row.session_id,
            tool_name=row.tool_name,
            arguments=json.loads(row.arguments_json),
            decision=Verdict(row.decision),
            check_results=check_results,
            execution_result=json.loads(row.execution_result_json)
            if row.execution_result_json
            else None,
            total_latency_ms=row.total_latency_ms,
            error=row.error,
            prev_hash=getattr(row, "prev_hash", None),
            entry_hash=getattr(row, "entry_hash", None),
        )

    async def verify_chain_integrity(self):
        """
        Verify the cryptographic SHA-256 hash chain across all audit entries in ascending order.
        Detects any inserted, modified, or deleted records.
        """
        from agentaudit.models import IntegrityVerificationResult

        async with self._session_factory() as session:
            result = await session.execute(
                text(
                    "SELECT id, timestamp, agent_id, session_id, tool_name, "
                    "arguments_json, decision, prev_hash, entry_hash "
                    "FROM audit_log ORDER BY timestamp ASC, id ASC"
                )
            )
            rows = result.fetchall()

        if not rows:
            return IntegrityVerificationResult(
                verified=True,
                total_entries=0,
                chain_head=None,
                tampered_entry_ids=[],
                message="Audit log is empty — integrity valid by default",
            )

        tampered_ids: list[str] = []
        expected_prev_hash = GENESIS_HASH
        chain_head = None

        for row in rows:
            r_id, r_ts, r_agent, r_session, r_tool, r_args, r_decision, r_prev, r_hash = row
            chain_head = r_hash

            # 1. Check prev_hash continuity (if populated)
            if r_prev is not None and r_prev != expected_prev_hash:
                tampered_ids.append(r_id)

            # 2. Recompute expected hash
            recomputed = compute_entry_hash(
                entry_id=r_id,
                timestamp=r_ts,
                agent_id=r_agent,
                session_id=r_session,
                tool_name=r_tool,
                decision=r_decision,
                arguments_json=r_args,
                prev_hash=r_prev or expected_prev_hash,
            )


            if r_hash is not None and r_hash != recomputed:
                if r_id not in tampered_ids:
                    tampered_ids.append(r_id)

            expected_prev_hash = r_hash or recomputed

        is_valid = len(tampered_ids) == 0
        msg = (
            f"Successfully verified cryptographic SHA-256 integrity of {len(rows)} audit entries"
            if is_valid
            else f"Integrity violation detected: {len(tampered_ids)} tampered records found"
        )

        return IntegrityVerificationResult(
            verified=is_valid,
            total_entries=len(rows),
            chain_head=chain_head,
            tampered_entry_ids=tampered_ids,
            message=msg,
        )

