import React, { useState } from 'react';
import type { AuditEntry } from '../lib/types';
import { StatusBadge } from './StatusBadge';
import {
  ArrowUpDown,
  Lock,
  Zap,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';

interface IncidentTableProps {
  entries: AuditEntry[];
  selectedEntry: AuditEntry | null;
  onSelectEntry: (entry: AuditEntry) => void;
}

type SortField = 'timestamp' | 'total_latency_ms' | 'decision' | 'tool_name';

export const IncidentTable: React.FC<IncidentTableProps> = ({
  entries,
  selectedEntry,
  onSelectEntry,
}) => {
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const sortedEntries = [...entries].sort((a, b) => {
    let comparison = 0;
    if (sortField === 'timestamp') {
      comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    } else if (sortField === 'total_latency_ms') {
      comparison = (a.total_latency_ms || 0) - (b.total_latency_ms || 0);
    } else if (sortField === 'decision') {
      comparison = a.decision.localeCompare(b.decision);
    } else if (sortField === 'tool_name') {
      comparison = a.tool_name.localeCompare(b.tool_name);
    }
    return sortAsc ? comparison : -comparison;
  });

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
    } catch {
      return iso;
    }
  };

  return (
    <div className="w-full overflow-x-auto h-full">
      <table className="w-full text-left border-collapse font-mono text-xs">
        <thead className="bg-[#050914] sticky top-0 z-20 border-b border-white/[0.08] text-slate-400 text-[10px] uppercase tracking-wider">
          <tr>
            <th
              onClick={() => handleSort('decision')}
              className="py-3 px-4 cursor-pointer hover:text-white transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <span>Verdict</span>
                <ArrowUpDown className="w-3 h-3" />
              </div>
            </th>
            <th
              onClick={() => handleSort('timestamp')}
              className="py-3 px-3 cursor-pointer hover:text-white transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <span>Timestamp</span>
                <ArrowUpDown className="w-3 h-3" />
              </div>
            </th>
            <th className="py-3 px-3">Agent</th>
            <th
              onClick={() => handleSort('tool_name')}
              className="py-3 px-3 cursor-pointer hover:text-white transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <span>Target Tool</span>
                <ArrowUpDown className="w-3 h-3" />
              </div>
            </th>
            <th className="py-3 px-3">Security Trigger / Rule</th>
            <th className="py-3 px-3">Payload Summary</th>
            <th
              onClick={() => handleSort('total_latency_ms')}
              className="py-3 px-3 cursor-pointer hover:text-white transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <span>Latency</span>
                <ArrowUpDown className="w-3 h-3" />
              </div>
            </th>
            <th className="py-3 px-3 text-center">SHA-256</th>
            <th className="py-3 px-3 text-right">Inspect</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {sortedEntries.map((entry) => {
            const isSelected = selectedEntry?.id === entry.id;
            const triggeredRules = (entry.check_results || [])
              .filter((c) => c.verdict !== 'ALLOW')
              .map((c) => c.rule_name);

            return (
              <tr
                key={entry.id}
                onClick={() => onSelectEntry(entry)}
                className={`transition-colors cursor-pointer select-none ${
                  isSelected
                    ? 'bg-slate-800/80 border-l-2 border-l-emerald-400'
                    : 'hover:bg-white/[0.03]'
                } ${
                  entry.decision === 'BLOCK'
                    ? 'hover:bg-rose-950/20'
                    : entry.decision === 'FLAG_FOR_REVIEW'
                    ? 'hover:bg-amber-950/20'
                    : ''
                }`}
              >
                {/* Verdict */}
                <td className="py-2.5 px-4 whitespace-nowrap">
                  <StatusBadge verdict={entry.decision} size="sm" />
                </td>

                {/* Timestamp */}
                <td className="py-2.5 px-3 whitespace-nowrap text-slate-400 text-[11px]">
                  {formatTime(entry.timestamp)}
                </td>

                {/* Agent */}
                <td className="py-2.5 px-3 whitespace-nowrap text-white font-medium">
                  {entry.agent_id}
                </td>

                {/* Tool */}
                <td className="py-2.5 px-3 whitespace-nowrap">
                  <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-semibold">
                    {entry.tool_name}
                  </span>
                </td>

                {/* Triggered Rule */}
                <td className="py-2.5 px-3 max-w-[200px] truncate">
                  {triggeredRules.length > 0 ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 truncate">
                      <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{triggeredRules.join(', ')}</span>
                    </span>
                  ) : (
                    <span className="text-slate-500 text-[11px]">Clean (No Rule Fired)</span>
                  )}
                </td>

                {/* Payload */}
                <td className="py-2.5 px-3 max-w-[240px] truncate text-slate-400 text-[11px]">
                  {JSON.stringify(entry.arguments)}
                </td>

                {/* Latency */}
                <td className="py-2.5 px-3 whitespace-nowrap text-slate-300 text-[11px]">
                  <span className="flex items-center gap-1">
                    <Zap className="w-3 h-3 text-slate-500" />
                    {entry.total_latency_ms ? `${entry.total_latency_ms.toFixed(1)}ms` : '<0.1ms'}
                  </span>
                </td>

                {/* SHA-256 Hash */}
                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                  {entry.entry_hash ? (
                    <span
                      title={`SHA-256: ${entry.entry_hash}`}
                      className="inline-flex items-center justify-center p-1 rounded-md bg-indigo-500/10 border border-indigo-500/30 text-indigo-400"
                    >
                      <Lock className="w-3 h-3" />
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>

                {/* Inspect Arrow */}
                <td className="py-2.5 px-3 text-right whitespace-nowrap">
                  <span className="text-slate-500 hover:text-emerald-400">
                    <ChevronRight className="w-4 h-4 inline-block" />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
