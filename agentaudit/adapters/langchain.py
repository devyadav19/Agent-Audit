"""
LangChain Adapter for AgentAudit.

Allows wrapping LangChain BaseTool objects or functions with AgentAudit policy enforcement.

Usage:
    from agentaudit.adapters.langchain import audit_langchain_tool

    audited_tool = audit_langchain_tool(my_langchain_tool, tool_name="spend_money")
"""

from __future__ import annotations

from typing import Any, Callable
from agentaudit.interceptor import audited_tool


def audit_langchain_tool(tool: Any, tool_name: str | None = None) -> Any:
    """
    Wrap a LangChain BaseTool or tool-like object so its `_run` and `_arun`
    methods are intercepted and verified against AgentAudit policies.
    """
    name = tool_name or getattr(tool, "name", tool.__class__.__name__)

    if hasattr(tool, "_run"):
        original_run = tool._run
        tool._run = audited_tool(name)(original_run)

    if hasattr(tool, "_arun"):
        original_arun = tool._arun
        tool._arun = audited_tool(name)(original_arun)

    return tool
