/**
 * Finds and reads holdfast.yaml (the only impure part of config handling —
 * the engine's config.ts only ever sees the text). Walks up from a starting
 * directory the way most project-config loaders do, so a hook running from a
 * subfolder still finds the repo-root config.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseConfig, type Config, type ConfigError } from '../engine/config.js';

export type LoadResult =
  | { readonly ok: true; readonly config: Config; readonly path: string }
  | { readonly ok: false; readonly errors: readonly ConfigError[]; readonly path?: string }
  /** No holdfast.yaml anywhere above `startDir` — not an error, just "nothing to enforce yet". */
  | { readonly ok: false; readonly errors: []; readonly path: undefined };

const CONFIG_FILENAME = 'holdfast.yaml';
const MAX_ANCESTORS = 50; // generous upper bound; stops a symlink loop from spinning forever

export function findConfigPath(startDir: string): string | undefined {
  let dir = startDir;
  for (let i = 0; i < MAX_ANCESTORS; i += 1) {
    const candidate = join(dir, CONFIG_FILENAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined; // reached the filesystem root
    dir = parent;
  }
  return undefined;
}

export function loadConfig(startDir: string): LoadResult {
  const path = findConfigPath(startDir);
  if (!path) return { ok: false, errors: [], path: undefined };

  const source = readFileSync(path, 'utf8');
  const result = parseConfig(source);
  if (!result.ok) return { ok: false, errors: result.errors, path };
  return { ok: true, config: result.config, path };
}
