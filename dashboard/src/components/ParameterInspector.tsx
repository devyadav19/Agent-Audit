import React, { useState } from 'react';
import {
  Code2,
  LayoutGrid,
  ShieldAlert,
  Fingerprint,
  DollarSign,
  Mail,
  Copy,
  Check,
} from 'lucide-react';

interface ParameterInspectorProps {
  argumentsData: Record<string, any>;
  toolName?: string;
}

export const ParameterInspector: React.FC<ParameterInspectorProps> = ({
  argumentsData,
}) => {
  const [viewMode, setViewMode] = useState<'cards' | 'json'>('cards');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(argumentsData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Threat heuristic detector for parameters
  const getParamThreatInfo = (key: string, value: any) => {
    const strVal = String(value || '');

    // 1. SSRF / Cloud Metadata
    if (
      strVal.includes('169.254.169.254') ||
      strVal.includes('metadata.google.internal') ||
      strVal.includes('127.0.0.1') ||
      strVal.includes('localhost')
    ) {
      return {
        level: 'critical',
        badge: 'SSRF / Cloud IMDS Target',
        icon: <ShieldAlert className="w-3 h-3 text-[#f85149]" />,
        border: 'border-[#da3633] bg-[#37171c]/50 text-[#f85149]',
      };
    }

    // 2. Sensitive filesystem access
    if (
      strVal.startsWith('/etc') ||
      strVal.startsWith('/var/secrets') ||
      strVal.includes('/shadow') ||
      strVal.includes('/passwd')
    ) {
      return {
        level: 'critical',
        badge: 'Protected System Directory',
        icon: <ShieldAlert className="w-3 h-3 text-[#f85149]" />,
        border: 'border-[#da3633] bg-[#37171c]/50 text-[#f85149]',
      };
    }

    // 3. High financial spend
    if ((key === 'amount' || key === 'price' || key === 'cost') && typeof value === 'number') {
      if (value > 200) {
        return {
          level: 'high',
          badge: `Exceeds Cap ($${value.toFixed(2)} > $200.00)`,
          icon: <DollarSign className="w-3 h-3 text-[#f85149]" />,
          border: 'border-[#da3633] bg-[#37171c]/50 text-[#f85149]',
        };
      }
      return {
        level: 'normal',
        badge: `Approved Cap Range ($${value.toFixed(2)})`,
        icon: <DollarSign className="w-3 h-3 text-[#3fb950]" />,
        border: 'border-[#238636] bg-[#0f2d1e]/50 text-[#3fb950]',
      };
    }

    // 4. External or untrusted email domain
    if (key === 'to' && typeof value === 'string') {
      if (!value.endsWith('@company.com') && !value.endsWith('@partner.org')) {
        return {
          level: 'medium',
          badge: 'External Recipient Domain',
          icon: <Mail className="w-3 h-3 text-[#d29922]" />,
          border: 'border-[#9e6a03] bg-[#332511]/50 text-[#d29922]',
        };
      }
      return {
        level: 'safe',
        badge: 'Trusted Internal Domain',
        icon: <Mail className="w-3 h-3 text-[#3fb950]" />,
        border: 'border-[#238636] bg-[#0f2d1e]/50 text-[#3fb950]',
      };
    }

    // 5. Masked credentials / PII tokens
    if (strVal.includes('***REDACTED') || strVal.includes('***MASKED')) {
      return {
        level: 'sanitized',
        badge: 'PII / Secret Masked by Guard',
        icon: <Fingerprint className="w-3 h-3 text-[#3fb950]" />,
        border: 'border-[#238636] bg-[#0f2d1e]/50 text-[#3fb950]',
      };
    }

    return null;
  };

  const keys = Object.keys(argumentsData || {});

  return (
    <div className="space-y-3">
      {/* Parameter Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-sans font-semibold text-[#e6edf3]">
          <Code2 className="w-3.5 h-3.5 text-[#58a6ff]" />
          <span>Tool Parameters ({keys.length})</span>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-[#0d1117] border border-[#30363d] rounded-md p-0.5">
            <button
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-sans font-medium transition-colors cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-[#21262d] text-white border border-[#30363d]'
                  : 'text-[#8b949e] hover:text-[#c9d1d9]'
              }`}
              title="Card Grid Representation"
            >
              <LayoutGrid className="w-3 h-3" />
              <span>Cards</span>
            </button>
            <button
              onClick={() => setViewMode('json')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-sans font-medium transition-colors cursor-pointer ${
                viewMode === 'json'
                  ? 'bg-[#21262d] text-white border border-[#30363d]'
                  : 'text-[#8b949e] hover:text-[#c9d1d9]'
              }`}
              title="Raw JSON Representation"
            >
              <Code2 className="w-3 h-3" />
              <span>JSON</span>
            </button>
          </div>

          <button
            onClick={handleCopy}
            className="p-1 rounded-md bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9] transition-colors cursor-pointer"
            title="Copy Arguments JSON"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#3fb950]" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Representation View */}
      {viewMode === 'json' ? (
        <div className="bg-[#0d1117] rounded-lg border border-[#30363d] p-3 font-mono text-xs overflow-x-auto">
          <pre className="text-[#c9d1d9] whitespace-pre-wrap leading-relaxed">
            {JSON.stringify(argumentsData, null, 2)}
          </pre>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.length === 0 ? (
            <div className="p-4 text-center text-[#8b949e] font-sans text-xs bg-[#0d1117] border border-[#30363d] rounded-lg">
              No arguments provided for this tool execution.
            </div>
          ) : (
            keys.map((key) => {
              const value = argumentsData[key];
              const threat = getParamThreatInfo(key, value);

              return (
                <div
                  key={key}
                  className={`p-3 rounded-lg border bg-[#161b22] transition-colors ${
                    threat ? threat.border : 'border-[#30363d]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                    <span className="font-mono text-xs font-semibold text-[#e6edf3] flex items-center gap-1">
                      <span className="text-[#8b949e]">$</span>
                      {key}
                    </span>

                    {threat && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-medium">
                        {threat.icon}
                        <span>{threat.badge}</span>
                      </span>
                    )}
                  </div>

                  <div className="font-mono text-xs break-all bg-[#0d1117] p-2.5 rounded border border-[#30363d]">
                    {typeof value === 'object' && value !== null ? (
                      <pre className="whitespace-pre-wrap text-[#c9d1d9] text-[11px]">
                        {JSON.stringify(value, null, 2)}
                      </pre>
                    ) : (
                      <span className="text-[#c9d1d9] leading-relaxed">
                        {String(value)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
