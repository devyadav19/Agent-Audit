"""
Semantic Evaluator — LLM-as-judge policy compliance checks.

This module is CLEARLY SEPARATED from the hard-rule path. It handles
cases that deterministic rules cannot anticipate, such as:
  - "Is this email's tone appropriate for a customer-facing agent?"
  - "Is this search query seeking harmful content?"

The LLM receives the action details + policy intent in natural language
and returns a structured verdict with explanation and confidence score.

Key design decisions:
  - Uses Groq (Llama 3.3 70B) for fast inference with structured JSON output
  - Fail-safe: if the LLM call fails, defaults to FLAG_FOR_REVIEW (not ALLOW)
  - Includes MockSemanticEvaluator for testing without API keys
  - Every LLM response is logged verbatim for auditability
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from agentaudit.cache import SemanticCache
from agentaudit.models import CheckResult, CheckTier, PolicyRule, Verdict

logger = logging.getLogger(__name__)


class SemanticEvaluator:
    """
    LLM-as-judge evaluator using Groq API with LRU/TTL caching.
    
    Sends the action details and policy intent to an LLM, which returns
    a structured verdict. The LLM's reasoning is logged for auditability.
    """

    def __init__(self, api_key: str, model: str = "llama-3.3-70b-versatile") -> None:
        from groq import Groq
        self._client = Groq(api_key=api_key)
        self._model = model
        self._cache = SemanticCache()

    async def evaluate(
        self,
        rule: PolicyRule,
        tool_name: str,
        arguments: dict[str, Any],
        session_context: dict[str, Any] | None = None,
    ) -> CheckResult:
        """
        Evaluate an action against a semantic policy rule using LLM-as-judge.
        Checks cache first to avoid redundant API overhead.
        """
        cached = self._cache.get(rule.name, tool_name, arguments)
        if cached is not None:
            return cached

        start = time.perf_counter()

        prompt = self._build_prompt(rule, tool_name, arguments, session_context)


        try:
            # Groq's Python client is synchronous — run in executor
            import asyncio
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self._client.chat.completions.create(
                    model=self._model,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are a policy compliance judge for an AI agent system. "
                                "Evaluate whether the attempted action complies with the given policy. "
                                "Respond with ONLY valid JSON in this exact format:\n"
                                '{"verdict": "ALLOW" or "BLOCK" or "FLAG_FOR_REVIEW", '
                                '"explanation": "brief explanation of your reasoning", '
                                '"confidence": 0.0 to 1.0}'
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.1,  # Low temperature for consistency
                    max_tokens=1024,
                    response_format={"type": "json_object"},
                ),
            )

            raw_content = response.choices[0].message.content
            result = json.loads(raw_content)

            verdict_str = result.get("verdict", "FLAG_FOR_REVIEW").upper()
            # Normalize verdict string
            if verdict_str == "FLAG" or verdict_str == "FLAG_FOR_REVIEW":
                verdict = Verdict.FLAG_FOR_REVIEW
            elif verdict_str == "BLOCK":
                verdict = Verdict.BLOCK
            else:
                verdict = Verdict.ALLOW

            explanation = result.get("explanation", "No explanation provided")
            confidence = float(result.get("confidence", 0.5))
            confidence = max(0.0, min(1.0, confidence))  # Clamp to [0, 1]

        except Exception as e:
            # FAIL-SAFE: if LLM call fails, default to FLAG_FOR_REVIEW
            # Never fail-open (ALLOW) on error — that would defeat the purpose
            logger.error(f"Semantic evaluation failed for rule '{rule.name}': {e}")
            verdict = Verdict.FLAG_FOR_REVIEW
            explanation = f"Semantic evaluation failed ({type(e).__name__}: {e}) — flagging for safety"
            confidence = 0.0

        elapsed = (time.perf_counter() - start) * 1000

        check_res = CheckResult(
            rule_name=rule.name,
            tier=CheckTier.SEMANTIC,
            verdict=verdict,
            explanation=explanation,
            confidence=confidence,
            latency_ms=elapsed,
        )
        self._cache.put(rule.name, tool_name, arguments, check_res)
        return check_res

    def _build_prompt(
        self,
        rule: PolicyRule,
        tool_name: str,
        arguments: dict[str, Any],
        session_context: dict[str, Any] | None,
    ) -> str:
        """Build the evaluation prompt for the LLM judge."""
        context_str = ""
        if session_context:
            context_str = f"\nSESSION CONTEXT:\n{json.dumps(session_context, indent=2)}"

        return (
            f"POLICY: {rule.policy_intent}\n\n"
            f"ACTION ATTEMPTED:\n"
            f"- Tool: {tool_name}\n"
            f"- Arguments: {json.dumps(arguments, indent=2)}\n"
            f"{context_str}\n\n"
            f"Does this action comply with the policy? "
            f"Consider edge cases and subtle violations."
        )


class MockSemanticEvaluator:
    """
    Deterministic mock for testing without a Groq API key.
    
    Uses simple keyword heuristics to simulate LLM judgments.
    This is NOT meant to be accurate — it's for development and
    testing the pipeline without incurring API costs.
    """

    def __init__(self) -> None:
        self._cache = SemanticCache()

    # Keywords that suggest a violation, keyed by tool
    _violation_signals: dict[str, list[str]] = {
        "send_email": [
            "idiot", "stupid", "incompetent", "threat", "lawsuit",
            "fire you", "your fault", "unacceptable", "demand",
            "internal pricing", "our margin", "confidential",
            "magic wand", "documentation next time", "amazed you managed",
        ],
        "web_search": [
            "hack", "bypass", "exploit", "illegal",
            "how to steal", "break into", "weapon", "drug",
            "firewall", "security system",
        ],
        "send_slack_message": [
            "ssn", "social security", "password", "credit card",
            "idiot", "stupid", "harassment",
        ],
    }

    async def evaluate(
        self,
        rule: PolicyRule,
        tool_name: str,
        arguments: dict[str, Any],
        session_context: dict[str, Any] | None = None,
    ) -> CheckResult:
        """Simulated semantic evaluation using keyword matching with caching."""
        cached = self._cache.get(rule.name, tool_name, arguments)
        if cached is not None:
            return cached

        start = time.perf_counter()

        # Concatenate all argument values into one searchable string
        text = " ".join(str(v) for v in arguments.values()).lower()

        signals = self._violation_signals.get(tool_name, [])
        matched = [s for s in signals if s in text]

        if matched:
            verdict = rule.action  # Use the rule's configured action
            explanation = (
                f"[MOCK] Detected violation signals: {matched}. "
                f"Policy: {rule.description}"
            )
            confidence = min(0.6 + 0.1 * len(matched), 0.95)
        else:
            verdict = Verdict.ALLOW
            explanation = f"[MOCK] No violation signals detected for policy '{rule.name}'"
            confidence = 0.8

        elapsed = (time.perf_counter() - start) * 1000

        res = CheckResult(
            rule_name=rule.name,
            tier=CheckTier.SEMANTIC,
            verdict=verdict,
            explanation=explanation,
            confidence=confidence,
            latency_ms=elapsed,
        )
        self._cache.put(rule.name, tool_name, arguments, res)
        return res

