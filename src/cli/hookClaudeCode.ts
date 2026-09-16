/**
 * Wires the Claude Code adapter, the runtime and the engine together for
 * each hook event (docs/03-architecture.md "CLI: ... Wire the other three
 * together"). One function per event; src/cli/main.ts just dispatches here.
 */
import { existsSync, readFileSync } from 'node:fs';
import {
  EDIT_TOOLS,
  SHELL_TOOLS,
  toClaudeAfterEditOutput,
  toClaudeBeforeCommandOutput,
  toClaudeSessionStartOutput,
  toClaudeStopOutput,
  type ClaudeHookInput,
} from '../adapters/claude-code.js';
import { toRepoRelative } from '../adapters/paths.js';
import { evaluate } from '../engine/evaluate.js';
import type { Finding, FileChange, RulekeepEvent } from '../engine/events.js';
import { formatStopSummary, formatVerdict } from '../engine/format.js';
import { runCheckers } from '../runtime/checker.js';
import { loadConfig, type LoadedConfig } from '../runtime/configFile.js';
import { saveSnapshot, takeSnapshot } from '../runtime/snapshot.js';
import { cleanupStaleSessions, readChanges, readStopRetries, recordChange, writeStopRetries } from '../runtime/state.js';
import { checkerRulesOf, isTrusted, untrustedNotice } from '../runtime/trust.js';

const AGENT = 'claude-code' as const;

function repoRootOf(input: ClaudeHookInput): string {
  return process.env.CLAUDE_PROJECT_DIR ?? input.cwd;
}

function readFileOrNull(absolutePath: string): string | null {
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : null;
}

/** Best-effort summary of active rules, injected back into context after compaction (docs/02-what-we-build.md "7. Rule reminder"). */
function ruleReminder(repoRoot: string): string | undefined {
  const loaded = loadConfig(repoRoot);
  if (!loaded.ok || loaded.config.rules.length === 0) return undefined;

  const lines = loaded.config.rules
    .filter((rule) => rule.mode !== 'off')
    .map((rule) => `- ${rule.id} (${rule.mode})${rule.message ? `: ${rule.message}` : ''}`);
  if (lines.length === 0) return undefined;

  return `rulekeep rules for this repo:\n${lines.join('\n')}`;
}

/**
 * Checker findings for an event, but only for a config whose commands the
 * user has approved (docs/03-architecture.md "Checker commands need
 * approval"). An untrusted config silently contributes no checker findings;
 * the user is told once, at session start, not on every edit.
 */
function checkerFindings(loaded: LoadedConfig, event: RulekeepEvent): readonly Finding[] {
  const checkers = checkerRulesOf(loaded.config);
  if (checkers.length === 0 || !isTrusted(loaded.path, checkers)) return [];
  return runCheckers(checkers, event, event.repoRoot);
}

export function handleSessionStart(input: ClaudeHookInput): object {
  cleanupStaleSessions();
  const repoRoot = repoRootOf(input);

  // The checker approval prompt is shown once per session, at the start —
  // never on every edit (docs/03-architecture.md "Checker commands need approval").
  const loaded = loadConfig(repoRoot);
  const notice = loaded.ok ? untrustedNotice(loaded.path, checkerRulesOf(loaded.config)) : undefined;

  // After a compaction the rules are re-stated, because the original
  // statement of them may have been compacted away.
  const reminder = input.source === 'compact' ? ruleReminder(repoRoot) : undefined;

  const parts = [notice, reminder].filter((part): part is string => part !== undefined);
  return toClaudeSessionStartOutput(parts.length > 0 ? parts.join('\n\n') : undefined);
}

export function handlePreToolUse(input: ClaudeHookInput): object {
  const repoRoot = repoRootOf(input);
  const toolName = input.tool_name ?? '';

  if (SHELL_TOOLS.has(toolName)) {
    const command = input.tool_input?.command ?? '';
    const loaded = loadConfig(repoRoot);
    if (!loaded.ok) return {}; // fail open: no config yet, or it's broken — say nothing here

    const verdict = evaluate(loaded.config.rules, {
      kind: 'before-command',
      agent: AGENT,
      sessionId: input.session_id,
      repoRoot,
      command,
    });
    return toClaudeBeforeCommandOutput(verdict, formatVerdict(verdict, 'command'));
  }

  if (EDIT_TOOLS.has(toolName) && input.tool_use_id) {
    // Snapshot only: PreToolUse never blocks an edit — the engine matches
    // against what the edit actually changed, which is only knowable after
    // it happens (docs/03-architecture.md "How changes are detected").
    const filePath = input.tool_input?.file_path;
    if (filePath) {
      saveSnapshot(AGENT, input.session_id, input.tool_use_id, readFileOrNull(filePath));
    }
  }

  return {};
}

export function handlePostToolUse(input: ClaudeHookInput): object {
  const repoRoot = repoRootOf(input);
  const toolName = input.tool_name ?? '';
  if (!EDIT_TOOLS.has(toolName)) return {};

  const filePath = input.tool_input?.file_path;
  if (!filePath || !input.tool_use_id) return {};

  const snapshot = takeSnapshot(AGENT, input.session_id, input.tool_use_id);
  // Missing snapshot (e.g. the pre-hook timed out) means "unknown before" —
  // treat the whole current content as added rather than silently skipping.
  const before = snapshot.found ? snapshot.content : null;
  const after = readFileOrNull(filePath);

  const change: FileChange = { path: toRepoRelative(filePath, repoRoot), before, after };
  recordChange(AGENT, input.session_id, change);

  const loaded = loadConfig(repoRoot);
  if (!loaded.ok) return {};

  const event: RulekeepEvent = {
    kind: 'after-edit',
    agent: AGENT,
    sessionId: input.session_id,
    repoRoot,
    changes: [change],
  };
  const verdict = evaluate(loaded.config.rules, event, checkerFindings(loaded, event));
  return toClaudeAfterEditOutput(verdict, formatVerdict(verdict, 'edit'));
}

export function handleStop(input: ClaudeHookInput): object {
  const repoRoot = repoRootOf(input);
  const loaded = loadConfig(repoRoot);
  if (!loaded.ok) return {};

  const changes = readChanges(AGENT, input.session_id);
  const retry = input.stop_hook_active ? readStopRetries(AGENT, input.session_id) : 0;

  const event: RulekeepEvent = {
    kind: 'stop',
    agent: AGENT,
    sessionId: input.session_id,
    repoRoot,
    changes,
    finalMessage: input.last_assistant_message ?? null,
    retry,
  };
  const verdict = evaluate(loaded.config.rules, event, checkerFindings(loaded, event));

  const isBlocking = verdict.outcome === 'block';
  const withinBudget = retry < loaded.config.maxStopRetries;

  if (isBlocking && withinBudget) {
    writeStopRetries(AGENT, input.session_id, retry + 1);
    // 'work', not 'edit': at stop the findings cover the whole turn, which
    // may include files the agent edited several steps ago.
    return toClaudeStopOutput(verdict, formatVerdict(verdict, 'work'), undefined);
  }

  writeStopRetries(AGENT, input.session_id, 0);
  const summary = formatStopSummary(verdict);
  return toClaudeStopOutput(verdict, '', summary.length > 0 ? summary : undefined);
}
