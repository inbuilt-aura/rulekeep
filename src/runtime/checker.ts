/**
 * Runs a `checker` rule's real command and turns a non-zero exit into a
 * finding (docs/03-architecture.md, docs/04-build-plan.md M4 step 1).
 *
 * This is the one rule type that executes something from the repo's own
 * holdfast.yaml, so it only ever runs for a config the user has trusted —
 * the caller enforces that via runtime/trust.ts. Everything here is impure
 * by definition, which is why it lives in src/runtime and not the engine.
 */
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';
import type { CheckerRule } from '../engine/config.js';
import type { Finding, HoldfastEvent } from '../engine/events.js';

/** Keep a failing checker's output short enough to stay inside an agent's message limit. */
const MAX_OUTPUT_LINES = 40;
const MAX_LINE_LENGTH = 500;

/** One hour, matching config.ts's own ceiling on `timeoutSeconds`. */
const MAX_TIMEOUT_MS = 3600 * 1000;

/**
 * Generous enough that a normal test suite's full output fits. Node kills the
 * child the moment this is exceeded and discards everything, so a too-small
 * value turns a passing-but-chatty checker into a reported failure.
 */
const MAX_BUFFER_BYTES = 64 * 1024 * 1024;

/** Strips ANSI colour/cursor escapes, so a checker's pretty output stays readable inside a hook's JSON message. */
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\[[0-9;]*[A-Za-z]|\][^]*/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}

/** First `maxLines` lines, each truncated, with a note when more was dropped. */
export function trimOutput(text: string, maxLines: number = MAX_OUTPUT_LINES): string {
  const lines = stripAnsi(text).replace(/\r\n/g, '\n').split('\n');
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop();

  const kept = lines.slice(0, maxLines).map((line) => (line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)}…` : line));
  const dropped = lines.length - kept.length;
  if (dropped > 0) kept.push(`… ${dropped} more line(s)`);
  return kept.join('\n');
}

export interface CheckerOutcome {
  readonly ok: boolean;
  readonly output: string;
  readonly timedOut: boolean;
}

/**
 * Runs one checker command. Uses a shell because `run` is written as a shell
 * string in holdfast.yaml ("npm run typecheck"); that is only safe because
 * the config had to be trusted first (runtime/trust.ts).
 */
export function runChecker(rule: CheckerRule, repoRoot: string): CheckerOutcome {
  const cwd = isAbsolute(rule.cwd) ? rule.cwd : resolve(repoRoot, rule.cwd);

  // config.ts already rejects a non-finite or out-of-range timeout, but
  // spawnSync THROWS synchronously on one rather than returning an error, and
  // an exception escaping here would drop every other rule in the session.
  // Clamping here too means that can't happen however this is called.
  const timeout = Math.min(Math.max(Math.floor(rule.timeoutSeconds * 1000), 1), MAX_TIMEOUT_MS);

  let result: SpawnSyncReturns<string>;
  try {
    result = spawnSync(rule.run, {
      cwd,
      shell: true,
      encoding: 'utf8',
      timeout,
      maxBuffer: MAX_BUFFER_BYTES,
      windowsHide: true,
    });
  } catch (cause) {
    return { ok: false, timedOut: false, output: `could not run: ${(cause as Error).message}` };
  }

  if (result.error !== undefined) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === 'ETIMEDOUT') {
      return { ok: false, timedOut: true, output: `timed out after ${rule.timeoutSeconds}s` };
    }
    // ENOBUFS means the command out-printed our buffer. Node kills it at that
    // moment and never learns its exit code, so we genuinely do not know
    // whether it would have passed. Say exactly that — reporting it as a
    // failure would block the agent over a merely verbose command.
    if (code === 'ENOBUFS') {
      return { ok: false, timedOut: false, output: 'produced too much output to capture, so its result is unknown — run it yourself' };
    }
    // A command that could not be started at all is reported, not silently
    // passed — a checker that never ran is not a checker that succeeded.
    return { ok: false, timedOut: false, output: `could not run: ${result.error.message}` };
  }

  const combined = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return { ok: result.status === 0, timedOut: false, output: trimOutput(combined) };
}

/** True when this checker should run for the given event (its `on:` phase, and any `when:` globs). */
export function checkerApplies(rule: CheckerRule, event: HoldfastEvent): boolean {
  if (rule.mode === 'off') return false;

  const phase = event.kind === 'stop' ? 'stop' : event.kind === 'after-edit' ? 'edit' : undefined;
  if (phase === undefined || phase !== rule.on) return false;

  if (rule.when === undefined) return true;

  const changes = event.kind === 'stop' || event.kind === 'after-edit' ? event.changes : [];
  return changes.some((change) => rule.when?.(change.path) === true);
}

/**
 * Runs every applicable checker rule and returns their findings. The caller
 * passes these to `evaluate` as `extra`, so checker results flow through the
 * same verdict, override and formatting path as every other rule type.
 */
export function runCheckers(rules: readonly CheckerRule[], event: HoldfastEvent, repoRoot: string): readonly Finding[] {
  const findings: Finding[] = [];

  for (const rule of rules) {
    if (!checkerApplies(rule, event)) continue;

    const outcome = runChecker(rule, repoRoot);
    if (outcome.ok) continue;

    const detail = rule.message.trim().length > 0 ? rule.message : `\`${rule.run}\` failed.`;
    findings.push({
      ruleId: rule.id,
      mode: rule.mode,
      message: outcome.output.length > 0 ? `${detail}\n${outcome.output}` : detail,
    });
  }

  return findings;
}
