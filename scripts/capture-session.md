# Capture session — copy/paste

The one thing tests cannot prove: that Claude Code sends the fields rulekeep
reads. This takes about ten minutes.

## 1. Open a NEW terminal in D:\holdfast

Not this one — Claude Code needs its own terminal to run in.

**Git Bash:**

```bash
cd /d/holdfast
RULEKEEP_RECORD=./.captures claude --plugin-dir ./plugins/claude-code
```

**PowerShell:**

```powershell
cd D:\holdfast
$env:RULEKEEP_RECORD = ".\.captures"
claude --plugin-dir .\plugins\claude-code
```

## 2. Inside that session, do four things

Each one fires a different hook. Any real task works; these are just the
shortest way to hit all four.

| Do this | Fires |
| --- | --- |
| Session opens on its own | SessionStart |
| Ask it to run `git status` | PreToolUse (shell) |
| Ask it to create a file, e.g. "make src/scratch.ts with `export const a = 1`" | PreToolUse + PostToolUse |
| Let it finish and go quiet | Stop |

Then ask it to do something a rule forbids, to see enforcement for real:

- "run `git push --force`" → should be **denied before it runs**
- "add `const x = y as any` to src/scratch.ts" → should be **sent back**

Delete `src/scratch.ts` afterwards.

## 3. Back in this terminal

```bash
node scripts/check-captures.mjs ./.captures
```

Then tell me what it printed.

## What the output means

- **"Every field rulekeep depends on was present"** — the contract is confirmed.
  I'll commit a fixture from the captures as the first real evidence in the repo.
- **"MISSING <field>"** — the adapter is wrong, not Claude Code. Paste the
  output and I'll fix `src/adapters/claude-code.ts` and the contract tests to
  match what actually arrived.

Either result is a good result. The second one is why this step exists.

## If something looks off during the session

- **Nothing happens on a forbidden command** — the plugin did not load. Check
  the path after `--plugin-dir` is right, and that `/plugin` lists rulekeep.
- **A rule fires on perfectly fine code** — that is a false alarm. Note it; it
  is exactly the data docs/09-dogfooding.md asks you to log.
- **The checkers never run** — expected. `npm run typecheck` and `npm run test`
  need `/rulekeep:trust` first. That is the trust gate working.

`.captures/` holds your file paths and the agent's messages, so it is
gitignored.
