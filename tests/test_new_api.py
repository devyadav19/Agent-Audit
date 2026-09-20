import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from api.main import app
from agentaudit.database import AuditDatabase
from agentaudit.policy_engine import PolicyEngine
from agentaudit.interceptor import initialize, reset


@pytest_asyncio.fixture(autouse=True)
async def init_test_backend(tmp_path):
    reset()
    db_file = tmp_path / "new_api_test.db"
    db = AuditDatabase(f"sqlite+aiosqlite:///{db_file}")
    await db.init_db()

    engine = PolicyEngine(
        policy_file="policies/default_policies.yaml",
        enable_semantic=False,
    )
    await initialize(policy_engine=engine, database=db)
    yield
    reset()


@pytest.mark.asyncio
async def test_verify_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/audit-log/verify")
        assert res.status_code == 200
        data = res.json()
        assert "verified" in data
        assert "total_entries" in data


@pytest.mark.asyncio
async def test_export_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # JSON export
        res_json = await client.get("/api/audit-log/export?format=json")
        assert res_json.status_code == 200
        assert "application/json" in res_json.headers["content-type"]

        # CSV export
        res_csv = await client.get("/api/audit-log/export?format=csv")
        assert res_csv.status_code == 200
        assert "text/csv" in res_csv.headers["content-type"]


@pytest.mark.asyncio
async def test_policy_reload_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/policies/reload")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "reloaded"
        assert "total_rules" in data


@pytest.mark.asyncio
async def test_policy_dry_run_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {
            "tool_name": "spend_money",
            "arguments": {"amount": 5000, "vendor": "Unauthorized Vendor"},
        }
        res = await client.post("/api/policies/test", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["tool_name"] == "spend_money"
        assert data["decision"] == "BLOCK"


@pytest.mark.asyncio
async def test_threat_analytics_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/analytics/threats")
        assert res.status_code == 200
        data = res.json()
        assert "total_analyzed" in data
        assert "top_violated_rules" in data
        assert "latency_percentiles" in data
