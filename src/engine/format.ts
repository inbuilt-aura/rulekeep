/**
 * Turns a Verdict into the message an agent (or a human, in CI) reads
 * (docs/02-what-we-build.md "3. Work normally"). One formatter, shared by
 * every adapter — an agent's own JSON wrapper is added on top of this text,
 * never instead of it.
 */
import type { Finding, Verdict } from './events.js';

const TOOL_NAME = 'rulekeep';

/** What the findings are about, which decides how the message is worded. */
export type Subject = 'command' | 'edit' | 'work';

const SUBJECTS: Record<Subject, { readonly headline: string; readonly fix: string }> = {
  command: { headline: 'this command breaks', fix: 'Fix the command, then continue.' },
  edit: { headline: 'this edit breaks', fix: 'Fix the edit, then continue.' },
  work: { headline: 'this turn leaves', fix: 'Fix them before finishing.' },
};

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

/**
 * The message shown after a command, an edit, or at stop: only what's
 * actively blocking or warning right now.
 *
 * `subject` decides the wording. At stop the findings cover everything the
 * agent did this turn, not one edit, so saying "this edit" there would point
 * the agent at the wrong thing.
 */
export function formatVerdict(verdict: Verdict, subject: Subject): string {
  const active = verdict.findings.filter((finding) => finding.override === undefined);
  if (active.length === 0) return '';

  const noun = active.length === 1 ? '1 rule' : `${active.length} rules`;
  const header = `${TOOL_NAME}: ${SUBJECTS[subject].headline} ${noun}${subject === 'work' ? ' broken' : ''}.`;

  const body = active.map(lineFor).join('\n\n');
  const footer =
    verdict.outcome === 'block'
      ? `${SUBJECTS[subject].fix} If this is a genuine exception, add ` +
        `\`// rulekeep-ignore <rule-id>: <reason>\` on that line.`
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
