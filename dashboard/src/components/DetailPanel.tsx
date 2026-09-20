import React, { useState } from 'react';
import type { AuditEntry } from '../lib/types';
import { StatusBadge } from './StatusBadge';
import { PipelineVisualizer } from './PipelineVisualizer';
import { ParameterInspector } from './ParameterInspector';
import {
  X,
  CheckCircle2,
  XCircle,
  Cpu,
  Zap,
  Copy,
  Check,
  FileText,
  User,
  Lock,
  ShieldCheck,
  Fingerprint,
  Info,
} from 'lucide-react';
import {
  getHumanActionSummary,
  getHumanReasoning,
  getHumanVerdict,
} from '../lib/humanizer';

interface DetailPanelProps {
  entry: AuditEntry | null;
  onClose: () => void;
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
  entry,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!entry) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-[#8b949e] font-sans text-xs border-l border-[#30363d] bg-[#161b22]">
        <Fingerprint className="w-10 h-10 text-[#484f58] mb-3" />
        <p className="max-w-xs leading-relaxed">
          Select an intercepted tool call from the live feed to inspect cryptographic proofs, rule check evaluations, and raw payloads.
        </p>
      </div>
    );
  }

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(entry, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hardChecks = (entry.check_results || []).filter((c) => c.tier === 'hard_rule');
  const semanticChecks = (entry.check_results || []).filter((c) => c.tier === 'semantic');
  const wasShortCircuited = hardChecks.some((c) => c.verdict === 'BLOCK') && semanticChecks.length === 0;

  const humanAction = getHumanActionSummary(entry);
  const humanReasoning = getHumanReasoning(entry);
  const humanVerdict = getHumanVerdict(entry.decision);

  return (
    <div className="h-full flex flex-col bg-[#161b22] border-l border-[#30363d] overflow-y-auto text-[#c9d1d9] select-none">
      {/* Header */}
      <div className="p-4 border-b border-[#30363d] flex items-center justify-between sticky top-0 bg-[#161b22] z-10">
        <div className="flex items-center gap-3 min-w-0">
          <StatusBadge verdict={entry.decision} size="md" />
          <div className="min-w-0">
            <h2 className="font-sans font-bold text-sm text-white truncate flex items-center gap-2">
              <span className="font-mono">{entry.tool_name}</span>
            </h2>
            <div className="flex items-center gap-2 text-[11px] font-mono text-[#8b949e]">
              <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
              <span>•</span>
              <span className="text-[#58a6ff] font-medium">
                {entry.total_latency_ms.toFixed(1)}ms latency
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopyJson}
            className="p-1.5 rounded-md bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9] transition-colors cursor-pointer"
            title="Copy Raw Audit Entry JSON"
          >
            {copied ? <Check className="w-4 h-4 text-[#3fb950]" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#8b949e] hover:text-[#f85149] transition-colors cursor-pointer"
            title="Close Panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4 font-sans">
        {/* Prominent Plain English "What Happened" Card */}
        <div
          className={`p-4 rounded-xl border space-y-3 ${
            entry.decision === 'BLOCK'
              ? 'bg-[#1f1517] border-[#da3633]/60'
              : entry.decision === 'FLAG_FOR_REVIEW'
              ? 'bg-[#221c10] border-[#9e6a03]/60'
              : 'bg-[#0f1f17] border-[#238636]/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-sans font-bold uppercase tracking-wider text-[#8b949e] flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-[#58a6ff]" />
              Human-Friendly Explanation
            </span>
            <span
              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${humanVerdict.bg} ${humanVerdict.color} ${humanVerdict.border}`}
            >
              {humanVerdict.badge}
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <span className="text-[#8b949e] text-[10px] uppercase font-semibold block tracking-wide">
                What the AI agent requested:
              </span>
              <p className="text-white text-sm font-semibold mt-0.5 leading-snug">
                {humanAction}
              </p>
            </div>

            <div>
              <span className="text-[#8b949e] text-[10px] uppercase font-semibold block tracking-wide">
                Safety verdict & explanation:
              </span>
              <p className="text-[#e6edf3] text-xs mt-0.5 leading-relaxed">
                {humanReasoning}
              </p>
            </div>

            <div className="pt-2 border-t border-white/10 flex items-center gap-2 text-[11px] text-[#8b949e]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#3fb950] shrink-0" />
              <span>Passwords, payment cards, and secret keys were automatically redacted.</span>
            </div>
          </div>
        </div>

        {/* Interactive Security Execution Pipeline */}
            <PipelineVisualizer entry={entry} />

            {/* Context metadata pill */}
            <div className="grid grid-cols-2 gap-2 text-xs bg-[#0d1117] p-3 rounded-lg border border-[#30363d]">
              <div>
                <span className="text-[#8b949e] text-[10px] uppercase block tracking-wider font-semibold">Agent Identifier</span>
                <span className="text-white font-medium flex items-center gap-1.5 mt-0.5 font-mono">
                  <User className="w-3.5 h-3.5 text-[#58a6ff]" />
                  {entry.agent_id}
                </span>
              </div>
              <div>
                <span className="text-[#8b949e] text-[10px] uppercase block tracking-wider font-semibold">Session Identifier</span>
                <span className="text-[#c9d1d9] truncate block mt-0.5 font-mono" title={entry.session_id}>
                  {entry.session_id}
                </span>
              </div>
            </div>

            {/* Cryptographic SHA-256 Hash Chain Proof */}
            {entry.entry_hash && (
              <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3.5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#e6edf3] font-semibold flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-[#58a6ff]" />
                    Cryptographic Ledger Integrity
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#0f2d1e] border border-[#238636] text-[#3fb950] font-medium flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    SHA-256 Validated
                  </span>
                </div>
                <div className="space-y-1.5 text-[11px] pt-1">
                  <div className="flex items-center justify-between text-[#8b949e] bg-[#161b22] px-2.5 py-1.5 rounded border border-[#21262d]">
                    <span className="text-[10px] uppercase font-semibold">Entry Hash:</span>
                    <span className="text-[#79c0ff] font-mono truncate max-w-[210px]" title={entry.entry_hash}>
                      {entry.entry_hash.slice(0, 14)}...{entry.entry_hash.slice(-8)}
                    </span>
                  </div>
                  {entry.prev_hash && (
                    <div className="flex items-center justify-between text-[#8b949e] bg-[#161b22] px-2.5 py-1.5 rounded border border-[#21262d]">
                      <span className="text-[10px] uppercase font-semibold">Prev Hash:</span>
                      <span className="text-[#8b949e] font-mono truncate max-w-[210px]" title={entry.prev_hash}>
                        {entry.prev_hash.slice(0, 14)}...{entry.prev_hash.slice(-8)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Section 1: Visual Parameter Inspector */}
            <ParameterInspector argumentsData={entry.arguments} toolName={entry.tool_name} />

            {/* Section 2: Two-Tier Policy Evaluation Breakdown */}
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-[#e6edf3] mb-2">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-[#3fb950]" />
                  <span>Tier 1: Deterministic Hard Rules</span>
                </div>
                <span className="text-[11px] text-[#8b949e] font-mono">
                  {hardChecks.length} rules checked
                </span>
              </div>

              <div className="space-y-2">
                {hardChecks.map((check, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border text-xs ${
                      check.verdict === 'BLOCK'
                        ? 'bg-[#2d1b1e] border-[#da3633]'
                        : check.verdict === 'FLAG_FOR_REVIEW'
                        ? 'bg-[#332511] border-[#9e6a03]'
                        : 'bg-[#0d1117] border-[#30363d]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-white">{check.rule_name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#8b949e] font-mono">{check.latency_ms.toFixed(2)}ms</span>
                        <StatusBadge verdict={check.verdict} size="sm" />
                      </div>
                    </div>
                    <p className="text-[#8b949e] text-[11px] leading-relaxed">{check.explanation}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Short-circuit notification if applicable */}
            {wasShortCircuited && (
              <div className="p-3 rounded-lg bg-[#0d1117] border border-[#30363d] text-xs">
                <div className="flex items-center gap-1.5 text-[#58a6ff] font-semibold mb-1">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Short-Circuit Bypass Activated</span>
                </div>
                <p className="text-[#8b949e] text-[11px] leading-relaxed">
                  Tier 1 hard rule blocked this action. To minimize overhead and conserve LLM API costs,
                  the Tier 2 semantic judge was safely bypassed.
                </p>
              </div>
            )}

            {/* Section 3: Semantic Evaluator (LLM Judge) */}
            {semanticChecks.length > 0 && (
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-[#e6edf3] mb-2">
                  <div className="flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-[#bc8cff]" />
                    <span>Tier 2: Semantic Evaluator (LLM-as-Judge)</span>
                  </div>
                  <span className="text-[11px] text-[#bc8cff] font-mono">
                    {semanticChecks.length} evaluated
                  </span>
                </div>

                <div className="space-y-2">
                  {semanticChecks.map((check, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border text-xs ${
                        check.verdict === 'BLOCK'
                          ? 'bg-[#2d1b1e] border-[#da3633]'
                          : check.verdict === 'FLAG_FOR_REVIEW'
                          ? 'bg-[#332511] border-[#9e6a03]'
                          : 'bg-[#0d1117] border-[#30363d]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-white">{check.rule_name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-[#8b949e] font-mono">{check.latency_ms.toFixed(1)}ms</span>
                          <StatusBadge verdict={check.verdict} size="sm" />
                        </div>
                      </div>

                      <div className="mb-2">
                        <div className="flex items-center justify-between text-[11px] text-[#8b949e] mb-1">
                          <span>Model Confidence</span>
                          <span className="text-white font-bold">{(check.confidence * 100).toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-[#161b22] rounded-full h-1.5 overflow-hidden border border-[#30363d]">
                          <div
                            className="bg-[#58a6ff] h-full rounded-full transition-all"
                            style={{ width: `${check.confidence * 100}%` }}
                          />
                        </div>
                      </div>

                      <div className="bg-[#161b22] p-2.5 rounded border border-[#21262d] mt-2">
                        <span className="text-[10px] uppercase text-[#8b949e] block mb-1 font-semibold tracking-wider">
                          Judge Reasoning
                        </span>
                        <p className="text-[#c9d1d9] text-xs leading-relaxed">{check.explanation}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section 4: Execution Outcome */}
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#e6edf3] mb-2">
                <FileText className="w-3.5 h-3.5 text-[#8b949e]" />
                <span>Downstream Tool Execution Result</span>
              </div>

              {entry.decision === 'BLOCK' ? (
                <div className="p-3 rounded-lg bg-[#2d1b1e] border border-[#da3633] text-xs text-[#f85149]">
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    <XCircle className="w-4 h-4 text-[#f85149]" />
                    <span>Execution Prevented at Boundary</span>
                  </div>
                  <p className="text-[#ffa198] text-xs mt-1 leading-relaxed">
                    {entry.error || `ActionBlockedError: Action '${entry.tool_name}' was halted by policy before execution.`}
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-[#0d1117] border border-[#30363d] font-mono text-xs overflow-x-auto">
                  <div className="flex items-center gap-1.5 text-[#3fb950] text-xs font-semibold mb-2">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Tool Executed Successfully</span>
                  </div>
                  <pre className="text-[#7ee787] whitespace-pre-wrap leading-relaxed">
                    {JSON.stringify(entry.execution_result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
      </div>
    </div>
  );
};
