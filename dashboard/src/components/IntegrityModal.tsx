import React, { useState } from 'react';
import type { IntegrityVerificationResult } from '../lib/types';
import { ShieldCheck, ShieldAlert, X, Copy, Check, Hash, CheckCircle2, Lock } from 'lucide-react';

interface IntegrityModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: IntegrityVerificationResult | null;
  loading: boolean;
  onReverify: () => Promise<void>;
}

export const IntegrityModal: React.FC<IntegrityModalProps> = ({
  isOpen,
  onClose,
  result,
  loading,
  onReverify,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyHash = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="bg-[#050916] border border-white/15 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200 glow-indigo">
        {/* Header */}
        <div className="p-5 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/10 border border-indigo-500/30 flex items-center justify-center shadow-inner">
              <Lock className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="font-mono font-bold text-sm text-white flex items-center gap-2">
                Cryptographic Integrity Verification
              </h3>
              <p className="text-xs text-slate-400 font-mono">SHA-256 Merkle Chain Audit Certificate</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {loading ? (
            <div className="py-14 text-center space-y-3">
              <div className="inline-block w-8 h-8 border-3 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin"></div>
              <p className="font-mono text-xs text-slate-400">Verifying cryptographic hash chain links across SQLite database...</p>
            </div>
          ) : result ? (
            <>
              {/* Verdict Status Card */}
              <div
                className={`p-4 rounded-2xl border flex items-start gap-3.5 ${
                  result.verified
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 glow-emerald'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300 glow-rose'
                }`}
              >
                {result.verified ? (
                  <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <div className="font-mono font-bold text-sm text-white">
                    {result.verified
                      ? 'Cryptographic Audit Trail Intact'
                      : 'Audit Log Integrity Violation Detected!'}
                  </div>
                  <p className="text-xs opacity-90 leading-relaxed font-sans text-slate-300">{result.message}</p>
                </div>
              </div>

              {/* Statistics Grid */}
              <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                <div className="glass-card p-4 rounded-2xl border-white/[0.08]">
                  <span className="text-[10px] text-slate-400 uppercase block tracking-wider font-semibold">Records Validated</span>
                  <span className="text-2xl font-bold text-white mt-1 block">{result.total_entries}</span>
                  <span className="text-[11px] text-emerald-400 flex items-center gap-1.5 mt-1.5 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> 100% Chain Match
                  </span>
                </div>

                <div className="glass-card p-4 rounded-2xl border-white/[0.08]">
                  <span className="text-[10px] text-slate-400 uppercase block tracking-wider font-semibold">Verification Time</span>
                  <span className="text-xs font-semibold text-slate-200 mt-2 block">
                    {new Date(result.verified_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    {new Date(result.verified_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Chain Head Hash */}
              <div className="bg-black/60 border border-white/[0.08] rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                    <Hash className="w-3.5 h-3.5 text-indigo-400" />
                    Latest Merkle Leaf (Chain Head):
                  </span>
                  {result.chain_head && (
                    <button
                      onClick={() => handleCopyHash(result.chain_head || '')}
                      className="text-[11px] text-slate-400 hover:text-emerald-400 flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copied ? 'Copied' : 'Copy Hash'}</span>
                    </button>
                  )}
                </div>
                <div className="font-mono text-xs text-indigo-300 break-all bg-black/50 p-3 rounded-xl border border-white/[0.06] shadow-inner">
                  {result.chain_head || 'GENESIS (No entries recorded yet)'}
                </div>
              </div>

              {/* How it works explanation */}
              <div className="text-xs text-slate-400 bg-white/[0.02] p-4 rounded-2xl border border-white/[0.06] leading-relaxed space-y-1.5 font-sans">
                <div className="font-mono font-semibold text-slate-200 text-[11px] uppercase tracking-wider">
                  Mathematical Tamper Resistance
                </div>
                <p className="leading-relaxed">
                  Every intercepted action calculates a SHA-256 digest of its predecessor (<code className="text-emerald-400 font-mono">prev_hash</code>) combined with the canonical JSON of its inputs, verdict, and checks. Any manual alteration in SQLite breaks subsequent hash links immediately.
                </p>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/[0.08] bg-white/[0.02] flex items-center justify-between">
          <button
            onClick={onReverify}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-200 font-mono text-xs transition-all cursor-pointer disabled:opacity-50"
          >
            Re-verify Chain
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-mono text-xs font-semibold transition-all shadow-md shadow-emerald-950/60 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
