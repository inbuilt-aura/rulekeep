import { describe, expect, it } from 'vitest';
import type { TestGuardRule } from '../../../src/engine/config.js';
import type { FileChange, RulekeepEvent } from '../../../src/engine/events.js';
import { checkTestGuardRule } from '../../../src/engine/rules/testGuard.js';

const rule = (overrides: Partial<TestGuardRule> = {}): TestGuardRule => ({
  id: 'keep-tests-honest',
  type: 'test-guard',
  mode: 'block',
  allowOverride: false,
  message: '',
  matchesPath: (path) => path.endsWith('.test.ts'),
  checks: ['skip-or-focus', 'file-deleted', 'assertions-removed'],
  ...overrides,
});

const afterEdit = (changes: readonly FileChange[]): RulekeepEvent => ({
  kind: 'after-edit',
  agent: 'claude-code',
  sessionId: 's1',
  repoRoot: '/repo',
  changes,
});

describe('checkTestGuardRule — skip-or-focus', () => {
  it('fires when .skip( is added to a test', () => {
    const change: FileChange = {
      path: 'app/src/sum.test.ts',
      before: "test('adds', () => { expect(sum(2, 3)).toBe(5); });\n",
      after: "test.skip('adds', () => { expect(sum(2, 3)).toBe(5); });\n",
    };
    const findings = checkTestGuardRule(rule(), afterEdit([change]));
    expect(findings.some((f) => f.ruleId === 'keep-tests-honest')).toBe(true);
  });

  it('fires when .only( is added', () => {
    const change: FileChange = { path: 'app/src/sum.test.ts', before: '', after: "it.only('x', () => {});\n" };
    expect(checkTestGuardRule(rule(), afterEdit([change]))).toHaveLength(1);
  });

  it('does not fire on a test with no skip or focus', () => {
    const change: FileChange = {
      path: 'app/src/sum.test.ts',
      before: "test('adds', () => {});\n",
      after: "test('adds two numbers', () => { expect(sum(2, 3)).toBe(5); });\n",
    };
    expect(checkTestGuardRule(rule(), afterEdit([change]))).toEqual([]);
  });

  it('can be disabled per-check via the checks list', () => {
    const change: FileChange = { path: 'app/src/sum.test.ts', before: '', after: "it.only('x', () => {});\n" };
    const findings = checkTestGuardRule(rule({ checks: ['file-deleted', 'assertions-removed'] }), afterEdit([change]));
    expect(findings).toEqual([]);
  });
});

describe('checkTestGuardRule — file-deleted', () => {
  it('fires when a matching test file is deleted', () => {
    const change: FileChange = { path: 'app/src/sum.test.ts', before: "test('x', () => {});\n", after: null };
    const findings = checkTestGuardRule(rule(), afterEdit([change]));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ path: 'app/src/sum.test.ts' });
  });

  it('does not fire for a newly created file', () => {
    const change: FileChange = { path: 'app/src/sum.test.ts', before: null, after: "test('x', () => {});\n" };
    expect(checkTestGuardRule(rule(), afterEdit([change]))).toEqual([]);
  });
});

describe('checkTestGuardRule — assertions-removed', () => {
  it('fires when more assertions are removed than added', () => {
    const change: FileChange = {
      path: 'app/src/sum.test.ts',
      before: "test('x', () => {\n  expect(sum(2, 3)).toBe(5);\n  expect(sum(0, 0)).toBe(0);\n});\n",
      after: "test('x', () => {\n  expect(sum(2, 3)).toBe(5);\n});\n",
    };
    const findings = checkTestGuardRule(rule(), afterEdit([change]));
    expect(findings).toHaveLength(1);
  });

  it('does not fire when an assertion is reworded (one removed, one added)', () => {
    const change: FileChange = {
      path: 'app/src/sum.test.ts',
      before: "test('x', () => {\n  expect(sum(2, 3)).toBe(5);\n});\n",
      after: "test('x', () => {\n  expect(sum(2, 3)).toStrictEqual(5);\n});\n",
    };
    expect(checkTestGuardRule(rule(), afterEdit([change]))).toEqual([]);
  });

  it('does not fire when assertions are only added', () => {
    const change: FileChange = {
      path: 'app/src/sum.test.ts',
      before: "test('x', () => {\n  expect(sum(2, 3)).toBe(5);\n});\n",
      after: "test('x', () => {\n  expect(sum(2, 3)).toBe(5);\n  expect(sum(1, 1)).toBe(2);\n});\n",
    };
    expect(checkTestGuardRule(rule(), afterEdit([change]))).toEqual([]);
  });
});
