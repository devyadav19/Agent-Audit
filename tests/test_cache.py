import pytest
from agentaudit.cache import SemanticCache
from agentaudit.models import CheckResult, CheckTier, Verdict


def test_semantic_cache_hit_and_miss():
    cache = SemanticCache(maxsize=10, ttl_seconds=60.0)

    res = CheckResult(
        rule_name="tone_check",
        tier=CheckTier.SEMANTIC,
        verdict=Verdict.ALLOW,
        explanation="Tone is courteous",
        confidence=0.9,
        latency_ms=350.0,
    )

    args = {"to": "user@example.com", "body": "Thank you for contacting us."}

    # First access - Miss
    assert cache.get("tone_check", "send_email", args) is None
    assert cache.stats["misses"] == 1
    assert cache.stats["hits"] == 0

    # Store in cache
    cache.put("tone_check", "send_email", args, res)

    # Second access - Hit
    cached = cache.get("tone_check", "send_email", args)
    assert cached is not None
    assert cached.verdict == Verdict.ALLOW
    assert cached.explanation == "Tone is courteous"
    assert cached.latency_ms < 1.0  # Fast cached latency
    assert cache.stats["hits"] == 1
