/**
 * Git plumbing for CI mode (docs/03-architecture.md "In CI: compare with the
 * base branch"). Every changed file since `baseRef`, plus anything still
 * uncommitted in the working tree, each as a FileChange the engine can grade.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FileChange } from '../engine/events.js';

function git(args: readonly string[], repoRoot: string): string {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function showAtRef(repoRoot: string, ref: string, path: string): string | null {
  try {
    return git(['show', `${ref}:${path}`], repoRoot);
  } catch {
    return null; // the file didn't exist at that ref
  }
}

function readWorkingTreeFile(repoRoot: string, path: string): string | null {
  const absolute = join(repoRoot, path);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : null;
}

/** Paths changed between `baseRef` and the working tree, committed or not, deduplicated. */
function changedPaths(repoRoot: string, baseRef: string): readonly string[] {
  const committed = git(['diff', '--name-only', '-z', `${baseRef}...HEAD`], repoRoot);
  const uncommitted = git(['status', '--porcelain=v1', '-z'], repoRoot);

  const paths = new Set<string>();
  for (const path of committed.split('\0')) if (path) paths.add(path);
  // `git status --porcelain` lines look like "XY path", or "XY orig -> path" for a rename.
  for (const entry of uncommitted.split('\0')) {
    if (!entry) continue;
    const path = entry.includes(' -> ') ? entry.split(' -> ')[1] : entry.slice(3);
    if (path) paths.add(path.trim());
  }
  return [...paths];
}

export function changesSinceRef(repoRoot: string, baseRef: string): readonly FileChange[] {
  return changedPaths(repoRoot, baseRef).map((path) => ({
    path,
    before: showAtRef(repoRoot, baseRef, path),
    after: readWorkingTreeFile(repoRoot, path),
  }));
}
