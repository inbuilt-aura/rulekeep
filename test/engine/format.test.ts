import { describe, expect, it } from 'vitest';
import { formatStopSummary, formatVerdict } from '../../src/engine/format.js';
import type { Verdict } from '../../src/engine/events.js';

describe('formatVerdict', () => {
  it('produces the exact message shape from docs/02-what-we-build.md', () => {
    const verdict: Verdict = {
      outcome: 'block',
      findings: [
        {
          ruleId: 'no-any',
          mode: 'block',
          path: 'app/src/features/world/queries.ts',
          line: 42,
          excerpt: 'const data = response as any;',
          message: "Don't use `any`. Use `unknown` and narrow it. (app/CLAUDE.md §13)",
        },
      ],
    };
    const message = formatVerdict(verdict, 'edit');
    expect(message).toContain('holdfast: this edit breaks 1 rule.');
    expect(message).toContain('no-any (block)  app/src/features/world/queries.ts:42');
    expect(message).toContain('const data = response as any;');
    expect(message).toContain("Don't use `any`.");
    expect(message).toContain('holdfast-ignore <rule-id>: <reason>');
  });

  it('pluralizes "rules" for more than one finding', () => {
    const verdict: Verdict = {
      outcome: 'block',
      findings: [
        { ruleId: 'a', mode: 'block', message: 'A' },
        { ruleId: 'b', mode: 'block', message: 'B' },
      ],
    };
    expect(formatVerdict(verdict, 'edit')).toContain('breaks 2 rules.');
  });

  it('has no footer telling the agent to fix things when the outcome is only a warning', () => {
    const verdict: Verdict = { outcome: 'warn', findings: [{ ruleId: 'a', mode: 'warn', message: 'A warning.' }] };
    const message = formatVerdict(verdict, 'edit');
    expect(message).not.toContain('Fix the edit');
  });

  it('returns an empty string when every finding was overridden', () => {
    const verdict: Verdict = {
      outcome: 'allow',
      findings: [{ ruleId: 'a', mode: 'block', message: 'A', override: { reason: 'tracked in #1' } }],
    };
    expect(formatVerdict(verdict, 'edit')).toBe('');
  });

  it('uses "command" wording for a before-command verdict', () => {
    const verdict: Verdict = { outcome: 'block', findings: [{ ruleId: 'no-force-push', mode: 'block', message: 'No.' }] };
    expect(formatVerdict(verdict, 'command')).toContain('this command breaks 1 rule.');
  });
});

describe('formatStopSummary', () => {
  it('names the still-broken rules and counts overrides', () => {
    const verdict: Verdict = {
      outcome: 'block',
      findings: [
        { ruleId: 'keep-tests-honest', mode: 'block', message: 'x' },
        { ruleId: 'no-any', mode: 'block', message: 'y', override: { reason: 'legacy' } },
      ],
    };
    const summary = formatStopSummary(verdict);
    expect(summary).toContain('rule is still broken (keep-tests-honest)');
    expect(summary).toContain('1 override used.');
  });

  it('is empty when nothing is broken and nothing was overridden', () => {
    expect(formatStopSummary({ outcome: 'allow', findings: [] })).toBe('');
  });
});
