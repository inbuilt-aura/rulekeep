/**
 * `test-guard` rules: catches the most common way an agent "fixes" a failing
 * test — switching it off (docs/02-what-we-build.md "4. test-guard"). Fixed,
 * built-in checks; no regex needed from the user.
 */
import { ruleAppliesTo, type TestGuardRule } from '../config.js';
import { changedLines } from '../diff.js';
import type { Finding, RulekeepEvent } from '../events.js';
import { findOverride } from '../overrides.js';

const SKIP_OR_FOCUS =
  /\.(skip|only|todo)\(|^\s*xit\s*\(|^\s*xdescribe\s*\(|skip:\s*true|@pytest\.mark\.skip|\bt\.Skip\(/;
const ASSERTION = /\bexpect\(|\bassert[.(]|\bshould\b/;

function findSkipOrFocus(rule: TestGuardRule, path: string, before: string | null, after: string | null): Finding[] {
  const { added } = changedLines(before, after);
  const afterLines = after === null ? [] : after.replace(/\r\n/g, '\n').split('\n');
  const findings: Finding[] = [];

  for (const { line, text } of added) {
    if (!SKIP_OR_FOCUS.test(text)) continue;
    const base: Finding = {
      ruleId: rule.id,
      mode: rule.mode,
      message: rule.message || 'A test was skipped or focused. Fix the test instead of disabling it.',
      path,
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
  return findings;
}

function findDeletedFile(rule: TestGuardRule, path: string, before: string | null, after: string | null): Finding[] {
  if (before === null || after !== null) return [];
  return [
    {
      ruleId: rule.id,
      mode: rule.mode,
      message: rule.message || 'A test file was deleted. Delete the code it tested too, or keep the test.',
      path,
    },
  ];
}

function findRemovedAssertions(rule: TestGuardRule, path: string, before: string | null, after: string | null): Finding[] {
  if (before === null || after === null) return [];
  const { added, removed } = changedLines(before, after);
  const addedAssertions = added.filter(({ text }) => ASSERTION.test(text)).length;
  const removedAssertions = removed.filter(({ text }) => ASSERTION.test(text)).length;
  if (removedAssertions <= addedAssertions) return [];

  return [
    {
      ruleId: rule.id,
      mode: rule.mode,
      message:
        rule.message ||
        `${removedAssertions - addedAssertions} more assertion(s) were removed than added. Fix the code under test, not the test.`,
      path,
    },
  ];
}

export function checkTestGuardRule(rule: TestGuardRule, event: RulekeepEvent): readonly Finding[] {
  if ((event.kind !== 'after-edit' && event.kind !== 'stop') || rule.mode === 'off') return [];

  const findings: Finding[] = [];
  for (const change of event.changes) {
    if (!ruleAppliesTo(rule, change.path)) continue;

    if (rule.checks.includes('skip-or-focus')) {
      findings.push(...findSkipOrFocus(rule, change.path, change.before, change.after));
    }
    if (rule.checks.includes('file-deleted')) {
      findings.push(...findDeletedFile(rule, change.path, change.before, change.after));
    }
    if (rule.checks.includes('assertions-removed')) {
      findings.push(...findRemovedAssertions(rule, change.path, change.before, change.after));
    }
  }
  return findings;
}
