"""
Session state tracking for AgentAudit.

Maintains per-session cumulative state (e.g., total spend, action counts)
so that stateful policy rules like "cumulative_session_spend > 500" can
be evaluated deterministically.

Thread-safe via a lock per session.
"""

from __future__ import annotations

import threading
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any


@dataclass
class SessionState:
    """
    Mutable state for a single agent session.
    
    Tracks cumulative values that stateful hard rules need to reference.
    """
    session_id: str
    cumulative_session_spend: float = 0.0
    actions_this_session: int = 0
    tools_called: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    call_timestamps: dict[str, list[float]] = field(default_factory=lambda: defaultdict(list))
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def record_action(self, tool_name: str, arguments: dict[str, Any]) -> None:
        """
        Update session state after a tool call is evaluated.
        
        Called by the interceptor regardless of verdict — we track
        *attempted* actions, not just allowed ones.
        """
        import time
        with self._lock:
            self.actions_this_session += 1
            self.tools_called[tool_name] += 1
            self.call_timestamps[tool_name].append(time.time())

            # Track cumulative spend for spend_money tool
            if tool_name == "spend_money" and "amount" in arguments:
                try:
                    self.cumulative_session_spend += float(arguments["amount"])
                except (ValueError, TypeError):
                    pass

    def get_recent_call_count(self, tool_name: str, window_seconds: float) -> int:
        """Get number of calls to tool_name within the sliding window."""
        import time
        now = time.time()
        cutoff = now - window_seconds
        with self._lock:
            recent = [t for t in self.call_timestamps[tool_name] if t >= cutoff]
            self.call_timestamps[tool_name] = recent
            return len(recent)

    def get_value(self, field_name: str) -> Any:
        """Get a session state value by field name (for policy condition evaluation)."""
        with self._lock:
            return getattr(self, field_name, None)


class SessionManager:
    """
    Manages SessionState instances keyed by session_id.
    
    Thread-safe: creates new sessions on first access.
    """

    def __init__(self) -> None:
        self._sessions: dict[str, SessionState] = {}
        self._lock = threading.Lock()

    def get_session(self, session_id: str) -> SessionState:
        """Get or create a session state for the given session ID."""
        with self._lock:
            if session_id not in self._sessions:
                self._sessions[session_id] = SessionState(session_id=session_id)
            return self._sessions[session_id]

    def reset_session(self, session_id: str) -> None:
        """Reset a session's state (useful for testing)."""
        with self._lock:
            self._sessions.pop(session_id, None)

    def reset_all(self) -> None:
        """Reset all sessions."""
        with self._lock:
            self._sessions.clear()
