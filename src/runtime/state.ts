/**
 * Per-session state on disk (docs/03-architecture.md "Per-session state").
 * Keyed by agent + session id so concurrent sessions never collide, and
 * stored in the OS temp folder so it works the same for every agent.
 *
 * THIS FILE IMPLEMENTS THE PRACTICAL SLICE OF THE DESIGN, NOT THE FULL SPEC:
 * the architecture doc describes a git-baseline reconciliation at stop (what
 * the repo looked like at session start, compared against `git status`).
 * That needs git plumbing this pass didn't build. What's here instead is
 * simpler and still real: every after-edit change holdfast is told about is
 * appended to the session's change log, and `stop` re-checks that whole log.
 * It catches everything the agent changed through its own edit tools; it
 * will not catch a file edited through a raw shell command with no matching
 * PostToolUse event. Closing that gap is the next increment (see
 * docs/03-architecture.md "How changes are detected").
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentName, FileChange } from '../engine/events.js';

const ROOT_DIR_NAME = 'holdfast';
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function safe(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function sessionDir(agent: AgentName, sessionId: string): string {
  return join(tmpdir(), ROOT_DIR_NAME, `${safe(agent)}-${safe(sessionId)}`);
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

/** Appends one FileChange to this session's change log. Idempotent to call repeatedly. */
export function recordChange(agent: AgentName, sessionId: string, change: FileChange): void {
  const dir = sessionDir(agent, sessionId);
  ensureDir(dir);
  appendFileSync(join(dir, 'changes.jsonl'), `${JSON.stringify(change)}\n`, 'utf8');
}

/**
 * All changes recorded this session, collapsed to one entry per path (the
 * last recorded `after` wins, but `before` is kept from the *first* time the
 * path was touched, so it still reflects what the file looked like before
 * the session started editing it).
 */
export function readChanges(agent: AgentName, sessionId: string): readonly FileChange[] {
  const path = join(sessionDir(agent, sessionId), 'changes.jsonl');
  if (!existsSync(path)) return [];

  const firstBefore = new Map<string, string | null>();
  const lastAfter = new Map<string, string | null>();
  const order: string[] = [];

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    const change = JSON.parse(line) as FileChange;
    if (!firstBefore.has(change.path)) {
      firstBefore.set(change.path, change.before);
      order.push(change.path);
    }
    lastAfter.set(change.path, change.after);
  }

  return order.map((path) => ({ path, before: firstBefore.get(path) ?? null, after: lastAfter.get(path) ?? null }));
}

const RETRY_FILE = 'stop-retries.json';

export function readStopRetries(agent: AgentName, sessionId: string): number {
  const path = join(sessionDir(agent, sessionId), RETRY_FILE);
  if (!existsSync(path)) return 0;
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as { count?: number };
    return typeof data.count === 'number' ? data.count : 0;
  } catch {
    return 0;
  }
}

export function writeStopRetries(agent: AgentName, sessionId: string, count: number): void {
  const dir = sessionDir(agent, sessionId);
  ensureDir(dir);
  writeFileSync(join(dir, RETRY_FILE), JSON.stringify({ count }), 'utf8');
}

/** Deletes session folders untouched for longer than a week. Call once per session start. */
export function cleanupStaleSessions(): void {
  const root = join(tmpdir(), ROOT_DIR_NAME);
  if (!existsSync(root)) return;

  const now = Date.now();
  for (const entry of readdirSync(root)) {
    const dir = join(root, entry);
    try {
      const stat = statSync(dir);
      if (stat.isDirectory() && now - stat.mtimeMs > STALE_AFTER_MS) {
        rmSync(dir, { recursive: true, force: true });
      }
    } catch {
      // A directory that vanished between readdir and stat, or one we can't
      // touch, is not worth failing a hook over.
    }
  }
}
