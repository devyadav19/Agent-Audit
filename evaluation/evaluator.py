"""
Evaluation Framework — Ablation benchmarks for AgentAudit.

Runs the full scenario suite in three modes:
    1. Hard rules only (semantic evaluator disabled)
    2. Semantic only (hard rules disabled — all hard rules skipped)
    3. Combined (both tiers active — the default)

For each mode, computes:
    - Catch rate: correctly_blocked_or_flagged / total_violations
    - False positive rate: incorrectly_blocked / total_legitimate
    - Average latency per action
    - P95 latency

This produces the ablation comparison that demonstrates the semantic
layer's added value quantitatively — the central credibility claim
of the project.
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np_fallback  # We'll handle this without numpy
from rich.console import Console
from rich.table import Table

from agent.scenarios import ALL_SCENARIOS, Scenario
from agentaudit.interceptor import ActionBlockedError, AuditContext, initialize, reset
from agentaudit.database import AuditDatabase
from agentaudit.models import Verdict, EvaluationResult
from agentaudit.policy_engine import PolicyEngine

logger = logging.getLogger(__name__)
console = Console()

# Map tool names to their functions
TOOL_FUNCTIONS = {
    "send_email": None,
    "spend_money": None,
    "delete_file": None,
    "web_search": None,
    "send_slack_message": None,
}


def _get_tool_functions():
    """Lazy import to avoid circular dependency."""
    from agent.tools import send_email, spend_money, delete_file, web_search, send_slack_message
    return {
        "send_email": send_email,
        "spend_money": spend_money,
        "delete_file": delete_file,
        "web_search": web_search,
        "send_slack_message": send_slack_message,
    }


async def run_evaluation_mode(
    mode: str,
    scenarios: list[Scenario],
    policy_file: str = "policies/default_policies.yaml",
) -> EvaluationResult:
    """
    Run all scenarios in a specific evaluation mode.
    
    Args:
        mode: "hard_rules_only", "semantic_only", or "combined"
        scenarios: List of scenarios to run
        policy_file: Path to the policy YAML file
    """
    console.print(f"\n[bold cyan]═══ Running mode: {mode} ═══[/bold cyan]")

    # Reset global state
    reset()

    # Configure policy engine based on mode
    if mode == "hard_rules_only":
        engine = PolicyEngine(
            policy_file=policy_file,
            enable_semantic=False,
        )
    elif mode == "semantic_only":
        # We need a special engine that skips hard rules
        engine = PolicyEngine(
            policy_file=policy_file,
            enable_semantic=True,
        )
        # Remove hard rules from the engine
        engine._rules = [r for r in engine._rules if r.tier.value == "semantic"]
    else:  # combined
        engine = PolicyEngine(
            policy_file=policy_file,
            enable_semantic=True,
        )

    # Use in-memory database for evaluation
    db = AuditDatabase(database_url="sqlite+aiosqlite:///./eval_temp.db")
    await db.init_db()
    await db.clear_all()

    await initialize(policy_engine=engine, database=db)

    tools = _get_tool_functions()
    latencies = []
    per_scenario = []

    true_positives = 0
    false_positives = 0
    true_negatives = 0
    false_negatives = 0

    with AuditContext(agent_id="eval_agent", session_id=f"eval_{mode}"):
        for scenario in scenarios:
            tool_fn = tools.get(scenario.tool_name)
            if tool_fn is None:
                continue

            start = time.perf_counter()
            actual_verdict = None

            try:
                result = tool_fn(**scenario.arguments)
                actual_verdict = Verdict.ALLOW

                # Check if it was flagged
                entries = await db.get_entries(limit=1)
                if entries and entries[0].tool_name == scenario.tool_name:
                    actual_verdict = entries[0].decision

            except ActionBlockedError:
                actual_verdict = Verdict.BLOCK
            except Exception:
                actual_verdict = Verdict.BLOCK

            elapsed = (time.perf_counter() - start) * 1000
            latencies.append(elapsed)

            # Classify result
            caught = actual_verdict in (Verdict.BLOCK, Verdict.FLAG_FOR_REVIEW)

            if scenario.is_violation:
                if caught:
                    true_positives += 1
                else:
                    false_negatives += 1
            else:
                if caught:
                    false_positives += 1
                else:
                    true_negatives += 1

            per_scenario.append({
                "name": scenario.name,
                "tool": scenario.tool_name,
                "expected": scenario.expected_verdict.value,
                "actual": actual_verdict.value if actual_verdict else "ERROR",
                "is_violation": scenario.is_violation,
                "caught": caught,
                "latency_ms": round(elapsed, 2),
            })

    # Calculate metrics
    total_violations = true_positives + false_negatives
    total_legitimate = false_positives + true_negatives

    catch_rate = true_positives / total_violations if total_violations > 0 else 0.0
    fp_rate = false_positives / total_legitimate if total_legitimate > 0 else 0.0

    avg_latency = sum(latencies) / len(latencies) if latencies else 0.0

    # P95 latency (manual calculation without numpy)
    sorted_latencies = sorted(latencies)
    p95_idx = int(len(sorted_latencies) * 0.95)
    p95_latency = sorted_latencies[min(p95_idx, len(sorted_latencies) - 1)] if sorted_latencies else 0.0

    result = EvaluationResult(
        mode=mode,
        total_scenarios=len(scenarios),
        true_positives=true_positives,
        false_positives=false_positives,
        true_negatives=true_negatives,
        false_negatives=false_negatives,
        catch_rate=round(catch_rate, 4),
        false_positive_rate=round(fp_rate, 4),
        avg_latency_ms=round(avg_latency, 2),
        p95_latency_ms=round(p95_latency, 2),
        per_scenario=per_scenario,
    )

    # Print mode results
    console.print(f"  Catch rate: [bold]{catch_rate*100:.1f}%[/bold]")
    console.print(f"  False positive rate: [bold]{fp_rate*100:.1f}%[/bold]")
    console.print(f"  Avg latency: [bold]{avg_latency:.1f}ms[/bold]")

    return result


async def run_full_evaluation(
    policy_file: str = "policies/default_policies.yaml",
    output_file: str | None = None,
) -> list[EvaluationResult]:
    """
    Run the full ablation evaluation across all three modes.
    
    Returns results for hard_rules_only, semantic_only, and combined.
    """
    modes = ["hard_rules_only", "semantic_only", "combined"]
    results = []

    for mode in modes:
        result = await run_evaluation_mode(
            mode=mode,
            scenarios=ALL_SCENARIOS,
            policy_file=policy_file,
        )
        results.append(result)

    # Print comparison table
    _print_comparison_table(results)

    # Save to file if requested
    if output_file:
        output = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "results": [r.model_dump() for r in results],
        }
        Path(output_file).write_text(json.dumps(output, indent=2))
        console.print(f"\n[dim]Results saved to {output_file}[/dim]")

    return results


def _print_comparison_table(results: list[EvaluationResult]) -> None:
    """Print the ablation comparison table."""
    console.print("\n")
    table = Table(
        title="AgentAudit Evaluation — Ablation Comparison",
        show_header=True,
        header_style="bold",
    )

    table.add_column("Mode", style="bold cyan", min_width=20)
    table.add_column("Catch Rate", justify="right", min_width=12)
    table.add_column("False Pos.", justify="right", min_width=12)
    table.add_column("Avg Latency", justify="right", min_width=12)
    table.add_column("P95 Latency", justify="right", min_width=12)
    table.add_column("TP / FP / TN / FN", justify="right", min_width=18)

    for r in results:
        catch_color = "green" if r.catch_rate >= 0.9 else "yellow" if r.catch_rate >= 0.7 else "red"
        fp_color = "green" if r.false_positive_rate <= 0.05 else "yellow" if r.false_positive_rate <= 0.1 else "red"

        table.add_row(
            r.mode.replace("_", " ").title(),
            f"[{catch_color}]{r.catch_rate*100:.1f}%[/{catch_color}]",
            f"[{fp_color}]{r.false_positive_rate*100:.1f}%[/{fp_color}]",
            f"{r.avg_latency_ms:.1f}ms",
            f"{r.p95_latency_ms:.1f}ms",
            f"{r.true_positives} / {r.false_positives} / {r.true_negatives} / {r.false_negatives}",
        )

    console.print(table)


async def main() -> None:
    """CLI entry point for evaluation."""
    import argparse

    parser = argparse.ArgumentParser(description="Run AgentAudit evaluation benchmarks")
    parser.add_argument(
        "--mode",
        choices=["hard_rules_only", "semantic_only", "combined", "all"],
        default="all",
        help="Evaluation mode (default: all for ablation comparison)",
    )
    parser.add_argument(
        "--output", "-o",
        default="evaluation_results.json",
        help="Output file for results (default: evaluation_results.json)",
    )
    parser.add_argument(
        "--policy-file",
        default="policies/default_policies.yaml",
        help="Path to policy YAML file",
    )

    args = parser.parse_args()

    if args.mode == "all":
        await run_full_evaluation(
            policy_file=args.policy_file,
            output_file=args.output,
        )
    else:
        result = await run_evaluation_mode(
            mode=args.mode,
            scenarios=ALL_SCENARIOS,
            policy_file=args.policy_file,
        )
        if args.output:
            output = {
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "results": [result.model_dump()],
            }
            Path(args.output).write_text(json.dumps(output, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
