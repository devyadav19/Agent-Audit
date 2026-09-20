"""Integration tests for FastAPI endpoints."""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from api.main import app
from agentaudit.database import AuditDatabase
from agentaudit.policy_engine import PolicyEngine
from agentaudit.interceptor import initialize, reset


@pytest_asyncio.fixture(autouse=True)
async def init_test_backend(tmp_path):
    reset()
    db_file = tmp_path / "api_test.db"
    db = AuditDatabase(f"sqlite+aiosqlite:///{db_file}")
    await db.init_db()

    engine = PolicyEngine(
        policy_file="policies/default_policies.yaml",
        enable_semantic=False,
    )
    await initialize(policy_engine=engine, database=db)
    yield
    reset()


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_get_policies(client):
    response = await client.get("/api/policies")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert any(p["name"] == "spend_cap_per_transaction" for p in data)


@pytest.mark.asyncio
async def test_get_stats(client):
    response = await client.get("/api/stats")
    assert response.status_code == 200
    data = response.json()
    assert "total" in data
    assert "by_verdict" in data
    assert "avg_latency_ms" in data


@pytest.mark.asyncio
async def test_get_audit_log(client):
    response = await client.get("/api/audit-log")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_get_evaluation_results(client):
    response = await client.get("/api/evaluation/results")
    assert response.status_code == 200
    data = response.json()
    assert "results" in data
