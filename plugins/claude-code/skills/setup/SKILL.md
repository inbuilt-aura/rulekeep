---
name: setup
description: Create or update holdfast.yaml from this repo's CLAUDE.md, AGENTS.md and GEMINI.md rules. Use when the user wants holdfast set up or asks which of their rules can be enforced.
disable-model-invocation: true
---

Set up holdfast rules for this repository.

1. Read every CLAUDE.md, AGENTS.md and GEMINI.md in the repo.
2. List each rule you find. For each, decide whether code can check it:
   - **Checkable:** a pattern in added lines, a banned import, a command to block,
     a test that must not be skipped, a command like a type check that must pass.
   - **Not checkable:** anything that needs judgement ("keep screens thin").
3. Propose holdfast.yaml using only these rule types:
   - `command` — a shell command that must not run (`match:` regex).
   - `line` — a pattern in added or removed lines (`added:` / `removed:` regex, `files:` globs).
   - `boundary` — imports a set of files must not make (`disallow:` globs).
   - `test-guard` — tests skipped, deleted, or stripped of assertions.
   - `checker` — a real command that must pass (`run:`, `on: stop|edit`).
   - `prose` — a claim the agent must not make in its final message (`match:` regex).
4. Default every rule to `mode: warn` unless the source says "never" or
   "banned", then use `block`.
5. Show the user the full proposed file AND the list of rules you left out,
   with one line each on why.
6. Only write holdfast.yaml after the user approves. Then run
   `holdfast doctor` and report the result.

If the file proposes any `checker` rules, tell the user they must run
`/holdfast:trust` before those commands will run.
