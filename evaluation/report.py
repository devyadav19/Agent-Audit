"""
Evaluation Report Generator — Formats ablation benchmark results.

Generates:
    - Terminal-friendly summary tables (Rich)
    - Markdown comparison tables for README / documentation
    - Structured JSON for API and React dashboard display
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from rich.console import Console
from rich.table import Table


def load_results(path: str | Path = "evaluation_results.json") -> dict[str, Any]:
    """Load benchmark results from JSON file."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Evaluation results file not found at {path}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def format_markdown_table(data: dict[str, Any]) -> str:
    """Generate GitHub-Flavored Markdown comparison table."""
    results = data.get("results", [])
    lines = [
        "| Evaluation Mode | Catch Rate | False Positive Rate | Avg Latency | P95 Latency | True Positives | False Negatives |",
        "| :--- | :---: | :---: | :---: | :---: | :---: | :---: |",
    ]
    for r in results:
        mode_title = r["mode"].replace("_", " ").title()
        catch = f"{r['catch_rate'] * 100:.1f}%"
        fp = f"{r['false_positive_rate'] * 100:.1f}%"
        avg_lat = f"{r['avg_latency_ms']:.1f}ms"
        p95_lat = f"{r['p95_latency_ms']:.1f}ms"
        tp = str(r["true_positives"])
        fn = str(r["false_negatives"])
        lines.append(f"| **{mode_title}** | {catch} | {fp} | {avg_lat} | {p95_lat} | {tp} | {fn} |")
    return "\n".join(lines)


def print_cli_summary(data: dict[str, Any]) -> None:
    """Print a clean Rich table to the console."""
    console = Console()
    table = Table(
        title="AgentAudit Ablation Benchmark Report",
        title_style="bold magenta",
        header_style="bold cyan",
        show_lines=True,
    )
    table.add_column("Tier Configuration", style="bold white")
    table.add_column("Catch Rate", justify="right")
    table.add_column("False Positive Rate", justify="right")
    table.add_column("Avg Latency", justify="right")
    table.add_column("P95 Latency", justify="right")
    table.add_column("TP / Violations", justify="center")

    for r in data.get("results", []):
        name = r["mode"].replace("_", " ").title()
        catch_color = "green" if r["catch_rate"] >= 0.9 else ("yellow" if r["catch_rate"] >= 0.5 else "red")
        fp_color = "green" if r["false_positive_rate"] == 0 else "red"

        table.add_row(
            name,
            f"[{catch_color}]{r['catch_rate'] * 100:.1f}%[/{catch_color}]",
            f"[{fp_color}]{r['false_positive_rate'] * 100:.1f}%[/{fp_color}]",
            f"{r['avg_latency_ms']:.1f}ms",
            f"{r['p95_latency_ms']:.1f}ms",
            f"{r['true_positives']} / {r['true_positives'] + r['false_negatives']}",
        )

    console.print(table)


if __name__ == "__main__":
    try:
        data = load_results()
        print_cli_summary(data)
        print("\nMarkdown Table:\n")
        print(format_markdown_table(data))
    except Exception as e:
        print(f"Error generating report: {e}")
