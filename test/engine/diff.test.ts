import { describe, expect, it } from 'vitest';
import { changedLines } from '../../src/engine/diff.js';

describe('changedLines', () => {
  it('reports no changes for identical text', () => {
    const result = changedLines('const a = 1;\n', 'const a = 1;\n');
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('finds an added line with its 1-based line number', () => {
    const before = 'a\nb\n';
    const after = 'a\nb\nc\n';
    const { added, removed } = changedLines(before, after);
    expect(removed).toEqual([]);
    expect(added).toEqual([{ line: 3, text: 'c' }]);
  });

  it('finds a removed line with its line number in the original text', () => {
    const before = 'a\nb\nc\n';
    const after = 'a\nc\n';
    const { added, removed } = changedLines(before, after);
    expect(added).toEqual([]);
    expect(removed).toEqual([{ line: 2, text: 'b' }]);
  });

  it('treats null before as file creation: every line is added', () => {
    const { added, removed } = changedLines(null, 'x\ny\n');
    expect(removed).toEqual([]);
    expect(added).toEqual([
      { line: 1, text: 'x' },
      { line: 2, text: 'y' },
    ]);
  });

  it('treats null after as file deletion: every line is removed', () => {
    const { added, removed } = changedLines('x\ny\n', null);
    expect(added).toEqual([]);
    expect(removed).toEqual([
      { line: 1, text: 'x' },
      { line: 2, text: 'y' },
    ]);
  });

  it('normalizes CRLF so Windows line endings do not shift line numbers', () => {
    const before = 'a\r\nb\r\n';
    const after = 'a\r\nb\r\nc\r\n';
    const { added } = changedLines(before, after);
    expect(added).toEqual([{ line: 3, text: 'c' }]);
  });

  it('does not report an unchanged middle line when lines are added after it', () => {
    // Regression check for off-by-one line numbering on multi-hunk diffs.
    const before = 'one\ntwo\nthree\n';
    const after = 'one\ntwo\nthree\nfour\nfive\n';
    const { added } = changedLines(before, after);
    expect(added).toEqual([
      { line: 4, text: 'four' },
      { line: 5, text: 'five' },
    ]);
  });
});
