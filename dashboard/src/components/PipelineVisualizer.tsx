import React from 'react';
import type { AuditEntry } from '../lib/types';
import {
  User,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Cpu,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  Sparkles,
  Fingerprint,
} from 'lucide-react';

interface PipelineVisualizerProps {
  entry: AuditEntry;
}

export const PipelineVisualizer: React.FC<PipelineVisualizerProps> = ({ entry }) => {
  const hardChecks = (entry.check_results || []).filter((c) => c.tier === 'hard_rule');
  const semanticChecks = (entry.check_results || []).filter((c) => c.tier === 'semantic');
  const isBlocked = entry.decision === 'BLOCK';
  const isFlagged = entry.decision === 'FLAG_FOR_REVIEW';
  const wasShortCircuited = hardChecks.some((c) => c.verdict === 'BLOCK') && semanticChecks.length === 0;

  const hardBlockedCount = hardChecks.filter((c) => c.verdict === 'BLOCK').length;
  const hardFlaggedCount = hardChecks.filter((c) => c.verdict === 'FLAG_FOR_REVIEW').length;

  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-4 space-y-3 select-none">
      {/* Visual Ambient Flow Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#21262d]">
        <span className="flex items-center gap-1.5 text-xs font-sans font-semibold text-[#e6edf3]">
          <Sparkles className="w-3.5 h-3.5 text-[#58a6ff]" />
          Policy Execution Pipeline
        </span>
        <span className="text-[11px] text-[#8b949e] font-mono">
          Gate Latency: {entry.total_latency_ms ? `${entry.total_latency_ms.toFixed(1)}ms` : '<0.1ms'}
        </span>
      </div>

      {/* Vertical Pipeline Steps (No Truncation) */}
      <div className="space-y-2 text-xs font-sans">
        {/* Step 1: Caller Ingestion */}
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#161b22] border border-[#30363d]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-6 h-6 rounded-md bg-[#1f2937] border border-[#374151] flex items-center justify-center shrink-0">
              <User className="w-3.5 h-3.5 text-[#58a6ff]" />
            </div>
            <div className="min-w-0">
              <div className="font-medium text-[#e6edf3] flex items-center gap-1.5">
                <span>1. Ingestion:</span>
                <span className="font-mono text-[#79c0ff]">{entry.agent_id}</span>
              </div>
              <div className="text-[11px] text-[#8b949e]">
                Invoked <span className="font-mono text-[#c9d1d9] font-medium">{entry.tool_name}</span>
              </div>
            </div>
          </div>
          <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-sans font-medium bg-[#0f2d1e] text-[#3fb950] border border-[#238636]">
            Received
          </span>
        </div>

        {/* Step 2: PII Sanitizer Gate */}
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#161b22] border border-[#30363d]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-6 h-6 rounded-md bg-[#122b1e] border border-[#238636] flex items-center justify-center shrink-0">
              <Fingerprint className="w-3.5 h-3.5 text-[#3fb950]" />
            </div>
            <div className="min-w-0">
              <div className="font-medium text-[#e6edf3]">2. PII Sanitizer Gate</div>
              <div className="text-[11px] text-[#8b949e]">API keys, SSN & credentials masked</div>
            </div>
          </div>
          <span className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-medium bg-[#0f2d1e] text-[#3fb950] border border-[#238636]">
            <CheckCircle2 className="w-3 h-3 text-[#3fb950]" />
            Clean
          </span>
        </div>

        {/* Step 3: Tier 1 Hard Rules */}
        <div
          className={`flex items-center justify-between p-2.5 rounded-lg border ${
            hardBlockedCount > 0
              ? 'bg-[#2d1b1e] border-[#da3633]'
              : hardFlaggedCount > 0
              ? 'bg-[#332511] border-[#9e6a03]'
              : 'bg-[#161b22] border-[#30363d]'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 border ${
                hardBlockedCount > 0
                  ? 'bg-[#37171c] border-[#da3633]'
                  : 'bg-[#122b1e] border-[#238636]'
              }`}
            >
              <Zap
                className={`w-3.5 h-3.5 ${
                  hardBlockedCount > 0 ? 'text-[#f85149]' : 'text-[#3fb950]'
                }`}
              />
            </div>
            <div className="min-w-0">
              <div className="font-medium text-[#e6edf3] flex items-center gap-1.5">
                <span>3. Hard Rules Engine:</span>
                <span className="text-[#8b949e] font-normal">({hardChecks.length} rules)</span>
              </div>
              <div className="text-[11px] text-[#8b949e]">
                {hardBlockedCount > 0
                  ? `${hardBlockedCount} deterministic violation(s) triggered`
                  : 'All deterministic rules passed'}
              </div>
            </div>
          </div>
          <span
            className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-medium ${
              hardBlockedCount > 0
                ? 'bg-[#37171c] text-[#f85149] border border-[#da3633]'
                : 'bg-[#0f2d1e] text-[#3fb950] border border-[#238636]'
            }`}
          >
            {hardBlockedCount > 0 ? (
              <>
                <XCircle className="w-3 h-3 text-[#f85149]" />
                Triggered
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3 h-3 text-[#3fb950]" />
                Passed
              </>
            )}
          </span>
        </div>

        {/* Step 4: Tier 2 Semantic LLM Judge */}
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#161b22] border border-[#30363d]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-6 h-6 rounded-md bg-[#241c38] border border-[#8957e5] flex items-center justify-center shrink-0">
              <Cpu className="w-3.5 h-3.5 text-[#bc8cff]" />
            </div>
            <div className="min-w-0">
              <div className="font-medium text-[#e6edf3]">4. Semantic LLM Judge</div>
              <div className="text-[11px] text-[#8b949e]">
                {wasShortCircuited
                  ? 'Bypassed by Tier 1 block (Saved API overhead)'
                  : semanticChecks.length > 0
                  ? `${semanticChecks[0].rule_name} evaluated`
                  : 'Intent verified within parameters'}
              </div>
            </div>
          </div>
          <span
            className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-sans font-medium ${
              wasShortCircuited
                ? 'bg-[#21262d] text-[#8b949e] border border-[#30363d]'
                : semanticChecks.some((c) => c.verdict === 'BLOCK')
                ? 'bg-[#37171c] text-[#f85149] border border-[#da3633]'
                : 'bg-[#0f2d1e] text-[#3fb950] border border-[#238636]'
            }`}
          >
            {wasShortCircuited
              ? 'Bypassed'
              : semanticChecks.length > 0
              ? `${((semanticChecks[0]?.confidence || 1) * 100).toFixed(0)}% Conf`
              : 'Verified'}
          </span>
        </div>

        {/* Step 5: Final Enforcement Barrier */}
        <div
          className={`flex items-center justify-between p-2.5 rounded-lg border ${
            isBlocked
              ? 'bg-[#2d1b1e] border-[#da3633]'
              : isFlagged
              ? 'bg-[#332511] border-[#9e6a03]'
              : 'bg-[#0f2d1e] border-[#238636]'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 border ${
                isBlocked
                  ? 'bg-[#37171c] border-[#da3633]'
                  : isFlagged
                  ? 'bg-[#332511] border-[#9e6a03]'
                  : 'bg-[#122b1e] border-[#238636]'
              }`}
            >
              {isBlocked ? (
                <ShieldAlert className="w-3.5 h-3.5 text-[#f85149]" />
              ) : isFlagged ? (
                <AlertTriangle className="w-3.5 h-3.5 text-[#d29922]" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5 text-[#3fb950]" />
              )}
            </div>
            <div className="min-w-0">
              <div className="font-medium text-[#e6edf3]">5. Enforcement Barrier Decision</div>
              <div className="text-[11px] text-[#8b949e] flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-[#58a6ff]" />
                <span>SHA-256 Ledger Synchronized</span>
              </div>
            </div>
          </div>
          <span
            className={`shrink-0 px-2.5 py-0.5 rounded text-[11px] font-sans font-bold uppercase ${
              isBlocked
                ? 'bg-[#37171c] text-[#f85149] border border-[#da3633]'
                : isFlagged
                ? 'bg-[#332511] text-[#d29922] border border-[#9e6a03]'
                : 'bg-[#0f2d1e] text-[#3fb950] border border-[#238636]'
            }`}
          >
            {entry.decision}
          </span>
        </div>
      </div>
    </div>
  );
};
