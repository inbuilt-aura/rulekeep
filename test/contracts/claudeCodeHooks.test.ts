/**
 * Hook contract tests (docs/05-testing.md "Layer 2: hook contract tests").
 *
 * These drive the four Claude Code hook handlers with the exact JSON shapes
 * Claude Code actually sends, against a real rulekeep.yaml on a real
 * filesystem, and assert on the exact JSON shapes it expects back. Unit tests
 * prove a rule matches; these prove the whole path — payload in, snapshot,
 * config discovery, evaluation, verdict out — is wired together correctly,
 * with the field names Claude Code reads.
 *
 * Getting a field name wrong here is invisible to every other layer of the
 * suite and completely breaks the product, which is why these assert on the
 * literal keys rather than a parsed object.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handlePostToolUse, handlePreToolUse, handleSessionStart, handleStop } from '../../src/cli/hookClaudeCode.js';
import type { ClaudeHookInput } from '../../src/adapters/claude-code.js';

const CONFIG = `
version: 1
defaults:
  maxStopRetries: 2
rules:
  - id: no-force-push
    type: command
    match: 'git\\s+push\\b.*\\s(--force|-f)\\b'
    mode: block
    message: Never force-push.

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

let repo: string;
let sessionCounter = 0;
const originalProjectDir = process.env.CLAUDE_PROJECT_DIR;
const originalHome = process.env.RULEKEEP_HOME;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'rulekeep-contract-'));
  writeFileSync(join(repo, 'rulekeep.yaml'), CONFIG, 'utf8');
  mkdirSync(join(repo, 'src'), { recursive: true });
  process.env.CLAUDE_PROJECT_DIR = repo;
  // Keep the suite away from the real ~/.rulekeep.
  process.env.RULEKEEP_HOME = join(repo, '.rulekeep-home');
  sessionCounter += 1;
});

afterEach(() => {
  try {
    rmSync(repo, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  } catch {
    // Temp folder; the OS will reclaim it.
  }
  if (originalProjectDir === undefined) delete process.env.CLAUDE_PROJECT_DIR;
  else process.env.CLAUDE_PROJECT_DIR = originalProjectDir;
  if (originalHome === undefined) delete process.env.RULEKEEP_HOME;
  else process.env.RULEKEEP_HOME = originalHome;
});

const sessionId = (): string => `contract-session-${sessionCounter}`;

/** A PreToolUse payload for a shell command, as Claude Code sends it. */
const bashPayload = (command: string): ClaudeHookInput => ({
  session_id: sessionId(),
  cwd: repo,
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command },
});

/** A PreToolUse/PostToolUse pair for a Write, as Claude Code sends them. */
const writePayload = (event: string, filePath: string, toolUseId: string): ClaudeHookInput => ({
  session_id: sessionId(),
  cwd: repo,
  hook_event_name: event,
  tool_name: 'Write',
  tool_use_id: toolUseId,
  tool_input: { file_path: filePath },
});

/** Runs a full edit: pre-hook snapshot, the write itself, then the post-hook. */
function performEdit(relativePath: string, content: string, toolUseId: string): object {
  const absolute = join(repo, relativePath);
  handlePreToolUse(writePayload('PreToolUse', absolute, toolUseId));
  writeFileSync(absolute, content, 'utf8');
  return handlePostToolUse(writePayload('PostToolUse', absolute, toolUseId));
}

describe('PreToolUse — commands', () => {
  it('denies a blocked command with the exact permissionDecision shape', () => {
    const output = handlePreToolUse(bashPayload('git push origin main --force')) as {
      hookSpecificOutput?: { hookEventName?: string; permissionDecision?: string; permissionDecisionReason?: string };
    };

    expect(output.hookSpecificOutput?.hookEventName).toBe('PreToolUse');
    expect(output.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput?.permissionDecisionReason).toContain('no-force-push');
    expect(output.hookSpecificOutput?.permissionDecisionReason).toContain('Never force-push.');
  });

  it('stays silent on an allowed command — and never returns "allow"', () => {
    const output = handlePreToolUse(bashPayload('git push origin main'));
    expect(output).toEqual({});
    expect(JSON.stringify(output)).not.toContain('allow');
  });

  it('treats a PowerShell command the same as Bash (the Windows path)', () => {
    const output = handlePreToolUse({ ...bashPayload('git push --force'), tool_name: 'PowerShell' }) as {
      hookSpecificOutput?: { permissionDecision?: string };
    };
    expect(output.hookSpecificOutput?.permissionDecision).toBe('deny');
  });
});

describe('PostToolUse — edits', () => {
  it('blocks a rule-breaking edit with top-level decision/reason, naming file and line', () => {
    const output = performEdit('src/parse.ts', 'const a = 1;\nconst data = response as any;\n', 'tool-1') as {
      decision?: string;
      reason?: string;
    };

    expect(output.decision).toBe('block');
    expect(output.reason).toContain('no-any');
    expect(output.reason).toContain('src/parse.ts:2');
  });

  it('warns without blocking, using additionalContext', () => {
    const output = performEdit('src/todo.ts', '// TODO: later\n', 'tool-2') as {
      decision?: string;
      hookSpecificOutput?: { hookEventName?: string; additionalContext?: string };
    };

    expect(output.decision).toBeUndefined();
    expect(output.hookSpecificOutput?.hookEventName).toBe('PostToolUse');
    expect(output.hookSpecificOutput?.additionalContext).toContain('no-todo');
  });

  it('stays silent on a clean edit', () => {
    expect(performEdit('src/clean.ts', 'export const a = 1;\n', 'tool-3')).toEqual({});
  });

  it('honours a rulekeep-ignore override on the offending line', () => {
    const output = performEdit(
      'src/override.ts',
      'const data = response as any; // rulekeep-ignore no-any: third-party types are wrong\n',
      'tool-4',
    );
    expect(output).toEqual({});
  });

  it('only reports what an edit added, not what was already there', () => {
    // The pre-existing violation is in the snapshot, so it is not "added".
    const absolute = join(repo, 'src/existing.ts');
    writeFileSync(absolute, 'const old = x as any;\n', 'utf8');
    const output = performEdit('src/existing.ts', 'const old = x as any;\nexport const fresh = 1;\n', 'tool-5');
    expect(output).toEqual({});
  });
});

describe('Stop', () => {
  const stopPayload = (stopHookActive: boolean): ClaudeHookInput => ({
    session_id: sessionId(),
    cwd: repo,
    hook_event_name: 'Stop',
    stop_hook_active: stopHookActive,
    last_assistant_message: 'All done.',
  });

  it('sends the agent back when a blocking rule is still open', () => {
    performEdit('src/bad.ts', 'const data = x as any;\n', 'tool-a');

    const output = handleStop(stopPayload(false)) as { decision?: string; reason?: string };
    expect(output.decision).toBe('block');
    expect(output.reason).toContain('no-any');
  });

  it('lets the agent stop when nothing is broken', () => {
    performEdit('src/good.ts', 'export const a = 1;\n', 'tool-b');
    expect(handleStop(stopPayload(false))).toEqual({});
  });

  it('gives up after maxStopRetries instead of looping forever', () => {
    performEdit('src/bad.ts', 'const data = x as any;\n', 'tool-c');

    // maxStopRetries is 2 in this config: two send-backs, then it must stop.
    expect((handleStop(stopPayload(false)) as { decision?: string }).decision).toBe('block');
    expect((handleStop(stopPayload(true)) as { decision?: string }).decision).toBe('block');

    const third = handleStop(stopPayload(true)) as { decision?: string; systemMessage?: string };
    expect(third.decision).toBeUndefined();
    expect(third.systemMessage).toContain('no-any');
  });

  it('catches a violation at stop that a warn-mode edit let through', () => {
    // A warn rule does not block the edit, but it is still reported at stop.
    performEdit('src/todo.ts', '// TODO: later\n', 'tool-d');
    const output = handleStop(stopPayload(false)) as { decision?: string; systemMessage?: string };
    expect(output.decision).toBeUndefined();
    expect(output.systemMessage).toContain('no-todo');
  });

  it('reports overrides used, so a silenced rule is never invisible', () => {
    performEdit('src/ov.ts', 'const d = x as any; // rulekeep-ignore no-any: vendor types\n', 'tool-e');
    const output = handleStop(stopPayload(false)) as { systemMessage?: string };
    expect(output.systemMessage).toContain('override');
  });
});

describe('SessionStart', () => {
  it('says nothing on a normal startup', () => {
    const output = handleSessionStart({
      session_id: sessionId(),
      cwd: repo,
      hook_event_name: 'SessionStart',
      source: 'startup',
    });
    expect(output).toEqual({});
  });

  it('re-states the rules after a compaction, via additionalContext', () => {
    const output = handleSessionStart({
      session_id: sessionId(),
      cwd: repo,
      hook_event_name: 'SessionStart',
      source: 'compact',
    }) as { hookSpecificOutput?: { hookEventName?: string; additionalContext?: string } };

    expect(output.hookSpecificOutput?.hookEventName).toBe('SessionStart');
    expect(output.hookSpecificOutput?.additionalContext).toContain('no-any');
    expect(output.hookSpecificOutput?.additionalContext).toContain('no-force-push');
  });

  it('asks for approval once when the repo has untrusted checker commands', () => {
    writeFileSync(
      join(repo, 'rulekeep.yaml'),
      `${CONFIG}\n  - id: typecheck\n    type: checker\n    run: npm run typecheck\n    on: stop\n`,
      'utf8',
    );

    const output = handleSessionStart({
      session_id: sessionId(),
      cwd: repo,
      hook_event_name: 'SessionStart',
      source: 'startup',
    }) as { hookSpecificOutput?: { additionalContext?: string } };

    expect(output.hookSpecificOutput?.additionalContext).toContain('npm run typecheck');
    expect(output.hookSpecificOutput?.additionalContext).toContain('/rulekeep:trust');
  });
});

describe('fail open', () => {
  it('says nothing at all when rulekeep.yaml is invalid, rather than blocking work', () => {
    writeFileSync(join(repo, 'rulekeep.yaml'), 'version: 1\nrules: [ this is not valid', 'utf8');

    expect(handlePreToolUse(bashPayload('git push --force'))).toEqual({});
    expect(performEdit('src/x.ts', 'const a = b as any;\n', 'tool-f')).toEqual({});
    expect(
      handleStop({ session_id: sessionId(), cwd: repo, hook_event_name: 'Stop', stop_hook_active: false }),
    ).toEqual({});
  });

  it('says nothing when there is no rulekeep.yaml anywhere', () => {
    rmSync(join(repo, 'rulekeep.yaml'));
    expect(handlePreToolUse(bashPayload('git push --force'))).toEqual({});
  });
});
