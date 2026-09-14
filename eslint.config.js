// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * The engine (src/engine/**) must stay pure: no filesystem, no processes, no
 * clock. That's what makes it fast and exhaustively testable with fixtures,
 * and what guarantees every agent adapter sees identical behaviour
 * (docs/03-architecture.md "Why the engine is pure").
 */
const enginePurity = {
  files: ['src/engine/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          { name: 'node:fs', message: 'The engine is pure. File access belongs in src/runtime.' },
          { name: 'node:child_process', message: 'The engine is pure. Process spawning belongs in src/runtime.' },
          { name: 'fs', message: 'The engine is pure. File access belongs in src/runtime.' },
          { name: 'child_process', message: 'The engine is pure. Process spawning belongs in src/runtime.' },
        ],
      },
    ],
  },
};

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  enginePurity,
);
