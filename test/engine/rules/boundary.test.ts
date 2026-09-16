import { describe, expect, it } from 'vitest';
import type { BoundaryRule } from '../../../src/engine/config.js';
import type { FileChange, RulekeepEvent } from '../../../src/engine/events.js';
import { checkBoundaryRule } from '../../../src/engine/rules/boundary.js';

// LIFEWORLD's real import-direction rule (app/CLAUDE.md §4): components must
// stay presentational and never import repositories, stores or features.
const rule: BoundaryRule = {
  id: 'components-stay-presentational',
  type: 'boundary',
  mode: 'block',
  allowOverride: true,
  message: 'Components are presentational. Pass data in as props.',
  matchesPath: (path) => path.startsWith('app/src/components/'),
  disallow: ['@/repositories', '@/store', '@/features'],
};

const afterEdit = (changes: readonly FileChange[]): RulekeepEvent => ({
  kind: 'after-edit',
  agent: 'claude-code',
  sessionId: 's1',
  repoRoot: '/repo',
  changes,
});

describe('checkBoundaryRule', () => {
  it('fires on a newly added import of a disallowed path', () => {
    const change: FileChange = {
      path: 'app/src/components/Card.tsx',
      before: "import { AppText } from './Text';\n",
      after: "import { AppText } from './Text';\nimport { repositories } from '@/repositories';\n",
    };
    const findings = checkBoundaryRule(rule, afterEdit([change]));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ ruleId: 'components-stay-presentational', line: 2 });
  });

  it('fires on a disallowed subpath, not only the exact specifier', () => {
    const change: FileChange = {
      path: 'app/src/components/Avatar.tsx',
      before: '',
      after: "import { mockRepositories } from '@/repositories/mock/repositories';\n",
    };
    expect(checkBoundaryRule(rule, afterEdit([change]))).toHaveLength(1);
  });

  it('does not fire on an existing disallowed import that this edit did not touch', () => {
    const change: FileChange = {
      path: 'app/src/components/Legacy.tsx',
      before: "import { repositories } from '@/repositories';\nconst a = 1;\n",
      after: "import { repositories } from '@/repositories';\nconst a = 2;\n",
    };
    expect(checkBoundaryRule(rule, afterEdit([change]))).toEqual([]);
  });

  it('does not fire on an allowed import', () => {
    const change: FileChange = {
      path: 'app/src/components/Button.tsx',
      before: '',
      after: "import { palette } from '@/constants/theme';\n",
    };
    expect(checkBoundaryRule(rule, afterEdit([change]))).toEqual([]);
  });

  it('does not apply outside the components folder', () => {
    const change: FileChange = {
      path: 'app/src/features/world/queries.ts',
      before: '',
      after: "import { repositories } from '@/repositories';\n",
    };
    expect(checkBoundaryRule(rule, afterEdit([change]))).toEqual([]);
  });
});

describe('checkBoundaryRule — disallow entries written as globs', () => {
  // A glob is the natural thing to reach for, and matching it literally makes
  // the rule silently never fire — which looks exactly like "no violations".
  const globRule = (disallow: readonly string[]): BoundaryRule => ({
    ...rule,
    matchesPath: (path) => path.startsWith('src/components/'),
    disallow,
  });

  const importing = (specifier: string): RulekeepEvent => ({
    kind: 'after-edit',
    agent: 'claude-code',
    sessionId: 's1',
    repoRoot: '/repo',
    changes: [{ path: 'src/components/List.ts', before: null, after: `import { q } from '${specifier}';\n` }],
  });

  it('matches a relative import through a glob', () => {
    expect(checkBoundaryRule(globRule(['**/db/**']), importing('../db/client'))).toHaveLength(1);
  });

  it('matches a deeper relative path through the same glob', () => {
    expect(checkBoundaryRule(globRule(['**/db/**']), importing('../../db/pg/pool'))).toHaveLength(1);
  });

  it('does not match an unrelated import', () => {
    expect(checkBoundaryRule(globRule(['**/db/**']), importing('../utils/format'))).toEqual([]);
  });

  it('still honours a plain literal prefix, with no glob syntax', () => {
    expect(checkBoundaryRule(globRule(['@/repositories']), importing('@/repositories/user'))).toHaveLength(1);
    expect(checkBoundaryRule(globRule(['@/repositories']), importing('@/repos'))).toEqual([]);
  });

  it('matches a bare package name by glob', () => {
    expect(checkBoundaryRule(globRule(['pg', 'mysql*']), importing('mysql2'))).toHaveLength(1);
  });
});
