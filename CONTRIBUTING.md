# Contributing to rulekeep

Thanks for helping improve rulekeep. The project is open to focused bug fixes,
false-alarm reports, documentation improvements, and new rule ideas.

## Fork and pull request workflow

The `main` branch is protected. Contributors should work from a fork and open
a pull request; direct pushes to `main` are not accepted.

```bash
git clone https://github.com/<your-account>/rulekeep.git
cd rulekeep
git remote add upstream https://github.com/inbuilt-aura/rulekeep.git
git switch -c fix/short-description
npm ci
```

Make the smallest useful change, add or update tests, and keep the branch
focused. Before opening the pull request, sync with upstream and push your
branch:

```bash
git fetch upstream
git rebase upstream/main
npm run verify
git push -u origin fix/short-description
```

Open a pull request from your fork to `inbuilt-aura/rulekeep:main`. Explain the
problem, the approach, and how you verified the change. Maintainers review the
pull request before merging; CI must pass and at least one approval is
required.

## Before opening a pull request

Run the complete local check:

```bash
npm ci
npm run verify
```

The verify command runs TypeScript, ESLint, the Vitest suite, and the build.

For a quick first contribution, look for issues labelled `good first issue` or
`documentation`, improve an example or error message, or reproduce a reported
false alarm with a focused test. Questions and small usage reports are welcome
even when they are not yet polished feature requests.

## Project boundaries

The engine in `src/engine/` stays pure: it must not read the filesystem, start
processes, or read the clock. ESLint enforces this boundary. Runtime concerns
belong in `src/runtime/`.

Every new rule type needs an implementation, configuration validation,
evaluation tests, formatting coverage, and documentation. Follow the definition
of done in `docs/04-build-plan.md`.

Keep changes focused, add regression tests for behavior changes, and update the
documentation when a user-facing contract changes.
