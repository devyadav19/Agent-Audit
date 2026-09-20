import React from 'react';
import type { AuditEntry } from '../lib/types';
import { StatusBadge } from './StatusBadge';
import { Mail, DollarSign, Trash2, Globe, MessageSquare, ChevronRight, Lock } from 'lucide-react';

interface ActionRowProps {
  entry: AuditEntry;
  isSelected: boolean;
  onSelect: (entry: AuditEntry) => void;
  isNew?: boolean;
}

export const ActionRow: React.FC<ActionRowProps> = ({
  entry,
  isSelected,
  onSelect,
  isNew = false,
}) => {
  const getToolDetails = (tool: string) => {
    switch (tool) {
      case 'send_email':
        return {
          icon: <Mail className="w-3.5 h-3.5 text-[#58a6ff] shrink-0" />,
          bg: 'bg-[#161b22] border-[#30363d] text-[#58a6ff]',
        };
      case 'spend_money':
        return {
          icon: <DollarSign className="w-3.5 h-3.5 text-[#3fb950] shrink-0" />,
          bg: 'bg-[#161b22] border-[#30363d] text-[#3fb950]',
        };
      case 'delete_file':
        return {
          icon: <Trash2 className="w-3.5 h-3.5 text-[#f85149] shrink-0" />,
          bg: 'bg-[#161b22] border-[#30363d] text-[#f85149]',
        };
      case 'web_search':
        return {
          icon: <Globe className="w-3.5 h-3.5 text-[#79c0ff] shrink-0" />,
          bg: 'bg-[#161b22] border-[#30363d] text-[#79c0ff]',
        };
      case 'send_slack_message':
        return {
          icon: <MessageSquare className="w-3.5 h-3.5 text-[#bc8cff] shrink-0" />,
          bg: 'bg-[#161b22] border-[#30363d] text-[#bc8cff]',
        };
      default:
        return {
          icon: <Mail className="w-3.5 h-3.5 text-[#8b949e] shrink-0" />,
          bg: 'bg-[#161b22] border-[#30363d] text-[#c9d1d9]',
        };
    }
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return iso;
    }
  };

  const triggeredRules = (entry.check_results || [])
    .filter((c) => c.verdict !== 'ALLOW')
    .map((c) => c.rule_name);

  const toolMeta = getToolDetails(entry.tool_name);

  return (
    <div
      onClick={() => onSelect(entry)}
      className={`group flex items-center px-4 py-3 border-b border-[#21262d] cursor-pointer transition-colors select-none text-xs ${
        isSelected
          ? 'bg-[#1c2128] border-l-2 border-l-[#58a6ff]'
          : 'bg-[#0d1117] hover:bg-[#161b22] border-l-2 border-l-transparent'
      } ${isNew ? 'bg-[#1f293d]/40' : ''}`}
    >
      {/* Column 1: Timestamp (fixed width 84px) */}
      <div className="w-20 shrink-0 font-mono text-[11px] text-[#8b949e]">
        {formatTime(entry.timestamp)}
      </div>

      {/* Column 2: Verdict Badge (fixed width 88px) */}
      <div className="w-20 shrink-0 flex items-center">
        <StatusBadge verdict={entry.decision} size="sm" />
      </div>

      {/* Column 3: Tool Badge (fixed width 180px) */}
      <div className="w-48 shrink-0 flex items-center pr-3">
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-sans text-xs font-medium w-full truncate ${toolMeta.bg}`}
        >
          {toolMeta.icon}
          <span className="truncate font-mono">{entry.tool_name}</span>
        </div>
      </div>

      {/* Column 4: Rule Triggered or Arguments (flexible flex-1) */}
      <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden pr-3">
        {triggeredRules.length > 0 ? (
          <div className="flex items-center gap-1.5 overflow-hidden">
            <span className="text-[11px] font-sans text-[#8b949e] shrink-0 font-medium">Rule:</span>
            <span className="font-sans text-[11px] font-medium text-[#e3b341] bg-[#332511] px-2 py-0.5 rounded border border-[#9e6a03] truncate">
              {triggeredRules.join(', ')}
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-[#8b949e] truncate font-mono">
            {JSON.stringify(entry.arguments).slice(0, 80)}
          </span>
        )}
      </div>

      {/* Column 5: Latency & Lock (fixed width 80px) */}
      <div className="w-20 shrink-0 flex items-center justify-end gap-2 font-mono text-[11px] text-[#8b949e]">
        {entry.entry_hash && (
          <span title="SHA-256 Ledger Verified">
            <Lock className="w-3 h-3 text-[#58a6ff]" />
          </span>
        )}
        <span>{entry.total_latency_ms ? `${entry.total_latency_ms.toFixed(1)}ms` : '<0.1ms'}</span>
      </div>

      {/* Column 6: Action arrow (fixed width 20px) */}
      <div className="w-5 shrink-0 text-right">
        <ChevronRight
          className={`w-4 h-4 text-[#484f58] group-hover:text-[#c9d1d9] transition-colors ${
            isSelected ? 'text-[#58a6ff]' : ''
          }`}
        />
      </div>
    </div>
  );
};
