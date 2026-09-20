import React, { useState, useEffect } from 'react';
import type { EvaluationReportData } from '../lib/types';
import { BarChart3, ShieldCheck, Zap, Cpu, RefreshCw } from 'lucide-react';

interface EvaluationReportProps {
  onTriggerEvaluation: () => Promise<void>;
  isEvaluating: boolean;
}

export const EvaluationReport: React.FC<EvaluationReportProps> = ({
  onTriggerEvaluation,
  isEvaluating,
}) => {
  const [data, setData] = useState<EvaluationReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchResults = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/evaluation/results');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error('Failed to fetch evaluation results', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResults();
  }, []);

  const handleRun = async () => {
    await onTriggerEvaluation();
    await fetchResults();
  };

  if (loading) {
    return (
      <div className="py-20 text-center font-mono text-xs text-slate-400">
        Loading evaluation benchmark data...
      </div>
    );
  }

  const results = data?.results || [];
  const hardOnly = results.find((r) => r.mode === 'hard_rules_only');
  const semanticOnly = results.find((r) => r.mode === 'semantic_only');
  const combined = results.find((r) => r.mode === 'combined');

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/80 p-5 rounded-xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            <h2 className="font-mono font-bold text-base text-slate-100">
              Ablation Study & Quantitative Benchmarks
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Evaluates the quantitative contribution of both the deterministic hard rule tier and the
            semantic LLM-as-judge tier across 30 ground-truth test scenarios (15 legitimate, 15 adversarial).
          </p>
        </div>

        <button
          onClick={handleRun}
          disabled={isEvaluating}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-mono text-xs font-semibold transition-colors cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isEvaluating ? 'animate-spin' : ''}`} />
          <span>{isEvaluating ? 'Running Benchmark...' : 'Re-run Benchmark'}</span>
        </button>
      </div>

      {/* Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Tier 1: Hard Rules Only */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-slate-300 font-mono text-xs font-semibold">
              <Zap className="w-4 h-4 text-slate-400" />
              <span>Hard Rules Only</span>
            </div>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
              Ablation A
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <span className="text-[11px] font-mono text-slate-400 block">Catch Rate</span>
              <span className="text-2xl font-mono font-bold text-amber-400">
                {hardOnly ? `${(hardOnly.catch_rate * 100).toFixed(1)}%` : 'N/A'}
              </span>
              <span className="text-[11px] text-slate-500 ml-2 font-mono">
                ({hardOnly?.true_positives || 0}/15 caught)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-xs font-mono">
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">False Positives</span>
                <span className="text-emerald-400 font-semibold">
                  {hardOnly ? `${(hardOnly.false_positive_rate * 100).toFixed(1)}%` : '0.0%'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Avg Latency</span>
                <span className="text-slate-200 font-semibold">
                  {hardOnly ? `${hardOnly.avg_latency_ms.toFixed(1)}ms` : 'N/A'}
                </span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-4 leading-relaxed">
            Misses semantic violations (subtle sarcasm, unauthorized data leaks, malicious search intent).
          </p>
        </div>

        {/* Tier 2: Semantic Only */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-purple-300 font-mono text-xs font-semibold">
              <Cpu className="w-4 h-4 text-purple-400" />
              <span>Semantic Only</span>
            </div>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-400 border border-purple-800/30">
              Ablation B
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <span className="text-[11px] font-mono text-slate-400 block">Catch Rate</span>
              <span className="text-2xl font-mono font-bold text-indigo-400">
                {semanticOnly ? `${(semanticOnly.catch_rate * 100).toFixed(1)}%` : 'N/A'}
              </span>
              <span className="text-[11px] text-slate-500 ml-2 font-mono">
                ({semanticOnly?.true_positives || 0}/15 caught)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-xs font-mono">
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">False Positives</span>
                <span className="text-emerald-400 font-semibold">
                  {semanticOnly ? `${(semanticOnly.false_positive_rate * 100).toFixed(1)}%` : '0.0%'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Avg Latency</span>
                <span className="text-slate-200 font-semibold">
                  {semanticOnly ? `${semanticOnly.avg_latency_ms.toFixed(1)}ms` : 'N/A'}
                </span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-4 leading-relaxed">
            Catches semantic tone & intent, but cannot track cumulative session state like budget caps.
          </p>
        </div>

        {/* Tier 1 + Tier 2: Combined */}
        <div className="bg-emerald-950/20 border border-emerald-500/40 rounded-xl p-5 relative overflow-hidden shadow-lg shadow-emerald-950/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-emerald-300 font-mono text-xs font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Combined (AgentAudit)</span>
            </div>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-700/50">
              Optimal
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <span className="text-[11px] font-mono text-emerald-400/80 block">Catch Rate</span>
              <span className="text-2xl font-mono font-bold text-emerald-400">
                {combined ? `${(combined.catch_rate * 100).toFixed(1)}%` : 'N/A'}
              </span>
              <span className="text-[11px] text-emerald-500/70 ml-2 font-mono">
                ({combined?.true_positives || 0}/15 caught)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-emerald-900/50 text-xs font-mono">
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">False Positives</span>
                <span className="text-emerald-400 font-semibold">
                  {combined ? `${(combined.false_positive_rate * 100).toFixed(1)}%` : '0.0%'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Avg Latency</span>
                <span className="text-slate-200 font-semibold">
                  {combined ? `${combined.avg_latency_ms.toFixed(1)}ms` : 'N/A'}
                </span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-emerald-300/80 mt-4 leading-relaxed">
            Full defense-in-depth: deterministic short-circuiting saves compute while LLM catches subtle intent.
          </p>
        </div>
      </div>

      {/* Summary Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-mono font-semibold text-xs text-slate-200 uppercase tracking-wider">
            Comparative Benchmark Summary Table
          </h3>
          {data?.timestamp && (
            <span className="font-mono text-[11px] text-slate-500">
              Last run: {new Date(data.timestamp).toLocaleString()}
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-slate-950/80 text-slate-400 text-[11px] uppercase border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Evaluation Mode</th>
                <th className="py-3 px-4 text-right">Catch Rate</th>
                <th className="py-3 px-4 text-right">False Pos. Rate</th>
                <th className="py-3 px-4 text-right">Avg Latency</th>
                <th className="py-3 px-4 text-right">P95 Latency</th>
                <th className="py-3 px-4 text-center">True Positives</th>
                <th className="py-3 px-4 text-center">False Negatives</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {results.map((r) => {
                const isOptimal = r.mode === 'combined';
                return (
                  <tr
                    key={r.mode}
                    className={isOptimal ? 'bg-emerald-950/15 font-semibold' : 'hover:bg-slate-800/40'}
                  >
                    <td className="py-3 px-4 text-slate-200">
                      {r.mode.replace(/_/g, ' ').toUpperCase()}
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-400">
                      {(r.catch_rate * 100).toFixed(1)}%
                    </td>
                    <td className="py-3 px-4 text-right text-slate-300">
                      {(r.false_positive_rate * 100).toFixed(1)}%
                    </td>
                    <td className="py-3 px-4 text-right text-slate-300">
                      {r.avg_latency_ms.toFixed(1)}ms
                    </td>
                    <td className="py-3 px-4 text-right text-slate-300">
                      {r.p95_latency_ms.toFixed(1)}ms
                    </td>
                    <td className="py-3 px-4 text-center text-slate-200">
                      {r.true_positives} / 15
                    </td>
                    <td className="py-3 px-4 text-center text-rose-400">
                      {r.false_negatives}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
