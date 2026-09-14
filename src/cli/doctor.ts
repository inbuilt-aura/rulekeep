/**
 * `holdfast doctor` — a quick self-check a user runs when something seems
 * off (docs/02-what-we-build.md "Commands"). This build covers the checks
 * that don't need a live agent session; per-agent hook-support checks are a
 * later increment.
 */
import { loadConfig } from '../runtime/configFile.js';

const MIN_NODE_MAJOR = 22;

export function runDoctor(repoRoot: string): string {
  const lines: string[] = [];

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  lines.push(
    nodeMajor >= MIN_NODE_MAJOR
      ? `✔ Node.js ${process.versions.node} (>= ${MIN_NODE_MAJOR} required)`
      : `✘ Node.js ${process.versions.node} — holdfast needs Node ${MIN_NODE_MAJOR} or newer`,
  );

  const loaded = loadConfig(repoRoot);
  if (loaded.ok) {
    lines.push(`✔ ${loaded.path}: ${loaded.config.rules.length} rule(s), valid`);
    const offCount = loaded.config.rules.filter((r) => r.mode === 'off').length;
    if (offCount > 0) lines.push(`  (${offCount} rule(s) set to "off")`);
  } else if (loaded.path === undefined) {
    lines.push('✘ No holdfast.yaml found above this directory. Run /holdfast:setup to create one.');
  } else {
    lines.push(`✘ ${loaded.path} is invalid:`);
    for (const error of loaded.errors) lines.push(`    line ${error.line}: ${error.message}`);
  }

  return lines.join('\n');
}
