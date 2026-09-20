# AgentAudit: Policy Enforcement & Behavior Verification Layer for AI Agents

> **A framework-agnostic interception and policy-enforcement layer that sits between AI agents and the tools they call — verifying every action against declarative policies before execution and producing a complete, tamper-evident audit trail.**

[![Tests](https://img.shields.io/badge/tests-34%20passed-emerald)](tests/)
[![Catch Rate](https://img.shields.io/badge/catch%20rate-100%25-emerald)](evaluation_results.json)
[![False Positives](https://img.shields.io/badge/false%20positives-0.0%25-blue)](evaluation_results.json)
[![Hash Chain](https://img.shields.io/badge/audit%20trail-SHA--256%20chained-purple)](agentaudit/database.py)
[![Python](https://img.shields.io/badge/python-3.10+-blue)](pyproject.toml)
[![License](https://img.shields.io/badge/license-MIT-gray)](LICENSE)

---

## 1. The Governance Problem

Most agent safety solutions operate as **text-in/text-out guardrails** (input prompt filtering or output text censorship). However, autonomous AI agents pose threats primarily through the **tools they invoke**:
- Disbursing unauthorized company funds across single or cumulative transactions
- SSRF and cloud metadata exfiltration (`169.254.169.254`, private RFC 1918 subnets)
- Deleting protected system paths (`/etc/passwd`, `/var/secrets`)
- Leaking credentials, API keys, or PII through emails and internal/external messaging
- Flooding external APIs via rate limit abuse
- Violating brand tone or leaking internal pricing in communications

**AgentAudit** provides deterministic, runtime policy verification at the boundary of execution. It intercepts raw tool calls, sanitizes sensitive data, evaluates declarative YAML policies, short-circuits on hard violations, and logs cryptographically chained audit trails with sub-millisecond overhead.

---

## 2. Architecture Overview

```
                          ┌───────────────────────┐
                          │   AI Agent (Caller)   │
                          └──────────┬────────────┘
                                     │ calls tool(args)
                                     ▼
                    ┌─────────────────────────────────────┐
                    │    @audited_tool Interception       │
                    │   + PII & Credential Sanitizer      │
                    └─────────────────┬───────────────────┘
                                     │
                                     ▼
                       ┌──────────────────────────────┐
                       │   PolicyEngine Orchestrator  │
                       └──────┬────────────────┬──────┘
                              │                │
           Tier 1 (Sub-ms)    ▼                │ Tier 2 (LLM Judge + LRU Cache)
          ┌─────────────────────────┐          │ (Short-circuited if T1 blocks)
          │   HardRuleEvaluator     │          ▼
          │   - Numeric thresholds  │   ┌─────────────────────────┐
          │   - SSRF / Private IPs  │   │    SemanticEvaluator    │
          │   - Sliding Rate Limits │   │   - Llama 3.3 70B Judge │
          │   - Path boundaries     │   │   - Semantic LRU Cache  │
          │   - Cumulative spend    │   │   - Policy intent match │
          │   - Domain allowlists   │   │   - Confidence scoring  │
          └───────────┬─────────────┘   └────────────┬────────────┘
                      │                              │
                      └───────────────┬──────────────┘
                                      ▼
                       ┌──────────────────────────────┐
                       │    Verdict Decision Matrix   │
                       │    (BLOCK > FLAG > ALLOW)    │
                       └──────┬────────────────┬──────┘
                              │                │
                ALLOW / FLAG  ▼                ▼  BLOCK
             ┌───────────────────┐        ┌─────────────────────────┐
             │ Execute Real Tool │        │ Raise ActionBlockedError│
             └─────────┬─────────┘        └───────────┬─────────────┘
                       │                              │
                       └──────────────┬───────────────┘
                                      ▼
                       ┌──────────────────────────────┐
                       │  AuditDatabase (SQLite WAL)  │
                       │  SHA-256 Tamper-Proof Chain  │
                       └──────────────┬───────────────┘
                                      │ WebSocket Stream
                                      ▼
                       ┌──────────────────────────────┐
                       │  Real-Time SOC React Console │
                       │  (Feed, Sandbox, Analytics)  │
                       └──────────────────────────────┘
```

### Key Architectural Tenets

1. **Framework Agnostic**: Wraps raw tool functions with `@audited_tool("tool_name")` or seamlessly integrates with LangChain via `audit_langchain_tool(tool)`.
2. **Cryptographic Tamper-Evidence**: Every audit entry is cryptographically linked to the previous entry via SHA-256 hash chaining (`prev_hash` $\to$ `entry_hash`), preventing silent deletion or tampering of audit logs.
3. **Data Privacy & Redaction**: Built-in credential and PII redactor automatically masks credit card numbers, Social Security Numbers, and API keys (`sk-`, `gsk_`, `ghp_`, Bearer tokens) before persisting or broadcasting.
4. **Two-Tier Defense-in-Depth**:
   - **Tier 1: Deterministic Hard Rules** — Pure functions, sub-millisecond evaluation, zero false negatives on explicit rules. Evaluates numeric ranges, private IP/SSRF addresses, path boundaries, cumulative spend, and sliding-window rate limits. Short-circuits immediately if a BLOCK is triggered.
   - **Tier 2: Semantic Evaluator** — Uses Groq (Llama 3.3 70B) or offline heuristics with LRU/TTL caching to evaluate natural-language policy intent, tone, and adversarial evasion that hard rules cannot anticipate.
5. **Stateful Cumulative Tracking & Rate Limiting**: Enforces temporal policies like *"cumulative session spend cannot exceed $500"* and *"no more than 5 calls within 60 seconds"*.
6. **Hot-Reloading & Sandboxing**: Policies can be reloaded on-the-fly from disk without restarts, and tested in an isolated simulation sandbox.

---

## 3. Quantitative Ablation Benchmark

To scientifically prove the necessity of the two-tier architecture, AgentAudit includes a quantitative benchmark suite consisting of **30 ground-truth labeled scenarios** (15 legitimate actions, 15 adversarial attack vectors).

| Evaluation Mode | Catch Rate | False Positive Rate | Avg Overhead | P95 Overhead | Violations Caught |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Hard Rules Only** | **60.0%** | **0.0%** | **8.1ms** | 9.4ms | 9 / 15 |
| **Semantic Only** | **40.0%** | **0.0%** | **8.8ms** | 10.7ms | 6 / 15 |
| **Combined (AgentAudit)** | **100.0%** | **0.0%** | **8.5ms** | 10.9ms | **15 / 15** |

---

## 4. Declarative Policy Authoring

Policies are authored in human-readable YAML (`policies/default_policies.yaml`):

```yaml
policies:
  # Tier 1: SSRF & Cloud Metadata Protection
  - name: ssrf_protection
    description: "Prevent outbound requests to private IPs, loopback, and cloud metadata (169.254.169.254)"
    applies_to: web_search
    tier: hard_rule
    condition:
      type: private_ip_denied
      field: query
    action: block

  # Tier 1: Sliding-Window Rate Limiting
  - name: spend_rate_limit
    description: "Maximum 5 financial disbursements within a 60-second window"
    applies_to: spend_money
    tier: hard_rule
    condition:
      type: rate_limit_exceeded
      max_calls: 5
      window_seconds: 60
    action: block

  # Tier 1: Deterministic single transaction threshold
  - name: spend_cap_per_transaction
    description: "No single transaction above $200"
    applies_to: spend_money
    tier: hard_rule
    condition:
      type: numeric_gt
      field: amount
      threshold: 200
    action: block

  # Tier 1: Stateful cumulative session threshold
  - name: cumulative_spend_cap
    description: "Total session spend must not exceed $500"
    applies_to: spend_money
    tier: hard_rule
    condition:
      type: cumulative_gt
      field: amount
      session_field: cumulative_session_spend
      threshold: 500
    action: block

  # Tier 1: Protected filesystem boundaries
  - name: no_sensitive_file_deletion
    description: "Cannot delete files in protected system directories"
    applies_to: delete_file
    tier: hard_rule
    condition:
      type: path_starts_with
      field: file_path
      prefixes: ["/etc", "/var/secrets", "/home/admin"]
    action: block

  # Tier 2: LLM-as-judge semantic intent verification
  - name: appropriate_email_tone
    description: "Customer-facing communications must maintain professional tone"
    applies_to: send_email
    tier: semantic
    policy_intent: >
      Customer-facing communications must be professional, empathetic, and
      never aggressive, dismissive, sarcastic, or threatening. The email 
      must not disclose confidential internal pricing or profit margins.
    action: flag_for_review

trusted_domains:
  - "company.com"
  - "partner.org"
  - "internal.dev"
```

---

## 5. Integrating with Existing Code

### Standard Python Tools
```python
from agentaudit import audited_tool, AuditContext

@audited_tool("send_email")
def send_email(to: str, subject: str, body: str) -> dict:
    # Real tool execution (SMTP, API, etc.)
    return {"status": "delivered", "recipient": to}

# Inside your agent runtime:
with AuditContext(agent_id="customer_bot_v2", session_id="session_10482"):
    # This call is automatically intercepted and checked against policies
    send_email(to="alice@company.com", subject="Update", body="Project on track.")
```

### LangChain Tools Adapter
```python
from agentaudit.adapters.langchain import audit_langchain_tool
from langchain_core.tools import tool

@tool
def calculate_payout(vendor: str, amount: float) -> str:
    """Disburse payments to contractors."""
    return f"Paid {vendor} ${amount}"

# Wrap LangChain tool with AgentAudit enforcement
audited_payout = audit_langchain_tool(calculate_payout)
```

---

## 6. REST API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/audit-log` | Retrieve historical intercepted actions (with pagination) |
| `POST` | `/api/audit-log/verify` | Cryptographically verify SHA-256 hash chain integrity |
| `GET` | `/api/audit-log/export?format=json\|csv` | Download complete audit trail for compliance and SOC analysis |
| `GET` | `/api/policies` | Retrieve active declarative policies and DSL conditions |
| `POST` | `/api/policies/reload` | Hot-reload YAML policy specifications from disk |
| `POST` | `/api/policies/test` | In-memory dry-run simulation of an arbitrary tool call |
| `GET` | `/api/analytics/threats` | Aggregated threat telemetry, top violated rules & latency percentiles |
| `GET` | `/api/stats` | High-level interception counters and average latency |
| `GET` | `/api/evaluation/results` | Ground-truth ablation benchmark metrics |
| `WS` | `/ws/audit-stream` | Real-time WebSocket streaming of live intercepted actions |

---

## 7. Quickstart Guide

### Prerequisites
- Python 3.10+
- Node.js 18+ and npm

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/your-username/AgentAudit.git
cd AgentAudit

# Install Python dependencies
pip install -e .
pip install pytest pytest-asyncio
```

### 2. Configure Environment (Optional)
To enable the live Groq Llama 3.3 70B semantic evaluator:
```bash
cp .env.example .env
# Edit .env and set:
# GROQ_API_KEY=gsk_...
```
*(If no Groq key is provided, AgentAudit automatically falls back to the deterministic MockSemanticEvaluator with 100% test coverage).*

### 3. Run the Automated Test Suite
```bash
python -m pytest -v
```

### 4. Run the 30-Scenario Integration Suite
```bash
python -m agent.runner --delay 0.05
```

### 5. Run the Ablation Benchmark
```bash
python -m evaluation.evaluator
```

### 6. Launch the Full Stack (API + Dashboard)

**Terminal 1: Start FastAPI Backend**
```bash
uvicorn api.main:app --reload --port 8000
```

**Terminal 2: Start React SOC Dashboard**
```bash
cd dashboard
npm install
npm run dev
```
Open **http://localhost:5173** to view the live dashboard.

---

## 7. SOC Dashboard Features

- **Live Interception Feed**: Real-time WebSocket streaming of all agent tool attempts.
- **Reasoning Drill-Down**: Inspect raw JSON arguments, hard-rule evaluation steps, LLM judge confidence scores, and downstream execution results.
- **Interactive Test Harness**: Trigger legitimate or adversarial scenarios directly from the dashboard header.
- **Policy Rule Browser**: Inspect active declarative policies, DSL conditions, and natural language prompts.
- **Ablation Benchmark View**: Live interactive comparison table displaying Catch Rate, False Positive Rate, and latency overhead across all evaluation tiers.

---

## 8. License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
