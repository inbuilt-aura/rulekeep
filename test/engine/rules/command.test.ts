import { describe, expect, it } from 'vitest';
import type { CommandRule } from '../../../src/engine/config.js';
import type { HoldfastEvent } from '../../../src/engine/events.js';
import { checkCommandRule } from '../../../src/engine/rules/command.js';

const rule = (overrides: Partial<CommandRule> = {}): CommandRule => ({
  id: 'no-force-push',
  type: 'command',
  mode: 'block',
  allowOverride: false,
  message: 'Never force-push. Ask the user instead.',
  match: /git\s+push\b.*\s(--force|-f)\b/,
  ...overrides,
});

const beforeCommand = (command: string): HoldfastEvent => ({
  kind: 'before-command',
  agent: 'claude-code',
  sessionId: 's1',
  repoRoot: '/repo',
  command,
});

describe('checkCommandRule', () => {
  it('fires when the command matches, even mid-way through a longer command', () => {
    const findings = checkCommandRule(rule(), beforeCommand('cd app && git push origin main --force'));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ ruleId: 'no-force-push', mode: 'block' });
  });

  it('does not fire on an allowed command that only looks similar', () => {
    const findings = checkCommandRule(rule(), beforeCommand('git push origin main'));
    expect(findings).toEqual([]);
  });

  it('does not fire for any other event kind', () => {
    const event: HoldfastEvent = {
      kind: 'after-edit',
      agent: 'claude-code',
      sessionId: 's1',
      repoRoot: '/repo',
      changes: [],
    };
    expect(checkCommandRule(rule(), event)).toEqual([]);
  });

  it('is disabled by mode: off', () => {
    const findings = checkCommandRule(rule({ mode: 'off' }), beforeCommand('git push --force'));
    expect(findings).toEqual([]);
  });
});
