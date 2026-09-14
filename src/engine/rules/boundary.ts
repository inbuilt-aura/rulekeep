/**
 * `boundary` rules: which folders may import which (docs/02-what-we-build.md
 * "3. boundary"). Reads the import lines an edit added and checks the
 * specifier against a disallowed list.
 *
 * v1 matches import specifiers as written ("@/repositories", "../repositories")
 * rather than resolving tsconfig path aliases — see "What it does not do".
 */
import { ruleAppliesTo, type BoundaryRule } from '../config.js';
import { changedLines } from '../diff.js';
import type { Finding, HoldfastEvent } from '../events.js';
import { findOverride } from '../overrides.js';

// Matches `import ... from '<spec>'`, `import '<spec>'`, and `require('<spec>')`.
const IMPORT_SPECIFIER = /(?:from\s+|require\()\s*['"]([^'"]+)['"]/;

function specifierOf(line: string): string | undefined {
  return IMPORT_SPECIFIER.exec(line)?.[1];
}

function isDisallowed(specifier: string, disallow: readonly string[]): boolean {
  return disallow.some((prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`));
}

export function checkBoundaryRule(rule: BoundaryRule, event: HoldfastEvent): readonly Finding[] {
  if ((event.kind !== 'after-edit' && event.kind !== 'stop') || rule.mode === 'off') return [];

  const findings: Finding[] = [];
  for (const change of event.changes) {
    if (!ruleAppliesTo(rule, change.path)) continue;

    const { added } = changedLines(change.before, change.after);
    const afterLines = change.after === null ? [] : change.after.replace(/\r\n/g, '\n').split('\n');

    for (const { line, text } of added) {
      const specifier = specifierOf(text);
      if (!specifier || !isDisallowed(specifier, rule.disallow)) continue;

      const base: Finding = {
        ruleId: rule.id,
        mode: rule.mode,
        message: rule.message,
        path: change.path,
        line,
        excerpt: text.trim(),
      };
      if (!rule.allowOverride) {
        findings.push(base);
        continue;
      }
      const override = findOverride(rule.id, afterLines, line);
      findings.push(override ? { ...base, override } : base);
    }
  }
  return findings;
}
