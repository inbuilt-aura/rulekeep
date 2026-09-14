/**
 * Turns a Verdict into the message an agent (or a human, in CI) reads
 * (docs/02-what-we-build.md "3. Work normally"). One formatter, shared by
 * every adapter — an agent's own JSON wrapper is added on top of this text,
 * never instead of it.
 */
import type { Finding, Verdict } from './events.js';

const TOOL_NAME = 'holdfast';

function locationOf(finding: Finding): string {
  if (finding.path === undefined) return '';
  return finding.line === undefined ? `  ${finding.path}` : `  ${finding.path}:${finding.line}`;
}

function lineFor(finding: Finding): string {
  const parts = [`${finding.ruleId} (${finding.mode})${locationOf(finding)}`];
  if (finding.excerpt) parts.push(`    ${finding.excerpt}`);
  parts.push(`    ${finding.message}`);
  if (finding.override) parts.push(`    (overridden: ${finding.override.reason})`);
  return parts.join('\n');
}

/** The message shown after a command or an edit: only what's actively blocking or warning right now. */
export function formatVerdict(verdict: Verdict, subject: 'command' | 'edit'): string {
  const active = verdict.findings.filter((finding) => finding.override === undefined);
  if (active.length === 0) return '';

  const noun = active.length === 1 ? '1 rule' : `${active.length} rules`;
  const header =
    subject === 'command'
      ? `${TOOL_NAME}: this command breaks ${noun}.`
      : `${TOOL_NAME}: this edit breaks ${noun}.`;

  const body = active.map(lineFor).join('\n\n');
  const footer =
    verdict.outcome === 'block'
      ? `Fix the ${subject === 'command' ? 'command' : 'edit'}, then continue. If this is a genuine exception, add ` +
        `\`// holdfast-ignore <rule-id>: <reason>\` on that line.`
      : '';

  return [header, '', body, footer].filter((part) => part !== '').join('\n');
}

/** The short note shown to the user when the agent is allowed to stop with findings still open (docs/02-what-we-build.md "Stopping without looping forever"). */
export function formatStopSummary(verdict: Verdict): string {
  const active = verdict.findings.filter((finding) => finding.override === undefined);
  const overridden = verdict.findings.filter((finding) => finding.override !== undefined);

  const parts: string[] = [];
  if (active.length > 0) {
    const noun = active.length === 1 ? 'rule is' : `${active.length} rules are`;
    parts.push(`${TOOL_NAME}: stopped with ${noun} still broken (${active.map((f) => f.ruleId).join(', ')}).`);
  }
  if (overridden.length > 0) {
    const noun = overridden.length === 1 ? 'override' : 'overrides';
    parts.push(`${overridden.length} ${noun} used.`);
  }
  return parts.join(' ');
}
