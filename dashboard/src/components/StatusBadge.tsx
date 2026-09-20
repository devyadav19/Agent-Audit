import React from 'react';
import { CheckCircle2, ShieldAlert, AlertTriangle } from 'lucide-react';
import type { Verdict } from '../lib/types';

interface StatusBadgeProps {
  verdict: Verdict | string;
  size?: 'sm' | 'md' | 'lg';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ verdict, size = 'md' }) => {
  const isAllow = verdict === 'ALLOW';
  const isBlock = verdict === 'BLOCK';
  const isFlag = verdict === 'FLAG_FOR_REVIEW';

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[11px] gap-1.5 font-medium',
    md: 'px-2.5 py-1 text-xs font-semibold gap-1.5',
    lg: 'px-3 py-1.5 text-xs font-bold gap-2',
  }[size];

  const iconSizes = {
    sm: 12,
    md: 13,
    lg: 14,
  }[size];

  if (isAllow) {
    return (
      <span
        className={`inline-flex items-center rounded-md border border-[#238636] bg-[#0f2d1e] text-[#3fb950] font-sans ${sizeClasses}`}
        title="Action allowed by policy"
      >
        <CheckCircle2 size={iconSizes} className="shrink-0 text-[#3fb950]" />
        <span>ALLOW</span>
      </span>
    );
  }

  if (isBlock) {
    return (
      <span
        className={`inline-flex items-center rounded-md border border-[#da3633] bg-[#37171c] text-[#f85149] font-sans ${sizeClasses}`}
        title="Action blocked by policy engine"
      >
        <ShieldAlert size={iconSizes} className="shrink-0 text-[#f85149]" />
        <span>BLOCK</span>
      </span>
    );
  }

  if (isFlag) {
    return (
      <span
        className={`inline-flex items-center rounded-md border border-[#9e6a03] bg-[#332511] text-[#d29922] font-sans ${sizeClasses}`}
        title="Flagged for human operator review"
      >
        <AlertTriangle size={iconSizes} className="shrink-0 text-[#d29922]" />
        <span>FLAG</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-md border border-[#30363d] bg-[#21262d] text-[#8b949e] font-sans ${sizeClasses}`}
    >
      {verdict}
    </span>
  );
};

