import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/engine/config.js';

describe('parseConfig', () => {
  it('parses a minimal valid config', () => {
    const result = parseConfig(`
version: 1
rules:
  - id: no-any
    type: line
    added: 'as any'
    message: "Don't use any."
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.rules).toHaveLength(1);
    expect(result.config.rules[0]).toMatchObject({ id: 'no-any', type: 'line', mode: 'warn', allowOverride: true });
  });

  it('applies defaults.mode and defaults.allowOverride to rules that do not set their own', () => {
    const result = parseConfig(`
version: 1
defaults:
  mode: block
  allowOverride: false
rules:
  - id: no-force-push
    type: command
    match: '--force'
    message: Never force-push.
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.rules[0]).toMatchObject({ mode: 'block', allowOverride: false });
  });

  it('rejects a config whose version is not 1', () => {
    const result = parseConfig(`
version: 2
rules: []
`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes('version'))).toBe(true);
  });

  it('reports a config-level error with a line number when rules is missing', () => {
    const result = parseConfig(`version: 1\n`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toMatch(/"rules"/);
  });

  it('rejects a rule missing "id" and reports which index', () => {
    const result = parseConfig(`
version: 1
rules:
  - type: command
    match: 'rm -rf'
    message: Dangerous.
`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toMatch(/rules\[0\].*id/);
  });

  it('rejects a duplicate rule id', () => {
    const result = parseConfig(`
version: 1
rules:
  - id: dup
    type: command
    match: 'a'
    message: a
  - id: dup
    type: command
    match: 'b'
    message: b
`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes('Duplicate rule id "dup"'))).toBe(true);
  });

  it('rejects an unknown rule type', () => {
    const result = parseConfig(`
version: 1
rules:
  - id: bad
    type: not-a-real-type
    message: x
`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toMatch(/"type" must be one of/);
  });

  it('requires "message" on rule types that need one', () => {
    const result = parseConfig(`
version: 1
rules:
  - id: no-message
    type: command
    match: 'x'
`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toMatch(/"message" is required/);
  });

  it('rejects an invalid regular expression, and points at the offending field', () => {
    const result = parseConfig(`
version: 1
rules:
  - id: bad-regex
    type: command
    match: '(unclosed'
    message: x
`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toMatch(/"match" is not a valid regular expression/);
  });

  it('requires a "line" rule to set at least one of added/removed', () => {
    const result = parseConfig(`
version: 1
rules:
  - id: no-op
    type: line
    message: x
`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toMatch(/needs "added" and\/or "removed"/);
  });

  it('requires a "boundary" rule to have a non-empty disallow list', () => {
    const result = parseConfig(`
version: 1
rules:
  - id: boundary
    type: boundary
    from: 'src/components/**'
    disallow: []
    message: x
`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toMatch(/non-empty "disallow"/);
  });

  it('defaults test-guard to mode block and allowOverride false, unless the rule overrides that', () => {
    const result = parseConfig(`
version: 1
rules:
  - id: keep-tests-honest
    type: test-guard
    files: ['**/*.test.ts']
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.rules[0]).toMatchObject({ mode: 'block', allowOverride: false });
  });

  it('requires "run" on a checker rule', () => {
    const result = parseConfig(`
version: 1
rules:
  - id: typecheck
    type: checker
    cwd: app
`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toMatch(/"run" is required/);
  });

  it('parses the LIFEWORLD example config from docs/02-what-we-build.md with no errors', () => {
    const result = parseConfig(`
version: 1

defaults:
  mode: warn
  allowOverride: true

rules:
  - id: no-force-push
    type: command
    match: 'git\\s+push\\b.*\\s(--force|-f)\\b'
    mode: block
    allowOverride: false
    message: Never force-push. Ask the user instead.

  - id: use-edit-tool
    type: command
    match: '\\bsed\\s+-i\\b'
    mode: block
    message: Edit files with the edit tool, not \`sed -i\`, so changes can be reviewed.

  - id: no-any
    type: line
    files: ['app/src/**/*.{ts,tsx}', 'web/**/*.{ts,tsx}']
    added: '(:\\s*any\\b|\\bas\\s+any\\b|<any>)'
    mode: block
    message: Don't use \`any\`. Use \`unknown\` and narrow it.

  - id: no-hex-colors-in-components
    type: line
    files: ['app/src/components/**/*.tsx']
    added: '#[0-9a-fA-F]{3,8}\\b'
    message: Colors come from constants/theme.ts, not literals.

  - id: components-stay-presentational
    type: boundary
    from: 'app/src/components/**'
    disallow: ['@/repositories', '@/store', '@/features']
    mode: block
    message: Components are presentational. Pass data in as props.

  - id: keep-tests-honest
    type: test-guard
    files: ['**/*.test.{ts,tsx}']
    mode: block
    allowOverride: false

  - id: app-typecheck
    type: checker
    when: ['app/src/**/*.{ts,tsx}']
    run: npm run typecheck
    cwd: app
    on: stop
    mode: block

  - id: no-filler-words
    type: prose
    match: '\\b(load-bearing|delve|seamlessly)\\b'
    message: Say it plainly.
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.rules).toHaveLength(8);
  });
});

describe('checker timeoutSeconds validation', () => {
  const withTimeout = (value: string): string =>
    `version: 1\nrules:\n  - id: c\n    type: checker\n    run: npm test\n    timeoutSeconds: ${value}\n`;

  it('rejects an infinite timeout', () => {
    // YAML parses `.inf` to Infinity, which is a number and is > 0. Node's
    // spawnSync THROWS on a non-finite timeout instead of returning an error,
    // so letting this through would disable every rule in the file.
    const result = parseConfig(withTimeout('.inf'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toContain('timeoutSeconds');
  });

  it('rejects an overflowing exponent, which YAML also reads as Infinity', () => {
    expect(parseConfig(withTimeout('1e400')).ok).toBe(false);
  });

  it('rejects a timeout too large for Node to accept', () => {
    expect(parseConfig(withTimeout('1e20')).ok).toBe(false);
  });

  it('rejects zero and negative timeouts', () => {
    expect(parseConfig(withTimeout('0')).ok).toBe(false);
    expect(parseConfig(withTimeout('-5')).ok).toBe(false);
  });

  it('accepts a sensible timeout, and defaults when none is given', () => {
    const explicit = parseConfig(withTimeout('120'));
    expect(explicit.ok).toBe(true);
    if (explicit.ok) {
      const rule = explicit.config.rules[0];
      expect(rule?.type === 'checker' && rule.timeoutSeconds).toBe(120);
    }

    const defaulted = parseConfig('version: 1\nrules:\n  - id: c\n    type: checker\n    run: npm test\n');
    expect(defaulted.ok).toBe(true);
    if (defaulted.ok) {
      const rule = defaulted.config.rules[0];
      expect(rule?.type === 'checker' && rule.timeoutSeconds).toBe(60);
    }
  });
});

describe('rule scope: files and from', () => {
  const scoped = (yaml: string) => {
    const result = parseConfig(yaml);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'));
    return result.config.rules[0]!;
  };

  it('honours `from` on a boundary rule, the spelling the docs use', () => {
    // `from` appears in docs/02-what-we-build.md and in the shipped example.
    // Ignoring it silently widened the rule to every file in the repo.
    const rule = scoped(`
version: 1
rules:
  - id: b
    type: boundary
    from: 'src/components/**'
    disallow: ['@/db']
    message: no db
`);
    expect(rule.matchesPath).toBeDefined();
    expect(rule.matchesPath?.('src/components/Card.ts')).toBe(true);
    expect(rule.matchesPath?.('src/server/handler.ts')).toBe(false);
  });

  it('accepts `from` written as a list too', () => {
    const rule = scoped(`
version: 1
rules:
  - id: b
    type: boundary
    from: ['src/components/**', 'src/widgets/**']
    disallow: ['@/db']
    message: no db
`);
    expect(rule.matchesPath?.('src/widgets/Chip.ts')).toBe(true);
    expect(rule.matchesPath?.('src/server/handler.ts')).toBe(false);
  });

  it('accepts a single glob string for `files`, not only a list', () => {
    const rule = scoped(`
version: 1
rules:
  - id: l
    type: line
    files: 'src/**/*.ts'
    added: 'TODO'
    message: no todos
`);
    expect(rule.matchesPath?.('src/a.ts')).toBe(true);
    expect(rule.matchesPath?.('docs/a.ts')).toBe(false);
  });

  it('leaves a rule unscoped when neither is given', () => {
    const rule = scoped(`
version: 1
rules:
  - id: l
    type: line
    added: 'TODO'
    message: no todos
`);
    expect(rule.matchesPath).toBeUndefined();
  });
});
