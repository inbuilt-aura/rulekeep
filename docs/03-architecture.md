# 3. How it works

This chapter is the technical design: the parts of rulekeep, how data flows for
each agent, how changes are detected, the exact hook formats, and the rules for
speed, safety and Windows. Build steps are in [04-build-plan.md](./04-build-plan.md).

Claude Code facts here were checked against the official docs on 14 September
2026 ([hooks reference](https://code.claude.com/docs/en/hooks),
[plugins reference](https://code.claude.com/docs/en/plugins-reference)).

---

## The big picture

```
                         ┌───────────────────────────── rulekeep.cjs (one bundled file) ─────────────────────────────┐
                         │                                                                                             │
 Claude Code hook ──┐    │  ┌──────────────┐    ┌───────────────┐    ┌──────────────────┐    ┌───────────────────┐   │
 Codex hook ────────┼──► │  │   adapter    │ ─► │    runtime    │ ─► │   rule engine    │ ─► │  adapter output   │ ──┼──► back to the agent
 Gemini CLI hook ───┘    │  │ agent JSON → │    │ snapshots,    │    │ pure: event +    │    │ verdict → agent's │   │
                         │  │ rulekeep     │    │ git baseline, │    │ rules → verdict  │    │ JSON / exit code  │   │
 rulekeep check (CI) ──► │  │ event        │    │ run checkers  │    │                  │    │                   │   │
                         │  └──────────────┘    └───────────────┘    └──────────────────┘    └───────────────────┘   │
                         └─────────────────────────────────────────────────────────────────────────────────────────────┘
```

Four parts, each with one job:

| Part | Job | Allowed to |
| --- | --- | --- |
| **Adapter** (one per agent) | Read that agent's hook JSON from stdin; write that agent's answer to stdout | Know one agent's format. Nothing else |
| **Runtime** | Everything that touches the outside world: read files, save snapshots, call git, run checker commands, keep per-session state | Use the file system and child processes |
| **Rule engine** | Decide. Given an event and the rules, return a verdict | Nothing impure — no files, no processes, no clock. Pure functions only |
| **CLI** | Entry points: `hook`, `check`, `test`, `doctor`, `explain` | Wire the other three together |

**Why the engine is pure:** it's where the bugs that matter live (wrong verdicts,
false alarms), and pure code is fast and free to test with thousands of fixture
cases. It also means the same engine runs identically in every agent and in CI.

---

## Source layout

```
src/
  engine/
    config.ts        parse + validate rulekeep.yaml → typed rules (errors carry line numbers)
    events.ts        the RulekeepEvent and Verdict types
    diff.ts          added/removed lines, with line numbers, between two file versions
    evaluate.ts      (event, rules) → Verdict
    format.ts        Verdict → the message the agent reads
    overrides.ts     find `rulekeep-ignore <rule>: <reason>` comments
    rules/
      command.ts  line.ts  boundary.ts  testGuard.ts  prose.ts
  runtime/
    state.ts         per-session folder: snapshots, baseline, stop retry counter
    snapshot.ts      save a file's content before an edit
    baseline.ts      what the repo looked like when the session started
    changes.ts       compute FileChange[] (after an edit, at stop, or in CI)
    checker.ts       run a checker command with a timeout, capture output
    trust.ts         has the user approved this rulekeep.yaml's checker commands?
  adapters/
    claude-code.ts   codex.ts   gemini-cli.ts
  cli/
    main.ts          rulekeep hook | check | test | doctor | explain | trust
```

**Build output:** one file, `dist/rulekeep.cjs`, bundled with esbuild. Every
plugin package (Claude Code, Codex, Gemini CLI) contains a copy.

**Runtime dependencies** (all pure JavaScript, bundled into that one file):

| Package | Why |
| --- | --- |
| `yaml` | Parse `rulekeep.yaml` with line numbers for error messages |
| `picomatch` | Glob matching for `files`, `exclude`, `when`, `from` |
| `diff` | Line diffs between file versions |

No native modules, no bash, no Python. Only Node.js 22 or newer (Node 20 reached
end of life on 30 April 2026).

> Claude Code can install a plugin's npm dependencies automatically (it runs
> `npm ci --ignore-scripts` when the plugin has a `package.json` and lockfile).
> We still bundle, because Codex and Gemini CLI don't do this, and a single file
> starts faster.

---

## The event model

Every adapter turns its agent's hook data into one of these. The engine only
ever sees these types.

```ts
export type AgentName = 'claude-code' | 'codex' | 'gemini-cli' | 'ci';

export interface FileChange {
  /** Repo-relative, forward slashes: "app/src/components/Card.tsx" */
  readonly path: string;
  /** null = the file didn't exist before (created) */
  readonly before: string | null;
  /** null = the file no longer exists (deleted) */
  readonly after: string | null;
}

interface Base {
  readonly agent: AgentName;
  readonly sessionId: string;
  readonly repoRoot: string;
}

export type RulekeepEvent =
  | (Base & { kind: 'session-start'; reason: 'startup' | 'resume' | 'clear' | 'compact' })
  | (Base & { kind: 'before-command'; command: string })
  | (Base & { kind: 'before-edit'; paths: readonly string[] })
  | (Base & { kind: 'after-edit'; changes: readonly FileChange[] })
  | (Base & { kind: 'stop'; changes: readonly FileChange[]; finalMessage: string | null; retry: number });

export interface Finding {
  readonly ruleId: string;
  readonly mode: 'warn' | 'block';
  readonly message: string;
  readonly path?: string;
  readonly line?: number;
  readonly excerpt?: string;
  /** Present when a rulekeep-ignore comment silenced a finding. It is still reported */
  readonly override?: { readonly reason: string };
}

export interface Verdict {
  /** block if any un-overridden block finding; warn if any warn finding; else allow */
  readonly outcome: 'allow' | 'warn' | 'block';
  readonly findings: readonly Finding[];
}
```

---

## Which rules run when

| Event | command | line | boundary | test-guard | checker `on: edit` | checker `on: stop` | prose | rule reminder |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| session-start (compact) | | | | | | | | ✓ |
| before-command | ✓ | | | | | | | |
| after-edit | | ✓ | ✓ | ✓ | ✓ | | | |
| stop | | ✓ | ✓ | ✓ | | ✓ | ✓ | |
| CI (`rulekeep check`) | | ✓ | ✓ | ✓ | ✓ | ✓ | | |

At **stop**, line, boundary and test-guard rules run again over the **whole
turn's changes**. That's what catches files written through the shell, which no
after-edit hook saw.

---

## How changes are detected

This is the hardest part to get right, and the part hookify doesn't do.

### After one edit: snapshot before, compare after

The agent's edit tools don't give us a clean "before and after":

- `Write` sends the new content only — not what the file held before.
- `Edit` sends `old_string` and `new_string`, but with `replace_all` it can change
  many places, and we need real line numbers.

So rulekeep uses **two hooks per edit**:

```
PreToolUse (Edit|Write)   → runtime/snapshot.ts saves the file's current content
                             to <state>/snapshots/<tool_use_id>
                             (or "did not exist")
        ↓ the agent's tool edits the file
PostToolUse (Edit|Write)  → read the snapshot + the file now → FileChange
                             → engine.diff → added/removed lines with line numbers
                             → rules
```

Claude Code gives both hooks the same `tool_use_id`, which links the snapshot to
the result. If the snapshot is missing (for example, the pre-hook timed out),
fall back to comparing with the session baseline.

### At stop: compare with the session baseline

At **session start**, rulekeep records what the repo looked like:

1. `git rev-parse HEAD` — the commit.
2. `git status --porcelain=v1 -z` — files already modified or untracked **by the
   user**, before the agent did anything.
3. A copy of each of those already-modified files (skip files over 1 MB).

At **stop**, rulekeep lists every file that now differs from that baseline
(`git status` again, plus snapshot history), and builds a `FileChange` for each:

| File was… | `before` comes from |
| --- | --- |
| Clean at session start | `git show <HEAD>:<path>` |
| Already modified at session start | The copy saved at session start |
| Created during the session | `null` |

**Why this matters:** the user's own uncommitted work is not blamed on the
agent. Only what changed *during the session* is checked.

**No git repo?** The stop gate checks only files the edit hooks saw, and
`rulekeep doctor` says so.

### In CI: compare with the base branch

`rulekeep check --base origin/main`:

- changed files: `git diff --name-status -z origin/main...HEAD`, plus uncommitted
  working-tree changes
- `before`: `git show origin/main:<path>`
- `after`: the file on disk

---

## Per-session state

Stored in the OS temp folder, so it works the same for every agent:

```
<os.tmpdir()>/rulekeep/<agent>-<sessionId>/
  baseline.json          HEAD, dirty file list
  baseline-files/        copies of files dirty at session start
  snapshots/             one file per pending edit, deleted after PostToolUse
  stop.json              { turnId, retries }
```

At every session start, delete session folders older than 7 days.

---

## Claude Code: the exact wiring

### `hooks/hooks.json`

Use the **exec form** (`command` + `args`). It skips the shell entirely, so
quoting and paths with spaces work the same in Git Bash, PowerShell and sh.

```json
{
  "description": "rulekeep: enforce rulekeep.yaml rules",
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "node",
            "args": ["${CLAUDE_PLUGIN_ROOT}/dist/rulekeep.cjs", "hook", "claude-code", "session-start"],
            "timeout": 30 }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell|^Edit$|^Write$|^NotebookEdit$",
        "hooks": [
          { "type": "command", "command": "node",
            "args": ["${CLAUDE_PLUGIN_ROOT}/dist/rulekeep.cjs", "hook", "claude-code", "pre-tool-use"],
            "timeout": 10 }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "^Edit$|^Write$|^NotebookEdit$",
        "hooks": [
          { "type": "command", "command": "node",
            "args": ["${CLAUDE_PLUGIN_ROOT}/dist/rulekeep.cjs", "hook", "claude-code", "post-tool-use"],
            "timeout": 60 }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node",
            "args": ["${CLAUDE_PLUGIN_ROOT}/dist/rulekeep.cjs", "hook", "claude-code", "stop"],
            "timeout": 300 }
        ]
      }
    ]
  }
}
```

Notes on the choices above:

- **One entry per event.** Claude Code runs all matching hooks for an event **in
  parallel**. One entry means rulekeep controls the order itself.
- **Match `Bash|PowerShell`.** On Windows, Claude Code may route shell commands
  through a `PowerShell` tool instead of `Bash`. A hook matching only `Bash`
  never fires there.
- **`^Edit$` with anchors.** Matchers are unanchored regexes, so `Edit` alone
  would also match `NotebookEdit`.
- **Timeouts are in seconds.** The default for command hooks is 600. Short
  timeouts on the fast hooks keep a bug from freezing the agent.

### What each hook receives (the fields rulekeep uses)

Common to every event: `session_id`, `transcript_path`, `cwd`,
`permission_mode`, `hook_event_name`.

| Event | Extra fields rulekeep reads |
| --- | --- |
| SessionStart | `source`: `startup`, `resume`, `clear`, `compact` or `fork` |
| PreToolUse | `tool_name`, `tool_use_id`, `tool_input` |
| PostToolUse | `tool_name`, `tool_use_id`, `tool_input`, `tool_response` |
| Stop | `stop_hook_active`, `last_assistant_message` |

`tool_input` shapes:

| Tool | Fields |
| --- | --- |
| `Bash`, `PowerShell` | `command`, `description`, `timeout`, `run_in_background` |
| `Write` | `file_path`, `content` |
| `Edit` | `file_path`, `old_string`, `new_string`, `replace_all` |

**File paths are always absolute and use the platform's separators** —
backslashes on Windows (`C:\\project\\src\\index.ts`). The adapter converts every
path to repo-relative with forward slashes before anything else sees it.

### What each hook returns

rulekeep **always exits 0 and prints JSON**. It never uses exit code 2, so a
rulekeep bug can't accidentally block the agent.

**SessionStart, after compaction** — put the rules back into context:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "rulekeep rules for this repo:\n- no-any (block): Don't use `any`…\n- …"
  }
}
```

**PreToolUse, command blocked:**

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "rulekeep: no-force-push (block)\nNever force-push. Ask the user instead."
  }
}
```

For `deny`, the reason is shown to Claude. For a **warn**, don't set
`permissionDecision` (the normal permission flow continues) and use
`additionalContext` for the warning.

> Don't return `"allow"` to mean "no rule broken". `allow` skips the user's
> permission prompt, which rulekeep has no business doing. Return `{}`.

**PostToolUse, edit breaks a blocking rule** — `decision` and `reason` are
**top-level** for this event:

```json
{
  "decision": "block",
  "reason": "rulekeep: this edit breaks 1 rule.\n\n  no-any (block)  app/src/features/world/queries.ts:42\n    const data = response as any;\n    Don't use `any`. Use `unknown` and narrow it.\n\nFix the edit, then continue."
}
```

The edit has already happened; `block` puts the reason next to the tool result
so Claude acts on it. For a **warn**, use
`hookSpecificOutput.additionalContext` instead.

**Stop, blocking rules still broken** — also top-level:

```json
{
  "decision": "block",
  "reason": "rulekeep: 2 rules are still broken in this turn's changes.\n…\nFix these before finishing."
}
```

To let Claude stop while telling the **user** what's left, return:

```json
{ "systemMessage": "rulekeep: stopped with 1 rule still broken (keep-tests-honest in app/src/models/world.test.ts). 1 override used." }
```

### Loop protection at stop

Three layers:

1. **rulekeep's own limit:** send the agent back at most `maxStopRetries` times
   (default 3) per turn, counted in `stop.json`.
2. **`stop_hook_active`:** `false` on the first stop attempt of a turn, `true`
   when Claude is already continuing because of a stop hook. rulekeep resets its
   counter whenever it's `false`.
3. **Claude Code's cap:** Claude Code ends the turn after **8 consecutive
   blocks** regardless.

### Output size

Claude Code caps hook output strings at 10,000 characters. rulekeep lists at most
20 findings and adds "…and N more (run `rulekeep check`)".

---

## Codex and Gemini CLI

The adapters for Codex and Gemini CLI follow the same pattern: map the agent's
before-tool, after-tool, stop and session events to rulekeep events, and map the
verdict back to the agent's output format. Their exact formats are in the
[Codex and Gemini CLI wiring](#codex-and-gemini-cli-wiring) section below.

---

## CI mode

```bash
npx rulekeep check --base origin/main [--format text|github|json]
```

- Runs line, boundary, test-guard and checker rules over every change since
  `--base` (see [In CI](#in-ci-compare-with-the-base-branch)).
- Command and prose rules are skipped — there's no agent in CI.
- Lists every override with its reason.
- Exit code **1** if any un-overridden blocking finding, **0** otherwise, **2**
  if the config is invalid.
- `--format github` prints GitHub Actions annotations
  (`::error file=app/src/x.ts,line=42::no-any: …`), so findings appear inline on
  the pull request.

---

## Speed

| Hook | Budget (normal laptop) | How |
| --- | --- | --- |
| PreToolUse | < 150 ms | Node startup (~50 ms) + regex. No git calls |
| PostToolUse | < 200 ms without checkers | Read snapshot + file, diff, regex. No git calls |
| Stop | < 2 s without checkers | One `git status`, one `git show` per changed file |
| Checkers | whatever the tool takes | Only when a changed file matches `when`; `on: stop` by default |

Rules to keep it fast:

- **Bundle** into one file; no module resolution at startup.
- **Parse `rulekeep.yaml` once per hook call**, and cache the parsed result in the
  session folder keyed by the file's hash.
- **Skip lines over 2,000 characters** for regex rules (minified or generated
  files).
- **Ignore** `node_modules/`, `dist/`, `build/`, `.git/` and anything in
  `.gitignore` by default.

---

## Safety

### Fail open

Any exception, unreadable input or invalid config → exit 0 with a single
`systemMessage` such as `rulekeep: config error in rulekeep.yaml line 12 —
rules not applied`. **A broken rulekeep must never stop someone working.**

### Checker commands need approval

A `checker` rule runs a command from `rulekeep.yaml`. Someone could put a harmful
command in a repo's `rulekeep.yaml` and wait for a user to open it with an agent.

So: the first time rulekeep sees a `rulekeep.yaml` containing checker rules, it
**doesn't run them**. It tells the user once:

```
rulekeep: this repo's rulekeep.yaml wants to run 2 commands:
  npm run typecheck   (app-typecheck)
  npm run lint        (app-lint)
Run /rulekeep:trust to allow them. Other rules are active.
```

Approval stores the config's hash in `~/.rulekeep/trusted.json`. If the checker
commands change, approval is needed again.

### Nothing leaves the machine

No network calls, no telemetry, no update checks. This is also required for
listing in Anthropic's directory ([07-business.md](./07-business.md)).

### Regex from config

Rules come from the user's own repo, but a badly written regex can still be very
slow on some input. Mitigations: the 2,000-character line limit, a per-rule
fixture test (`rulekeep test`), and `rulekeep doctor` timing each rule against the
repo's largest files.

### Not a security boundary

An agent with shell access can always work around hooks. Say so in the README.
rulekeep is for conventions and habits; use real sandboxing for security.

---

## Windows

| Problem | What rulekeep does |
| --- | --- |
| Paths arrive with backslashes | Convert to forward slashes and repo-relative in the adapter, before anything else |
| Shell differs (Git Bash or PowerShell) | Exec-form hooks: `node` + `args`, no shell involved |
| Shell tool may be `PowerShell`, not `Bash` | Match `Bash\|PowerShell` |
| `python3` / bash scripts missing | Only Node is used |
| CRLF line endings | Normalise `\r\n` to `\n` before diffing; report line numbers from the normalised text |
| Case-insensitive file system | Compare paths case-insensitively on Windows when matching globs |

---

## Codex and Gemini CLI wiring

Checked against the official docs on 14 September 2026:
[Codex hooks](https://learn.chatgpt.com/docs/hooks),
[Codex plugins](https://learn.chatgpt.com/docs/plugins),
[Gemini CLI hooks reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md),
[Gemini CLI extensions](https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/reference.md).
Record real payloads before relying on any detail (see [05-testing.md](./05-testing.md#layer-2-hook-contract-tests)).

### The three agents side by side

| | Claude Code | Codex | Gemini CLI |
| --- | --- | --- | --- |
| **Hooks file in the plugin** | `hooks/hooks.json` | `hooks/hooks.json` (or `hooks` in `.codex-plugin/plugin.json`) | `hooks/hooks.json` (not in the manifest) |
| **Plugin manifest** | `.claude-plugin/plugin.json` | `.codex-plugin/plugin.json` | `gemini-extension.json` |
| **Plugin folder variable** | `${CLAUDE_PLUGIN_ROOT}` | `PLUGIN_ROOT` env var — **also sets `CLAUDE_PLUGIN_ROOT`** for compatibility | `${extensionPath}` |
| **Before a command** | `PreToolUse`, tool `Bash` / `PowerShell` | `PreToolUse`, tool `Bash` | `BeforeTool`, tool `run_shell_command` |
| **After an edit** | `PostToolUse`, tools `Edit`, `Write` | `PostToolUse`, tool `apply_patch` (matcher can say `Edit\|Write`) | `AfterTool`, tools `replace`, `write_file` |
| **Before stopping** | `Stop` | `Stop` | `AfterAgent` |
| **Session start** | `SessionStart` (`source` incl. `compact`) | `SessionStart` (`startup`, `resume`, `clear`, `compact`) | `SessionStart` (`startup`, `resume`, `clear` — **no compact**) |
| **Timeout unit** | seconds (default 600) | seconds (default 600) | **milliseconds** (default 60000) |
| **Matching hooks run** | in parallel | concurrently | in parallel unless `sequential: true` |
| **Hook approval** | none for installed plugins | **user must trust each hook in `/hooks`; re-trust when the hook definition changes** | extension install asks for consent |
| **Shell for hook commands** | `sh -c`; on Windows Git Bash, else PowerShell (or exec form `args`, no shell) | `$SHELL -lc`; on Windows `cmd.exe` (`commandWindows` overrides) | `bash -c`; on Windows PowerShell |
| **Model-visible output limit** | 10,000 characters | ~2,500 tokens | not stated |

### Codex

**The formats are close to Claude Code's**, so the Codex adapter is small — with
two important differences in behaviour, below.

Input fields rulekeep uses: `session_id`, `cwd`, `hook_event_name`, `turn_id`
(Codex-specific, useful for the stop retry counter), `tool_name`, `tool_use_id`,
`tool_input`, `stop_hook_active`, `last_assistant_message`.

**File edits arrive as a patch.** For `apply_patch`, `tool_input.command`
contains the patch text, not a file path. The adapter reads the file headers in
the patch (`*** Add File: <path>`, `*** Update File: <path>`,
`*** Delete File: <path>`, `*** Move to: <path>`, between `*** Begin Patch` and
`*** End Patch`) to know which files to snapshot in `PreToolUse` and compare in
`PostToolUse`. Confirm from recorded payloads whether paths can be absolute.

Outputs:

| Situation | JSON |
| --- | --- |
| Command blocked | `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "…"}}` |
| Warning before a command | `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "additionalContext": "…"}}` |
| Edit breaks **any** rule | `{"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": "…"}}` |
| Stop with blocking rules still broken | `{"decision": "block", "reason": "…"}` — Codex continues, using the reason as a new prompt |
| Stop, tell the user | `{"systemMessage": "…"}` |

Codex-specific cautions:

- **After an edit, use `additionalContext`, not `decision: "block"`.** In Codex,
  `block` on `PostToolUse` *replaces the tool result* with the reason, so the
  agent may think the patch failed and apply it again. Say "the edit was
  applied; fix line N", and enforce blocking rules at `Stop`.
- **No built-in limit on stop continuations.** Codex only provides
  `stop_hook_active`; it doesn't end the turn after N blocks the way Claude Code
  does. rulekeep's own `maxStopRetries`, counted per `turn_id`, is the only thing
  preventing an endless loop.
- **Don't return `permissionDecision: "ask"`, `continue`, `stopReason` or
  `suppressOutput` from `PreToolUse`.** Codex marks the hook as failed and lets
  the call through.
- **Crashes and timeouts fail open** — the tool call proceeds. That matches
  rulekeep's own fail-open rule.
- **`Stop` expects JSON when exiting 0.** Print `{}` rather than nothing or plain text.
- **Trust:** Codex skips plugin hooks until the user trusts them in `/hooks`.
  The trust hash covers each hook's event, matcher, command and timeout — not the
  contents of the script it runs. Keep `hooks.json` identical between releases
  and change only `rulekeep.cjs`, so updates don't ask for approval again.

`plugins/codex/hooks/hooks.json`:

```json
{
  "description": "rulekeep: enforce rulekeep.yaml rules",
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "node \"${PLUGIN_ROOT}/dist/rulekeep.cjs\" hook codex session-start", "timeout": 30 } ] }
    ],
    "PreToolUse": [
      { "matcher": "^Bash$|^apply_patch$", "hooks": [ { "type": "command", "command": "node \"${PLUGIN_ROOT}/dist/rulekeep.cjs\" hook codex pre-tool-use", "timeout": 10 } ] }
    ],
    "PostToolUse": [
      { "matcher": "^apply_patch$", "hooks": [ { "type": "command", "command": "node \"${PLUGIN_ROOT}/dist/rulekeep.cjs\" hook codex post-tool-use", "timeout": 60 } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "node \"${PLUGIN_ROOT}/dist/rulekeep.cjs\" hook codex stop", "timeout": 300 } ] }
    ]
  }
}
```

**Use the brace form `${PLUGIN_ROOT}`.** Codex replaces it in the command text
itself, before any shell runs. That matters on Windows, where Codex runs hook
commands through `cmd.exe`, which wouldn't understand `$PLUGIN_ROOT`. With the
brace form, the same command works on every OS, so `commandWindows` shouldn't be
needed — confirm on a real Windows machine in M5.

### Gemini CLI

**Different names, similar ideas.**

Input fields rulekeep uses: `session_id`, `cwd`, `hook_event_name`, `tool_name`,
`tool_input`, `tool_response`, `prompt_response` (the final message, in
`AfterAgent`), `stop_hook_active`.

`tool_input` shapes:

| Tool | Fields |
| --- | --- |
| `run_shell_command` | `command`, `description`, `dir_path`, `is_background` |
| `write_file` | `file_path`, `content` |
| `replace` | `file_path`, `old_string`, `new_string`, `instruction`, `allow_multiple` |

There's no `tool_use_id`, so the snapshot is keyed by session and file path.

Outputs:

| Situation | JSON |
| --- | --- |
| Command blocked | `{"decision": "deny", "reason": "…"}` — sent to the agent as a tool error |
| Edit breaks any rule | `{"hookSpecificOutput": {"additionalContext": "…"}}` — appended to the tool result |
| Stop with rules still broken | `{"decision": "deny", "reason": "…"}` on `AfterAgent` — rejects the response and retries with the reason as the prompt |
| Tell the user | `{"systemMessage": "…"}` |

Gemini-specific cautions:

- **Don't use `decision: "deny"` on `AfterTool`.** It *replaces* the tool result
  with the reason, so the agent may think the edit failed. Use
  `additionalContext`, and enforce blocking rules at `AfterAgent`.
- **No compaction event you can act on.** `PreCompress` is advisory only. Instead,
  re-send the short rule summary with `BeforeAgent`'s `additionalContext` at the
  start of every turn.
- **Print nothing but the final JSON** on stdout. Logs go to stderr.
- **Always exit 0 with valid JSON.** Gemini CLI's docs say other exit codes are
  only warnings, but its source treats non-JSON output with an unexpected exit
  code as a *deny*. A crashing rulekeep could block the agent — the opposite of
  fail-open. Catch everything and print `{}` or a `systemMessage`.
- **No built-in retry cap at `AfterAgent`** beyond the session's turn budget.
  rulekeep's `maxStopRetries` is what stops loops.
- **Timeouts are in milliseconds.**

`plugins/gemini-cli/hooks/hooks.json`:

```json
{
  "hooks": {
    "BeforeAgent": [
      { "hooks": [ { "type": "command", "command": "node \"${extensionPath}/dist/rulekeep.cjs\" hook gemini-cli before-agent", "timeout": 10000 } ] }
    ],
    "BeforeTool": [
      { "matcher": "^(run_shell_command|write_file|replace)$", "hooks": [ { "type": "command", "command": "node \"${extensionPath}/dist/rulekeep.cjs\" hook gemini-cli before-tool", "timeout": 10000 } ] }
    ],
    "AfterTool": [
      { "matcher": "^(write_file|replace)$", "hooks": [ { "type": "command", "command": "node \"${extensionPath}/dist/rulekeep.cjs\" hook gemini-cli after-tool", "timeout": 60000 } ] }
    ],
    "AfterAgent": [
      { "hooks": [ { "type": "command", "command": "node \"${extensionPath}/dist/rulekeep.cjs\" hook gemini-cli after-agent", "timeout": 300000 } ] }
    ]
  }
}
```

### Event mapping in one table

| rulekeep event | Claude Code | Codex | Gemini CLI |
| --- | --- | --- | --- |
| `session-start` | SessionStart | SessionStart | SessionStart |
| rule reminder | SessionStart (`compact`) | SessionStart (`compact`) | BeforeAgent (every turn) |
| `before-command` | PreToolUse `Bash\|PowerShell` | PreToolUse `Bash` | BeforeTool `run_shell_command` |
| `before-edit` | PreToolUse `Edit\|Write` | PreToolUse `apply_patch` | BeforeTool `write_file\|replace` |
| `after-edit` | PostToolUse `Edit\|Write` | PostToolUse `apply_patch` | AfterTool `write_file\|replace` |
| `stop` | Stop | Stop | AfterAgent |
