/**
 * `holdfast check` — the CI backstop (docs/03-architecture.md "CI mode").
 *
 * These build a real git repository in a temp folder and run the command
 * against real commits. `changesSinceRef` shells out to git, so a fake would
 * only prove the fake works; the failure modes worth catching here (a rename,
 * an uncommitted file, a file that did not exist at the base ref) are all
 * things only real git produces.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCheck } from '../../src/cli/check.js';

let repo: string;

const CONFIG = `
version: 1
rules:
  - id: no-any
    type: line
    files: ['**/*.ts']
    added: '\\bas\\s+any\\b'
    mode: block
    message: "Don't use \`any\`."

  - id: no-todo
    type: line
    files: ['**/*.ts']
    added: 'TODO'
    mode: warn
    message: Avoid TODOs.
`;

const git = (...args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

const write = (relativePath: string, content: string): void => {
  const absolute = join(repo, relativePath);
  mkdirSync(join(absolute, '..'), { recursive: true });
  writeFileSync(absolute, content, 'utf8');
};

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'holdfast-check-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');

  write('holdfast.yaml', CONFIG);
  write('src/base.ts', 'export const a = 1;\n');
  git('add', '-A');
  git('commit', '-qm', 'base');
});

afterEach(() => {
  try {
    rmSync(repo, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  } catch {
    // Temp folder; the OS will reclaim it.
  }
});

const check = (format: 'text' | 'github' | 'json' = 'text'): ReturnType<typeof runCheck> =>
  runCheck({ base: 'HEAD', format, repoRoot: repo, runCheckers: false });

describe('holdfast check', () => {
  it('passes with exit 0 when nothing changed', () => {
    const result = check();
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('no rules broken');
  });

  it('fails with exit 1 on an uncommitted violation, naming file and line', () => {
    write('src/bad.ts', 'const x = 1;\nconst data = y as any;\n');

    const result = check();
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('no-any');
    expect(result.output).toContain('src/bad.ts:2');
  });

  it('catches a violation in a commit made after the base ref', () => {
    git('rev-parse', 'HEAD');
    write('src/bad.ts', 'const data = y as any;\n');
    git('add', '-A');
    git('commit', '-qm', 'add violation');

    const result = runCheck({ base: 'HEAD~1', format: 'text', repoRoot: repo, runCheckers: false });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('no-any');
  });

  it('does not fail the build for a warn-mode rule, but still reports it', () => {
    write('src/todo.ts', '// TODO: later\n');

    const result = check();
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('no-todo');
  });

  it('ignores a pre-existing violation that this change did not add', () => {
    write('src/legacy.ts', 'const old = y as any;\n');
    git('add', '-A');
    git('commit', '-qm', 'legacy');

    // Touching the file elsewhere must not re-report the untouched old line.
    write('src/legacy.ts', 'const old = y as any;\nexport const fresh = 2;\n');

    const result = check();
    expect(result.exitCode).toBe(0);
  });

  it('reports overrides rather than hiding them', () => {
    write('src/ov.ts', 'const d = y as any; // holdfast-ignore no-any: vendor types are wrong\n');

    const result = check();
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Overridden');
    expect(result.output).toContain('vendor types are wrong');
  });

  it('emits GitHub annotations that Actions can render inline', () => {
    write('src/bad.ts', 'const data = y as any;\n');

    const result = check('github');
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/^::error file=src\/bad\.ts,line=1::/m);
    expect(result.output).not.toContain('\n::error file=src/bad.ts,line=1::no-any: Don\'t\n');
  });

  it('emits machine-readable JSON', () => {
    write('src/bad.ts', 'const data = y as any;\n');

    const result = check('json');
    const parsed = JSON.parse(result.output) as { outcome: string; findings: { ruleId: string }[] };
    expect(parsed.outcome).toBe('block');
    expect(parsed.findings[0]?.ruleId).toBe('no-any');
  });

  it('exits 2 — a distinct code from "rules broken" — when the config is invalid', () => {
    write('holdfast.yaml', 'version: 1\nrules: [ broken');

    const result = check();
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('invalid');
  });

  it('passes quietly when the repo has no holdfast.yaml', () => {
    rmSync(join(repo, 'holdfast.yaml'));

    const result = check();
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('no holdfast.yaml');
  });
});

describe('holdfast check — checker rules', () => {
  it('runs checkers in CI without the interactive trust prompt, and fails on a failing one', () => {
    write(
      'holdfast.yaml',
      `${CONFIG}
  - id: must-pass
    type: checker
    run: node -e "process.exit(1)"
    mode: block
    message: The build must pass.
`,
    );

    const result = runCheck({ base: 'HEAD', format: 'text', repoRoot: repo, runCheckers: true });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('must-pass');
    expect(result.output).toContain('The build must pass.');
  });

  it('passes when the checker command succeeds', () => {
    write(
      'holdfast.yaml',
      `${CONFIG}
  - id: must-pass
    type: checker
    run: node -e "process.exit(0)"
    mode: block
    message: The build must pass.
`,
    );

    const result = runCheck({ base: 'HEAD', format: 'text', repoRoot: repo, runCheckers: true });
    expect(result.exitCode).toBe(0);
  });

  it('skips checkers entirely when --no-checkers is passed', () => {
    write(
      'holdfast.yaml',
      `${CONFIG}
  - id: must-pass
    type: checker
    run: node -e "process.exit(1)"
    mode: block
    message: The build must pass.
`,
    );

    const result = runCheck({ base: 'HEAD', format: 'text', repoRoot: repo, runCheckers: false });
    expect(result.exitCode).toBe(0);
  });
});

describe('holdfast check — fail open', () => {
  it('rejects an infinite checker timeout at parse time rather than crashing', () => {
    // `.inf` is a number and is > 0, and spawnSync throws on it. Before this
    // was validated, `holdfast check` died with an unhandled RangeError.
    write('holdfast.yaml', `${CONFIG}
  - id: bad
    type: checker
    run: node -e "process.exit(0)"
    timeoutSeconds: .inf
`);

    let result: ReturnType<typeof runCheck> | undefined;
    expect(() => {
      result = runCheck({ base: 'HEAD', format: 'text', repoRoot: repo, runCheckers: true });
    }).not.toThrow();

    expect(result?.exitCode).toBe(2);
    expect(result?.output).toContain('timeoutSeconds');
  });
});
