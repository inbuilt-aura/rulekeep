/**
 * `prose` rules: matched against the agent's final message before it stops
 * (docs/02-what-we-build.md "6. prose"). For banned phrases and habits, like
 * the "load-bearing" issue in docs/01-why.md.
 */
import type { ProseRule } from '../config.js';
import type { Finding, RulekeepEvent } from '../events.js';

export function checkProseRule(rule: ProseRule, event: RulekeepEvent): readonly Finding[] {
  if (event.kind !== 'stop' || rule.mode === 'off') return [];
  if (event.finalMessage === null || !rule.match.test(event.finalMessage)) return [];

  return [
    {
      ruleId: rule.id,
      mode: rule.mode,
      message: rule.message,
      excerpt: rule.match.exec(event.finalMessage)?.[0],
    },
  ];
}
