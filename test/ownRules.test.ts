/**
 * rulekeep's own rulekeep.yaml (docs/09-dogfooding.md).
 *
 * A config file is the one thing in this repo with no compiler and no type
 * checker behind it, so it can rot silently: a rule that no longer parses, or
 * one whose globs stopped matching anything, looks exactly like a clean run.
 * These assert the properties that actually matter — it parses, and the rules
 * are scoped where they claim to be.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseConfig, type Rule } from '../src/engine/config.js';

const source = readFileSync(new URL('../rulekeep.yaml', import.meta.url), 'utf8');
const result = parseConfig(source);

const ruleById = (id: string): Rule => {
  if (!result.ok) throw new Error('config did not parse');
  const rule = result.config.rules.find((candidate) => candidate.id === id);
  if (!rule) throw new Error(`no rule with id "${id}"`);
  return rule;
};

describe('rulekeep.yaml (our own rules)', () => {
  it('parses with no errors', () => {
    if (!result.ok) {
      throw new Error(result.errors.map((error) => `line ${error.line}: ${error.message}`).join('\n'));
    }
    expect(result.config.rules.length).toBeGreaterThanOrEqual(10);
  });

  it('keeps the engine-purity rule pointed at the engine', () => {
    const rule = ruleById('engine-stays-pure');
    expect(rule.type).toBe('boundary');
    expect(rule.mode).toBe('block');
    expect(rule.matchesPath?.('src/engine/evaluate.ts')).toBe(true);
    expect(rule.matchesPath?.('src/runtime/checker.ts')).toBe(false);
    if (rule.type === 'boundary') {
      expect(rule.disallow).toContain('node:fs');
      expect(rule.disallow).toContain('node:child_process');
    }
  });

  it('scopes no-any to src, not test', () => {
    // Test files legitimately contain `as any` inside fixture strings — it is
    // the thing under test. Including test/ produced 20 false alarms on this
    // repo's own history and caught nothing true.
    const rule = ruleById('no-any');
    expect(rule.matchesPath?.('src/engine/config.ts')).toBe(true);
    expect(rule.matchesPath?.('test/engine/config.test.ts')).toBe(false);
  });

  it('lets the CLI write to stdout, but nothing else', () => {
    // A stray console.log inside a hook corrupts the JSON the agent reads.
    const rule = ruleById('no-console-in-src');
    expect(rule.matchesPath?.('src/runtime/checker.ts')).toBe(true);
    expect(rule.matchesPath?.('src/cli/main.ts')).toBe(false);
  });

  it('makes the rules that must not be bypassed non-overridable', () => {
    expect(ruleById('no-force-push').allowOverride).toBe(false);
    expect(ruleById('keep-tests-honest').allowOverride).toBe(false);
  });

  it('declares its checkers on stop, never on every edit', () => {
    const checkers = result.ok ? result.config.rules.filter((rule) => rule.type === 'checker') : [];
    expect(checkers.length).toBeGreaterThan(0);
    for (const checker of checkers) {
      if (checker.type !== 'checker') continue;
      // `npm run test` on every keystroke-sized edit would make the tool unusable.
      expect(checker.on).toBe('stop');
      expect(checker.timeoutSeconds).toBeGreaterThan(0);
    }
  });
});
