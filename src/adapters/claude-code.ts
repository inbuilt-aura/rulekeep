/**
 * Claude Code's hook JSON, in and out (docs/03-architecture.md "Claude Code:
 * the exact wiring"). Pure translation only — reading files, snapshots and
 * the config live in src/runtime and src/cli, not here.
 */
import type { Verdict, SessionStartReason } from '../engine/events.js';

export interface ClaudeHookInput {
  readonly session_id: string;
  readonly cwd: string;
  readonly hook_event_name: string;
  readonly source?: SessionStartReason;
  readonly tool_name?: string;
  readonly tool_use_id?: string;
  readonly tool_input?: {
    readonly command?: string;
    readonly file_path?: string;
    readonly content?: string;
    readonly old_string?: string;
    readonly new_string?: string;
    readonly replace_all?: boolean;
  };
  readonly stop_hook_active?: boolean;
  readonly last_assistant_message?: string;
}

/** Tool names whose calls run a shell command (docs/03-architecture.md: match `Bash|PowerShell`). */
export const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

/** Tool names that edit a file on disk. */
export const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);

/**
 * Never returns `permissionDecision: "allow"` — rulekeep has no business
 * skipping the user's own permission prompt just because no rule fired
 * (docs/03-architecture.md, note under "PreToolUse, command blocked").
 */
export function toClaudeBeforeCommandOutput(verdict: Verdict, message: string): object {
  if (verdict.outcome === 'block') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: message,
      },
    };
  }
  if (verdict.outcome === 'warn') {
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: message } };
  }
  return {};
}

/** `decision`/`reason` are top-level for PostToolUse, not under `hookSpecificOutput` (docs/03-architecture.md). */
export function toClaudeAfterEditOutput(verdict: Verdict, message: string): object {
  if (verdict.outcome === 'block') {
    return { decision: 'block', reason: message };
  }
  if (verdict.outcome === 'warn') {
    return { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: message } };
  }
  return {};
}

export function toClaudeStopOutput(verdict: Verdict, reason: string, exhaustedSummary: string | undefined): object {
  if (verdict.outcome === 'block' && exhaustedSummary === undefined) {
    return { decision: 'block', reason };
  }
  // Either nothing is blocking, or the retry budget ran out and rulekeep is
  // letting the agent stop — say what's still open to the user instead.
  return exhaustedSummary ? { systemMessage: exhaustedSummary } : {};
}

export function toClaudeSessionStartOutput(reminder: string | undefined): object {
  return reminder
    ? { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: reminder } }
    : {};
}
