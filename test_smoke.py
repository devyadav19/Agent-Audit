"""Quick smoke test for the core AgentAudit pipeline."""
import asyncio
import sys
import os

# Ensure we're running from the project root and stdout is utf-8
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


from agentaudit.interceptor import AuditContext, ActionBlockedError, initialize, get_database
from agentaudit.policy_engine import PolicyEngine
from agentaudit.database import AuditDatabase
from agentaudit.models import Verdict


async def test():
    # Initialize with mock semantic (no API key needed for smoke test)
    os.environ["GROQ_API_KEY"] = ""  # Force mock mode
    
    engine = PolicyEngine(
        policy_file="policies/default_policies.yaml",
        enable_semantic=True,
    )
    db = AuditDatabase(database_url="sqlite+aiosqlite:///./test_smoke.db")
    await db.init_db()
    await db.clear_all()
    
    await initialize(policy_engine=engine, database=db)
    
    # Import tools AFTER initialization
    from agent.tools import send_email, spend_money, delete_file
    
    print("=" * 60)
    print("AgentAudit Smoke Test")
    print("=" * 60)
    
    with AuditContext(agent_id="smoke_test", session_id="test_001"):
        # Test 1: Legitimate email (should ALLOW)
        print("\n1. Sending email to trusted domain...")
        try:
            result = send_email(to="alice@company.com", subject="Hello", body="Hi Alice!")
            print(f"   ✓ ALLOWED — {result}")
        except ActionBlockedError as e:
            print(f"   ✗ BLOCKED — {e}")
        
        # Test 2: Small expense (should ALLOW)
        print("\n2. Small expense $50...")
        try:
            result = spend_money(amount=50, vendor="Office Depot", description="Pens")
            print(f"   ✓ ALLOWED — {result}")
        except ActionBlockedError as e:
            print(f"   ✗ BLOCKED — {e}")
        
        # Test 3: Huge expense (should BLOCK)
        print("\n3. Huge expense $1200...")
        try:
            result = spend_money(amount=1200, vendor="Luxury", description="MacBook")
            print(f"   ✗ ERROR — Should have been blocked! {result}")
        except ActionBlockedError as e:
            print(f"   ✓ BLOCKED — {e}")
        
        # Test 4: Delete system file (should BLOCK)
        print("\n4. Delete /etc/passwd...")
        try:
            result = delete_file(file_path="/etc/passwd", reason="cleanup")
            print(f"   ✗ ERROR — Should have been blocked! {result}")
        except ActionBlockedError as e:
            print(f"   ✓ BLOCKED — {e}")
        
        # Test 5: Email with password (should BLOCK)
        print("\n5. Email with password...")
        try:
            result = send_email(
                to="user@company.com",
                subject="Credentials",
                body="Your password is: Secret123!"
            )
            print(f"   ✗ ERROR — Should have been blocked! {result}")
        except ActionBlockedError as e:
            print(f"   ✓ BLOCKED — {e}")
        
        # Test 6: External email (should FLAG)
        print("\n6. Email to external domain...")
        try:
            result = send_email(
                to="stranger@gmail.com",
                subject="Hello",
                body="Reaching out about a business opportunity."
            )
            print(f"   ⚑ FLAGGED (but executed) — {result}")
        except ActionBlockedError as e:
            print(f"   ✗ BLOCKED — {e}")
    
    # Check audit log
    entries = await db.get_entries(limit=10)
    print(f"\n{'=' * 60}")
    print(f"Audit log: {len(entries)} entries")
    for entry in entries:
        print(f"  {entry.tool_name:<20s} → {entry.decision.value:<18s} ({entry.total_latency_ms:.1f}ms)")
    
    stats = await db.get_stats()
    print(f"\nStats: {stats}")
    print(f"{'=' * 60}")
    
    # Cleanup
    os.remove("test_smoke.db") if os.path.exists("test_smoke.db") else None


if __name__ == "__main__":
    asyncio.run(test())
