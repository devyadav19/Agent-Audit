"""
Scenario Runner — Executes test scenarios against audited tools.

Runs scenarios sequentially, handling both ALLOW and BLOCK outcomes,
and reports results to the console and optionally to the API.
"""

from __future__ import annotations

import asyncio
import logging
import sys
import time
from typing import Any

from rich.console import Console
from rich.table import Table
from rich.text import Text

from agent.scenarios import ALL_SCENARIOS, Scenario, get_scenarios
from agent.tools import delete_file, send_email, send_slack_message, spend_money, web_search
from agentaudit.interceptor import ActionBlockedError, AuditContext
from agentaudit.models import Verdict

logger = logging.getLogger(__name__)
console = Console()

# Map tool names to their function references
TOOL_FUNCTIONS = {
    "send_email": send_email,
    "spend_money": spend_money,
    "delete_file": delete_file,
    "web_search": web_search,
    "send_slack_message": send_slack_message,
}


async def run_scenario(scenario: Scenario) -> dict[str, Any]:
    """
    Execute a single scenario and return the result.
    
    Returns a dict with:
        - scenario: the Scenario object
        - actual_verdict: what actually happened
        - matched_expected: bool
        - latency_ms: how long the intercepted call took
        - error: any error message
    """
    tool_fn = TOOL_FUNCTIONS.get(scenario.tool_name)
    if tool_fn is None:
        return {
            "scenario": scenario,
            "actual_verdict": None,
            "matched_expected": False,
            "latency_ms": 0,
            "error": f"Unknown tool: {scenario.tool_name}",
        }

    start = time.perf_counter()
    actual_verdict = None
    error = None

    try:
        # Call the tool — it's intercepted by @audited_tool
        result = tool_fn(**scenario.arguments)
        actual_verdict = Verdict.ALLOW  # If no exception, it was allowed

        # Check if it was flagged by inspecting the audit log
        # (FLAG_FOR_REVIEW still executes but logs the flag)
        from agentaudit.interceptor import get_database
        db = get_database()
        if db:
            entries = await db.get_entries(limit=1)
            if entries and entries[0].tool_name == scenario.tool_name:
                actual_verdict = entries[0].decision

    except ActionBlockedError as e:
        actual_verdict = Verdict.BLOCK
    except Exception as e:
        error = str(e)
        actual_verdict = Verdict.BLOCK  # Treat errors as blocks for safety

    elapsed = (time.perf_counter() - start) * 1000

    # Determine if the actual matches expected
    # For violations: BLOCK or FLAG matches if expected is BLOCK or FLAG
    # For legitimate: only ALLOW matches
    if scenario.is_violation:
        matched = actual_verdict in (Verdict.BLOCK, Verdict.FLAG_FOR_REVIEW)
    else:
        matched = actual_verdict == Verdict.ALLOW

    return {
        "scenario": scenario,
        "actual_verdict": actual_verdict,
        "matched_expected": matched,
        "latency_ms": elapsed,
        "error": error,
    }


async def run_all_scenarios(
    category: str | None = None,
    delay_between: float = 0.1,
    agent_id: str = "test_agent",
    session_id: str = "test_session",
) -> list[dict[str, Any]]:
    """
    Run all (or filtered) scenarios and return results.
    
    Args:
        category: "legitimate", "adversarial", or None for all
        delay_between: seconds to wait between scenarios
        agent_id: agent ID to use in audit context
        session_id: session ID to use in audit context
    """
    scenarios = get_scenarios(category=category)
    results = []

    try:
        console.print(f"\n[bold]Running {len(scenarios)} scenarios...[/bold]\n")
    except Exception:
        pass

    with AuditContext(agent_id=agent_id, session_id=session_id):
        for i, scenario in enumerate(scenarios):
            result = await run_scenario(scenario)
            results.append(result)

            # Print result immediately
            _print_scenario_result(i + 1, result)

            if delay_between > 0 and i < len(scenarios) - 1:
                await asyncio.sleep(delay_between)

    # Print summary
    _print_summary(results)

    return results


def _print_scenario_result(index: int, result: dict[str, Any]) -> None:
    """Print a single scenario result to console safely."""
    try:
        scenario = result["scenario"]
        actual = result["actual_verdict"]
        matched = result["matched_expected"]

        # Status indicator (ASCII-safe to prevent Windows cp1252 UnicodeEncodeError)
        if matched:
            status = Text("[PASS]", style="bold green")
        else:
            status = Text("[FAIL]", style="bold red")

        # Verdict coloring
        verdict_styles = {
            Verdict.ALLOW: "green",
            Verdict.BLOCK: "red",
            Verdict.FLAG_FOR_REVIEW: "yellow",
        }
        actual_text = Text(
            actual.value if actual else "ERROR",
            style=verdict_styles.get(actual, "red"),
        )
        expected_text = Text(
            scenario.expected_verdict.value,
            style=verdict_styles.get(scenario.expected_verdict, "white"),
        )

        console.print(
            f"  {index:2d}. {status} | "
            f"{scenario.name:<28s} | "
            f"expected: {expected_text} | "
            f"actual: {actual_text} | "
            f"{result['latency_ms']:.1f}ms"
        )
    except Exception:
        pass


def _print_summary(results: list[dict[str, Any]]) -> None:
    """Print a summary table of results safely."""
    try:
        total = len(results)
        passed = sum(1 for r in results if r["matched_expected"])
        failed = total - passed

        violations = [r for r in results if r["scenario"].is_violation]
        legitimate = [r for r in results if not r["scenario"].is_violation]

        caught = sum(1 for r in violations if r["matched_expected"])
        false_positives = sum(1 for r in legitimate if not r["matched_expected"])

        avg_latency = sum(r["latency_ms"] for r in results) / total if total else 0

        console.print("\n")
        table = Table(title="Scenario Run Summary", show_header=True)
        table.add_column("Metric", style="bold")
        table.add_column("Value", justify="right")

        table.add_row("Total Scenarios", str(total))
        table.add_row("Passed", f"[green]{passed}[/green]")
        table.add_row("Failed", f"[red]{failed}[/red]" if failed else "0")
        table.add_row("---", "---")
        table.add_row(
            "Catch Rate (violations caught)",
            f"{caught}/{len(violations)} ({caught / len(violations) * 100:.1f}%)" if violations else "N/A",
        )
        table.add_row(
            "False Positive Rate",
            f"{false_positives}/{len(legitimate)} ({false_positives / len(legitimate) * 100:.1f}%)" if legitimate else "N/A",
        )
        table.add_row("Avg Latency", f"{avg_latency:.1f}ms")

        console.print(table)
    except Exception:
        pass


async def main() -> None:
    """CLI entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Run AgentAudit test scenarios")
    parser.add_argument(
        "--category",
        choices=["legitimate", "adversarial"],
        default=None,
        help="Run only a specific category",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.5,
        help="Delay between scenarios in seconds (default: 0.5)",
    )
    parser.add_argument(
        "--agent-id",
        default="test_agent",
        help="Agent ID for audit context",
    )
    parser.add_argument(
        "--session-id",
        default="test_session",
        help="Session ID for audit context",
    )

    args = parser.parse_args()

    await run_all_scenarios(
        category=args.category,
        delay_between=args.delay,
        agent_id=args.agent_id,
        session_id=args.session_id,
    )


if __name__ == "__main__":
    asyncio.run(main())
