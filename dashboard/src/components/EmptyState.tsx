import React from 'react';
import { Shield, Play, Terminal, CheckCircle2 } from 'lucide-react';

interface EmptyStateProps {
  onRunScenarios: () => void;
  isRunning: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onRunScenarios, isRunning }) => {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="relative mb-6">
        <div className="w-16 h-16 rounded-2xl bg-emerald-950/40 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
          <Shield className="w-8 h-8" />
        </div>
        <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
        </span>
      </div>

      <h3 className="text-base font-mono font-semibold text-slate-100 mb-2">
        Awaiting Intercepted Agent Activity
      </h3>
      <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
        AgentAudit is active and monitoring tool invocations. When an agent calls tools like{' '}
        <code className="text-slate-300">send_email</code>, <code className="text-slate-300">spend_money</code>, or{' '}
        <code className="text-slate-300">delete_file</code>, they are intercepted and verified against policies before execution.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button
          onClick={onRunScenarios}
          disabled={isRunning}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-semibold shadow-lg shadow-emerald-950/50 transition-all cursor-pointer disabled:opacity-50"
        >
          {isRunning ? (
            <>
              <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              <span>Executing Scenarios...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Run 30 Test Scenarios</span>
            </>
          )}
        </button>
      </div>

      <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl text-left">
        <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
          <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-mono font-semibold mb-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Tier 1: Hard Rules</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Sub-millisecond deterministic checks for regex, spend caps, allowlists, and file paths.
          </p>
        </div>

        <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
          <div className="flex items-center gap-1.5 text-indigo-400 text-xs font-mono font-semibold mb-1">
            <Terminal className="w-3.5 h-3.5" />
            <span>Tier 2: Semantic Judge</span>
          </div>
          <p className="text-[11px] text-slate-400">
            LLM-as-judge checks for tone, policy intent, data leakage, and harmful requests.
          </p>
        </div>

        <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
          <div className="flex items-center gap-1.5 text-amber-400 text-xs font-mono font-semibold mb-1">
            <Shield className="w-3.5 h-3.5" />
            <span>Audit Trail</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Every decision, latency breakdown, and reasoning trail stored immutably.
          </p>
        </div>
      </div>
    </div>
  );
};
