"""
Hard Rule Evaluator — Deterministic policy checks.

Every check here is a pure function: given (arguments, session_state, condition),
it returns a boolean. No network calls, no LLM inference, no randomness.

This is the FAST tier — sub-millisecond per check, zero false negatives on
explicitly defined rules. If a hard rule says BLOCK, it's definitive.

Supported condition types:
    - numeric_gt         : field value > threshold
    - cumulative_gt      : session cumulative value > threshold
    - domain_not_in_list : email domain not in trusted domains list
    - path_starts_with   : file path starts with any of the given prefixes
    - regex_match        : field value matches a regex pattern
"""

from __future__ import annotations

import ipaddress
import re
import time
from typing import Any
from urllib.parse import urlparse


from agentaudit.models import (
    CheckResult,
    CheckTier,
    PolicyCondition,
    PolicyRule,
    Verdict,
)
from agentaudit.session import SessionState


class HardRuleEvaluator:
    """
    Evaluates tool-call arguments against deterministic hard rules.
    
    Each condition type maps to a small, testable checker method.
    No eval(), no dynamic code execution — the condition DSL is parsed
    from YAML into structured PolicyCondition objects and dispatched here.
    """

    def __init__(self, reference_lists: dict[str, list[str]] | None = None) -> None:
        """
        Args:
            reference_lists: Named lists (e.g., trusted_domains) loaded from
                             the policy YAML. Used by domain_not_in_list and
                             similar checks.
        """
        self._reference_lists = reference_lists or {}
        # Dispatch table: condition type → checker method
        self._checkers = {
            "numeric_gt": self._check_numeric_gt,
            "numeric_lt": self._check_numeric_lt,
            "numeric_between": self._check_numeric_between,
            "cumulative_gt": self._check_cumulative_gt,
            "domain_not_in_list": self._check_domain_not_in_list,
            "path_starts_with": self._check_path_starts_with,
            "regex_match": self._check_regex_match,
            "private_ip_denied": self._check_private_ip_denied,
            "contains_any": self._check_contains_any,
            "contains_none": self._check_contains_none,
            "rate_limit_exceeded": self._check_rate_limit_exceeded,
        }


    def evaluate(
        self,
        rule: PolicyRule,
        arguments: dict[str, Any],
        session: SessionState,
    ) -> CheckResult:
        """
        Evaluate a single hard rule against the given arguments.
        
        Returns a CheckResult with verdict ALLOW (rule not triggered)
        or the rule's configured action (BLOCK / FLAG_FOR_REVIEW).
        """
        start = time.perf_counter()

        condition = rule.condition
        if condition is None:
            # No condition means the rule always triggers (unusual but valid)
            triggered = True
            explanation = f"Rule '{rule.name}' has no condition — always triggers"
        elif condition.type not in self._checkers:
            # Unknown condition type — fail-safe: flag for review
            elapsed = (time.perf_counter() - start) * 1000
            return CheckResult(
                rule_name=rule.name,
                tier=CheckTier.HARD_RULE,
                verdict=Verdict.FLAG_FOR_REVIEW,
                explanation=f"Unknown condition type '{condition.type}' — flagging for safety",
                confidence=1.0,
                latency_ms=elapsed,
            )
        else:
            checker = self._checkers[condition.type]
            triggered, explanation = checker(condition, arguments, session)

        elapsed = (time.perf_counter() - start) * 1000

        if triggered:
            return CheckResult(
                rule_name=rule.name,
                tier=CheckTier.HARD_RULE,
                verdict=rule.action,
                explanation=explanation,
                confidence=1.0,  # Deterministic — always 1.0
                latency_ms=elapsed,
            )
        else:
            return CheckResult(
                rule_name=rule.name,
                tier=CheckTier.HARD_RULE,
                verdict=Verdict.ALLOW,
                explanation=explanation,
                confidence=1.0,
                latency_ms=elapsed,
            )

    # -----------------------------------------------------------------------
    # Checker methods — each returns (triggered: bool, explanation: str)
    # -----------------------------------------------------------------------

    def _check_numeric_gt(
        self,
        condition: PolicyCondition,
        arguments: dict[str, Any],
        session: SessionState,
    ) -> tuple[bool, str]:
        """Check if a numeric argument exceeds a threshold."""
        field = condition.field
        threshold = condition.threshold

        if field not in arguments:
            return False, f"Field '{field}' not in arguments — rule does not apply"

        try:
            value = float(arguments[field])
        except (ValueError, TypeError):
            return False, f"Field '{field}' value '{arguments[field]}' is not numeric"

        if value > threshold:
            return True, f"Field '{field}' = {value} exceeds threshold {threshold}"
        else:
            return False, f"Field '{field}' = {value} is within threshold {threshold}"

    def _check_cumulative_gt(
        self,
        condition: PolicyCondition,
        arguments: dict[str, Any],
        session: SessionState,
    ) -> tuple[bool, str]:
        """Check if a cumulative session value exceeds a threshold."""
        session_field = condition.session_field
        threshold = condition.threshold

        current = session.get_value(session_field) or 0.0

        # Include the current action's contribution
        field = condition.field
        try:
            pending = float(arguments.get(field, 0))
        except (ValueError, TypeError):
            pending = 0.0

        projected = current + pending

        if projected > threshold:
            return True, (
                f"Cumulative '{session_field}' would be {projected} "
                f"(current: {current} + pending: {pending}), "
                f"exceeding threshold {threshold}"
            )
        else:
            return False, (
                f"Cumulative '{session_field}' would be {projected} "
                f"(current: {current} + pending: {pending}), "
                f"within threshold {threshold}"
            )

    def _check_domain_not_in_list(
        self,
        condition: PolicyCondition,
        arguments: dict[str, Any],
        session: SessionState,
    ) -> tuple[bool, str]:
        """Check if an email recipient's domain is NOT in the trusted list."""
        field = condition.field
        list_name = condition.list_name

        if field not in arguments:
            return False, f"Field '{field}' not in arguments — rule does not apply"

        email = str(arguments[field])
        if "@" not in email:
            return True, f"Field '{field}' = '{email}' is not a valid email address"

        domain = email.split("@")[-1].lower()
        trusted = [d.lower() for d in self._reference_lists.get(list_name, [])]

        if domain not in trusted:
            return True, (
                f"Domain '{domain}' (from '{email}') is not in "
                f"'{list_name}': {trusted}"
            )
        else:
            return False, f"Domain '{domain}' is in trusted list '{list_name}'"

    def _check_path_starts_with(
        self,
        condition: PolicyCondition,
        arguments: dict[str, Any],
        session: SessionState,
    ) -> tuple[bool, str]:
        """Check if a file path starts with any protected prefix."""
        field = condition.field
        prefixes = condition.prefixes or []

        if field not in arguments:
            return False, f"Field '{field}' not in arguments — rule does not apply"

        path = str(arguments[field])
        normalized = path.replace("\\", "/")

        for prefix in prefixes:
            norm_prefix = prefix.replace("\\", "/")
            if normalized.startswith(norm_prefix):
                return True, (
                    f"Path '{path}' starts with protected prefix '{prefix}'"
                )

        return False, f"Path '{path}' does not match any protected prefix"

    def _check_regex_match(
        self,
        condition: PolicyCondition,
        arguments: dict[str, Any],
        session: SessionState,
    ) -> tuple[bool, str]:
        """Check if a field value matches a regex pattern."""
        field = condition.field
        pattern = condition.pattern or ""

        if field not in arguments:
            return False, f"Field '{field}' not in arguments — rule does not apply"

        value = str(arguments[field])

        try:
            match = re.search(pattern, value)
        except re.error as e:
            return False, f"Invalid regex pattern '{pattern}': {e}"

        if match:
            return True, (
                f"Field '{field}' matches pattern '{pattern}' "
                f"(matched: '{match.group()}')"
            )
        else:
            return False, f"Field '{field}' does not match pattern '{pattern}'"

    def _check_numeric_lt(
        self,
        condition: PolicyCondition,
        arguments: dict[str, Any],
        session: SessionState,
    ) -> tuple[bool, str]:
        """Check if a numeric argument is below a threshold."""
        field = condition.field
        threshold = condition.threshold

        if field not in arguments:
            return False, f"Field '{field}' not in arguments — rule does not apply"

        try:
            value = float(arguments[field])
        except (ValueError, TypeError):
            return False, f"Field '{field}' value '{arguments[field]}' is not numeric"

        if threshold is not None and value < threshold:
            return True, f"Field '{field}' = {value} is below threshold {threshold}"
        else:
            return False, f"Field '{field}' = {value} meets or exceeds threshold {threshold}"

    def _check_numeric_between(
        self,
        condition: PolicyCondition,
        arguments: dict[str, Any],
        session: SessionState,
    ) -> tuple[bool, str]:
        """Check if a numeric argument falls within a specified range."""
        field = condition.field
        min_val = condition.min_threshold if condition.min_threshold is not None else float("-inf")
        max_val = condition.max_threshold if condition.max_threshold is not None else float("inf")

        if field not in arguments:
            return False, f"Field '{field}' not in arguments — rule does not apply"

        try:
            value = float(arguments[field])
        except (ValueError, TypeError):
            return False, f"Field '{field}' value '{arguments[field]}' is not numeric"

        if min_val <= value <= max_val:
            return True, f"Field '{field}' = {value} falls within forbidden range [{min_val}, {max_val}]"
        else:
            return False, f"Field '{field}' = {value} is outside range [{min_val}, {max_val}]"

    def _check_private_ip_denied(
        self,
        condition: PolicyCondition,
        arguments: dict[str, Any],
        session: SessionState,
    ) -> tuple[bool, str]:
        """
        SSRF Protection: Check if a destination URL, hostname, or IP addresses
        points to private, link-local, or cloud metadata ranges.
        """
        field = condition.field
        if field not in arguments:
            return False, f"Field '{field}' not in arguments — rule does not apply"

        raw_target = str(arguments[field]).strip()

        # Parse hostname if URL
        parsed = urlparse(raw_target)
        host = parsed.hostname or raw_target.split("/")[0].split(":")[0]

        # Common metadata and loopback hostnames
        dangerous_hosts = {
            "localhost",
            "127.0.0.1",
            "0.0.0.0",
            "::1",
            "169.254.169.254",  # AWS/Azure/GCP IMDS
            "metadata.google.internal",
            "instance-data",
        }

        if host.lower() in dangerous_hosts or "169.254.169.254" in raw_target:
            return True, f"SSRF violation: target '{raw_target}' resolves to protected internal/cloud metadata host '{host}'"

        try:
            ip = ipaddress.ip_address(host)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return True, f"SSRF violation: target host '{host}' is in protected/private network ({ip})"
        except ValueError:
            # Host is a regular domain name
            pass

        return False, f"Target '{raw_target}' does not point to forbidden private IP or metadata services"

    def _check_contains_any(
        self,
        condition: PolicyCondition,
        arguments: dict[str, Any],
        session: SessionState,
    ) -> tuple[bool, str]:
        """Check if any specified items appear in the target field value."""
        field = condition.field
        items = condition.items or []

        if field not in arguments:
            return False, f"Field '{field}' not in arguments — rule does not apply"

        val_lower = str(arguments[field]).lower()
        matched = [item for item in items if item.lower() in val_lower]

        if matched:
            return True, f"Field '{field}' contains forbidden items: {matched}"
        return False, f"Field '{field}' does not contain any forbidden items"

    def _check_contains_none(
        self,
        condition: PolicyCondition,
        arguments: dict[str, Any],
        session: SessionState,
    ) -> tuple[bool, str]:
        """Check if none of the required items appear in the target field value."""
        field = condition.field
        items = condition.items or []

        if field not in arguments:
            return False, f"Field '{field}' not in arguments — rule does not apply"

        val_lower = str(arguments[field]).lower()
        matched = [item for item in items if item.lower() in val_lower]

        if not matched:
            return True, f"Field '{field}' is missing required items: {items}"
        return False, f"Field '{field}' contains required items: {matched}"

    def _check_rate_limit_exceeded(
        self,
        condition: PolicyCondition,
        arguments: dict[str, Any],
        session: SessionState,
    ) -> tuple[bool, str]:
        """Check if the rate limit (sliding window calls) has been exceeded for this tool."""
        max_calls = condition.max_calls or 10
        window_seconds = condition.window_seconds or 60.0
        tool_name = condition.field or "default_tool"

        recent_count = session.get_recent_call_count(tool_name, window_seconds)

        if recent_count >= max_calls:
            return True, (
                f"Rate limit exceeded for '{tool_name}': {recent_count} calls "
                f"in last {window_seconds}s (limit: {max_calls})"
            )
        return False, (
            f"Rate limit OK for '{tool_name}': {recent_count}/{max_calls} "
            f"calls in last {window_seconds}s"
        )

