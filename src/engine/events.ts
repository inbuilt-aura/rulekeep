/**
 * The shared event and verdict model every agent adapter and the CI command
 * translate into and out of (docs/03-architecture.md "The event model").
 *
 * The engine (evaluate.ts and everything under rules/) never imports an
 * agent's own hook types — it only ever sees these. That's what lets one rule
 * engine produce identical behaviour in Claude Code, Codex, Gemini CLI and CI.
 */

export type AgentName = 'claude-code' | 'codex' | 'gemini-cli' | 'ci';

export interface FileChange {
  /** Repo-relative, forward slashes, e.g. "app/src/components/Card.tsx". */
  readonly path: string;
  /** null = the file didn't exist before this change (created). */
  readonly before: string | null;
  /** null = the file no longer exists after this change (deleted). */
  readonly after: string | null;
}

interface EventBase {
  readonly agent: AgentName;
  readonly sessionId: string;
  readonly repoRoot: string;
}

export type SessionStartReason = 'startup' | 'resume' | 'clear' | 'compact';

export type RulekeepEvent =
  | (EventBase & { readonly kind: 'session-start'; readonly reason: SessionStartReason })
  | (EventBase & { readonly kind: 'before-command'; readonly command: string })
  | (EventBase & { readonly kind: 'before-edit'; readonly paths: readonly string[] })
  | (EventBase & { readonly kind: 'after-edit'; readonly changes: readonly FileChange[] })
  | (EventBase & {
      readonly kind: 'stop';
      readonly changes: readonly FileChange[];
      readonly finalMessage: string | null;
      /** How many times this turn has already been sent back. 0 on the first attempt. */
      readonly retry: number;
    });

export type RuleMode = 'off' | 'warn' | 'block';

export interface Finding {
  readonly ruleId: string;
  readonly mode: RuleMode;
  readonly message: string;
  readonly path?: string | undefined;
  readonly line?: number | undefined;
  readonly excerpt?: string | undefined;
  /** Present when a `rulekeep-ignore` comment silenced this finding. It is still reported, never hidden. */
  readonly override?: { readonly reason: string } | undefined;
}

export interface Verdict {
  /** "block" if any un-overridden block-mode finding exists; "warn" if any warn finding; else "allow". */
  readonly outcome: 'allow' | 'warn' | 'block';
  readonly findings: readonly Finding[];
}

/** True for a finding that should actually count toward the verdict (not silenced by a valid override). */
export const isActive = (finding: Finding): boolean => finding.override === undefined;

export function outcomeOf(findings: readonly Finding[]): Verdict['outcome'] {
  const active = findings.filter(isActive);
  if (active.some((finding) => finding.mode === 'block')) return 'block';
  if (active.some((finding) => finding.mode === 'warn')) return 'warn';
  return 'allow';
}
