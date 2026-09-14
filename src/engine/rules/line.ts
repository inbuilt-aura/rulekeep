/**
 * `line` rules: matched against the lines an edit actually added or removed
 * (docs/02-what-we-build.md "2. line"). Pre-existing code that wasn't touched
 * never fires, because changedLines() only returns what changed.
 */
import { ruleAppliesTo, type LineRule } from '../config.js';
import { changedLines, type ChangedLine } from '../diff.js';
import type { Finding, HoldfastEvent } from '../events.js';
import { findOverride } from '../overrides.js';

/** Lines this long are skipped — minified or generated files, not real edits to review. */
const MAX_LINE_LENGTH = 2000;

function findingsFor(
  rule: LineRule,
  path: string,
  pattern: RegExp | undefined,
  hits: readonly ChangedLine[],
  afterText: string | null,
): Finding[] {
  if (!pattern) return [];
  const afterLines = afterText === null ? [] : afterText.replace(/\r\n/g, '\n').split('\n');

  const findings: Finding[] = [];
  for (const { line, text } of hits) {
    if (text.length > MAX_LINE_LENGTH || !pattern.test(text)) continue;

    const base: Finding = {
      ruleId: rule.id,
      mode: rule.mode,
      message: rule.message,
      path,
      line,
      excerpt: text.trim(),
    };

    if (!rule.allowOverride) {
      findings.push(base);
      continue;
    }
    // Overrides are only meaningful on lines that still exist — a removed
    // line can't carry a comment that silences its own removal.
    const override = afterLines.length > 0 ? findOverride(rule.id, afterLines, line) : undefined;
    findings.push(override ? { ...base, override } : base);
  }
  return findings;
}

export function checkLineRule(rule: LineRule, event: HoldfastEvent): readonly Finding[] {
  if ((event.kind !== 'after-edit' && event.kind !== 'stop') || rule.mode === 'off') return [];

  const findings: Finding[] = [];
  for (const change of event.changes) {
    if (!ruleAppliesTo(rule, change.path)) continue;
    const { added, removed } = changedLines(change.before, change.after);
    findings.push(...findingsFor(rule, change.path, rule.added, added, change.after));
    findings.push(...findingsFor(rule, change.path, rule.removed, removed, change.after));
  }
  return findings;
}
