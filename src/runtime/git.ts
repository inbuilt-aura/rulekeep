/**
 * Git plumbing for CI mode (docs/03-architecture.md "In CI: compare with the
 * base branch"). Every changed file since `baseRef`, plus anything still
 * uncommitted in the working tree, each as a FileChange the engine can grade.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { FileChange } from "../engine/events.js";

function git(args: readonly string[], repoRoot: string): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

export function showAtRef(
  repoRoot: string,
  ref: string,
  path: string,
): string | null {
  try {
    return git(["show", `${ref}:${path}`], repoRoot);
  } catch {
    return null; // the file didn't exist at that ref
  }
}

/**
 * Returns null for anything that is not a readable text file.
 *
 * `git status` reports an untracked DIRECTORY as a single entry ("node_modules/"),
 * not its contents, so this is handed real directories on any repo with
 * untracked folders — which is most of them. Reading one throws EISDIR, and an
 * unhandled throw here crashed the whole `check` command. A binary file is
 * likewise not something the rules can grade.
 */
function readWorkingTreeFile(repoRoot: string, path: string): string | null {
  const absolute = join(repoRoot, path);
  try {
    if (!statSync(absolute).isFile()) return null;
    return readFileSync(absolute, "utf8");
  } catch {
    // Missing, unreadable, or vanished between the status call and now.
    return null;
  }
}

/** Paths changed between `baseRef` and the working tree, committed or not, deduplicated. */
export function workingTreePaths(repoRoot: string): readonly string[] {
  let status: string;
  try {
    status = git(["status", "--porcelain=v1", "-z"], repoRoot);
  } catch {
    return [];
  }
  const paths = new Set<string>();
  for (const entry of status.split("\0")) {
    if (!entry) continue;
    const path = entry.includes(" -> ")
      ? entry.split(" -> ")[1]
      : entry.slice(3);
    if (!path) continue;
    const trimmed = path.trim();
    if (trimmed === "" || trimmed.endsWith("/")) continue;
    paths.add(trimmed);
  }
  try {
    for (const path of git(
      ["ls-files", "--others", "--exclude-standard", "-z"],
      repoRoot,
    ).split("\0")) {
      if (path) paths.add(path);
    }
  } catch {
    // A non-git workspace is valid for hook tests and fails open.
  }
  return [...paths];
}

function changedPaths(repoRoot: string, baseRef: string): readonly string[] {
  const committed = git(
    ["diff", "--name-only", "-z", `${baseRef}...HEAD`],
    repoRoot,
  );
  const uncommitted = workingTreePaths(repoRoot);

  const paths = new Set<string>();
  for (const path of committed.split("\0")) if (path) paths.add(path);
  // `git status --porcelain` lines look like "XY path", or "XY orig -> path" for a rename.
  for (const path of uncommitted) paths.add(path);
  return [...paths];
}

export function changesSinceRef(
  repoRoot: string,
  baseRef: string,
): readonly FileChange[] {
  return changedPaths(repoRoot, baseRef).map((path) => ({
    path,
    before: showAtRef(repoRoot, baseRef, path),
    after: readWorkingTreeFile(repoRoot, path),
  }));
}
