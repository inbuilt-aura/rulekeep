/**
 * `holdfast trust` — approve, list or revoke this repo's checker commands
 * (docs/03-architecture.md "Checker commands need approval"). The
 * /holdfast:trust skill calls this; a user can also run it directly.
 *
 * Approving is deliberately a separate, explicit act: it is the one place
 * holdfast agrees to run a command that came out of a repo's config file.
 */
import { checkerRulesOf, isTrusted, revoke, trust } from '../runtime/trust.js';
import { loadConfig } from '../runtime/configFile.js';

export interface TrustResult {
  readonly exitCode: 0 | 1 | 2;
  readonly output: string;
}

export type TrustAction = 'approve' | 'list' | 'revoke';

export function runTrust(repoRoot: string, action: TrustAction): TrustResult {
  const loaded = loadConfig(repoRoot);

  if (!loaded.ok) {
    if (loaded.path === undefined) {
      return { exitCode: 1, output: 'holdfast: no holdfast.yaml found — nothing to trust.' };
    }
    const detail = loaded.errors.map((error) => `  ${loaded.path}:${error.line}: ${error.message}`).join('\n');
    return { exitCode: 2, output: `holdfast: holdfast.yaml is invalid, so its checkers cannot be trusted:\n${detail}` };
  }

  const checkers = checkerRulesOf(loaded.config);

  if (checkers.length === 0) {
    return { exitCode: 0, output: `holdfast: ${loaded.path} has no checker rules — nothing to trust.` };
  }

  const width = Math.max(...checkers.map((rule) => rule.run.length));
  const listing = checkers.map((rule) => `  ${rule.run.padEnd(width)}  (${rule.id})`).join('\n');

  switch (action) {
    case 'list': {
      const state = isTrusted(loaded.path, checkers) ? 'trusted' : 'NOT trusted — run `holdfast trust` to approve';
      return { exitCode: 0, output: `holdfast: ${checkers.length} checker command(s) in ${loaded.path} (${state}):\n${listing}` };
    }
    case 'revoke': {
      const removed = revoke(loaded.path);
      return {
        exitCode: 0,
        output: removed
          ? `holdfast: revoked approval for ${loaded.path}. Its checkers will not run until approved again.`
          : `holdfast: nothing to revoke — ${loaded.path} was not approved.`,
      };
    }
    case 'approve': {
      if (isTrusted(loaded.path, checkers)) {
        return { exitCode: 0, output: `holdfast: already trusted — these ${checkers.length} command(s) will run:\n${listing}` };
      }
      trust(loaded.path, checkers);
      return { exitCode: 0, output: `holdfast: approved. These ${checkers.length} command(s) will now run for ${loaded.path}:\n${listing}` };
    }
  }
}
