import React, { useState } from 'react';
import type { Stats } from '../lib/types';
import {
  ShieldCheck,
  Lock,
  Download,
  RefreshCw,
  Trash2,
  ChevronDown,
  Play,
  Flame,
} from 'lucide-react';

interface StatsBarProps {
  stats: Stats;
  isConnected: boolean;
  onRunScenarios: (category?: string) => void;
  isRunningScenarios: boolean;
  onClear: () => void;
  onVerifyIntegrity: () => void;
  onExport: (format: 'json' | 'csv') => void;
  onReloadPolicies: () => Promise<void>;
  isReloadingPolicies: boolean;
}

export const StatsBar: React.FC<StatsBarProps> = ({
  stats,
  isConnected,
  onRunScenarios,
  isRunningScenarios,
  onClear,
  onVerifyIntegrity,
  onExport,
  onReloadPolicies,
  isReloadingPolicies,
}) => {
  const [showExportMenu, setShowExportMenu] = useState(false);

  const allowCount = stats.by_verdict?.ALLOW || 0;
  const blockCount = stats.by_verdict?.BLOCK || 0;
  const flagCount = stats.by_verdict?.FLAG_FOR_REVIEW || 0;
  const total = stats.total || 0;

  const allowPct = total > 0 ? ((allowCount / total) * 100).toFixed(0) : '0';
  const blockPct = total > 0 ? ((blockCount / total) * 100).toFixed(0) : '0';
  const flagPct = total > 0 ? ((flagCount / total) * 100).toFixed(0) : '0';

  return (
    <header className="bg-[#161b22] border-b border-[#30363d] px-5 py-2.5 sticky top-0 z-30 select-none">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Brand & Telemetry Status */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-[#1f2937] border border-[#374151] flex items-center justify-center text-[#58a6ff]">
            <ShieldCheck className="w-4 h-4 text-[#58a6ff]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-sans font-bold text-sm text-white tracking-tight">AgentAudit</span>
              <span className="text-[10px] uppercase font-sans font-semibold px-1.5 py-0.5 rounded bg-[#21262d] border border-[#30363d] text-[#8b949e]">
                Enterprise
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="flex items-center gap-1 text-[11px] font-sans text-[#8b949e]">
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#3fb950]' : 'bg-[#f85149]'}`} />
                {isConnected ? 'Active' : 'Offline'}
              </span>
              <span className="text-[#484f58]">•</span>
              <button
                onClick={onVerifyIntegrity}
                className="text-[11px] font-sans text-[#58a6ff] hover:underline flex items-center gap-1 cursor-pointer"
                title="Verify SHA-256 Ledger Integrity"
              >
                <Lock className="w-3 h-3" />
                <span>SHA-256 Validated</span>
              </button>
            </div>
          </div>
        </div>

        {/* Center: Clean Metric Chips */}
        <div className="hidden md:flex items-center gap-2">
          {/* Total */}
          <div className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 min-w-[85px] text-center">
            <span className="text-[10px] text-[#8b949e] font-sans block uppercase font-medium">
              Intercepted
            </span>
            <span className="font-mono font-bold text-sm text-white">{total}</span>
          </div>

          {/* Allowed */}
          <div className="bg-[#0d1117] border border-[#238636]/40 rounded-lg px-3 py-1.5 min-w-[85px] text-center">
            <span className="text-[10px] text-[#3fb950] font-sans block uppercase font-medium">
              Allowed
            </span>
            <span className="font-mono font-bold text-sm text-[#3fb950]">
              {allowCount} <span className="text-[10px] text-[#3fb950]/70 font-normal">({allowPct}%)</span>
            </span>
          </div>

          {/* Blocked */}
          <div className="bg-[#0d1117] border border-[#da3633]/40 rounded-lg px-3 py-1.5 min-w-[85px] text-center">
            <span className="text-[10px] text-[#f85149] font-sans block uppercase font-medium">
              Blocked
            </span>
            <span className="font-mono font-bold text-sm text-[#f85149]">
              {blockCount} <span className="text-[10px] text-[#f85149]/70 font-normal">({blockPct}%)</span>
            </span>
          </div>

          {/* Flagged */}
          <div className="bg-[#0d1117] border border-[#9e6a03]/40 rounded-lg px-3 py-1.5 min-w-[85px] text-center">
            <span className="text-[10px] text-[#d29922] font-sans block uppercase font-medium">
              Flagged
            </span>
            <span className="font-mono font-bold text-sm text-[#d29922]">
              {flagCount} <span className="text-[10px] text-[#d29922]/70 font-normal">({flagPct}%)</span>
            </span>
          </div>

          {/* Overhead */}
          <div className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 min-w-[85px] text-center">
            <span className="text-[10px] text-[#8b949e] font-sans block uppercase font-medium">
              Latency
            </span>
            <span className="font-mono font-bold text-sm text-[#79c0ff]">
              {stats.avg_latency_ms ? `${stats.avg_latency_ms.toFixed(1)}ms` : '0.0ms'}
            </span>
          </div>
        </div>

        {/* Right: Actions Group (STRICT SINGLE LINE NO-WRAP) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#c9d1d9] font-sans text-xs font-medium transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#8b949e]" />
              <span>Export</span>
              <ChevronDown className="w-3 h-3 text-[#8b949e]" />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-1 w-44 bg-[#161b22] border border-[#30363d] rounded-md shadow-xl py-1 z-40 text-xs font-sans">
                <button
                  onClick={() => {
                    onExport('json');
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-[#c9d1d9] hover:bg-[#1f242c] hover:text-white transition-colors cursor-pointer"
                >
                  JSON (SOC 2 Bundle)
                </button>
                <button
                  onClick={() => {
                    onExport('csv');
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-[#c9d1d9] hover:bg-[#1f242c] hover:text-white transition-colors cursor-pointer"
                >
                  CSV (Audit Report)
                </button>
              </div>
            )}
          </div>

          {/* Hot-reload policies */}
          <button
            onClick={onReloadPolicies}
            disabled={isReloadingPolicies}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#c9d1d9] font-sans text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
            title="Reload policies from disk"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#8b949e] ${isReloadingPolicies ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Reload</span>
          </button>

          {/* Run 30 Scenarios */}
          <button
            onClick={() => onRunScenarios()}
            disabled={isRunningScenarios}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white font-sans text-xs font-semibold transition-colors shadow-sm cursor-pointer"
          >
            {isRunningScenarios ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Running...</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-current" />
                <span>Run 30 Tests</span>
              </>
            )}
          </button>

          {/* Adversarial Only */}
          <button
            onClick={() => onRunScenarios('adversarial')}
            disabled={isRunningScenarios}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#21262d] hover:bg-[#2d1b1e] border border-[#30363d] hover:border-[#da3633] text-[#f85149] font-sans text-xs font-medium transition-colors cursor-pointer"
            title="Run 15 adversarial attack tests"
          >
            <Flame className="w-3 h-3 text-[#f85149]" />
            <span className="hidden lg:inline">Adversarial</span>
          </button>

          {/* Clear Trail */}
          <button
            onClick={onClear}
            disabled={isRunningScenarios || total === 0}
            className="p-1.5 rounded-md bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#8b949e] hover:text-[#f85149] transition-colors cursor-pointer disabled:opacity-30"
            title="Clear audit log"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
