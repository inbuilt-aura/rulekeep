import { describe, expect, it } from 'vitest';
import type { ProseRule } from '../../../src/engine/config.js';
import type { RulekeepEvent } from '../../../src/engine/events.js';
import { checkProseRule } from '../../../src/engine/rules/prose.js';

const rule: ProseRule = {
  id: 'no-filler-words',
  type: 'prose',
  mode: 'warn',
  allowOverride: false,
  message: 'Say it plainly.',
  match: /\b(load-bearing|delve|seamlessly)\b/i,
};

const stop = (finalMessage: string | null): RulekeepEvent => ({
  kind: 'stop',
  agent: 'claude-code',
  sessionId: 's1',
  repoRoot: '/repo',
  changes: [],
  finalMessage,
  retry: 0,
});

describe('checkProseRule', () => {
  it('fires when the final message contains a banned phrase', () => {
    const findings = checkProseRule(rule, stop('This function is load-bearing for the whole app.'));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.excerpt).toBe('load-bearing');
  });

  it('does not fire on a clean final message', () => {
    expect(checkProseRule(rule, stop('Done. All tests pass.'))).toEqual([]);
  });

  it('is skipped, not crashed, when the agent provides no final message', () => {
    expect(checkProseRule(rule, stop(null))).toEqual([]);
  });

  it('only runs on the stop event', () => {
    const event: RulekeepEvent = { kind: 'before-command', agent: 'claude-code', sessionId: 's1', repoRoot: '/repo', command: 'delve into it' };
    expect(checkProseRule(rule, event)).toEqual([]);
  });
});
