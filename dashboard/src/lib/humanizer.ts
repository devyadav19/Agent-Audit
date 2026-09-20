import type { AuditEntry, Verdict } from './types';

export interface HumanVerdictInfo {
  badge: string;
  label: string;
  description: string;
  color: string;
  bg: string;
  border: string;
}

/**
 * Converts technical tool identifiers into user-friendly names.
 */
export function getToolFriendlyName(tool: string): string {
  switch (tool) {
    case 'spend_money':
      return 'Payment / Expense';
    case 'send_email':
      return 'Customer Email';
    case 'delete_file':
      return 'File Deletion';
    case 'web_search':
      return 'Web Query';
    case 'send_slack_message':
      return 'Team Chat Message';
    default:
      return tool.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

/**
 * Returns a 1-sentence plain-English description of what the AI agent tried to do.
 */
export function getHumanActionSummary(entry: AuditEntry): string {
  const args = entry.arguments || {};
  switch (entry.tool_name) {
    case 'spend_money': {
      const amt =
        typeof args.amount === 'number'
          ? `$${args.amount.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`
          : args.amount
          ? `$${args.amount}`
          : 'funds';
      const vendor = args.vendor ? ` at "${args.vendor}"` : '';
      const forDesc = args.description ? ` for "${args.description}"` : '';
      return `Agent tried to spend ${amt}${vendor}${forDesc}`;
    }
    case 'send_email': {
      const recipient = args.to ? ` to ${args.to}` : '';
      const subject = args.subject ? ` with subject "${args.subject}"` : '';
      return `Agent tried to send an email${recipient}${subject}`;
    }
    case 'delete_file': {
      const path = args.file_path || 'a protected file';
      return `Agent tried to permanently delete file: ${path}`;
    }
    case 'web_search': {
      const q = args.query || '';
      return `Agent searched the web for: "${q}"`;
    }
    case 'send_slack_message': {
      const ch = args.channel ? ` in channel ${args.channel}` : '';
      return `Agent tried to send a chat message${ch}`;
    }
    default: {
      const keys = Object.keys(args);
      if (keys.length === 0) return `Agent triggered action: ${entry.tool_name}`;
      const preview = keys.map((k) => `${k}: ${args[k]}`).slice(0, 3).join(', ');
      return `Agent invoked ${entry.tool_name} (${preview})`;
    }
  }
}

/**
 * Translates triggered policies or passing statuses into everyday language.
 */
export function getHumanReasoning(entry: AuditEntry): string {
  const triggered = (entry.check_results || []).filter((c) => c.verdict !== 'ALLOW');
  if (triggered.length === 0) {
    return 'All security and budget guardrails passed successfully. This action was safe to execute.';
  }

  const explanations: string[] = [];
  for (const t of triggered) {
    switch (t.rule_name) {
      case 'spend_cap_per_transaction':
        explanations.push(
          'Blocked because this single payment exceeds the company safety limit of $200.00.'
        );
        break;
      case 'cumulative_spend_cap':
        explanations.push(
          'Blocked because total spending across this session exceeds the maximum $500.00 budget.'
        );
        break;
      case 'spend_rate_limit':
        explanations.push(
          'Blocked because too many payment requests occurred within 60 seconds (rate limit exceeded).'
        );
        break;
      case 'ssrf_protection':
        explanations.push(
          'Blocked because the request attempted to access private internal cloud servers (SSRF security violation).'
        );
        break;
      case 'no_sensitive_file_deletion':
        explanations.push(
          'Blocked because the agent attempted to delete protected operating system files.'
        );
      break;
      case 'appropriate_email_tone':
        explanations.push(
          t.explanation ||
            'Flagged because the email contained hostile or inappropriate tone, or leaked confidential pricing.'
        );
        break;
      default:
        explanations.push(t.explanation || `Violated safety rule: ${t.rule_name}`);
        break;
    }
  }

  return explanations.join(' ');
}

/**
 * Returns friendly labels and badge styling for verdicts.
 */
export function getHumanVerdict(verdict: Verdict): HumanVerdictInfo {
  switch (verdict) {
    case 'ALLOW':
      return {
        badge: 'Safe & Allowed',
        label: 'Approved',
        description: 'Action passed all security, budget, and content guidelines.',
        color: 'text-[#3fb950]',
        bg: 'bg-[#0f2d1e]',
        border: 'border-[#238636]',
      };
    case 'BLOCK':
      return {
        badge: 'Threat Stopped',
        label: 'Blocked',
        description: 'Action was immediately halted because it violated safety rules.',
        color: 'text-[#f85149]',
        bg: 'bg-[#2d1b1e]',
        border: 'border-[#da3633]',
      };
    case 'FLAG_FOR_REVIEW':
      return {
        badge: 'Held for Review',
        label: 'Needs Review',
        description: 'Action was paused for human approval before sending.',
        color: 'text-[#d29922]',
        bg: 'bg-[#332511]',
        border: 'border-[#9e6a03]',
      };
    default:
      return {
        badge: verdict,
        label: verdict,
        description: 'Status unknown.',
        color: 'text-[#8b949e]',
        bg: 'bg-[#161b22]',
        border: 'border-[#30363d]',
      };
  }
}
