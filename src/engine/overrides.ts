/**
 * Finds `rulekeep-ignore <rule-id>: <reason>` comments
 * (docs/02-what-we-build.md "Overrides"). An override must be visible and
 * carry a reason — a bare `rulekeep-ignore no-any` with nothing after the
 * colon does not count, and still fires.
 */

// Captures the rule id and the reason text after the colon.
const OVERRIDE = /rulekeep-ignore\s+([a-z0-9-]+)\s*:\s*(\S.*)$/i;

export interface OverrideMatch {
  readonly ruleId: string;
  readonly reason: string;
}

function parseOverride(line: string | undefined): OverrideMatch | undefined {
  if (line === undefined) return undefined;
  const match = OVERRIDE.exec(line);
  if (!match) return undefined;
  const ruleId = match[1];
  const reason = match[2]?.trim();
  if (!ruleId || !reason) return undefined;
  return { ruleId, reason };
}

/**
 * An override on the finding's own line, or the line directly above it,
 * silences that finding — but only when it names this exact rule.
 *
 * `lines` is the full text the finding's line number indexes into (1-based),
 * split on `\n`.
 */
export function findOverride(ruleId: string, lines: readonly string[], lineNumber: number): OverrideMatch | undefined {
  const sameLine = parseOverride(lines[lineNumber - 1]);
  if (sameLine?.ruleId === ruleId) return sameLine;

  const lineAbove = parseOverride(lines[lineNumber - 2]);
  if (lineAbove?.ruleId === ruleId) return lineAbove;

  return undefined;
}
