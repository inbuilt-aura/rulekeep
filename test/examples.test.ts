import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/engine/config.js';

// Guards against the shipped example silently drifting out of sync with the
// parser — a broken example is a worse first impression than none at all.
describe('examples/lifeworld/rulekeep.yaml', () => {
  it('parses with no errors', () => {
    const source = readFileSync(new URL('../examples/lifeworld/rulekeep.yaml', import.meta.url), 'utf8');
    const result = parseConfig(source);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.errors.map((e) => `line ${e.line}: ${e.message}`).join('\n'));
    }
    expect(result.config.rules.length).toBeGreaterThanOrEqual(8);
  });

  it('actually scopes the rules that declare a scope', () => {
    // The example's boundary rule uses `from:`. When the parser ignored that
    // field the rule silently applied to every file in the repo — it still
    // parsed, still looked right, and was wrong. Scope is checked, not assumed.
    const source = readFileSync(new URL('../examples/lifeworld/rulekeep.yaml', import.meta.url), 'utf8');
    const result = parseConfig(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const boundary = result.config.rules.find((rule) => rule.type === 'boundary');
    expect(boundary).toBeDefined();
    expect(boundary?.matchesPath).toBeDefined();
    expect(boundary?.matchesPath?.('app/src/components/Card.tsx')).toBe(true);
    expect(boundary?.matchesPath?.('app/src/screens/Home.tsx')).toBe(false);
  });
});
