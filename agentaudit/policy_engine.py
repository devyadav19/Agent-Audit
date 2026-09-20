"""
Policy Engine — Orchestrates the two-tier evaluation pipeline.

This is the central coordinator that:
1. Loads policy rules from YAML
2. Determines which rules apply to a given tool call
3. Runs applicable hard rules first (fast, deterministic)
4. If no hard rule BLOCKed, runs semantic rules (LLM-as-judge)
5. Merges all results: most restrictive verdict wins

Design: Hard rules SHORT-CIRCUIT. If a hard rule says BLOCK, we skip
the semantic evaluator entirely — no point wasting an LLM call on an
action that's already definitively blocked by a deterministic check.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any

import yaml

from agentaudit.config import get_settings
from agentaudit.hard_rules import HardRuleEvaluator
from agentaudit.models import (
    AuditEntry,
    CheckResult,
    CheckTier,
    PolicyCondition,
    PolicyRule,
    Verdict,
)
from agentaudit.session import SessionManager, SessionState

logger = logging.getLogger(__name__)


class PolicyEngine:
    """
    Orchestrates policy evaluation for intercepted tool calls.
    
    Loads rules from YAML, dispatches to the appropriate evaluator
    tier, and merges results into a final verdict.
    """

    def __init__(
        self,
        policy_file: str | None = None,
        enable_semantic: bool = True,
        semantic_evaluator: Any = None,
    ) -> None:
        self._rules: list[PolicyRule] = []
        self._reference_lists: dict[str, list[str]] = {}
        self._hard_evaluator: HardRuleEvaluator | None = None
        self._semantic_evaluator = semantic_evaluator
        self._enable_semantic = enable_semantic
        self._session_manager = SessionManager()

        self._policy_path = policy_file or get_settings().policy_file
        self._load_policies(self._policy_path)

    def _load_policies(self, policy_file: str) -> None:
        """Parse YAML policy file into structured PolicyRule objects."""
        path = Path(policy_file)
        if not path.exists():
            logger.warning(f"Policy file not found: {policy_file}")
            return

        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)

        self._rules = []
        self._reference_lists = {
            k: v for k, v in data.items()
            if k != "policies" and isinstance(v, list)
        }

        # Parse policy rules
        for rule_data in data.get("policies", []):
            condition = None
            if "condition" in rule_data:
                condition = PolicyCondition(**rule_data["condition"])


            # Parse action string into Verdict enum
            action_str = rule_data.get("action", "FLAG_FOR_REVIEW")
            action = Verdict(action_str)

            rule = PolicyRule(
                name=rule_data["name"],
                description=rule_data["description"],
                applies_to=rule_data["applies_to"],
                tier=CheckTier(rule_data["tier"]),
                action=action,
                condition=condition,
                policy_intent=rule_data.get("policy_intent"),
            )
            self._rules.append(rule)

        # Initialize the hard rule evaluator with reference lists
        self._hard_evaluator = HardRuleEvaluator(
            reference_lists=self._reference_lists
        )

        logger.info(
            f"Loaded {len(self._rules)} policy rules "
            f"({sum(1 for r in self._rules if r.tier == CheckTier.HARD_RULE)} hard, "
            f"{sum(1 for r in self._rules if r.tier == CheckTier.SEMANTIC)} semantic) "
            f"from {policy_file}"
        )

    def _init_semantic_evaluator(self) -> None:
        """Lazily initialize the semantic evaluator."""
        if self._semantic_evaluator is not None:
            return

        settings = get_settings()
        if settings.groq_api_key:
            from agentaudit.semantic_evaluator import SemanticEvaluator
            self._semantic_evaluator = SemanticEvaluator(
                api_key=settings.groq_api_key,
                model=settings.semantic_model,
            )
            logger.info("Initialized Groq semantic evaluator")
        else:
            from agentaudit.semantic_evaluator import MockSemanticEvaluator
            self._semantic_evaluator = MockSemanticEvaluator()
            logger.warning(
                "No GROQ_API_KEY found — using MockSemanticEvaluator. "
                "Semantic checks will use keyword heuristics, not LLM inference."
            )

    async def evaluate(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        agent_id: str = "default_agent",
        session_id: str = "default_session",
    ) -> AuditEntry:
        """
        Evaluate a tool call against all applicable policies.
        
        Returns a complete AuditEntry with the final verdict and
        all individual check results.
        """
        start = time.perf_counter()

        session = self._session_manager.get_session(session_id)

        # Find applicable rules
        applicable_hard = [
            r for r in self._rules
            if r.applies_to == tool_name and r.tier == CheckTier.HARD_RULE
        ]
        applicable_semantic = [
            r for r in self._rules
            if r.applies_to == tool_name and r.tier == CheckTier.SEMANTIC
        ]

        all_results: list[CheckResult] = []

        # ----- TIER 1: Hard rules (deterministic) -----
        hard_blocked = False
        for rule in applicable_hard:
            result = self._hard_evaluator.evaluate(rule, arguments, session)
            all_results.append(result)
            if result.verdict == Verdict.BLOCK:
                hard_blocked = True

        # ----- TIER 2: Semantic rules (LLM-as-judge) -----
        # Skip if: hard rule already blocked, semantic is disabled, or no semantic rules apply
        if not hard_blocked and self._enable_semantic and applicable_semantic:
            self._init_semantic_evaluator()
            session_context = {
                "session_id": session_id,
                "agent_id": agent_id,
                "cumulative_spend": session.cumulative_session_spend,
                "actions_this_session": session.actions_this_session,
            }
            for rule in applicable_semantic:
                result = await self._semantic_evaluator.evaluate(
                    rule, tool_name, arguments, session_context
                )
                all_results.append(result)

        # ----- Merge verdicts: most restrictive wins -----
        final_verdict = self._merge_verdicts(all_results)

        # Update session state (track attempted actions regardless of verdict)
        session.record_action(tool_name, arguments)

        elapsed = (time.perf_counter() - start) * 1000

        return AuditEntry(
            agent_id=agent_id,
            session_id=session_id,
            tool_name=tool_name,
            arguments=arguments,
            decision=final_verdict,
            check_results=all_results,
            total_latency_ms=elapsed,
        )

    def _merge_verdicts(self, results: list[CheckResult]) -> Verdict:
        """
        Merge multiple check results into a single final verdict.
        
        Priority: BLOCK > FLAG_FOR_REVIEW > ALLOW
        If no rules matched, default is ALLOW.
        """
        if not results:
            return Verdict.ALLOW

        verdicts = [r.verdict for r in results]

        if Verdict.BLOCK in verdicts:
            return Verdict.BLOCK
        elif Verdict.FLAG_FOR_REVIEW in verdicts:
            return Verdict.FLAG_FOR_REVIEW
        else:
            return Verdict.ALLOW

    def get_rules(self) -> list[PolicyRule]:
        """Return all loaded policy rules."""
        return self._rules.copy()

    def get_session_manager(self) -> SessionManager:
        """Return the session manager for external access."""
        return self._session_manager

    def reset_sessions(self) -> None:
        """Reset all session state (for testing)."""
        self._session_manager.reset_all()

    def reload_policies(self, policy_file: str | None = None) -> dict[str, Any]:
        """Hot-reload policies from disk without restarting."""
        from datetime import datetime, timezone
        target_file = policy_file or self._policy_path
        self._load_policies(target_file)
        hard_count = sum(1 for r in self._rules if r.tier == CheckTier.HARD_RULE)
        sem_count = sum(1 for r in self._rules if r.tier == CheckTier.SEMANTIC)
        return {
            "status": "reloaded",
            "policy_file": str(target_file),
            "total_rules": len(self._rules),
            "hard_rules": hard_count,
            "semantic_rules": sem_count,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    async def dry_run(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        agent_id: str = "sandbox_agent",
        session_id: str = "sandbox_session",
    ) -> AuditEntry:
        """
        Dry-run simulation of a tool call against policies.
        Does NOT mutate session state, trigger real execution, or record to the audit database.
        """
        start = time.perf_counter()
        session = self._session_manager.get_session(session_id)

        applicable_hard = [
            r for r in self._rules
            if r.applies_to == tool_name and r.tier == CheckTier.HARD_RULE
        ]
        applicable_semantic = [
            r for r in self._rules
            if r.applies_to == tool_name and r.tier == CheckTier.SEMANTIC
        ]

        all_results: list[CheckResult] = []
        hard_blocked = False
        for rule in applicable_hard:
            result = self._hard_evaluator.evaluate(rule, arguments, session)
            all_results.append(result)
            if result.verdict == Verdict.BLOCK:
                hard_blocked = True

        if not hard_blocked and self._enable_semantic and applicable_semantic:
            self._init_semantic_evaluator()
            session_context = {
                "session_id": session_id,
                "agent_id": agent_id,
                "cumulative_spend": session.cumulative_session_spend,
                "actions_this_session": session.actions_this_session,
            }
            for rule in applicable_semantic:
                result = await self._semantic_evaluator.evaluate(
                    rule, tool_name, arguments, session_context
                )
                all_results.append(result)

        final_verdict = self._merge_verdicts(all_results)
        elapsed = (time.perf_counter() - start) * 1000

        return AuditEntry(
            agent_id=agent_id,
            session_id=session_id,
            tool_name=tool_name,
            arguments=arguments,
            decision=final_verdict,
            check_results=all_results,
            total_latency_ms=elapsed,
        )

