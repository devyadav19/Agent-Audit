import React, { useState, useEffect } from 'react';
import type { ThreatAnalyticsData } from '../lib/types';
import {
  TrendingUp,
  ShieldAlert,
  Clock,
  CheckCircle2,
  RefreshCw,
  Activity,
  Layers,
} from 'lucide-react';

export const ThreatAnalytics: React.FC = () => {
  const [data, setData] = useState<ThreatAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/analytics/threats');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error('Failed to load threat analytics', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="py-24 text-center font-mono text-xs text-slate-400 space-y-2">
        <div className="inline-block w-6 h-6 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin"></div>
        <p>Aggregating threat intelligence metrics...</p>
      </div>
    );
  }

  const topRules = data?.top_violated_rules || [];
  const maxViolations = topRules.length > 0 ? Math.max(...topRules.map((r) => r.count), 1) : 1;
  const toolBreakdown = data?.tool_breakdown || {};
  const latencies = data?.latency_percentiles || { p50_ms: 0, p95_ms: 0, p99_ms: 0 };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h2 className="font-mono font-bold text-base text-slate-100">
              Threat Intelligence & Enforcement Telemetry
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Real-time analytics across intercepted agent actions, policy violation distribution, and runtime latency percentiles.
          </p>
        </div>

        <button
          onClick={fetchAnalytics}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs transition-colors cursor-pointer shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Security Posture Rating */}
        <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>CONTAINMENT STATUS</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold text-emerald-400">100% ACTIVE</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Deterministic hard rules active with sub-millisecond short-circuiting.
          </p>
        </div>

        {/* Latency Telemetry */}
        <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>P95 INTERCEPTION OVERHEAD</span>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold text-slate-100">{latencies.p95_ms}ms</span>
            <span className="text-xs text-slate-500 font-mono">(P50: {latencies.p50_ms}ms)</span>
          </div>
          <p className="text-[11px] text-slate-400">
            P99 latency capped at {latencies.p99_ms}ms across all monitored sessions.
          </p>
        </div>

        {/* Total Analyzed */}
        <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>SAMPLES ANALYZED</span>
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold text-slate-100">{data?.total_analyzed || 0}</span>
            <span className="text-xs text-slate-500 font-mono">recent events</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Continuous threat aggregation from local SQLite WAL storage.
          </p>
        </div>
      </div>

      {/* Grid: Top Violated Rules & Tool Distributions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Violated Policies */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-mono font-bold text-sm text-slate-200 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              Most Frequently Violated Policies
            </h3>
            <span className="text-[11px] font-mono text-slate-500">Ranked by blocks</span>
          </div>

          {topRules.length > 0 ? (
            <div className="space-y-3">
              {topRules.slice(0, 6).map((item, idx) => {
                const pct = ((item.count / maxViolations) * 100).toFixed(0);
                return (
                  <div key={item.rule} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-300 font-medium truncate pr-2">
                        {idx + 1}. {item.rule}
                      </span>
                      <span className="text-rose-400 font-bold shrink-0">{item.count} hits</span>
                    </div>
                    <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800/80">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-xs font-mono text-slate-500">
              No policy violations recorded yet. Run test scenarios to populate threat telemetry.
            </div>
          )}
        </div>

        {/* Tool Invocations by Verdict */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-mono font-bold text-sm text-slate-200 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              Tool Invocation Verdict Split
            </h3>
            <span className="text-[11px] font-mono text-slate-500">By Tool Type</span>
          </div>

          {Object.keys(toolBreakdown).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(toolBreakdown).map(([tool, counts]) => {
                const allow = counts.ALLOW || 0;
                const block = counts.BLOCK || 0;
                const flag = counts.FLAG_FOR_REVIEW || 0;
                const total = allow + block + flag;

                const allowPct = total > 0 ? (allow / total) * 100 : 0;
                const blockPct = total > 0 ? (block / total) * 100 : 0;
                const flagPct = total > 0 ? (flag / total) * 100 : 0;

                return (
                  <div key={tool} className="space-y-1.5 bg-slate-950/60 p-3 rounded-lg border border-slate-800/70">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-200 font-semibold">{tool}</span>
                      <span className="text-slate-400">{total} total</span>
                    </div>

                    {/* Tri-color Stacked Bar */}
                    <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden flex">
                      <div
                        style={{ width: `${allowPct}%` }}
                        className="bg-emerald-500 h-full"
                        title={`Allowed: ${allow}`}
                      ></div>
                      <div
                        style={{ width: `${flagPct}%` }}
                        className="bg-amber-500 h-full"
                        title={`Flagged: ${flag}`}
                      ></div>
                      <div
                        style={{ width: `${blockPct}%` }}
                        className="bg-rose-500 h-full"
                        title={`Blocked: ${block}`}
                      ></div>
                    </div>

                    <div className="flex items-center gap-4 text-[10px] font-mono text-slate-400 pt-0.5">
                      <span className="text-emerald-400">Allow: {allow}</span>
                      <span className="text-amber-400">Flag: {flag}</span>
                      <span className="text-rose-400">Block: {block}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-xs font-mono text-slate-500">
              No tool data available.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
