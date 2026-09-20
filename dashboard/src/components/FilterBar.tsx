import React from 'react';
import {
  Search,
  Layers,
  Shield,
  BarChart3,
  FlaskConical,
  TrendingUp,
  LayoutList,
  Table,
  GitCommitHorizontal,
} from 'lucide-react';
import type { Verdict } from '../lib/types';
import type { FeedViewMode } from './ActionFeed';

export type DashboardTab = 'feed' | 'sandbox' | 'analytics' | 'policies' | 'benchmark';

interface FilterBarProps {
  activeTab: DashboardTab;
  setActiveTab: (tab: DashboardTab) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedTool: string;
  setSelectedTool: (t: string) => void;
  selectedVerdict: Verdict | 'ALL';
  setSelectedVerdict: (v: Verdict | 'ALL') => void;
  toolsList: string[];
  feedViewMode?: FeedViewMode;
  setFeedViewMode?: (mode: FeedViewMode) => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  activeTab,
  setActiveTab,
  searchQuery,
  setSearchQuery,
  selectedTool,
  setSelectedTool,
  selectedVerdict,
  setSelectedVerdict,
  toolsList,
  feedViewMode = 'stream',
  setFeedViewMode,
}) => {
  return (
    <div className="bg-[#161b22] border-b border-[#30363d] px-5 py-2">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        {/* Navigation Tabs (Strictly shrink-0, zero clipping) */}
        <div className="flex items-center gap-1 bg-[#0d1117] p-1 rounded-lg border border-[#30363d] shrink-0">
          <button
            onClick={() => setActiveTab('feed')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-sans font-medium transition-colors cursor-pointer shrink-0 ${
              activeTab === 'feed'
                ? 'bg-[#21262d] text-white border border-[#30363d] shadow-sm font-semibold'
                : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22]'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-[#58a6ff]" />
            <span>Interception Feed</span>
          </button>

          <button
            onClick={() => setActiveTab('sandbox')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-sans font-medium transition-colors cursor-pointer shrink-0 ${
              activeTab === 'sandbox'
                ? 'bg-[#21262d] text-white border border-[#30363d] shadow-sm font-semibold'
                : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22]'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5 text-[#bc8cff]" />
            <span>Policy Sandbox</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-sans font-medium transition-colors cursor-pointer shrink-0 ${
              activeTab === 'analytics'
                ? 'bg-[#21262d] text-white border border-[#30363d] shadow-sm font-semibold'
                : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22]'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 text-[#79c0ff]" />
            <span>Threat Telemetry</span>
          </button>

          <button
            onClick={() => setActiveTab('policies')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-sans font-medium transition-colors cursor-pointer shrink-0 ${
              activeTab === 'policies'
                ? 'bg-[#21262d] text-white border border-[#30363d] shadow-sm font-semibold'
                : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22]'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-[#3fb950]" />
            <span>Policy Catalog</span>
          </button>

          <button
            onClick={() => setActiveTab('benchmark')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-sans font-medium transition-colors cursor-pointer shrink-0 ${
              activeTab === 'benchmark'
                ? 'bg-[#21262d] text-white border border-[#30363d] shadow-sm font-semibold'
                : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22]'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-[#d29922]" />
            <span>Ablation Study</span>
          </button>
        </div>

        {/* Filter & View controls (active in feed mode) */}
        {activeTab === 'feed' && (
          <div className="flex items-center gap-2 shrink-0 overflow-x-auto">
            {/* View Representation Mode Switcher */}
            {setFeedViewMode && (
              <div className="flex items-center bg-[#0d1117] border border-[#30363d] rounded-lg p-0.5">
                <button
                  onClick={() => setFeedViewMode('stream')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-sans font-medium transition-colors cursor-pointer ${
                    feedViewMode === 'stream'
                      ? 'bg-[#21262d] text-white border border-[#30363d] shadow-sm'
                      : 'text-[#8b949e] hover:text-[#c9d1d9]'
                  }`}
                  title="Stream Cards View"
                >
                  <LayoutList className="w-3 h-3" />
                  <span className="hidden sm:inline">Stream</span>
                </button>
                <button
                  onClick={() => setFeedViewMode('table')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-sans font-medium transition-colors cursor-pointer ${
                    feedViewMode === 'table'
                      ? 'bg-[#21262d] text-white border border-[#30363d] shadow-sm'
                      : 'text-[#8b949e] hover:text-[#c9d1d9]'
                  }`}
                  title="Dense SOC Incident Grid"
                >
                  <Table className="w-3 h-3" />
                  <span className="hidden sm:inline">Table</span>
                </button>
                <button
                  onClick={() => setFeedViewMode('swimlanes')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-sans font-medium transition-colors cursor-pointer ${
                    feedViewMode === 'swimlanes'
                      ? 'bg-[#21262d] text-white border border-[#30363d] shadow-sm'
                      : 'text-[#8b949e] hover:text-[#c9d1d9]'
                  }`}
                  title="Agent Blast Radius & Journey Swimlanes"
                >
                  <GitCommitHorizontal className="w-3 h-3" />
                  <span className="hidden sm:inline">Swimlanes</span>
                </button>
              </div>
            )}

            {/* Search Input */}
            <div className="relative flex-1 sm:w-52">
              <Search className="w-3.5 h-3.5 text-[#8b949e] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search actions, rules..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] hover:border-[#484f58] focus:border-[#58a6ff] rounded-md pl-8 pr-3 py-1 text-xs font-sans text-[#c9d1d9] placeholder:text-[#6e7681] focus:outline-none transition-colors"
              />
            </div>

            {/* Verdict Filter Segmented Controls */}
            <div className="flex items-center bg-[#0d1117] border border-[#30363d] rounded-lg p-0.5">
              {(['ALL', 'ALLOW', 'BLOCK', 'FLAG_FOR_REVIEW'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setSelectedVerdict(v)}
                  className={`px-2.5 py-1 rounded-md text-xs font-sans font-medium transition-colors cursor-pointer ${
                    selectedVerdict === v
                      ? v === 'ALLOW'
                        ? 'bg-[#0f2d1e] text-[#3fb950] border border-[#238636]'
                        : v === 'BLOCK'
                        ? 'bg-[#37171c] text-[#f85149] border border-[#da3633]'
                        : v === 'FLAG_FOR_REVIEW'
                        ? 'bg-[#332511] text-[#d29922] border border-[#9e6a03]'
                        : 'bg-[#21262d] text-white border border-[#30363d]'
                      : 'text-[#8b949e] hover:text-[#c9d1d9]'
                  }`}
                >
                  {v === 'FLAG_FOR_REVIEW' ? 'FLAG' : v}
                </button>
              ))}
            </div>

            {/* Tool Filter Dropdown */}
            {toolsList.length > 0 && (
              <select
                value={selectedTool}
                onChange={(e) => setSelectedTool(e.target.value)}
                className="bg-[#0d1117] border border-[#30363d] hover:border-[#484f58] focus:border-[#58a6ff] rounded-md px-2.5 py-1 text-xs font-sans text-[#c9d1d9] focus:outline-none transition-colors cursor-pointer"
              >
                <option value="ALL">All Tools ({toolsList.length})</option>
                {toolsList.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
