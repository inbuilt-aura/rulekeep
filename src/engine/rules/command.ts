/**
 * `command` rules: matched against a shell command before it runs
 * (docs/02-what-we-build.md "1. command"). Honest limit: this is a guardrail
 * against habits, not a security sandbox — a determined agent can still hide
 * a command inside a script file.
 */
import type { CommandRule } from '../config.js';
import type { Finding, HoldfastEvent } from '../events.js';

export function checkCommandRule(rule: CommandRule, event: HoldfastEvent): readonly Finding[] {
  if (event.kind !== 'before-command' || rule.mode === 'off') return [];
  if (!rule.match.test(event.command)) return [];

  return [
    {
      ruleId: rule.id,
      mode: rule.mode,
      message: rule.message,
      excerpt: event.command.trim().slice(0, 200),
    },
  ];
}
