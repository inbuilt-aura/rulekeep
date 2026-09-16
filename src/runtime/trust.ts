/**
 * Approval for checker commands (docs/03-architecture.md "Checker commands
 * need approval").
 *
 * A `checker` rule runs a command written in the repo's rulekeep.yaml. Anyone
 * can put a harmful command in a repo and wait for someone to open it with an
 * agent. So rulekeep never runs a checker until the user has approved that
 * exact set of commands, and approval is tied to a hash of the commands
 * themselves: change what they run, and it has to be approved again.
 *
 * Approvals live in ~/.rulekeep/trusted.json, keyed by config path, so
 * trusting one repo says nothing about any other.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { CheckerRule, Config } from '../engine/config.js';

const TRUST_DIR_NAME = '.rulekeep';
const TRUST_FILE_NAME = 'trusted.json';

export function trustFilePath(): string {
  return join(process.env.RULEKEEP_HOME ?? join(homedir(), TRUST_DIR_NAME), TRUST_FILE_NAME);
}

export function checkerRulesOf(config: Config): readonly CheckerRule[] {
  return config.rules.filter((rule): rule is CheckerRule => rule.type === 'checker' && rule.mode !== 'off');
}

/**
 * A stable fingerprint of exactly what would be executed, and when.
 *
 * Hashed: the command, where it runs, and its `on`/`timeoutSeconds` — all of
 * which change the behaviour the user approved. Flipping `on: stop` to
 * `on: edit` turns one run per turn into one per keystroke-sized edit, so it
 * must force re-approval. Not hashed: `message` and `mode`, which change only
 * how a result is reported, so re-wording a message doesn't nag the user.
 *
 * Fields are JSON-encoded rather than concatenated: with a plain separator,
 * {run: 'echo hi', cwd: '.'} and {run: 'echo', cwd: 'hi .'} hash identically,
 * which would let a repo shift text across the boundary and keep its approval.
 */
export function fingerprint(rules: readonly CheckerRule[]): string {
  const material = rules
    .map((rule) => JSON.stringify([rule.id, rule.run, rule.cwd, rule.on, rule.timeoutSeconds]))
    .sort()
    .join('\n');
  return createHash('sha256').update(material).digest('hex');
}

interface TrustFile {
  readonly version: 1;
  readonly entries: Record<string, { readonly fingerprint: string; readonly approvedAt: string }>;
}

function readTrustFile(): TrustFile {
  const path = trustFilePath();
  if (!existsSync(path)) return { version: 1, entries: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<TrustFile>;
    return { version: 1, entries: parsed.entries ?? {} };
  } catch {
    // A corrupt trust file means "nothing is trusted" — the safe direction.
    return { version: 1, entries: {} };
  }
}

/**
 * Key on the config's own absolute path, so approving one repo never approves
 * another. `resolve` matters: a relative path would collapse every repo onto
 * the one shared key "rulekeep.yaml", making a single approval cover them all.
 */
function keyFor(configPath: string): string {
  return resolve(configPath).replace(/\\/g, '/');
}

export function isTrusted(configPath: string, rules: readonly CheckerRule[]): boolean {
  if (rules.length === 0) return true; // nothing to run, nothing to approve
  const entry = readTrustFile().entries[keyFor(configPath)];
  return entry !== undefined && entry.fingerprint === fingerprint(rules);
}

export function trust(configPath: string, rules: readonly CheckerRule[]): void {
  const path = trustFilePath();
  mkdirSync(dirname(path), { recursive: true });

  const current = readTrustFile();
  const next: TrustFile = {
    version: 1,
    entries: {
      ...current.entries,
      [keyFor(configPath)]: { fingerprint: fingerprint(rules), approvedAt: new Date().toISOString() },
    },
  };
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

/** Returns true only if an approval was actually removed, so a caller never claims to have revoked nothing. */
export function revoke(configPath: string): boolean {
  const path = trustFilePath();
  const current = readTrustFile();
  const entries = { ...current.entries };
  if (entries[keyFor(configPath)] === undefined) return false;
  delete entries[keyFor(configPath)];
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`, 'utf8');
  return true;
}

/**
 * The one-time notice shown when a repo wants to run checkers that haven't
 * been approved. Returns undefined when there's nothing to say — either there
 * are no checkers, or they're already trusted.
 */
export function untrustedNotice(configPath: string, rules: readonly CheckerRule[]): string | undefined {
  if (rules.length === 0 || isTrusted(configPath, rules)) return undefined;

  const noun = rules.length === 1 ? 'command' : 'commands';
  const width = Math.max(...rules.map((rule) => rule.run.length));
  const lines = rules.map((rule) => `  ${rule.run.padEnd(width)}  (${rule.id})`);

  return [
    `rulekeep: this repo's rulekeep.yaml wants to run ${rules.length} ${noun}:`,
    ...lines,
    'Run /rulekeep:trust to allow them. Other rules are active.',
  ].join('\n');
}
