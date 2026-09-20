import React from 'react';
import type { AuditEntry } from '../lib/types';
import { User, Clock } from 'lucide-react';

interface AgentSwimlanesProps {
  entries: AuditEntry[];
  selectedEntry: AuditEntry | null;
  onSelectEntry: (entry: AuditEntry) => void;
}

interface AgentGroup {
  agent_id: string;
  totalCalls: number;
  allowCount: number;
  blockCount: number;
  flagCount: number;
  cumulativeSpend: number;
  sessions: Record<string, AuditEntry[]>;
}

export const AgentSwimlanes: React.FC<AgentSwimlanesProps> = ({
  entries,
  selectedEntry,
  onSelectEntry,
}) => {
  // Group entries by agent_id and session_id
  const agentGroups: Record<string, AgentGroup> = {};

  entries.forEach((entry) => {
    const aid = entry.agent_id || 'anonymous_agent';
    const sid = entry.session_id || 'default_session';

    if (!agentGroups[aid]) {
      agentGroups[aid] = {
        agent_id: aid,
        totalCalls: 0,
        allowCount: 0,
        blockCount: 0,
        flagCount: 0,
        cumulativeSpend: 0,
        sessions: {},
      };
    }

    const group = agentGroups[aid];
    group.totalCalls++;
    if (entry.decision === 'ALLOW') group.allowCount++;
    if (entry.decision === 'BLOCK') group.blockCount++;
    if (entry.decision === 'FLAG_FOR_REVIEW') group.flagCount++;

    if (entry.tool_name === 'spend_money' && typeof entry.arguments?.amount === 'number') {
      group.cumulativeSpend += entry.arguments.amount;
    }

    if (!group.sessions[sid]) {
      group.sessions[sid] = [];
    }
    group.sessions[sid].push(entry);
  });

  const agentsList = Object.values(agentGroups);

  if (agentsList.length === 0) {
    return (
      <div className="py-24 text-center text-slate-500 font-mono text-xs">
        No agent telemetry recorded yet.
      </div>
    );
  }

  return (
    <div className="p-5 space-y-6 overflow-y-auto h-full">
      {agentsList.map((agent) => {
        const containmentRate =
          agent.totalCalls > 0
            ? ((agent.blockCount / agent.totalCalls) * 100).toFixed(0)
            : '0';

        return (
          <div
            key={agent.agent_id}
            className="glass-card rounded-2xl border-white/[0.08] p-5 space-y-4 hover:border-white/15 transition-all shadow-lg"
          >
            {/* Agent Header & Blast Radius Telemetry */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                  <User className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-white">{agent.agent_id}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-white/10">
                      {Object.keys(agent.sessions).length} Sessions
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Autonomous Identity Lifecycle Trace
                  </span>
                </div>
              </div>

              {/* Blast Radius Micro-Metrics */}
              <div className="flex items-center gap-3 flex-wrap">
                {/* Containment Rate */}
                <div className="bg-black/40 px-3 py-1.5 rounded-xl border border-white/[0.06] text-right font-mono text-xs">
                  <span className="text-[10px] text-slate-400 uppercase block tracking-wider">Containment</span>
                  <span
                    className={`font-bold ${
                      parseInt(containmentRate) > 0 ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {containmentRate}% Blocked
                  </span>
                </div>

                {/* Cumulative Financial Requests */}
                {agent.cumulativeSpend > 0 && (
                  <div className="bg-black/40 px-3 py-1.5 rounded-xl border border-white/[0.06] text-right font-mono text-xs">
                    <span className="text-[10px] text-slate-400 uppercase block tracking-wider">Spend Requested</span>
                    <span className="font-bold text-amber-300">
                      ${agent.cumulativeSpend.toFixed(2)}
                    </span>
                  </div>
                )}

                {/* Total Actions */}
                <div className="bg-black/40 px-3 py-1.5 rounded-xl border border-white/[0.06] text-right font-mono text-xs">
                  <span className="text-[10px] text-slate-400 uppercase block tracking-wider">Total Calls</span>
                  <span className="font-bold text-white">{agent.totalCalls}</span>
                </div>
              </div>
            </div>

            {/* Sessions Swimlanes */}
            <div className="space-y-3">
              {Object.entries(agent.sessions).map(([sessionId, sessionEntries]) => (
                <div
                  key={sessionId}
                  className="bg-black/30 rounded-xl p-3 border border-white/[0.04] space-y-2"
                >
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span className="flex items-center gap-1.5 truncate max-w-sm">
                      <Clock className="w-3 h-3 text-slate-500" />
                      Session: <span className="text-slate-300 truncate">{sessionId}</span>
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {sessionEntries.length} chronological actions
                    </span>
                  </div>

                  {/* Horizontal Timeline Bubbles */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
                    {sessionEntries.map((entry, idx) => {
                      const isSelected = selectedEntry?.id === entry.id;
                      const isBlock = entry.decision === 'BLOCK';
                      const isFlag = entry.decision === 'FLAG_FOR_REVIEW';

                      return (
                        <button
                          key={entry.id || idx}
                          onClick={() => onSelectEntry(entry)}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-mono text-[11px] shrink-0 border transition-all cursor-pointer ${
                            isSelected
                              ? 'ring-2 ring-emerald-400 bg-slate-800 text-white shadow-lg'
                              : isBlock
                              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20'
                              : isFlag
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                          }`}
                          title={`Click to inspect: ${entry.tool_name} (${entry.decision})`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              isBlock
                                ? 'bg-rose-400'
                                : isFlag
                                ? 'bg-amber-400'
                                : 'bg-emerald-400'
                            }`}
                          />
                          <span className="font-semibold">{entry.tool_name}</span>
                          <span className="text-[9px] opacity-70">
                            {entry.total_latency_ms.toFixed(0)}ms
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
