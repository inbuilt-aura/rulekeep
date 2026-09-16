/**
 * `holdfast hook | check | trust | doctor` (docs/02-what-we-build.md "Commands").
 * The shebang line lives in the esbuild `--banner:js` flag (package.json
 * "build" script), not here — one in the source plus one from the banner
 * would double up in the bundle, and Node only strips the first.
 * This build implements the Claude Code hook path end to end, plus `check`,
 * `doctor` and `trust`. The Codex and Gemini CLI adapters are the next
 * milestones (docs/04-build-plan.md M5-M6).
 */
import { runCheck } from './check.js';
import { runDoctor } from './doctor.js';
import { handlePostToolUse, handlePreToolUse, handleSessionStart, handleStop } from './hookClaudeCode.js';
import { readStdinJson } from './stdin.js';
import { runTrust, type TrustAction } from './trust.js';
import type { ClaudeHookInput } from '../adapters/claude-code.js';
import { recordPayload } from '../runtime/record.js';

/**
 * The one rule that matters most: a bug in holdfast must never block real
 * work (docs/03-architecture.md "Fail open"). Every `hook` invocation always
 * exits 0, even when something inside throws.
 */
async function runHook(agent: string, event: string): Promise<void> {
  if (agent !== 'claude-code') {
    // Codex and Gemini CLI adapters aren't built yet (M5/M6). Say nothing
    // and let the agent proceed rather than fail its hook trust check on an
    // unimplemented path.
    process.exit(0);
  }

  try {
    const input = (await readStdinJson()) as ClaudeHookInput;
    recordPayload(agent, event, input);
    const output =
      event === 'session-start'
        ? handleSessionStart(input)
        : event === 'pre-tool-use'
          ? handlePreToolUse(input)
          : event === 'post-tool-use'
            ? handlePostToolUse(input)
            : event === 'stop'
              ? handleStop(input)
              : {};
    process.stdout.write(JSON.stringify(output));
  } catch (error) {
    process.stdout.write(JSON.stringify({ systemMessage: `holdfast: internal error, rules not applied (${(error as Error).message})` }));
  }
  process.exit(0);
}

function runCheckCommand(args: readonly string[]): void {
  const baseIndex = args.indexOf('--base');
  const base = baseIndex >= 0 ? args[baseIndex + 1] : undefined;
  const formatIndex = args.indexOf('--format');
  const format = formatIndex >= 0 ? args[formatIndex + 1] : 'text';

  if (!base) {
    console.error('holdfast check: --base <ref> is required, e.g. --base origin/main');
    process.exit(2);
  }
  if (format !== 'text' && format !== 'github' && format !== 'json') {
    console.error(`holdfast check: --format must be text, github or json (got "${format}")`);
    process.exit(2);
  }

  const result = runCheck({
    base,
    format,
    repoRoot: process.cwd(),
    runCheckers: !args.includes('--no-checkers'),
  });
  console.log(result.output);
  process.exit(result.exitCode);
}

function runTrustCommand(args: readonly string[]): void {
  const action: TrustAction = args.includes('--revoke') ? 'revoke' : args.includes('--list') ? 'list' : 'approve';
  const result = runTrust(process.cwd(), action);
  console.log(result.output);
  process.exit(result.exitCode);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case 'hook': {
      const [agent, event] = rest;
      await runHook(agent ?? '', event ?? '');
      return;
    }
    case 'check':
      runCheckCommand(rest);
      return;
    case 'trust':
      runTrustCommand(rest);
      return;
    case 'doctor':
      console.log(runDoctor(process.cwd()));
      return;
    default:
      console.error(
        [
          'holdfast — enforce your project\'s rules while an AI agent works.',
          '',
          'Usage:',
          '  holdfast hook <agent> <event>     (called by an agent\'s own hook config)',
          '  holdfast check --base <ref>       (run every rule against changes since <ref>)',
          '  holdfast trust [--list|--revoke]  (approve this repo\'s checker commands)',
          '  holdfast doctor                   (check Node version and holdfast.yaml)',
        ].join('\n'),
      );
      process.exit(command === undefined ? 0 : 1);
  }
}

void main();
