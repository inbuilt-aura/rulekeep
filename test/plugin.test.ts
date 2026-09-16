/**
 * Guards the packaging, not the logic (docs/04-build-plan.md M3).
 *
 * Every assertion here corresponds to a way the plugin can be completely
 * broken for an installed user while every other test in the suite passes:
 * a hook pointing at a path that isn't shipped, a matcher that misses the
 * Windows shell tool, an `Edit` matcher that also swallows `NotebookEdit`.
 * None of that shows up until someone installs it, so it is checked here.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string): string => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const readJson = <T,>(relativePath: string): T => JSON.parse(read(relativePath)) as T;
const exists = (relativePath: string): boolean => existsSync(new URL(`../${relativePath}`, import.meta.url));

interface HookEntry {
  readonly matcher?: string;
  readonly hooks: readonly { readonly type: string; readonly command: string; readonly args?: readonly string[]; readonly timeout?: number }[];
}
interface HooksFile {
  readonly hooks: Record<string, readonly HookEntry[]>;
}

describe('plugin manifest', () => {
  it('declares the fields the plugin directory needs', () => {
    const manifest = readJson<Record<string, unknown>>('plugins/claude-code/.claude-plugin/plugin.json');
    expect(manifest.name).toBe('rulekeep');
    expect(typeof manifest.version).toBe('string');
    expect(typeof manifest.description).toBe('string');
    expect(manifest.license).toBe('Apache-2.0');
  });

  it('is listed by the repo-root marketplace file, pointing at a folder that exists', () => {
    const marketplace = readJson<{ plugins: readonly { name: string; source: string }[] }>('.claude-plugin/marketplace.json');
    const entry = marketplace.plugins.find((plugin) => plugin.name === 'rulekeep');
    expect(entry).toBeDefined();
    expect(entry?.source).toBe('./plugins/claude-code');
    expect(exists('plugins/claude-code/.claude-plugin/plugin.json')).toBe(true);
  });
});

describe('hooks.json', () => {
  const hooksFile = readJson<HooksFile>('plugins/claude-code/hooks/hooks.json');
  const allEntries = Object.values(hooksFile.hooks).flat();
  const allHooks = allEntries.flatMap((entry) => entry.hooks);

  it('wires all four events rulekeep needs', () => {
    expect(Object.keys(hooksFile.hooks).sort()).toEqual(['PostToolUse', 'PreToolUse', 'SessionStart', 'Stop']);
  });

  it('registers exactly one entry per event, so rulekeep controls its own ordering', () => {
    for (const [event, entries] of Object.entries(hooksFile.hooks)) {
      expect(entries, `${event} should have one entry`).toHaveLength(1);
    }
  });

  it('uses exec form — no shell, so paths with spaces work on every platform', () => {
    for (const hook of allHooks) {
      expect(hook.type).toBe('command');
      expect(hook.command).toBe('node');
      expect(Array.isArray(hook.args)).toBe(true);
    }
  });

  it('points every hook at the bundle the plugin actually ships', () => {
    for (const hook of allHooks) {
      expect(hook.args?.[0]).toBe('${CLAUDE_PLUGIN_ROOT}/dist/rulekeep.cjs');
      expect(hook.args?.slice(1, 3)).toEqual(['hook', 'claude-code']);
    }
  });

  it('passes each event the CLI name that src/cli/main.ts dispatches on', () => {
    const eventArg = (event: string): string | undefined => hooksFile.hooks[event]?.[0]?.hooks[0]?.args?.[3];
    expect(eventArg('SessionStart')).toBe('session-start');
    expect(eventArg('PreToolUse')).toBe('pre-tool-use');
    expect(eventArg('PostToolUse')).toBe('post-tool-use');
    expect(eventArg('Stop')).toBe('stop');
  });

  it('matches the Windows shell tool as well as Bash', () => {
    const matcher = hooksFile.hooks.PreToolUse?.[0]?.matcher ?? '';
    expect(new RegExp(matcher).test('Bash')).toBe(true);
    expect(new RegExp(matcher).test('PowerShell')).toBe(true);
  });

  it('anchors the Edit matcher so it does not also swallow NotebookEdit unintentionally', () => {
    // Both should match, but via their own alternatives — an unanchored
    // `Edit` would match "NotebookEdit" as a substring by accident.
    const matcher = hooksFile.hooks.PostToolUse?.[0]?.matcher ?? '';
    expect(matcher).toContain('^Edit$');
    expect(new RegExp(matcher).test('Edit')).toBe(true);
    expect(new RegExp(matcher).test('NotebookEdit')).toBe(true);
    expect(new RegExp(matcher).test('Read')).toBe(false);
  });

  it('keeps the fast hooks on short timeouts so a bug cannot freeze the agent', () => {
    const timeout = (event: string): number | undefined => hooksFile.hooks[event]?.[0]?.hooks[0]?.timeout;
    expect(timeout('PreToolUse')).toBeLessThanOrEqual(10);
    expect(timeout('SessionStart')).toBeLessThanOrEqual(30);
    expect(timeout('Stop')).toBeLessThanOrEqual(300);
  });
});

describe('skills', () => {
  const skills = ['setup', 'trust', 'explain'];

  it.each(skills)('ships a %s skill with the frontmatter Claude Code requires', (skill) => {
    const source = read(`plugins/claude-code/skills/${skill}/SKILL.md`);
    expect(source.startsWith('---\n')).toBe(true);

    const frontmatter = source.split('---')[1] ?? '';
    expect(frontmatter).toContain(`name: ${skill}`);
    expect(frontmatter).toMatch(/description: \S/);
    // These are user-invoked (/rulekeep:setup), not things the model should
    // fire on its own — especially `trust`, which approves running commands.
    expect(frontmatter).toContain('disable-model-invocation: true');
  });

  it('tells the trust skill to show the commands before approving them', () => {
    const source = read('plugins/claude-code/skills/trust/SKILL.md');
    expect(source).toContain('rulekeep trust --list');
    expect(source).toContain('rulekeep trust --revoke');
  });
});
