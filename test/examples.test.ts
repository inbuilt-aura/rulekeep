import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/engine/config.js';

// Guards against the shipped example silently drifting out of sync with the
// parser — a broken example is a worse first impression than none at all.
describe('examples/lifeworld/holdfast.yaml', () => {
  it('parses with no errors', () => {
    const source = readFileSync(new URL('../examples/lifeworld/holdfast.yaml', import.meta.url), 'utf8');
    const result = parseConfig(source);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.errors.map((e) => `line ${e.line}: ${e.message}`).join('\n'));
    }
    expect(result.config.rules.length).toBeGreaterThanOrEqual(8);
  });
});
