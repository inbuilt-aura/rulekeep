import { describe, expect, it } from 'vitest';
import type { LineRule } from '../../../src/engine/config.js';
import type { FileChange, RulekeepEvent } from '../../../src/engine/events.js';
import { checkLineRule } from '../../../src/engine/rules/line.js';

const rule = (overrides: Partial<LineRule> = {}): LineRule => ({
  id: 'no-any',
  type: 'line',
  mode: 'block',
  allowOverride: true,
  message: "Don't use `any`. Use `unknown` and narrow it.",
  matchesPath: (path) => path.endsWith('.ts') || path.endsWith('.tsx'),
  added: /(:\s*any\b|\bas\s+any\b|<any>)/,
  ...overrides,
});

const afterEdit = (changes: readonly FileChange[]): RulekeepEvent => ({
  kind: 'after-edit',
  agent: 'claude-code',
  sessionId: 's1',
  repoRoot: '/repo',
  changes,
});

describe('checkLineRule', () => {
  it('fires on a newly added `as any`, with the correct line number', () => {
    const change: FileChange = {
      path: 'app/src/utils/parse.ts',
      before: 'export function parse(x: string) {\n  return x;\n}\n',
      after: 'export function parse(x: string) {\n  const data = JSON.parse(x) as any;\n  return data;\n}\n',
    };
    const findings = checkLineRule(rule(), afterEdit([change]));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'no-any',
      path: 'app/src/utils/parse.ts',
      line: 2,
      excerpt: 'const data = JSON.parse(x) as any;',
    });
  });

  it('does not fire on `any` that already existed and was not touched by this edit', () => {
    const change: FileChange = {
      before: 'const x: any = 1;\nconst y = 2;\n',
      after: 'const x: any = 1;\nconst y = 3;\n',
      path: 'app/src/legacy.ts',
    };
    expect(checkLineRule(rule(), afterEdit([change]))).toEqual([]);
  });

  it('does not fire on a file the rule does not apply to', () => {
    const change: FileChange = { path: 'app/src/style.css', before: 'a {}\n', after: 'a { color: any; }\n' };
    expect(checkLineRule(rule(), afterEdit([change]))).toEqual([]);
  });

  it('is silenced by a same-line override with a reason, but the override is still reported', () => {
    const change: FileChange = {
      path: 'app/src/utils/parse.ts',
      before: '',
      after: 'const raw = JSON.parse(text) as any; // rulekeep-ignore no-any: third-party JSON, validated below\n',
    };
    const findings = checkLineRule(rule(), afterEdit([change]));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.override).toEqual({ ruleId: 'no-any', reason: 'third-party JSON, validated below' });
  });

  it('still fires when the override comment has no reason', () => {
    const change: FileChange = {
      path: 'app/src/utils/parse.ts',
      before: '',
      after: 'const raw = x as any; // rulekeep-ignore no-any\n',
    };
    const findings = checkLineRule(rule(), afterEdit([change]));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.override).toBeUndefined();
  });

  it('ignores overrides when allowOverride is false', () => {
    const change: FileChange = {
      path: 'app/src/utils/parse.ts',
      before: '',
      after: 'const raw = x as any; // rulekeep-ignore no-any: reason\n',
    };
    const findings = checkLineRule(rule({ allowOverride: false }), afterEdit([change]));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.override).toBeUndefined();
  });

  it('skips lines over 2000 characters (generated/minified content)', () => {
    const longLine = `const x = "${'a'.repeat(2000)}" as any;`;
    const change: FileChange = { path: 'app/src/generated.ts', before: '', after: `${longLine}\n` };
    expect(checkLineRule(rule(), afterEdit([change]))).toEqual([]);
  });

  it('matches `removed` lines against the line rule separately from `added`', () => {
    const removalRule = rule({
      id: 'no-removing-guard',
      added: undefined,
      removed: /if \(!user\) return;/,
    });
    const change: FileChange = {
      path: 'app/src/auth.ts',
      before: 'if (!user) return;\ndoWork(user);\n',
      after: 'doWork(user);\n',
    };
    const findings = checkLineRule(removalRule, afterEdit([change]));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ ruleId: 'no-removing-guard', line: 1 });
  });

  it('re-runs over the whole turn at stop, not just the last edit', () => {
    const change: FileChange = {
      path: 'app/src/shell-written.ts',
      before: null,
      after: 'export const x = y as any;\n',
    };
    const stopEvent: RulekeepEvent = {
      kind: 'stop',
      agent: 'claude-code',
      sessionId: 's1',
      repoRoot: '/repo',
      changes: [change],
      finalMessage: 'Done.',
      retry: 0,
    };
    expect(checkLineRule(rule(), stopEvent)).toHaveLength(1);
  });
});
