"""
Core data models for AgentAudit.

These Pydantic models define the shared vocabulary used across every module:
interceptor, policy engine, database, API, and dashboard.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class Verdict(str, Enum):
    """
    The three possible outcomes of a policy evaluation.
    
    ALLOW  — Action is permitted; execute normally.
    BLOCK  — Action violates policy; do NOT execute.
    FLAG_FOR_REVIEW — Action is suspicious; execute but mark for human review.
    """
    ALLOW = "ALLOW"
    BLOCK = "BLOCK"
    FLAG_FOR_REVIEW = "FLAG_FOR_REVIEW"


class CheckTier(str, Enum):
    """
    Which evaluation tier produced a check result.
    
    This distinction is central to the project's credibility:
    - HARD_RULE: Deterministic, pure-function check. Zero false negatives
      on explicitly defined rules. Sub-millisecond latency.
    - SEMANTIC: LLM-as-judge evaluation. Can catch violations that hard
      rules can't anticipate, but introduces latency and potential
      false positives. The LLM's reasoning is logged for auditability.
    """
    HARD_RULE = "hard_rule"
    SEMANTIC = "semantic"


# ---------------------------------------------------------------------------
# Policy definitions (parsed from YAML)
# ---------------------------------------------------------------------------

class PolicyCondition(BaseModel):
    """A single condition within a hard rule."""
    type: str                          # e.g. "numeric_gt", "numeric_lt", "numeric_between", "domain_not_in_list", "private_ip_denied", "rate_limit_exceeded"
    field: str                         # argument field to check
    threshold: Optional[float] = None  # for numeric comparisons
    min_threshold: Optional[float] = None  # for numeric_between
    max_threshold: Optional[float] = None  # for numeric_between
    list_name: Optional[str] = None    # for allowlist/denylist lookups
    pattern: Optional[str] = None      # for regex matching
    prefixes: Optional[list[str]] = None  # for path_starts_with
    items: Optional[list[str]] = None     # for contains_any / contains_none
    max_calls: Optional[int] = None       # for rate_limit_exceeded
    window_seconds: Optional[float] = None # for rate_limit_exceeded
    session_field: Optional[str] = None   # for cumulative checks


class PolicyRule(BaseModel):
    """
    A single policy rule, parsed from the YAML policy file.
    
    Hard rules have a structured `condition`; semantic rules have a
    natural-language `policy_intent` that gets passed to the LLM judge.
    """
    name: str
    description: str
    applies_to: str                            # tool name this rule targets
    tier: CheckTier
    action: Verdict                            # what to do if the rule triggers
    condition: Optional[PolicyCondition] = None  # for hard rules
    policy_intent: Optional[str] = None          # for semantic rules


# ---------------------------------------------------------------------------
# Check results & audit entries
# ---------------------------------------------------------------------------

class CheckResult(BaseModel):
    """
    Result of a single policy check (either hard-rule or semantic).
    
    Every intercepted action may produce multiple CheckResults — one per
    applicable rule. The policy engine merges them into a final verdict.
    """
    rule_name: str
    tier: CheckTier
    verdict: Verdict
    explanation: str
    confidence: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="1.0 for deterministic hard rules; 0.0–1.0 for semantic checks"
    )
    latency_ms: float = Field(
        default=0.0,
        description="Time taken for this individual check, in milliseconds"
    )


class AuditEntry(BaseModel):
    """
    Immutable log entry for a single intercepted action.
    
    Every tool call produces exactly one AuditEntry. Contains a cryptographic
    SHA-256 hash linking it to the previous entry, establishing a tamper-evident audit chain.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    agent_id: str = "default_agent"
    session_id: str = "default_session"
    tool_name: str
    arguments: dict[str, Any]
    decision: Verdict
    check_results: list[CheckResult]
    execution_result: Optional[Any] = None   # populated only if action was ALLOW or FLAG
    total_latency_ms: float = 0.0             # total policy evaluation time
    error: Optional[str] = None               # if execution raised an exception
    prev_hash: Optional[str] = None           # Cryptographic link to previous entry
    entry_hash: Optional[str] = None          # SHA-256 hash of this entry's contents


class IntegrityVerificationResult(BaseModel):
    """Result of verifying the tamper-evident cryptographic hash chain."""
    verified: bool
    total_entries: int
    chain_head: Optional[str] = None
    tampered_entry_ids: list[str] = Field(default_factory=list)
    message: str = "Hash chain integrity verified"
    verified_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class EvaluationResult(BaseModel):
    """Aggregate metrics from an evaluation run."""
    mode: str                         # "hard_rules_only", "semantic_only", "combined"
    total_scenarios: int
    true_positives: int               # correctly blocked/flagged violations
    false_positives: int              # incorrectly blocked legitimate actions
    true_negatives: int               # correctly allowed legitimate actions
    false_negatives: int              # missed violations
    catch_rate: float                 # TP / (TP + FN)
    false_positive_rate: float        # FP / (FP + TN)
    avg_latency_ms: float
    p95_latency_ms: float
    per_scenario: list[dict[str, Any]] = Field(default_factory=list)

