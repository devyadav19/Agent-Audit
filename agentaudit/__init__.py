"""
AgentAudit — Framework-agnostic policy enforcement & behavior verification
layer for AI agents.

Core exports:
    audited_tool   — Decorator that intercepts tool calls for policy checking
    AuditContext   — Context manager for setting agent/session metadata
    Verdict        — Enum: ALLOW, BLOCK, FLAG_FOR_REVIEW
"""

from agentaudit.interceptor import audited_tool, AuditContext, ActionBlockedError
from agentaudit.models import Verdict, AuditEntry, CheckResult

__all__ = [
    "audited_tool",
    "AuditContext",
    "ActionBlockedError",
    "Verdict",
    "AuditEntry",
    "CheckResult",
]
