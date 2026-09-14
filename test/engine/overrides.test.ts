import { describe, expect, it } from 'vitest';
import { findOverride } from '../../src/engine/overrides.js';

describe('findOverride', () => {
  it('matches an override on the same line', () => {
    const lines = ['const x = y as any; // holdfast-ignore no-any: legacy API, tracked in #42'];
    const result = findOverride('no-any', lines, 1);
    expect(result).toEqual({ ruleId: 'no-any', reason: 'legacy API, tracked in #42' });
  });

  it('matches an override on the line directly above', () => {
    const lines = ['// holdfast-ignore no-any: third-party JSON, validated below', 'const x = y as any;'];
    const result = findOverride('no-any', lines, 2);
    expect(result).toEqual({ ruleId: 'no-any', reason: 'third-party JSON, validated below' });
  });

  it('requires a reason: a bare ignore comment does not count', () => {
    const lines = ['const x = y as any; // holdfast-ignore no-any'];
    expect(findOverride('no-any', lines, 1)).toBeUndefined();
  });

  it('requires the rule id to match exactly', () => {
    const lines = ['const x = y as any; // holdfast-ignore no-console-log: reason here'];
    expect(findOverride('no-any', lines, 1)).toBeUndefined();
  });

  it('does not look further than one line above', () => {
    const lines = ['// holdfast-ignore no-any: reason', '', 'const x = y as any;'];
    expect(findOverride('no-any', lines, 3)).toBeUndefined();
  });
});
