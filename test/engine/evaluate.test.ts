import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/engine/config.js';
import { evaluate } from '../../src/engine/evaluate.js';
import type { RulekeepEvent } from '../../src/engine/events.js';

const CONFIG = `
version: 1
defaults:
  mode: warn
rules:
  - id: no-force-push
    type: command
    match: '--force'
    mode: block
    allowOverride: false
    message: Never force-push.

  - id: no-any
    type: line
    files: ['**/*.ts']
    added: 'as any'
    mode: block
    message: "Don't use any."

  - id: no-console-log
    type: line
    files: ['**/*.ts']
    added: 'console\\.log\\('
    message: Use the logger.
`;

function config() {
  const result = parseConfig(CONFIG);
  if (!result.ok) throw new Error(`fixture config is invalid: ${JSON.stringify(result.errors)}`);
  return result.config;
}

describe('evaluate (end to end through a real parsed config)', () => {
  it('walks the whole story from docs/02-what-we-build.md: a command is blocked with a reason', () => {
    const event: RulekeepEvent = {
      kind: 'before-command',
      agent: 'claude-code',
      sessionId: 's1',
      repoRoot: '/repo',
      command: 'git push origin main --force',
    };
    const verdict = evaluate(config().rules, event);
    expect(verdict.outcome).toBe('block');
    expect(verdict.findings.map((f) => f.ruleId)).toEqual(['no-force-push']);
  });

  it('reports both a block and a warn finding on the same edit, and the outcome is the stricter one', () => {
    const event: RulekeepEvent = {
      kind: 'after-edit',
      agent: 'claude-code',
      sessionId: 's1',
      repoRoot: '/repo',
      changes: [
        {
          path: 'app/src/x.ts',
          before: '',
          after: 'const data = response as any;\nconsole.log(data);\n',
        },
      ],
    };
    const verdict = evaluate(config().rules, event);
    expect(verdict.outcome).toBe('block'); // no-any is block-mode; no-console-log is warn-mode
    expect(verdict.findings.map((f) => f.ruleId).sort()).toEqual(['no-any', 'no-console-log']);
  });

  it('produces "allow" with no findings for a clean edit', () => {
    const event: RulekeepEvent = {
      kind: 'after-edit',
      agent: 'claude-code',
      sessionId: 's1',
      repoRoot: '/repo',
      changes: [{ path: 'app/src/x.ts', before: '', after: 'export const x = 1;\n' }],
    };
    const verdict = evaluate(config().rules, event);
    expect(verdict).toEqual({ outcome: 'allow', findings: [] });
  });

  it('caps findings at 20 so a hook response never grows unbounded', () => {
    const manyLines = Array.from({ length: 30 }, (_, i) => `const v${i} = x${i} as any;`).join('\n');
    const event: RulekeepEvent = {
      kind: 'after-edit',
      agent: 'claude-code',
      sessionId: 's1',
      repoRoot: '/repo',
      changes: [{ path: 'app/src/many.ts', before: '', after: `${manyLines}\n` }],
    };
    const verdict = evaluate(config().rules, event);
    expect(verdict.findings.length).toBe(20);
  });
});
