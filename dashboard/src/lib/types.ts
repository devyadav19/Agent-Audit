export type Verdict = 'ALLOW' | 'BLOCK' | 'FLAG_FOR_REVIEW';
export type CheckTier = 'hard_rule' | 'semantic';

export interface CheckResult {
  rule_name: string;
  tier: CheckTier;
  verdict: Verdict;
  explanation: string;
  confidence: number;
  latency_ms: number;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  agent_id: string;
  session_id: string;
  tool_name: string;
  arguments: Record<string, any>;
  decision: Verdict;
  check_results: CheckResult[];
  execution_result?: any;
  total_latency_ms: number;
  error?: string | null;
  prev_hash?: string | null;
  entry_hash?: string | null;
}

export interface Stats {
  total: number;
  by_verdict: {
    ALLOW?: number;
    BLOCK?: number;
    FLAG_FOR_REVIEW?: number;
  };
  by_tool: Record<string, number>;
  avg_latency_ms: number;
}

export interface PolicyRule {
  name: string;
  description: string;
  applies_to: string;
  tier: CheckTier;
  condition?: Record<string, any>;
  policy_intent?: string;
  action: Verdict;
}

export interface IntegrityVerificationResult {
  verified: boolean;
  total_entries: number;
  chain_head?: string | null;
  tampered_entry_ids: string[];
  message: string;
  verified_at: string;
}

export interface ThreatAnalyticsData {
  total_analyzed: number;
  top_violated_rules: { rule: string; count: number }[];
  tool_breakdown: Record<string, Record<string, number>>;
  latency_percentiles: {
    p50_ms: number;
    p95_ms: number;
    p99_ms: number;
  };
}

export interface PolicyReloadResult {
  status: string;
  policy_file: string;
  total_rules: number;
  hard_rules: number;
  semantic_rules: number;
  timestamp: string;
}

export interface PerScenarioResult {
  name: string;
  tool: string;
  expected: string;
  actual: string;
  is_violation: boolean;
  caught: boolean;
  latency_ms: number;
}

export interface ModeEvaluationResult {
  mode: string;
  total_scenarios: number;
  true_positives: number;
  false_positives: number;
  true_negatives: number;
  false_negatives: number;
  catch_rate: number;
  false_positive_rate: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  per_scenario: PerScenarioResult[];
}

export interface EvaluationReportData {
  timestamp: string | null;
  results: ModeEvaluationResult[];
}

