"""
Interception Layer — The @audited_tool decorator.

This is the public API of AgentAudit. Any Python function decorated with
@audited_tool("tool_name") gets intercepted before execution:

    1. Arguments are captured
    2. Policy engine evaluates the action
    3. Decision is logged to the audit trail
    4. Action is ALLOWED (executed), BLOCKED (raises ActionBlockedError),
       or FLAGGED (executed but marked for human review)

Framework-agnostic: works whether the tool function is called by raw
OpenAI/Groq/Anthropic function-calling, LangChain, or any Python code.
The decorator doesn't know or care what triggered the call.

Usage:
    from agentaudit import audited_tool, AuditContext

    @audited_tool("send_email")
    def send_email(to: str, subject: str, body: str) -> dict:
        return {"status": "sent", "to": to}

    # Set agent/session context before calling tools
    with AuditContext(agent_id="support-bot", session_id="session-123"):
        result = send_email(to="user@company.com", subject="Hello", body="Hi")
"""

from __future__ import annotations

import asyncio
import contextvars
import functools
import inspect
import logging
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Callable, TypeVar

from agentaudit.models import AuditEntry, Verdict

logger = logging.getLogger(__name__)

# Context variable for passing agent/session metadata to the interceptor
_audit_context: contextvars.ContextVar["_ContextData | None"] = contextvars.ContextVar(
    "_audit_context", default=None
)


@dataclass
class _ContextData:
    agent_id: str
    session_id: str


class AuditContext:
    """
    Context manager for setting agent/session metadata.
    
    Any @audited_tool calls made inside this context will be tagged
    with the given agent_id and session_id in the audit log.
    
    Usage:
        with AuditContext(agent_id="bot-1", session_id="sess-abc"):
            send_email(to="user@example.com", ...)
    """

    def __init__(self, agent_id: str = "default_agent", session_id: str = "default_session"):
        self.agent_id = agent_id
        self.session_id = session_id
        self._token: contextvars.Token | None = None

    def __enter__(self) -> "AuditContext":
        self._token = _audit_context.set(
            _ContextData(agent_id=self.agent_id, session_id=self.session_id)
        )
        return self

    def __exit__(self, *exc: Any) -> None:
        if self._token is not None:
            _audit_context.reset(self._token)


class ActionBlockedError(Exception):
    """
    Raised when a tool call is blocked by a policy rule.
    
    Contains the full AuditEntry so the caller can inspect
    what rule triggered the block and why.
    """

    def __init__(self, entry: AuditEntry):
        self.entry = entry
        rule_names = [
            cr.rule_name
            for cr in entry.check_results
            if cr.verdict == Verdict.BLOCK
        ]
        super().__init__(
            f"Action '{entry.tool_name}' blocked by policy rules: {rule_names}"
        )


# ---------------------------------------------------------------------------
# Global state — lazily initialized
# ---------------------------------------------------------------------------

_policy_engine = None
_database = None
_initialized = False


async def _ensure_initialized() -> None:
    """Lazily initialize the policy engine and database."""
    global _policy_engine, _database, _initialized

    if _initialized:
        return

    from agentaudit.policy_engine import PolicyEngine
    from agentaudit.database import AuditDatabase

    _policy_engine = PolicyEngine()
    _database = AuditDatabase()
    await _database.init_db()
    _initialized = True
    logger.info("AgentAudit interceptor initialized")


def get_policy_engine():
    """Get the global policy engine instance (for API access)."""
    return _policy_engine


def get_database():
    """Get the global database instance (for API access)."""
    return _database


async def initialize(
    policy_engine=None,
    database=None,
) -> None:
    """
    Explicitly initialize the interceptor with custom components.
    
    Call this if you want to inject a custom policy engine or database
    (e.g., for testing). Otherwise, defaults are created lazily.
    """
    global _policy_engine, _database, _initialized

    if policy_engine is not None:
        _policy_engine = policy_engine
    else:
        from agentaudit.policy_engine import PolicyEngine
        _policy_engine = PolicyEngine()

    if database is not None:
        _database = database
    else:
        from agentaudit.database import AuditDatabase
        _database = AuditDatabase()
        await _database.init_db()

    _initialized = True
    logger.info("AgentAudit interceptor initialized (explicit)")


def reset() -> None:
    """Reset the global state (for testing)."""
    global _policy_engine, _database, _initialized
    _policy_engine = None
    _database = None
    _initialized = False


# ---------------------------------------------------------------------------
# The decorator
# ---------------------------------------------------------------------------

F = TypeVar("F", bound=Callable)


def audited_tool(tool_name: str) -> Callable[[F], F]:
    """
    Decorator that intercepts a tool function for policy enforcement.
    
    Every call to the decorated function will:
    1. Have its arguments captured
    2. Be evaluated against all applicable policy rules
    3. Be logged to the audit trail
    4. Be ALLOWED, BLOCKED, or FLAGGED based on the evaluation
    
    Works with both sync and async functions.
    
    Args:
        tool_name: The canonical name for this tool (used in policy rules)
    
    Raises:
        ActionBlockedError: If the action is blocked by a policy rule
    """

    def decorator(func: F) -> F:
        if inspect.iscoroutinefunction(func):
            @functools.wraps(func)
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                return await _intercept(func, tool_name, args, kwargs, is_async=True)
            return async_wrapper  # type: ignore
        else:
            @functools.wraps(func)
            def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
                # Run the async intercept in an event loop
                try:
                    loop = asyncio.get_running_loop()
                except RuntimeError:
                    loop = None

                if loop and loop.is_running():
                    # We're already in an async context — create a task
                    import concurrent.futures
                    with concurrent.futures.ThreadPoolExecutor() as pool:
                        future = pool.submit(
                            asyncio.run,
                            _intercept(func, tool_name, args, kwargs, is_async=False),
                        )
                        return future.result()
                else:
                    return asyncio.run(
                        _intercept(func, tool_name, args, kwargs, is_async=False)
                    )
            return sync_wrapper  # type: ignore

    return decorator


async def _intercept(
    func: Callable,
    tool_name: str,
    args: tuple,
    kwargs: dict,
    is_async: bool,
) -> Any:
    """
    Core interception logic.
    
    1. Build arguments dict from function signature
    2. Evaluate against policy engine
    3. Log the audit entry
    4. Execute or block
    """
    await _ensure_initialized()

    # Get agent/session context
    ctx = _audit_context.get()
    agent_id = ctx.agent_id if ctx else "default_agent"
    session_id = ctx.session_id if ctx else "default_session"

    # Build arguments dict from function signature
    sig = inspect.signature(func)
    bound = sig.bind(*args, **kwargs)
    bound.apply_defaults()
    arguments = dict(bound.arguments)

    # Evaluate against policies
    entry = await _policy_engine.evaluate(
        tool_name=tool_name,
        arguments=arguments,
        agent_id=agent_id,
        session_id=session_id,
    )

    from agentaudit.redactor import redact_data

    # Execute or block based on verdict
    if entry.decision == Verdict.BLOCK:
        # Redact arguments before logging to persistent audit trail
        entry.arguments = redact_data(entry.arguments)
        await _database.insert_entry(entry)
        raise ActionBlockedError(entry)

    # ALLOW or FLAG_FOR_REVIEW — execute the function
    try:
        if is_async:
            result = await func(*args, **kwargs)
        else:
            result = func(*args, **kwargs)
        entry.execution_result = redact_data(result)
    except Exception as e:
        entry.error = f"{type(e).__name__}: {e}"
        entry.arguments = redact_data(entry.arguments)
        await _database.insert_entry(entry)
        raise

    # Log the entry with sanitized arguments and execution result
    entry.arguments = redact_data(entry.arguments)
    await _database.insert_entry(entry)

    return result

