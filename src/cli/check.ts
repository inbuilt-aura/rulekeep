/**
 * `holdfast check` — the CI backstop (docs/03-architecture.md "CI mode").
 * Runs the same rules as the agent hooks over every file changed since a
 * base ref, so a rule broken by any agent, or a human, is still caught
 * before merge. Command and prose rules are skipped: there's no agent
 * command stream or final message in CI.
 *
 * `checker` rules DO run here, and without the interactive trust prompt: CI
 * is already running the repo's own build scripts, so a checker command from
 * the same checkout grants no access the job didn't already have. The trust
 * flow exists to protect a developer's machine, which is not this.
 */
import { evaluate } from '../engine/evaluate.js';
import type { Finding, HoldfastEvent } from '../engine/events.js';
import { formatVerdict } from '../engine/format.js';
import { runCheckers } from '../runtime/checker.js';
import { loadConfig } from '../runtime/configFile.js';
import { changesSinceRef } from '../runtime/git.js';
import { checkerRulesOf } from '../runtime/trust.js';

export interface CheckOptions {
  readonly base: string;
  readonly format: 'text' | 'github' | 'json';
  readonly repoRoot: string;
  /** Defaults to true. `--no-checkers` turns them off for a fast, pure-pattern run. */
  readonly runCheckers?: boolean | undefined;
}

export interface CheckResult {
  readonly exitCode: 0 | 1 | 2;
  readonly output: string;
}

function githubAnnotation(level: 'error' | 'warning', path: string | undefined, line: number | undefined, message: string): string {
  const location = path ? `file=${path}${line ? `,line=${line}` : ''}` : '';
  return `::${level}${location ? ` ${location}` : ''}::${message.replace(/\n/g, ' ')}`;
}

export function runCheck(options: CheckOptions): CheckResult {
  const loaded = loadConfig(options.repoRoot);
  if (!loaded.ok) {
    if (loaded.path === undefined) {
      return { exitCode: 0, output: 'holdfast: no holdfast.yaml found — nothing to check.' };
    }
    const message = loaded.errors.map((e) => `  ${loaded.path}:${e.line}: ${e.message}`).join('\n');
    return { exitCode: 2, output: `holdfast: holdfast.yaml is invalid:\n${message}` };
  }

  const changes = changesSinceRef(options.repoRoot, options.base);
  const event: HoldfastEvent = {
    kind: 'stop', // reuses the stop-time rule set: line, boundary, test-guard (docs/03-architecture.md "Which rules run when")
    agent: 'ci',
    sessionId: 'ci',
    repoRoot: options.repoRoot,
    changes,
    finalMessage: null,
    retry: 0,
  };
  // A crashing checker must not take the whole command down: CI should report
  // what it could check, not die with a stack trace (docs/03-architecture.md
  // "Fail open").
  let checkerResults: readonly Finding[] = [];
  if (options.runCheckers !== false) {
    try {
      checkerResults = runCheckers(checkerRulesOf(loaded.config), event, options.repoRoot);
    } catch (cause) {
      checkerResults = [
        { ruleId: 'holdfast', mode: 'warn', message: `checker rules could not run: ${(cause as Error).message}` },
      ];
    }
  }
  const verdict = evaluate(loaded.config.rules, event, checkerResults);

  const active = verdict.findings.filter((f) => f.override === undefined);
  const overridden = verdict.findings.filter((f) => f.override !== undefined);

  if (options.format === 'json') {
    return { exitCode: verdict.outcome === 'block' ? 1 : 0, output: JSON.stringify(verdict, null, 2) };
  }

  if (options.format === 'github') {
    const lines = verdict.findings.map((f) =>
      githubAnnotation(f.mode === 'block' && f.override === undefined ? 'error' : 'warning', f.path, f.line, `${f.ruleId}: ${f.message}`),
    );
    return { exitCode: verdict.outcome === 'block' ? 1 : 0, output: lines.join('\n') };
  }

  if (active.length === 0 && overridden.length === 0) {
    return { exitCode: 0, output: `holdfast: no rules broken across ${changes.length} changed file(s).` };
  }

  const parts = [formatVerdict(verdict, 'work') || 'holdfast: no active findings.'];
  if (overridden.length > 0) {
    parts.push(
      '',
      'Overridden:',
      ...overridden.map((f) => `  ${f.ruleId}${f.path ? ` ${f.path}${f.line ? `:${f.line}` : ''}` : ''} — ${f.override?.reason}`),
    );
  }

  return { exitCode: verdict.outcome === 'block' ? 1 : 0, output: parts.join('\n') };
}
