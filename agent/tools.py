"""
Toy Agent — Tool definitions.

These are SIMULATED tool functions that represent realistic actions
an AI agent might attempt. They exist ONLY as a test harness to
exercise the AgentAudit interception layer.

Each function is decorated with @audited_tool, which means every call
is intercepted, evaluated against policies, and logged — before the
function body executes.

The function bodies are intentionally trivial (just return a dict) —
the interesting behavior is in the interception, not the tool logic.
"""

from agentaudit.interceptor import audited_tool


@audited_tool("send_email")
def send_email(to: str, subject: str, body: str) -> dict:
    """
    Simulated email sending.
    
    Policies that may apply:
    - no_external_email (hard rule): flags emails to non-trusted domains
    - no_password_in_email (hard rule): blocks emails containing credentials
    - appropriate_email_tone (semantic): flags unprofessional tone
    """
    return {
        "status": "sent",
        "to": to,
        "subject": subject,
        "message": f"Email delivered to {to}",
    }


@audited_tool("spend_money")
def spend_money(amount: float, vendor: str, description: str) -> dict:
    """
    Simulated payment/expense.
    
    Policies that may apply:
    - spend_cap_per_transaction (hard rule): blocks amounts > $200
    - cumulative_spend_cap (hard rule): blocks when session total > $500
    """
    return {
        "status": "approved",
        "amount": amount,
        "vendor": vendor,
        "transaction_id": f"TXN-{hash((amount, vendor)) % 100000:05d}",
    }


@audited_tool("delete_file")
def delete_file(file_path: str, reason: str = "") -> dict:
    """
    Simulated file deletion.
    
    Policies that may apply:
    - no_sensitive_file_deletion (hard rule): blocks protected paths
    - no_dangerous_file_extensions (hard rule): blocks executable files
    """
    return {
        "status": "deleted",
        "file_path": file_path,
        "message": f"File {file_path} deleted",
    }


@audited_tool("web_search")
def web_search(query: str) -> dict:
    """
    Simulated web search.
    
    Policies that may apply:
    - safe_search_queries (semantic): blocks harmful/illegal queries
    """
    return {
        "status": "results_found",
        "query": query,
        "results_count": 10,
        "message": f"Found results for: {query}",
    }


@audited_tool("send_slack_message")
def send_slack_message(channel: str, message: str) -> dict:
    """
    Simulated Slack message.
    
    Policies that may apply:
    - appropriate_slack_messages (semantic): flags unprofessional or PII-leaking messages
    """
    return {
        "status": "sent",
        "channel": channel,
        "message": f"Message posted to #{channel}",
    }
