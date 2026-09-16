/**
 * Records real hook payloads to disk when HOLDFAST_RECORD is set
 * (docs/05-testing.md "Layer 2: hook contract tests", docs/04-build-plan.md
 * M3 step 8).
 *
 * Hand-written fixtures only ever prove holdfast agrees with our guess about
 * what Claude Code sends. Turning this on during a real session captures what
 * it actually sends, which is what the contract tests should be built from.
 *
 * Recording must never break a session, so every failure here is swallowed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Same sanitising rule as session state: keep filenames safe on every platform. */
function safe(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

export function recordPayload(agent: string, event: string, payload: unknown): void {
  const dir = process.env.HOLDFAST_RECORD;
  if (!dir) return;

  try {
    const target = join(dir, safe(agent));
    mkdirSync(target, { recursive: true });
    // A counter would need shared state; the clock plus a random suffix is
    // enough to keep two hooks firing in the same millisecond apart.
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    writeFileSync(join(target, `${safe(event)}-${stamp}.json`), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  } catch {
    // Recording is a debugging aid. It must never interfere with a session.
  }
}
