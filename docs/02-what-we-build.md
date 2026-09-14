# 2. What we build

This chapter is the product spec: who it's for, what they see, the rules file
format, every rule type, and what's deliberately left out. How it works inside
is in [03-architecture.md](./03-architecture.md).

> **Working name: `holdfast`.** A holdfast is a clamp that holds a workpiece
> still. It's a placeholder — check GitHub and npm for clashes before
> publishing, and never use "Claude", "Anthropic", "GPT" or "Codex" in the real
> name ([07-business.md](./07-business.md)).

---

## One sentence

**holdfast enforces your project's rules while an AI agent works — in Claude
Code, Codex and Gemini CLI — and checks the same rules again in CI.**

## Who it's for

| Person | Their problem | What they get |
| --- | --- | --- |
| **Solo developer** using Claude Code or Codex daily | Keeps correcting the same mistakes the agent makes | Rules that stop the mistake before they have to notice it |
| **Team lead** whose team uses different agents | Everyone's agent follows different rules, or none | One rules file in the repo, enforced for everyone |
| **Open-source maintainer** receiving AI-written pull requests | PRs skip tests, add banned dependencies, break conventions | A CI check that catches it on every PR |

## What using it looks like

### 1. Install (once)

In Claude Code:

```
/plugin marketplace add <github-user>/holdfast
/plugin install holdfast@holdfast
```

Codex and Gemini CLI have their own install commands
([06-publishing.md](./06-publishing.md)).

### 2. Set up rules (once per repo)

The user runs the setup skill:

```
/holdfast:setup
```

The agent reads `CLAUDE.md`, `AGENTS.md` and `GEMINI.md`, picks out the rules a
machine can check, and proposes a `holdfast.yaml`. **The user reviews and
approves it.** Nothing is enforced until the file exists.

For LIFEWORLD it would propose rules like "no `any`", "no hex colors in
`src/components/`", "components can't import repositories". It would *not*
propose "keep screens thin" — that needs judgement, not code (see
[What it does not do](#what-it-does-not-do)).

### 3. Work normally

The agent works as usual. When it breaks a rule, it gets a message like this
straight away:

```
holdfast: this edit breaks 1 rule.

  no-any (block)  app/src/features/world/queries.ts:42
    const data = response as any;
    Don't use `any`. Use `unknown` and narrow it. (app/CLAUDE.md §13)

Fix the edit, then continue. If this is a genuine exception, add
`// holdfast-ignore no-any: <reason>` on that line.
```

The agent fixes the line and carries on. The user only sees a short note that a
rule fired.

### 4. Pull request

CI runs the same rules on everything the PR changed:

```bash
npx holdfast check --base origin/main
```

It fails the build on any blocking rule and lists every override with its reason.

---

## The rules file

One file at the repo root: **`holdfast.yaml`**. It's plain YAML so anyone can
read and review it in a pull request.

### Full example (LIFEWORLD)

```yaml
version: 1

defaults:
  mode: warn             # off | warn | block
  allowOverride: true    # can a line opt out with a holdfast-ignore comment?

rules:
  # --- Command rules: run before a shell command -------------------------
  - id: no-force-push
    type: command
    match: 'git\s+push\b.*\s(--force|-f)\b'
    mode: block
    allowOverride: false
    message: Never force-push. Ask the user instead.

  - id: use-edit-tool
    type: command
    match: '\bsed\s+-i\b'
    mode: block
    message: Edit files with the edit tool, not `sed -i`, so changes can be reviewed.

  # --- Line rules: run on the lines an edit added or removed -------------
  - id: no-any
    type: line
    files: ['app/src/**/*.{ts,tsx}', 'web/**/*.{ts,tsx}']
    added: '(:\s*any\b|\bas\s+any\b|<any>)'
    mode: block
    message: Don't use `any`. Use `unknown` and narrow it. (app/CLAUDE.md §13)

  - id: no-hex-colors-in-components
    type: line
    files: ['app/src/components/**/*.tsx']
    added: '#[0-9a-fA-F]{3,8}\b'
    message: Colors come from `constants/theme.ts`, not literals. (app/CLAUDE.md §7)

  - id: no-banned-libraries
    type: line
    files: ['app/src/**/*.{ts,tsx}']
    added: 'from\s+[''"](moment|lodash|axios)[''"/]'
    mode: block
    message: moment, lodash and axios are banned. Use Intl, native methods, fetch. (app/CLAUDE.md §3)

  # --- Boundary rules: which folders may import which ---------------------
  - id: components-stay-presentational
    type: boundary
    from: 'app/src/components/**'
    disallow: ['@/repositories', '@/store', '@/features']
    mode: block
    message: Components are presentational. Pass data in as props. (app/CLAUDE.md §4)

  # --- Test guard: protects tests from being weakened --------------------
  - id: keep-tests-honest
    type: test-guard
    files: ['**/*.test.{ts,tsx}']
    mode: block
    allowOverride: false

  # --- Checker rules: run a real tool and hand its errors to the agent ---
  - id: app-typecheck
    type: checker
    when: ['app/src/**/*.{ts,tsx}']
    run: npm run typecheck
    cwd: app
    on: stop             # stop (default) | edit
    mode: block

  # --- Prose rules: run on the agent's final message ---------------------
  - id: no-filler-words
    type: prose
    match: '\b(load-bearing|delve|seamlessly)\b'
    message: Say it plainly.
```

### Common fields (every rule)

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Unique, kebab-case. Shown in messages and used in override comments |
| `type` | yes | One of the seven types below |
| `mode` | no | `off`, `warn` or `block`. Defaults to `defaults.mode` |
| `message` | no* | What the agent is told. *Required for `command`, `line`, `boundary` and `prose` |
| `files` | no | Glob patterns the rule applies to. Default: all files |
| `exclude` | no | Glob patterns to skip |
| `allowOverride` | no | Whether a `holdfast-ignore` comment can silence it |

### What `warn` and `block` mean at each moment

| Moment | `warn` | `block` |
| --- | --- | --- |
| Before a command | Command runs; agent is told the rule | Command does **not** run; agent is told why |
| After an edit | Agent is told; may continue | Agent is told it must fix the edit before continuing |
| Agent wants to stop | Listed in the final summary | Agent is sent back to fix it (with a retry limit, below) |
| CI (`holdfast check`) | Printed, build passes | Printed, build **fails** |

An edit has already happened when the after-edit hook runs, so "block" there
means "tell the agent to fix it now", not "undo".

---

## The seven rule types

### 1. `command` — before a shell command runs

Matches the command text with a regex.

| Field | Meaning |
| --- | --- |
| `match` | Regex tested against the full command string |

**Examples:** block `git push --force`, `rm -rf /`, `npm publish`; redirect
`sed -i` to the edit tool.

**Honest limit:** a determined agent can hide a command (for example inside a
script file). This is a guardrail against habits, not a security sandbox.

### 2. `line` — the lines an edit changed

Looks at the real change: lines **added** and lines **removed**, not the whole
file. So pre-existing problems in old code don't fire; only new ones do.

| Field | Meaning |
| --- | --- |
| `added` | Regex tested against each added line |
| `removed` | Regex tested against each removed line |

At least one of `added` or `removed` is required.

**Examples:** no `any`, no `console.log`, no hex colors in components, no banned
imports.

### 3. `boundary` — who may import whom

Reads the import lines an edit **added** and checks them against folder rules.

| Field | Meaning |
| --- | --- |
| `from` | Glob of files the rule applies to |
| `disallow` | Import specifiers (or prefixes) those files may not import |

**Example:** `app/src/components/**` may not import `@/repositories`. This is
LIFEWORLD's import-direction rule from `app/CLAUDE.md` §4, enforced for real.

v1 matches import specifiers as written (`@/repositories`, `../repositories`).
Resolving path aliases from `tsconfig.json` is a later improvement.

### 4. `test-guard` — tests can't be weakened to pass

The most common way an agent "fixes" a failing test is to switch it off. This
rule type has fixed, built-in checks; no regex needed.

| Check | Fires when |
| --- | --- |
| Skip or focus added | An added line contains `.skip(`, `.only(`, `.todo(`, `xit(`, `xdescribe(`, `skip: true`, `@pytest.mark.skip`, `t.Skip(` |
| Test file deleted | A file matching `files` existed at session start and is now gone |
| Assertions removed | More assertion lines (`expect(`, `assert`, `should`) removed than added in one test file |
| Snapshot rewritten | A snapshot file changed in bulk in the same turn as a failing test |

| Field | Meaning |
| --- | --- |
| `files` | Globs for test files |
| `checks` | Optional list to turn individual checks off |

**Default:** `mode: block`, `allowOverride: false`.

### 5. `checker` — run a real tool

Runs a command (type checker, linter, a quick test) and gives its output to the
agent. This catches what regex can't — a type error, an unused import, a broken
build.

| Field | Meaning |
| --- | --- |
| `run` | Command to run |
| `cwd` | Folder to run it in (relative to repo root) |
| `when` | Globs; the checker only runs if a changed file matches |
| `on` | `stop` (default) or `edit` |
| `timeoutSeconds` | Default 60 |

**Why `on: stop` is the default:** a full type check can take many seconds.
Running it after every edit would make the agent slow. Running it once, when the
agent thinks it's done, catches the same errors with one delay.

A non-zero exit code means the rule fired. The first 40 lines of output go to
the agent.

### 6. `prose` — the agent's final message

Regex on the agent's last message before it stops. For banned phrases and
habits, like the "load-bearing" issue.

| Field | Meaning |
| --- | --- |
| `match` | Regex tested against the final message |

Available where the agent passes the final message to its stop hook. Where it
doesn't, the rule is skipped and `holdfast doctor` says so.

### 7. Rule reminder — built in, not configured

Not a rule type you write. After the agent compacts its conversation, holdfast
puts a short summary of every active rule back into context. This is what keeps
long sessions following the rules.

---

## Overrides

Sometimes breaking a rule is right. The override must be **visible** and carry a
**reason**:

```ts
const raw = JSON.parse(text) as any; // holdfast-ignore no-any: third-party JSON, validated on the next line
```

Rules:

- The comment must be on the same line or the line directly above.
- It must name the rule id and give a reason. `holdfast-ignore no-any` with no
  reason doesn't count.
- Rules with `allowOverride: false` ignore these comments.
- Every override is listed in the end-of-turn summary and in the CI report. An
  agent can add an override, but it can't hide one.

## Stopping without looping forever

When a blocking rule is still broken, the stop hook sends the agent back to work.
If the agent can't fix it, it could loop. So:

- holdfast sends the agent back **at most 3 times per turn** (configurable as
  `defaults.maxStopRetries`).
- After that it lets the agent stop, and the final message to the user says
  exactly which rules are still broken.

## Commands

| Command | Who runs it | What it does |
| --- | --- | --- |
| `/holdfast:setup` | User, in the agent | Proposes `holdfast.yaml` from the repo's rule files |
| `/holdfast:explain <rule-id>` | User, in the agent | Shows what a rule checks and recent hits |
| `holdfast check [--base <ref>]` | CI or a human | Checks all changes since `<ref>` against every rule |
| `holdfast test` | Rule authors | Runs each rule against its example files ([05-testing.md](./05-testing.md)) |
| `holdfast doctor` | User | Checks Node version, config validity, which hooks the current agent supports |
| `holdfast hook <agent> <event>` | The agent's hooks (internal) | Entry point every hook calls |

## What it does not do

Say these plainly in the README. Promising more will lose trust fast.

| Not in v1 | Why |
| --- | --- |
| **Judge quality** ("keep screens thin", "write less") | Needs judgement. Would need an AI model call, which costs money and makes results unpredictable |
| **Be a security boundary** | An agent with shell access can work around any hook. Use sandboxing for security; this is for habits and conventions |
| **Auto-fix** | The agent fixes; holdfast explains. Keeps holdfast small and predictable |
| **Network calls or telemetry** | Hooks run on people's machines on every edit. Nothing leaves the machine |
| **A dashboard or accounts** | Only if teams adopt it and ask ([07-business.md](./07-business.md)) |
| **Resolve TypeScript path aliases** | Match import text as written in v1 |

## Versions

| Version | Scope | Done when |
| --- | --- | --- |
| **v0.1** | Claude Code plugin. Rule types: command, line, test-guard, checker, rule reminder. `check` CLI | Works on LIFEWORLD for 2 weeks; `claude plugin validate` passes; installs on Windows, macOS, Linux |
| **v0.2** | Codex plugin. Boundary rules. Overrides report | Same rules file works in Codex on LIFEWORLD |
| **v0.3** | Gemini CLI extension. Prose rules. `/holdfast:setup` skill | Accepted into Anthropic's community marketplace |
| **v1.0** | Stable `holdfast.yaml` format (no breaking changes after this) | 3 outside repos use it; no open bugs marked critical |
