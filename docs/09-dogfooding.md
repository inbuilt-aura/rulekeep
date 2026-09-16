# 9. Dogfooding

Everything in this repo is tested, and none of it has been used. This chapter
is how that changes: install rulekeep into a real Claude Code session, work
normally for two weeks, and find out whether it helps or nags.

This is the gate on v0.1.0 ([04-build-plan.md](./04-build-plan.md) M4 step 7).
The target is a **false-alarm rate under 1 in 5** — a tool that cries wolf gets
uninstalled once and never reinstalled.

---

## Why this can't be skipped

Every contract test in `test/contracts/` drives the hooks with payload shapes
written from the spec in [03-architecture.md](./03-architecture.md). They pass.
They are also, until a real session says otherwise, an assumption: that Claude
Code sends `session_id`, `tool_use_id`, `tool_input.file_path` and the rest,
spelled exactly that way.

If a field name is wrong, no test in this repo can tell you. The hook returns
`{}`, the agent proceeds, and rulekeep silently enforces nothing — the failure
mode it exists to prevent.

`RULEKEEP_RECORD` settles it.

---

## Session 1: capture what Claude Code really sends

From the rulekeep repo:

```bash
npm run build
```

Then, **in the project you want to enforce rules on** (not this repo):

```bash
# Git Bash / macOS / Linux
RULEKEEP_RECORD=./.rulekeep-captures claude --plugin-dir /path/to/rulekeep/plugins/claude-code
```

```powershell
# PowerShell
$env:RULEKEEP_RECORD = ".\.rulekeep-captures"
claude --plugin-dir C:\path\to\rulekeep\plugins\claude-code
```

Hooks inherit the environment of the Claude Code process, so setting the
variable before launching is enough.

Work normally for one session. Make sure you do each of these at least once, so
every hook fires:

- run a shell command (PreToolUse)
- edit a file with Edit or Write (PreToolUse + PostToolUse)
- let the agent finish a turn (Stop)

Then, back in the rulekeep repo:

```bash
node scripts/check-captures.mjs /path/to/your/project/.rulekeep-captures
```

It reports, per event, which fields rulekeep depends on were present, which
were missing, and what Claude Code sent that we do not read yet.

**If it reports problems:** the contract tests are wrong, not Claude Code. Fix
`src/adapters/claude-code.ts` and `test/contracts/claudeCodeHooks.test.ts` to
match the captures, and copy a representative payload into
`test/contracts/claude-code/` as a fixture.

**If it reports everything present:** the contract is confirmed. Commit a
fixture anyway — it is the first real evidence in the repo.

Add `.rulekeep-captures/` to that project's `.gitignore`. Payloads contain your
file paths and the agent's last message.

---

## Sessions 2 onward: actually live with it

Turn recording off (leave `RULEKEEP_RECORD` unset) and just work.

Start with **`mode: warn` on everything.** A blocking rule that turns out to be
wrong is far more annoying than a warning, and you cannot yet know which rules
are wrong. Promote a rule to `block` only after it has fired correctly several
times.

Write the rules from what your CLAUDE.md already says:

```
/rulekeep:setup
```

If any are `checker` rules, approve them before they will run:

```
/rulekeep:trust
```

### Keep a log

One line per firing, in a scratch file. This is the evidence for the 1-in-5 gate:

```
date  rule-id  right or wrong  what happened
----  -------  --------------  -------------
9-17  no-any   right           caught `as any` in a fetch wrapper
9-17  no-todo  WRONG           fired on a TODO inside a string literal
```

A **false alarm** is the rule firing when the code was fine. Those are the ones
that matter — each is either a rule to narrow, a rule to delete, or a bug.

When one is a bug, add a test for it before fixing. That is the discipline that
has already caught real defects here: `timeoutSeconds: .inf` disabling every
rule, a trust key that let one approval cover every repo, and a boundary rule
that silently enforced nothing.

---

## What to watch for

| Symptom | What it means | Likely fix |
| --- | --- | --- |
| A rule never fires | Its globs or regex don't match reality | Check with `rulekeep check --base HEAD` |
| A rule fires constantly on fine code | Too broad | Narrow the regex, or add `exclude` |
| The agent loops at stop | It can't satisfy a rule | Lower `maxStopRetries`, or make the message say *how* to fix it |
| Edits feel slow | A checker is on `on: edit` | Move it to `on: stop` |
| You reach for `rulekeep-ignore` often | The rule is wrong, not the code | Change the rule |

Overrides are the signal to trust most. Silencing a rule repeatedly means the
rule is miscalibrated — that is data, not a workaround.

---

## Done when

- One session captured and `check-captures.mjs` is clean, with a fixture committed
- Two weeks of real use logged
- False-alarm rate under 1 in 5
- Every false alarm either fixed, narrowed, or the rule deleted
- You would keep it installed if it were someone else's tool

That last one is the real test. If the honest answer is no, the gap between it
and yes is the v0.1.0 work.
