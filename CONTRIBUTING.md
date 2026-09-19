# Contributing to rulekeep

## Before opening a pull request

Run the complete local check:

```bash
npm ci
npm run verify
```

The verify command runs TypeScript, ESLint, the Vitest suite, and the build.

## Project boundaries

The engine in `src/engine/` stays pure: it must not read the filesystem, start
processes, or read the clock. ESLint enforces this boundary. Runtime concerns
belong in `src/runtime/`.

Every new rule type needs an implementation, configuration validation,
evaluation tests, formatting coverage, and documentation. Follow the definition
of done in `docs/04-build-plan.md`.

Keep changes focused, add regression tests for behavior changes, and update the
documentation when a user-facing contract changes.