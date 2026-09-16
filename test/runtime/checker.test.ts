/**
 * Tests for the one rule type that runs a real command. These spawn actual
 * processes (via `node -e`, which is guaranteed present wherever the tests
 * run) rather than mocking spawnSync — the whole point of this module is
 * that it correctly drives a real process, so mocking it would test nothing.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CheckerRule } from '../../src/engine/config.js';
import type { FileChange, HoldfastEvent } from '../../src/engine/events.js';
import { checkerApplies, runChecker, runCheckers, stripAnsi, trimOutput } from '../../src/runtime/checker.js';

let repoRoot: string;

beforeAll(() => {
  repoRoot = mkdtempSync(join(tmpdir(), 'holdfast-checker-'));
});

afterAll(() => {
  // On Windows a just-timed-out child can still hold the directory open for
  // a moment. A leftover temp folder is not worth failing the suite over.
  try {
    rmSync(repoRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  } catch {
    // The OS will clean the temp folder up.
  }
});

const rule = (overrides: Partial<CheckerRule> = {}): CheckerRule => ({
  id: 'typecheck',
  type: 'checker',
  mode: 'block',
  allowOverride: false,
  message: 'Type check must pass.',
  run: 'node -e "process.exit(0)"',
  cwd: '.',
  on: 'stop',
  timeoutSeconds: 30,
  ...overrides,
});

const change = (path: string): FileChange => ({ path, before: null, after: 'x' });

const stopEvent = (changes: readonly FileChange[] = []): HoldfastEvent => ({
  kind: 'stop',
  agent: 'claude-code',
  sessionId: 's1',
  repoRoot: '/repo',
  changes,
  finalMessage: null,
  retry: 0,
});

const editEvent = (changes: readonly FileChange[]): HoldfastEvent => ({
  kind: 'after-edit',
  agent: 'claude-code',
  sessionId: 's1',
  repoRoot: '/repo',
  changes,
});

describe('stripAnsi', () => {
  it('removes colour codes but keeps the text', () => {
    const ESC = String.fromCharCode(27);
    expect(stripAnsi(`${ESC}[31merror${ESC}[0m: bad`)).toBe('error: bad');
  });

  it('leaves plain text untouched', () => {
    expect(stripAnsi('plain output')).toBe('plain output');
  });
});

describe('trimOutput', () => {
  it('keeps output under the line cap and says how much was dropped', () => {
    const long = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
    const trimmed = trimOutput(long, 10);
    expect(trimmed.split('\n')).toHaveLength(11); // 10 kept + the "more" note
    expect(trimmed).toContain('line 0');
    expect(trimmed).toContain('40 more line(s)');
    expect(trimmed).not.toContain('line 11');
  });

  it('adds no note when everything fits', () => {
    expect(trimOutput('a\nb', 10)).toBe('a\nb');
  });

  it('normalises CRLF so Windows output does not show stray carriage returns', () => {
    expect(trimOutput('a\r\nb')).toBe('a\nb');
  });

  it('drops trailing blank lines', () => {
    expect(trimOutput('a\n\n\n')).toBe('a');
  });
});

describe('runChecker', () => {
  it('passes when the command exits 0', () => {
    const outcome = runChecker(rule(), repoRoot);
    expect(outcome.ok).toBe(true);
    expect(outcome.timedOut).toBe(false);
  });

  it('fails when the command exits non-zero, capturing its output', () => {
    const outcome = runChecker(rule({ run: 'node -e "console.log(\'nope\'); process.exit(1)"' }), repoRoot);
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain('nope');
  });

  it('captures stderr as well as stdout', () => {
    const outcome = runChecker(rule({ run: 'node -e "console.error(\'to stderr\'); process.exit(1)"' }), repoRoot);
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain('to stderr');
  });

  it('reports a timeout rather than hanging the hook', () => {
    const outcome = runChecker(rule({ run: 'node -e "setTimeout(()=>{}, 10000)"', timeoutSeconds: 1 }), repoRoot);
    expect(outcome.ok).toBe(false);
    expect(outcome.timedOut).toBe(true);
    expect(outcome.output).toContain('timed out');
  });

  it('runs in the rule\'s cwd, relative to the repo root', () => {
    const marker = 'marker.txt';
    writeFileSync(join(repoRoot, marker), 'here', 'utf8');
    // Exits 0 only if the file is visible from the working directory.
    const outcome = runChecker(rule({ run: `node -e "process.exit(require('fs').existsSync('${marker}') ? 0 : 1)"` }), repoRoot);
    expect(outcome.ok).toBe(true);
  });
});

describe('checkerApplies', () => {
  it('runs an on:stop checker at stop, not after an edit', () => {
    expect(checkerApplies(rule({ on: 'stop' }), stopEvent())).toBe(true);
    expect(checkerApplies(rule({ on: 'stop' }), editEvent([change('a.ts')]))).toBe(false);
  });

  it('runs an on:edit checker after an edit, not at stop', () => {
    expect(checkerApplies(rule({ on: 'edit' }), editEvent([change('a.ts')]))).toBe(true);
    expect(checkerApplies(rule({ on: 'edit' }), stopEvent())).toBe(false);
  });

  it('never runs for a command event', () => {
    const command: HoldfastEvent = { kind: 'before-command', agent: 'claude-code', sessionId: 's1', repoRoot: '/repo', command: 'ls' };
    expect(checkerApplies(rule(), command)).toBe(false);
  });

  it('is skipped entirely when the rule is off', () => {
    expect(checkerApplies(rule({ mode: 'off' }), stopEvent())).toBe(false);
  });

  it('respects `when` globs — only runs if a matching file changed', () => {
    const onlyTs = rule({ when: (path: string) => path.endsWith('.ts') });
    expect(checkerApplies(onlyTs, stopEvent([change('src/a.ts')]))).toBe(true);
    expect(checkerApplies(onlyTs, stopEvent([change('README.md')]))).toBe(false);
    expect(checkerApplies(onlyTs, stopEvent([]))).toBe(false);
  });
});

describe('runCheckers', () => {
  it('produces no findings when every checker passes', () => {
    expect(runCheckers([rule()], stopEvent(), repoRoot)).toEqual([]);
  });

  it('produces a finding carrying the rule message and the command output', () => {
    const failing = rule({ run: 'node -e "console.log(\'TS2322: bad type\'); process.exit(1)"' });
    const findings = runCheckers([failing], stopEvent(), repoRoot);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe('typecheck');
    expect(findings[0]?.mode).toBe('block');
    expect(findings[0]?.message).toContain('Type check must pass.');
    expect(findings[0]?.message).toContain('TS2322: bad type');
  });

  it('falls back to naming the command when the rule has no message', () => {
    const failing = rule({ message: '', run: 'node -e "process.exit(1)"' });
    const findings = runCheckers([failing], stopEvent(), repoRoot);
    expect(findings[0]?.message).toContain('node -e');
  });

  it('skips checkers that do not apply to this event', () => {
    const failing = rule({ on: 'edit', run: 'node -e "process.exit(1)"' });
    expect(runCheckers([failing], stopEvent(), repoRoot)).toEqual([]);
  });
});

describe('runChecker — failure modes that must not pass silently', () => {
  it('reports a command that does not exist as a failure, not a pass', () => {
    const outcome = runChecker(rule({ run: 'this-command-does-not-exist-anywhere' }), repoRoot);
    expect(outcome.ok).toBe(false);
  });

  it('says the result is unknown when a command floods past the output buffer', () => {
    // Node kills the child on overflow and never learns its exit code, and
    // returns ENOBUFS with no output at all. Claiming "failed" would block the
    // agent over a merely verbose command, so the message must say "unknown".
    const outcome = runChecker(rule({ run: 'node -e "console.log(\'x\'.repeat(80 * 1024 * 1024))"', timeoutSeconds: 120 }), repoRoot);
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain('unknown');
  });
});

describe('runChecker — never throws, whatever it is handed', () => {
  // config.ts rejects these, but runChecker must hold the line on its own:
  // spawnSync throws synchronously on a non-finite timeout, and an exception
  // escaping here would drop every other rule for the whole session.
  it('survives an infinite timeout', () => {
    expect(() => runChecker(rule({ timeoutSeconds: Number.POSITIVE_INFINITY }), repoRoot)).not.toThrow();
  });

  it('survives a NaN timeout', () => {
    expect(() => runChecker(rule({ timeoutSeconds: Number.NaN }), repoRoot)).not.toThrow();
  });

  it('survives a timeout far larger than Node accepts', () => {
    expect(() => runChecker(rule({ timeoutSeconds: 1e20 }), repoRoot)).not.toThrow();
  });

  it('survives a cwd that does not exist, reporting it rather than throwing', () => {
    const outcome = runChecker(rule({ cwd: 'no/such/directory' }), repoRoot);
    expect(outcome.ok).toBe(false);
  });

  it('still runs normally with a valid timeout after all that', () => {
    expect(runChecker(rule(), repoRoot).ok).toBe(true);
  });
});
