/**
 * Line-level diff between two versions of a file, with 1-based line numbers
 * (docs/04-build-plan.md M2 step 3). Pure: no I/O, just strings in, lines out.
 *
 * Rules match against `added`/`removed` lines rather than whole files, so a
 * rule never fires on code that was already there — only on what an edit
 * actually changed.
 */
import { diffLines } from 'diff';

export interface ChangedLine {
  /** 1-based. For an added line, the line number in `after`; for a removed line, in `before`. */
  readonly line: number;
  readonly text: string;
}

export interface LineChanges {
  readonly added: readonly ChangedLine[];
  readonly removed: readonly ChangedLine[];
}

const normalize = (text: string): string => text.replace(/\r\n/g, '\n');

export function changedLines(before: string | null, after: string | null): LineChanges {
  const a = normalize(before ?? '');
  const b = normalize(after ?? '');

  const added: ChangedLine[] = [];
  const removed: ChangedLine[] = [];
  let beforeLine = 1;
  let afterLine = 1;

  for (const part of diffLines(a, b)) {
    const lines = part.value.split('\n');
    // diffLines keeps the trailing newline inside `value`, which produces one
    // trailing empty element per split; drop it so it isn't counted as a line.
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

    for (const text of lines) {
      if (part.added) {
        added.push({ line: afterLine, text });
        afterLine += 1;
      } else if (part.removed) {
        removed.push({ line: beforeLine, text });
        beforeLine += 1;
      } else {
        beforeLine += 1;
        afterLine += 1;
      }
    }
  }

  return { added, removed };
}
