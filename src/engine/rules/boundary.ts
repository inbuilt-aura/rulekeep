/**
 * `boundary` rules: which folders may import which (docs/02-what-we-build.md
 * "3. boundary"). Reads the import lines an edit added and checks the
 * specifier against a disallowed list.
 *
 * v1 matches import specifiers as written ("@/repositories", "../repositories")
 * rather than resolving tsconfig path aliases — see "What it does not do".
 */
import picomatch from 'picomatch';
import { ruleAppliesTo, type BoundaryRule } from '../config.js';
import { changedLines } from '../diff.js';
import type { Finding, RulekeepEvent } from '../events.js';
import { findOverride } from '../overrides.js';

// Matches `import ... from '<spec>'`, `import '<spec>'`, and `require('<spec>')`.
const IMPORT_SPECIFIER = /(?:from\s+|require\()\s*['"]([^'"]+)['"]/;

/** Glob metacharacters. A `disallow` entry without any of these is treated as a literal prefix. */
const isGlob = (value: string): boolean => /[*?[\]{}!]/.test(value);

function specifierOf(line: string): string | undefined {
  return IMPORT_SPECIFIER.exec(line)?.[1];
}

/**
 * A `disallow` entry matches either as a literal specifier prefix
 * ("@/repositories" also covers "@/repositories/user") or, when it contains
 * glob syntax, as a glob (a `db` glob covers "../db/client").
 *
 * Supporting both matters: the prefix form is what the docs describe, but a
 * glob is the natural thing to reach for, and treating one as a literal string
 * makes the rule silently match nothing — a rule that looks active and never
 * fires is worse than one that errors.
 */
function isDisallowed(specifier: string, disallow: readonly string[]): boolean {
  // picomatch treats a leading "." as a dotfile and will not match it, even
  // with { dot: true } — so "../db/client" never matches a "db" glob. Import
  // specifiers are relative far more often than not, so the leading traversal
  // is stripped before globbing. Matching stays anchored to the path segments
  // that identify the module, which is what a boundary rule is about.
  const withoutTraversal = specifier.replace(/^(?:\.{1,2}\/)+/, '');

  return disallow.some((entry) => {
    if (specifier === entry || specifier.startsWith(`${entry}/`)) return true;
    if (!isGlob(entry)) return false;
    const matches = picomatch(entry);
    return matches(specifier) || matches(withoutTraversal);
  });
}

export function checkBoundaryRule(rule: BoundaryRule, event: RulekeepEvent): readonly Finding[] {
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
