import { useState, useEffect, useRef } from 'react';
import type { AuditEntry, Stats, Verdict, IntegrityVerificationResult } from './lib/types';
import { StatsBar } from './components/StatsBar';
import { FilterBar, type DashboardTab } from './components/FilterBar';
import { ActionFeed } from './components/ActionFeed';
import { DetailPanel } from './components/DetailPanel';
import { PolicyCatalog } from './components/PolicyCatalog';
import { EvaluationReport } from './components/EvaluationReport';
import { PolicySandbox } from './components/PolicySandbox';
import { ThreatAnalytics } from './components/ThreatAnalytics';
import { IntegrityModal } from './components/IntegrityModal';

export function App() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    by_verdict: {},
    by_tool: {},
    avg_latency_ms: 0,
  });
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>('feed');
  const [feedViewMode, setFeedViewMode] = useState<'stream' | 'table' | 'swimlanes'>('stream');

  // Integrity & Admin State
  const [isIntegrityModalOpen, setIsIntegrityModalOpen] = useState(false);
  const [integrityResult, setIntegrityResult] = useState<IntegrityVerificationResult | null>(null);
  const [isVerifyingIntegrity, setIsVerifyingIntegrity] = useState(false);
  const [isReloadingPolicies, setIsReloadingPolicies] = useState(false);


  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTool, setSelectedTool] = useState<string>('ALL');
  const [selectedVerdict, setSelectedVerdict] = useState<Verdict | 'ALL'>('ALL');

  // Running scenario state
  const [isRunningScenarios, setIsRunningScenarios] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  // Fetch initial data
  const fetchData = async () => {
    try {
      const [entriesRes, statsRes] = await Promise.all([
        fetch('/api/audit-log?limit=200'),
        fetch('/api/stats'),
      ]);

      if (entriesRes.ok) {
        const entriesData = await entriesRes.json();
        setEntries(entriesData);
        if (entriesData.length > 0 && !selectedEntry) {
          setSelectedEntry(entriesData[0]);
        }
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (err) {
      console.error('Failed to fetch initial audit log data', err);
    }
  };

  useEffect(() => {
    fetchData();

    // Setup WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/audit-stream`;

    let isDisposed = false;
    let ws: WebSocket;
    let reconnectTimer: any;

    const connect = () => {
      if (isDisposed) return;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isDisposed) {
          setIsConnected(true);
        }
      };

      ws.onmessage = (event) => {
        if (isDisposed) return;
        try {
          const newEntry: AuditEntry = JSON.parse(event.data);
          setEntries((prev) => {
            if (prev.some((e) => e.id === newEntry.id)) {
              return prev;
            }
            // Only increment stats for unique entries
            setStats((prevStats) => {
              const byVerdict = { ...prevStats.by_verdict };
              byVerdict[newEntry.decision] = (byVerdict[newEntry.decision] || 0) + 1;

              const byTool = { ...prevStats.by_tool };
              byTool[newEntry.tool_name] = (byTool[newEntry.tool_name] || 0) + 1;

              const newTotal = prevStats.total + 1;
              const newAvg =
                (prevStats.avg_latency_ms * prevStats.total + newEntry.total_latency_ms) / newTotal;

              return {
                total: newTotal,
                by_verdict: byVerdict,
                by_tool: byTool,
                avg_latency_ms: newAvg,
              };
            });
            return [newEntry, ...prev];
          });
        } catch (e) {
          console.error('Error parsing WebSocket message', e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        if (!isDisposed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    // Ping interval to keep connection active
    const pingInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send('ping');
      }
    }, 15000);

    return () => {
      isDisposed = true;
      clearInterval(pingInterval);
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Handlers
  const handleRunScenarios = async (category?: string) => {
    try {
      setIsRunningScenarios(true);
      // Clear previous run so each click runs a fresh, clean batch of exactly 30 scenarios
      await fetch('/api/clear', { method: 'POST' });
      setEntries([]);
      setSelectedEntry(null);
      setStats({
        total: 0,
        by_verdict: {},
        by_tool: {},
        avg_latency_ms: 0,
      });

      const url = category ? `/api/scenarios/run?category=${category}&delay=0.08` : '/api/scenarios/run?delay=0.08';
      const res = await fetch(url, { method: 'POST' });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error('Error running test scenarios', e);
    } finally {
      setIsRunningScenarios(false);
    }
  };

  const handleClearAuditLog = async () => {
    try {
      const res = await fetch('/api/clear', { method: 'POST' });
      if (res.ok) {
        setEntries([]);
        setSelectedEntry(null);
        setStats({
          total: 0,
          by_verdict: {},
          by_tool: {},
          avg_latency_ms: 0,
        });
      }
    } catch (e) {
      console.error('Error clearing audit log', e);
    }
  };

  const handleVerifyIntegrity = async () => {
    setIsIntegrityModalOpen(true);
    setIsVerifyingIntegrity(true);
    try {
      const res = await fetch('/api/audit-log/verify', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setIntegrityResult(data);
      }
    } catch (err) {
      console.error('Failed to verify audit log integrity', err);
    } finally {
      setIsVerifyingIntegrity(false);
    }
  };

  const handleExport = (format: 'json' | 'csv') => {
    const url = `/api/audit-log/export?format=${format}`;
    window.open(url, '_blank');
  };

  const handleReloadPolicies = async () => {
    setIsReloadingPolicies(true);
    try {
      await fetch('/api/policies/reload', { method: 'POST' });
      await fetchData();
    } catch (err) {
      console.error('Failed to reload policies', err);
    } finally {
      setIsReloadingPolicies(false);
    }
  };

  const handleTriggerEvaluation = async () => {
    try {
      setIsEvaluating(true);
      await fetch('/api/evaluation/run', { method: 'POST' });
    } catch (e) {
      console.error('Failed to trigger evaluation', e);
    } finally {
      setIsEvaluating(false);
    }
  };

  // Tools list for filter
  const toolsList = Array.from(new Set(entries.map((e) => e.tool_name)));

  // Filtered entries
  const filteredEntries = entries.filter((e) => {
    const matchesTool = selectedTool === 'ALL' || e.tool_name === selectedTool;
    const matchesVerdict = selectedVerdict === 'ALL' || e.decision === selectedVerdict;
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      !query ||
      e.tool_name.toLowerCase().includes(query) ||
      e.agent_id.toLowerCase().includes(query) ||
      JSON.stringify(e.arguments).toLowerCase().includes(query) ||
      e.check_results.some(
        (c) =>
          c.rule_name.toLowerCase().includes(query) ||
          c.explanation.toLowerCase().includes(query)
      );

    return matchesTool && matchesVerdict && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3] flex flex-col font-sans selection:bg-[#1f6feb]/30 selection:text-[#58a6ff]">
      {/* Top sticky stats & SOC controls bar */}
      <StatsBar
        stats={stats}
        isConnected={isConnected}
        onRunScenarios={handleRunScenarios}
        isRunningScenarios={isRunningScenarios}
        onClear={handleClearAuditLog}
        onVerifyIntegrity={handleVerifyIntegrity}
        onExport={handleExport}
        onReloadPolicies={handleReloadPolicies}
        isReloadingPolicies={isReloadingPolicies}
      />

      {/* Navigation & Filters bar */}
      <FilterBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedTool={selectedTool}
        setSelectedTool={setSelectedTool}
        selectedVerdict={selectedVerdict}
        setSelectedVerdict={setSelectedVerdict}
        toolsList={toolsList}
        feedViewMode={feedViewMode}
        setFeedViewMode={setFeedViewMode}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'feed' && (
          <div className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-108px)] overflow-hidden">
            {/* Left: Interception Feed (60% width on large screens) */}
            <div className="flex-1 lg:w-3/5 overflow-hidden border-r border-[#30363d] flex flex-col">
              <ActionFeed
                entries={filteredEntries}
                selectedEntry={selectedEntry}
                onSelectEntry={setSelectedEntry}
                onRunScenarios={() => handleRunScenarios()}
                isRunning={isRunningScenarios}
                searchQuery={searchQuery}
                viewMode={feedViewMode}
              />
            </div>

            {/* Right: Reasoning Detail Panel (40% width on large screens) */}
            <div className="hidden lg:block lg:w-2/5 h-full overflow-hidden">
              <DetailPanel
                entry={selectedEntry}
                onClose={() => setSelectedEntry(null)}
              />
            </div>

            {/* Mobile / Tablet Modal View for DetailPanel */}
            {selectedEntry && (
              <div className="lg:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end">
                <div className="w-full max-w-xl h-full bg-[#090f1c] shadow-2xl">
                  <DetailPanel
                    entry={selectedEntry}
                    onClose={() => setSelectedEntry(null)}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'sandbox' && (
          <div className="flex-1 overflow-y-auto h-[calc(100vh-125px)]">
            <PolicySandbox />
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="flex-1 overflow-y-auto h-[calc(100vh-125px)]">
            <ThreatAnalytics />
          </div>
        )}

        {activeTab === 'policies' && (
          <div className="flex-1 overflow-y-auto h-[calc(100vh-125px)]">
            <PolicyCatalog />
          </div>
        )}

        {activeTab === 'benchmark' && (
          <div className="flex-1 overflow-y-auto h-[calc(100vh-125px)]">
            <EvaluationReport
              onTriggerEvaluation={handleTriggerEvaluation}
              isEvaluating={isEvaluating}
            />
          </div>
        )}
      </div>

      {/* Cryptographic Proof Verification Modal */}
      <IntegrityModal
        isOpen={isIntegrityModalOpen}
        onClose={() => setIsIntegrityModalOpen(false)}
        result={integrityResult}
        loading={isVerifyingIntegrity}
        onReverify={handleVerifyIntegrity}
      />
    </div>
  );
}

export default App;
