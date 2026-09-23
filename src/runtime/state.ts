/**
 * Per-session state on disk (docs/03-architecture.md "Per-session state").
 * Keyed by agent + session id so concurrent sessions never collide, and
 * stored in the OS temp folder so it works the same for every agent.
 *
 * The active change log covers the current turn. A git working-tree baseline
 * is refreshed after each allowed stop so shell edits are included without
 * carrying findings into the next turn.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentName, FileChange } from "../engine/events.js";
import { showAtRef, workingTreePaths } from "./git.js";

const ROOT_DIR_NAME = "rulekeep";
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function safe(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function sessionDir(agent: AgentName, sessionId: string): string {
  return join(tmpdir(), ROOT_DIR_NAME, `${safe(agent)}-${safe(sessionId)}`);
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

/** Appends one FileChange to this session's change log. Idempotent to call repeatedly. */
export function recordChange(
  agent: AgentName,
  sessionId: string,
  change: FileChange,
): void {
  const dir = sessionDir(agent, sessionId);
  ensureDir(dir);
  appendFileSync(
    join(dir, "changes.jsonl"),
    `${JSON.stringify(change)}\n`,
    "utf8",
  );
}

/**
 * All changes recorded this session, collapsed to one entry per path (the
 * last recorded `after` wins, but `before` is kept from the *first* time the
 * path was touched, so it still reflects what the file looked like before
 * the session started editing it).
 */
export function readChanges(
  agent: AgentName,
  sessionId: string,
): readonly FileChange[] {
  const path = join(sessionDir(agent, sessionId), "changes.jsonl");
  if (!existsSync(path)) return [];

  const firstBefore = new Map<string, string | null>();
  const lastAfter = new Map<string, string | null>();
  const order: string[] = [];

  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    const change = JSON.parse(line) as FileChange;
    if (!firstBefore.has(change.path)) {
      firstBefore.set(change.path, change.before);
      order.push(change.path);
    }
    lastAfter.set(change.path, change.after);
  }

  return order.map((path) => ({
    path,
    before: firstBefore.get(path) ?? null,
    after: lastAfter.get(path) ?? null,
  }));
}

const RETRY_FILE = "stop-retries.json";
const BASELINE_FILE = "baseline.json";
const GIVEN_UP_FILE = "given-up.json";

interface Baseline {
  readonly repoRoot: string;
  readonly paths: Record<string, string | null>;
}

export function ensureSessionBaseline(
  agent: AgentName,
  sessionId: string,
  repoRoot: string,
): void {
  const dir = sessionDir(agent, sessionId);
  ensureDir(dir);
  const path = join(dir, BASELINE_FILE);
  if (existsSync(path)) {
    try {
      const existing = JSON.parse(
        readFileSync(path, "utf8"),
      ) as Partial<Baseline>;
      if (existing.repoRoot === repoRoot) return;
    } catch {
      // Rebuild malformed state below.
    }
    for (const entry of ["changes.jsonl", RETRY_FILE, GIVEN_UP_FILE])
      rmSync(join(dir, entry), { force: true });
  }

  const paths: Record<string, string | null> = {};
  for (const changedPath of workingTreePaths(repoRoot)) {
    const absolute = join(repoRoot, changedPath);
    paths[changedPath] = existsSync(absolute)
      ? readFileSync(absolute, "utf8")
      : null;
  }
  writeFileSync(path, JSON.stringify({ repoRoot, paths }), "utf8");
}

export function readSessionBaseline(
  agent: AgentName,
  sessionId: string,
): Baseline {
  const path = join(sessionDir(agent, sessionId), BASELINE_FILE);
  if (!existsSync(path)) return { repoRoot: "", paths: {} };
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as Partial<Baseline>;
    return data.paths && typeof data.paths === "object"
      ? {
          repoRoot: typeof data.repoRoot === "string" ? data.repoRoot : "",
          paths: data.paths,
        }
      : { repoRoot: "", paths: {} };
  } catch {
    return { repoRoot: "", paths: {} };
  }
}

export function changesSinceSessionBaseline(
  agent: AgentName,
  sessionId: string,
  repoRoot: string,
): readonly FileChange[] {
  const baseline = readSessionBaseline(agent, sessionId);
  return workingTreePaths(repoRoot).map((path) => ({
    path,
    before: baseline.paths[path] ?? showAtRef(repoRoot, "HEAD", path),
    after: readFileOrNull(join(repoRoot, path)),
  }));
}

function readFileOrNull(path: string): string | null {
  try {
    return statSync(path).isFile() ? readFileSync(path, "utf8") : null;
  } catch {
    return null;
  }
}

export function closeTurn(
  agent: AgentName,
  sessionId: string,
  repoRoot: string,
): void {
  const dir = sessionDir(agent, sessionId);
  const active = join(dir, "changes.jsonl");
  if (existsSync(active)) {
    let next = 1;
    for (const entry of readdirSync(dir)) {
      const match = /^changes\.(\d+)\.jsonl$/.exec(entry);
      if (match) next = Math.max(next, Number(match[1]) + 1);
    }
    writeFileSync(join(dir, `changes.${next}.jsonl`), readFileSync(active));
    rmSync(active, { force: true });
  }

  const paths: Record<string, string | null> = {};
  for (const path of workingTreePaths(repoRoot))
    paths[path] = readFileOrNull(join(repoRoot, path));
  writeFileSync(
    join(dir, BASELINE_FILE),
    JSON.stringify({ repoRoot, paths }),
    "utf8",
  );
}

export function readGivenUp(
  agent: AgentName,
  sessionId: string,
): readonly string[] {
  const path = join(sessionDir(agent, sessionId), GIVEN_UP_FILE);
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return Array.isArray(data) &&
      data.every((value): value is string => typeof value === "string")
      ? data
      : [];
  } catch {
    return [];
  }
}

export function addGivenUp(
  agent: AgentName,
  sessionId: string,
  fingerprints: readonly string[],
): void {
  const values = new Set([...readGivenUp(agent, sessionId), ...fingerprints]);
  const dir = sessionDir(agent, sessionId);
  ensureDir(dir);
  writeFileSync(join(dir, GIVEN_UP_FILE), JSON.stringify([...values]), "utf8");
}

export function readStopRetries(agent: AgentName, sessionId: string): number {
  const path = join(sessionDir(agent, sessionId), RETRY_FILE);
  if (!existsSync(path)) return 0;
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as { count?: number };
    return typeof data.count === "number" ? data.count : 0;
  } catch {
    return 0;
  }
}

export function writeStopRetries(
  agent: AgentName,
  sessionId: string,
  count: number,
): void {
  const dir = sessionDir(agent, sessionId);
  ensureDir(dir);
  writeFileSync(join(dir, RETRY_FILE), JSON.stringify({ count }), "utf8");
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
