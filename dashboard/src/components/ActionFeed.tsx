import React from 'react';
import type { AuditEntry } from '../lib/types';
import { ActionRow } from './ActionRow';
import { IncidentTable } from './IncidentTable';
import { AgentSwimlanes } from './AgentSwimlanes';
import { EmptyState } from './EmptyState';

export type FeedViewMode = 'stream' | 'table' | 'swimlanes';

interface ActionFeedProps {
  entries: AuditEntry[];
  selectedEntry: AuditEntry | null;
  onSelectEntry: (entry: AuditEntry) => void;
  onRunScenarios: () => void;
  isRunning: boolean;
  searchQuery: string;
  viewMode?: FeedViewMode;
}

export const ActionFeed: React.FC<ActionFeedProps> = ({
  entries,
  selectedEntry,
  onSelectEntry,
  onRunScenarios,
  isRunning,
  searchQuery,
  viewMode = 'stream',
}) => {
  if (entries.length === 0) {
    if (searchQuery) {
      return (
        <div className="py-20 text-center text-slate-400 font-mono text-xs">
          No intercepted actions matched search query "{searchQuery}"
        </div>
      );
    }
    return <EmptyState onRunScenarios={onRunScenarios} isRunning={isRunning} />;
  }

  if (viewMode === 'table') {
    return (
      <IncidentTable
        entries={entries}
        selectedEntry={selectedEntry}
        onSelectEntry={onSelectEntry}
      />
    );
  }

  if (viewMode === 'swimlanes') {
    return (
      <AgentSwimlanes
        entries={entries}
        selectedEntry={selectedEntry}
        onSelectEntry={onSelectEntry}
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0d1117]">
      {/* Pinned Column Headers for Strict Vertical Alignment */}
      <div className="flex items-center px-4 py-2 bg-[#161b22] border-b border-[#30363d] text-[11px] font-sans font-semibold text-[#8b949e] uppercase tracking-wider sticky top-0 z-10 select-none">
        <div className="w-20 shrink-0">Time</div>
        <div className="w-20 shrink-0">Verdict</div>
        <div className="w-48 shrink-0 pr-3">Tool Invoked</div>
        <div className="flex-1 min-w-0 pr-3">Policy Trigger / Payload</div>
        <div className="w-20 shrink-0 text-right">Latency</div>
        <div className="w-5 shrink-0" />
      </div>

      <div className="divide-y divide-[#21262d] overflow-y-auto flex-1">
        {entries.map((entry, idx) => (
          <ActionRow
            key={entry.id || idx}
            entry={entry}
            isSelected={selectedEntry?.id === entry.id}
            onSelect={onSelectEntry}
            isNew={idx === 0}
          />
        ))}
      </div>
    </div>
  );
};
