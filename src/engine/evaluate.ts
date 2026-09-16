/**
 * Runs every applicable rule against an event and produces a verdict
 * (docs/03-architecture.md "Which rules run when"). This is the one function
 * every adapter and the CI command call.
 *
 * `checker` rules are deliberately not run here: they execute a real command
 * (docs/03-architecture.md "runtime/checker.ts"), which is impure by
 * definition and belongs in src/runtime, not the engine (M4 in the build
 * plan). This function evaluates every other rule type.
 */
import type { Rule } from './config.js';
import { outcomeOf, type Finding, type RulekeepEvent, type Verdict } from './events.js';
import { checkBoundaryRule } from './rules/boundary.js';
import { checkCommandRule } from './rules/command.js';
import { checkLineRule } from './rules/line.js';
import { checkProseRule } from './rules/prose.js';
import { checkTestGuardRule } from './rules/testGuard.js';

/** Findings are capped so a hook's output never exceeds an agent's message limit (docs/03-architecture.md "Output size"). */
const MAX_FINDINGS = 20;

function checkRule(rule: Rule, event: RulekeepEvent): readonly Finding[] {
  switch (rule.type) {
    case 'command':
      return checkCommandRule(rule, event);
    case 'line':
      return checkLineRule(rule, event);
    case 'boundary':
      return checkBoundaryRule(rule, event);
    case 'test-guard':
      return checkTestGuardRule(rule, event);
    case 'prose':
      return checkProseRule(rule, event);
    case 'checker':
      // Runs in src/runtime, not here — see the module comment above.
      return [];
  }
}

export function evaluate(rules: readonly Rule[], event: RulekeepEvent, extra: readonly Finding[] = []): Verdict {
  const findings = rules.flatMap((rule) => checkRule(rule, event)).concat(extra);
  return { outcome: outcomeOf(findings), findings: findings.slice(0, MAX_FINDINGS) };
}
