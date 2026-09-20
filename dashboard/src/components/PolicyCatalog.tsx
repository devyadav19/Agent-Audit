import React, { useEffect, useState } from 'react';
import type { PolicyRule } from '../lib/types';
import { Shield, Zap, Cpu, Search, RefreshCw, Check } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

export const PolicyCatalog: React.FC = () => {
  const [policies, setPolicies] = useState<PolicyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<'ALL' | 'hard_rule' | 'semantic'>('ALL');
  const [isReloading, setIsReloading] = useState(false);
  const [reloadSuccess, setReloadSuccess] = useState(false);

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/policies');
      if (res.ok) {
        const data = await res.json();
        setPolicies(data);
      }
    } catch (e) {
      console.error('Failed to load policies', e);
    } finally {
      setLoading(false);
    }
  };

  const handleReload = async () => {
    try {
      setIsReloading(true);
      const res = await fetch('/api/policies/reload', { method: 'POST' });
      if (res.ok) {
        await fetchPolicies();
        setReloadSuccess(true);
        setTimeout(() => setReloadSuccess(false), 2500);
      }
    } catch (e) {
      console.error('Failed to reload policies', e);
    } finally {
      setIsReloading(false);
    }
  };

  const filtered = policies.filter((p) => {
    const matchesTier = tierFilter === 'ALL' || p.tier === tierFilter;
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase()) ||
      p.applies_to.toLowerCase().includes(search.toLowerCase());
    return matchesTier && matchesSearch;
  });

  if (loading) {
    return (
      <div className="py-24 text-center font-mono text-xs text-slate-400 space-y-2">
        <div className="inline-block w-6 h-6 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin"></div>
        <p>Loading active declarative policy rules...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/80 p-5 rounded-xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            <h2 className="font-mono font-bold text-base text-slate-100">
              Active Declarative Policy Catalog ({policies.length} Rules)
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Policies authored in YAML, enforced deterministically at Tier 1 or evaluated by LLM-as-judge at Tier 2.
          </p>
        </div>

        {/* Action & Filter controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleReload}
            disabled={isReloading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900/80 border border-emerald-800/50 text-emerald-300 font-mono text-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {reloadSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Reloaded!</span>
              </>
            ) : (
              <>
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isReloading ? 'animate-spin' : ''}`} />
                <span>Reload from Disk</span>
              </>
            )}
          </button>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search rules..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs font-mono">
            {(['ALL', 'hard_rule', 'semantic'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTierFilter(t)}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer ${
                  tierFilter === t ? 'bg-slate-800 text-emerald-400 font-semibold' : 'text-slate-400'
                }`}
              >
                {t === 'ALL' ? 'All Tiers' : t === 'hard_rule' ? 'Hard Rules' : 'Semantic'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid of Policies */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((policy) => {
          const isHard = policy.tier === 'hard_rule';
          return (
            <div
              key={policy.name}
              className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition-colors space-y-3"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium border ${
                        isHard
                          ? 'bg-slate-800 text-emerald-400 border-emerald-900/40'
                          : 'bg-purple-950/60 text-purple-400 border-purple-800/40'
                      }`}
                    >
                      {isHard ? <Zap className="w-3 h-3" /> : <Cpu className="w-3 h-3" />}
                      <span>{isHard ? 'Deterministic' : 'LLM Judge'}</span>
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      tool: <code className="text-slate-200 font-semibold">{policy.applies_to}</code>
                    </span>
                  </div>
                  <StatusBadge verdict={policy.action} size="sm" />
                </div>

                <h3 className="font-mono font-bold text-sm text-slate-100 mb-1">{policy.name}</h3>
                <p className="text-xs text-slate-400 mb-3 leading-relaxed">{policy.description}</p>

                {/* Condition or Intent Details */}
                {policy.condition && (
                  <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80 text-xs font-mono mb-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase text-slate-400">DSL Condition ({policy.condition.type})</span>
                    </div>
                    <pre className="text-emerald-300/90 text-[11px] whitespace-pre-wrap overflow-x-auto">
                      {JSON.stringify(policy.condition, null, 2)}
                    </pre>
                  </div>
                )}

                {policy.policy_intent && (
                  <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80 text-xs font-mono mb-2">
                    <span className="text-[10px] uppercase text-purple-400 block mb-1">
                      Natural Language Intent
                    </span>
                    <p className="text-slate-300 text-[11px] leading-relaxed italic">
                      "{policy.policy_intent.trim()}"
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
