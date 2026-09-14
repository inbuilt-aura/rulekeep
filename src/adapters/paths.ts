/**
 * Shared by every adapter: agents hand back absolute paths with the
 * platform's native separators — backslashes on Windows
 * (docs/03-architecture.md "What each hook receives"). The engine only ever
 * sees repo-relative, forward-slash paths, so every adapter normalizes here
 * before an event reaches it.
 */
import { relative } from 'node:path';

export function toRepoRelative(absolutePath: string, repoRoot: string): string {
  return relative(repoRoot, absolutePath).replace(/\\/g, '/');
}
