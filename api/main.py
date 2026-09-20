"""
FastAPI Application — API layer for AgentAudit.

Provides:
    - REST endpoints for querying the audit log
    - WebSocket for real-time streaming of new entries
    - Endpoint to trigger test scenarios from the dashboard
    - CORS configured for the dashboard dev server
"""

from __future__ import annotations

import asyncio
import json
import csv
import io
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Query, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware


from agentaudit.config import get_settings
from agentaudit.database import AuditDatabase
from agentaudit.interceptor import initialize, get_database, get_policy_engine
from agentaudit.models import AuditEntry, Verdict
from agentaudit.policy_engine import PolicyEngine

logger = logging.getLogger(__name__)

# WebSocket connection manager
connected_clients: list[WebSocket] = []


async def broadcast_entry(entry: AuditEntry) -> None:
    """Broadcast a new audit entry to all connected WebSocket clients."""
    data = entry.model_dump(mode="json")
    data["timestamp"] = entry.timestamp.isoformat()
    message = json.dumps(data)

    disconnected = []
    for ws in connected_clients:
        try:
            await ws.send_text(message)
        except Exception:
            disconnected.append(ws)

    for ws in disconnected:
        connected_clients.remove(ws)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup/shutdown lifecycle."""
    settings = get_settings()

    # Initialize the policy engine and database
    db = AuditDatabase(database_url=settings.database_url)
    await db.init_db()

    policy_engine = PolicyEngine(
        policy_file=settings.policy_file,
        enable_semantic=settings.enable_semantic,
    )

    await initialize(policy_engine=policy_engine, database=db)

    # Subscribe to new entries for WebSocket broadcasting
    db.subscribe(broadcast_entry)

    logger.info("AgentAudit API started")
    yield
    logger.info("AgentAudit API shutting down")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="AgentAudit API",
    description="Policy enforcement & behavior verification API for AI agents",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS for dashboard dev server
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# REST Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/audit-log")
async def get_audit_log(
    agent_id: str | None = None,
    tool_name: str | None = None,
    verdict: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[dict[str, Any]]:
    """Query audit log entries with optional filters."""
    db = get_database()
    entries = await db.get_entries(
        agent_id=agent_id,
        tool_name=tool_name,
        verdict=verdict,
        limit=limit,
        offset=offset,
    )
    return [_entry_to_dict(e) for e in entries]


@app.post("/api/audit-log/verify")
async def verify_audit_log_integrity() -> dict[str, Any]:
    """Verify cryptographic SHA-256 hash-chain integrity of the audit log."""
    db = get_database()
    result = await db.verify_chain_integrity()
    return result.model_dump(mode="json")


@app.get("/api/audit-log/export")
async def export_audit_log(
    format: str = Query(default="json", pattern="^(json|csv)$"),
) -> Response:
    """Export audit log trail as CSV or JSON compliance bundle."""
    db = get_database()
    entries = await db.get_entries(limit=5000)
    entry_dicts = [_entry_to_dict(e) for e in entries]

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "id",
            "timestamp",
            "agent_id",
            "session_id",
            "tool_name",
            "decision",
            "total_latency_ms",
            "entry_hash",
            "prev_hash",
            "arguments",
            "triggered_rules",
        ])
        for e in entry_dicts:
            triggered = [
                cr["rule_name"]
                for cr in e.get("check_results", [])
                if cr.get("verdict") != "ALLOW"
            ]
            writer.writerow([
                e.get("id"),
                e.get("timestamp"),
                e.get("agent_id"),
                e.get("session_id"),
                e.get("tool_name"),
                e.get("decision"),
                e.get("total_latency_ms"),
                e.get("entry_hash", ""),
                e.get("prev_hash", ""),
                json.dumps(e.get("arguments", {})),
                ";".join(triggered),
            ])
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=agentaudit_trail_export.csv"},
        )

    return Response(
        content=json.dumps(entry_dicts, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=agentaudit_compliance_bundle.json"},
    )


@app.get("/api/audit-log/{entry_id}")
async def get_audit_entry(entry_id: str) -> dict[str, Any] | dict[str, str]:
    """Get a single audit entry by ID."""
    db = get_database()
    entry = await db.get_entry_by_id(entry_id)
    if entry is None:
        return {"error": "Entry not found"}
    return _entry_to_dict(entry)



@app.get("/api/stats")
async def get_stats() -> dict[str, Any]:
    """Get aggregate statistics for the dashboard."""
    db = get_database()
    return await db.get_stats()


@app.get("/api/policies")
async def get_policies() -> list[dict[str, Any]]:
    """List all loaded policy rules."""
    engine = get_policy_engine()
    rules = engine.get_rules()
    return [r.model_dump() for r in rules]


@app.post("/api/scenarios/run")
async def run_scenarios(
    category: str | None = None,
    delay: float = 0.5,
) -> dict[str, Any]:
    """Trigger test scenarios from the dashboard."""
    from agent.runner import run_all_scenarios

    try:
        # Reset session state for clean evaluation
        engine = get_policy_engine()
        engine.reset_sessions()

        results = await run_all_scenarios(
            category=category,
            delay_between=delay,
            agent_id="dashboard_agent",
            session_id="dashboard_session",
        )

        # Summarize results
        total = len(results)
        passed = sum(1 for r in results if r["matched_expected"])

        return {
            "total": total,
            "passed": passed,
            "failed": total - passed,
            "results": [
                {
                    "name": r["scenario"].name,
                    "tool": r["scenario"].tool_name,
                    "expected": r["scenario"].expected_verdict.value,
                    "actual": r["actual_verdict"].value if r["actual_verdict"] else "ERROR",
                    "matched": r["matched_expected"],
                    "latency_ms": round(r["latency_ms"], 2),
                }
                for r in results
            ],
        }
    except Exception as exc:
        logger.error(f"Error running scenarios: {exc}", exc_info=True)
        return {
            "total": 0,
            "passed": 0,
            "failed": 0,
            "error": str(exc),
            "results": [],
        }


@app.post("/api/clear")
async def clear_audit_log() -> dict[str, str]:
    """Clear all audit log entries (for testing)."""
    db = get_database()
    await db.clear_all()
    engine = get_policy_engine()
    engine.reset_sessions()
    return {"status": "cleared"}


@app.post("/api/policies/reload")

async def reload_policies() -> dict[str, Any]:
    """Hot-reload policy YAML rules from disk without restarting FastAPI."""
    engine = get_policy_engine()
    return engine.reload_policies()


@app.post("/api/policies/test")
async def test_policy_simulation(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Dry-run sandbox simulation of a tool call against active policies.
    Does NOT mutate state, call the real tool, or record to database.
    """
    tool_name = payload.get("tool_name", "")
    arguments = payload.get("arguments", {})
    agent_id = payload.get("agent_id", "sandbox_agent")
    session_id = payload.get("session_id", "sandbox_session")

    engine = get_policy_engine()
    entry = await engine.dry_run(
        tool_name=tool_name,
        arguments=arguments,
        agent_id=agent_id,
        session_id=session_id,
    )
    return _entry_to_dict(entry)


@app.get("/api/analytics/threats")
async def get_threat_analytics() -> dict[str, Any]:
    """Get threat distribution intelligence, rule hit counts, and latency percentiles."""
    db = get_database()
    entries = await db.get_entries(limit=500)

    rule_hits: dict[str, int] = {}
    tool_verdicts: dict[str, dict[str, int]] = {}
    latencies: list[float] = []

    for e in entries:
        latencies.append(e.total_latency_ms)
        t = e.tool_name
        v = e.decision.value
        if t not in tool_verdicts:
            tool_verdicts[t] = {"ALLOW": 0, "BLOCK": 0, "FLAG_FOR_REVIEW": 0}
        tool_verdicts[t][v] = tool_verdicts[t].get(v, 0) + 1

        for cr in e.check_results:
            if cr.verdict != Verdict.ALLOW:
                rule_hits[cr.rule_name] = rule_hits.get(cr.rule_name, 0) + 1

    latencies.sort()
    n = len(latencies)
    p50 = latencies[int(n * 0.50)] if n > 0 else 0.0
    p95 = latencies[int(n * 0.95)] if n > 0 else 0.0
    p99 = latencies[int(n * 0.99)] if n > 0 else 0.0

    return {
        "total_analyzed": n,
        "top_violated_rules": sorted(
            [{"rule": k, "count": v} for k, v in rule_hits.items()],
            key=lambda x: x["count"],
            reverse=True,
        ),
        "tool_breakdown": tool_verdicts,
        "latency_percentiles": {
            "p50_ms": round(p50, 2),
            "p95_ms": round(p95, 2),
            "p99_ms": round(p99, 2),
        },
    }


@app.get("/api/evaluation/results")

async def get_evaluation_results() -> dict[str, Any]:
    """Get latest ablation benchmark evaluation results."""
    from pathlib import Path
    results_path = Path("evaluation_results.json")
    if results_path.exists():
        with open(results_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"timestamp": None, "results": []}


@app.post("/api/evaluation/run")
async def trigger_evaluation() -> dict[str, Any]:
    """Run a fresh ablation evaluation suite and return results."""
    from evaluation.evaluator import run_evaluation_mode
    from agent.scenarios import ALL_SCENARIOS
    from datetime import datetime

    modes = ["hard_rules_only", "semantic_only", "combined"]
    results = []
    for mode in modes:
        res = await run_evaluation_mode(mode, ALL_SCENARIOS)
        results.append(res.model_dump())

    eval_data = {
        "timestamp": datetime.now().isoformat(),
        "results": results,
    }
    with open("evaluation_results.json", "w", encoding="utf-8") as f:
        json.dump(eval_data, f, indent=2)

    return eval_data


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------


@app.websocket("/ws/audit-stream")
async def audit_stream(websocket: WebSocket) -> None:
    """
    WebSocket endpoint for real-time audit entry streaming.
    
    Clients connect here to receive new AuditEntry objects as they
    are created. Each message is a JSON-serialized AuditEntry.
    """
    await websocket.accept()
    connected_clients.append(websocket)
    logger.info(f"WebSocket client connected ({len(connected_clients)} total)")

    try:
        while True:
            # Keep connection alive — wait for client messages (e.g., pings)
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except Exception:
        if websocket in connected_clients:
            connected_clients.remove(websocket)
        logger.info(f"WebSocket client disconnected ({len(connected_clients)} total)")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _entry_to_dict(entry: AuditEntry) -> dict[str, Any]:
    """Convert an AuditEntry to a JSON-serializable dict."""
    data = entry.model_dump(mode="json")
    data["timestamp"] = entry.timestamp.isoformat()
    return data


# ---------------------------------------------------------------------------
# Run with: uvicorn api.main:app --reload
# ---------------------------------------------------------------------------
