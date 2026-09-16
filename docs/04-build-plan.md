# 4. Build plan

Step by step, from an empty folder to v1.0. Each milestone ends with a
**"Done when"** check. Don't start the next milestone until it passes.

The design behind every step is in [03-architecture.md](./03-architecture.md).
Weeks are rough estimates for one developer working steadily.

| Milestone | What | Weeks |
| --- | --- | --- |
| **M0** | One-week proof on LIFEWORLD, no real tool | 1 |
| **M1** | New repo, toolchain, CI | 0.5 |
| **M2** | Rule engine | 1.5 |
| **M3** | Claude Code adapter and plugin | 1 |
| **M4** | Checkers, trust, CI command, skills → **v0.1**, then 2 weeks of dogfooding | 1 (+2) |
| **M5** | Codex adapter → **v0.2** | 2 |
| **M6** | Gemini CLI adapter, prose rules → **v0.3** | 1 |
| **M7** | Launch | 1 |
| **M8** | v1.0: freeze the rules format | after outside use |

---

## Before you start

You need:

- **Node.js 22 or newer** and npm (Node 20 reached end of life on 30 April 2026)
- **Git**
- **Claude Code**, signed in (your normal subscription is fine for everything
  until automated evals in CI)
- **Codex CLI** (from M5) and **Gemini CLI** (from M6)
- A **GitHub account**
- **WSL2** on Windows, only for running plugin evals that use shell commands
  ([05-testing.md](./05-testing.md))

---

## M0 — One-week proof on LIFEWORLD

**Goal:** find out, cheaply, whether hooks catch real mistakes without getting in
the way. No repo, no build, no tests. One script.

### Step 1: Add the proof script

Create `d:\3d\.claude\holdfast-proof.mjs`:

```js
// One-week experiment for holdfast. Not the real tool: no diffs, no config file.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const LINE_RULES = [
  {
    id: 'no-any',
    files: /app[\\/]src[\\/].*\.tsx?$/,
    pattern: /(:\s*any\b|\bas\s+any\b|<any>)/,
    message: "Don't use `any`. Use `unknown` and narrow it. (app/CLAUDE.md §13)",
  },
  {
    id: 'no-hex-colors-in-components',
    files: /app[\\/]src[\\/]components[\\/].*\.tsx$/,
    pattern: /#[0-9a-fA-F]{3,8}\b/,
    message: 'Colors come from constants/theme.ts, not literals. (app/CLAUDE.md §7)',
  },
  {
    id: 'no-console-log',
    files: /app[\\/]src[\\/].*\.tsx?$/,
    pattern: /console\.log\(/,
    message: 'Use services/logger.ts, never console.log. (app/CLAUDE.md §9)',
  },
  {
    id: 'no-skipped-tests',
    files: /\.test\.tsx?$/,
    pattern: /\.(skip|only)\(/,
    message: 'Fix the test instead of skipping it.',
  },
];

const COMMAND_RULES = [
  {
    id: 'use-edit-tool',
    pattern: /\bsed\s+-i\b/,
    message: 'Edit files with the edit tool, not `sed -i`, so changes can be reviewed.',
  },
];

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd;
const logFile = join(projectDir, '.claude', 'holdfast-proof.log.jsonl');

function log(ruleId, detail) {
  mkdirSync(dirname(logFile), { recursive: true });
  appendFileSync(
    logFile,
    JSON.stringify({ at: new Date().toISOString(), ruleId, tool: input.tool_name, detail }) + '\n',
  );
}

function addedLines(toolName, toolInput) {
  if (toolName === 'Write') return String(toolInput.content ?? '').split(/\r?\n/);
  const before = new Set(String(toolInput.old_string ?? '').split(/\r?\n/));
  return String(toolInput.new_string ?? '')
    .split(/\r?\n/)
    .filter((line) => !before.has(line));
}

if (input.hook_event_name === 'PreToolUse') {
  const command = String(input.tool_input?.command ?? '');
  const hit = COMMAND_RULES.find((rule) => rule.pattern.test(command));
  if (hit) {
    log(hit.id, command.slice(0, 200));
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `holdfast-proof: ${hit.id}\n${hit.message}`,
        },
      }),
    );
  }
}

if (input.hook_event_name === 'PostToolUse') {
  const filePath = String(input.tool_input?.file_path ?? '');
  const lines = addedLines(input.tool_name, input.tool_input ?? {});
  const hits = [];
  for (const rule of LINE_RULES) {
    if (!rule.files.test(filePath)) continue;
    const line = lines.find((text) => rule.pattern.test(text));
    if (line !== undefined) hits.push({ rule, line });
  }
  if (hits.length > 0) {
    for (const { rule, line } of hits) log(rule.id, `${filePath}: ${line.trim().slice(0, 200)}`);
    const reason = hits
      .map(({ rule, line }) => `${rule.id}\n  ${line.trim()}\n  ${rule.message}`)
      .join('\n\n');
    console.log(
      JSON.stringify({
        decision: 'block',
        reason: `holdfast-proof: this edit breaks ${hits.length} rule(s).\n\n${reason}\n\nFix the edit, then continue.`,
      }),
    );
  }
}
```

### Step 2: Turn the hooks on, for you only

Create or edit `d:\3d\.claude\settings.local.json` (personal, not shared with
the team):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PROJECT_DIR}/.claude/holdfast-proof.mjs"],
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "^Edit$|^Write$",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PROJECT_DIR}/.claude/holdfast-proof.mjs"],
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

Keep the experiment out of git: add these two lines to `d:\3d\.git\info\exclude`:

```
.claude/holdfast-proof.mjs
.claude/holdfast-proof.log.jsonl
```

### Step 3: Check it works (5 minutes)

Start Claude Code in `d:\3d` and ask:

> Create `app/src/utils/debug.ts` containing
> `export const debug = (x: any) => console.log(x);`

You should see Claude get the `holdfast-proof` message for `no-any` and
`no-console-log`, and rewrite the code. Then undo the file.

### Step 4: Work normally for one week

Use Claude Code on LIFEWORLD as usual. Every rule firing is logged to
`.claude/holdfast-proof.log.jsonl`. At the end of each day, look at new entries
and mark each one in a notes file:

| Date | Rule | Real catch or false alarm? | Note |
| --- | --- | --- | --- |
| 2026-09-15 | no-any | real | Claude used `as any` for a navigation param |

### Done when

After one week:

- **At least 5 real catches**, and
- **fewer than 1 false alarm in 5 firings**, and
- you didn't feel the need to turn it off.

**If it fails:** look at why. Too few catches means the rules don't match how
the agent actually misbehaves — look at your own corrections to Claude that week
and try again. Too many false alarms means regex on added text isn't enough —
that's what real diffs (M2) fix; decide if that's worth building.

**If it passes:** remove the `hooks` block from `settings.local.json` and start M1.

---

## M1 — Repo, toolchain and CI

### Steps

1. Create a public GitHub repo, `holdfast` (or the final name, Q1).
2. Set up the project:

   ```bash
   npm init -y
   npm install --save-dev typescript esbuild vitest @types/node eslint typescript-eslint @eslint/js
   npm install yaml picomatch diff
   npm install --save-dev @types/picomatch @types/diff
   npx tsc --init
   ```

3. `tsconfig.json` — strict, modern Node:

   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "NodeNext",
       "moduleResolution": "NodeNext",
       "strict": true,
       "noUncheckedIndexedAccess": true,
       "exactOptionalPropertyTypes": true,
       "noEmit": true,
       "skipLibCheck": true
     },
     "include": ["src", "test"]
   }
   ```

4. `package.json` scripts:

   ```json
   {
     "scripts": {
       "build": "esbuild src/cli/main.ts --bundle --platform=node --target=node22 --format=cjs --outfile=dist/holdfast.cjs",
       "typecheck": "tsc",
       "lint": "eslint src test --max-warnings=0",
       "test": "vitest run",
       "verify": "npm run typecheck && npm run lint && npm run test && npm run build"
     }
   }
   ```

5. Create the folders from [Source layout](./03-architecture.md#source-layout).
6. Add a first test so CI has something to run:
   `test/engine/diff.test.ts` with one case.
7. Add `.github/workflows/ci.yml` from [05-testing.md](./05-testing.md#ci-workflow).
8. Add `LICENSE` (Apache-2.0) and a one-paragraph `README.md`.

### Done when

- `npm run verify` passes locally.
- CI passes on **Windows, macOS and Linux**.

---

## M2 — Rule engine

Everything here lives in `src/engine/` and is **pure**: no `fs`, no
`child_process`, no `Date.now()`. That's what makes it fast and exhaustively
testable.

### Steps, in order

1. **`events.ts`** — the types from
   [The event model](./03-architecture.md#the-event-model).
2. **`config.ts`** — parse `holdfast.yaml` and validate it.
   - Use `yaml`'s `parseDocument` so errors carry line numbers.
   - Validate every field from [02-what-we-build.md](./02-what-we-build.md#the-rules-file)
     by hand (no schema library needed): unknown `type`, missing `message`,
     invalid regex, duplicate `id`.
   - Compile every regex once. Return `Result<Config, ConfigError[]>`, never throw.
3. **`diff.ts`** — given `before` and `after`, return added and removed lines
   with line numbers. Normalise `\r\n` to `\n` first.

   ```ts
   import { diffLines } from 'diff';

   export interface ChangedLine {
     readonly line: number; // 1-based, in `after` for added, in `before` for removed
     readonly text: string;
   }

   export function changedLines(before: string | null, after: string | null) {
     const a = (before ?? '').replace(/\r\n/g, '\n');
     const b = (after ?? '').replace(/\r\n/g, '\n');
     const added: ChangedLine[] = [];
     const removed: ChangedLine[] = [];
     let beforeLine = 1;
     let afterLine = 1;
     for (const part of diffLines(a, b)) {
       const lines = part.value.split('\n');
       if (lines.at(-1) === '') lines.pop();
       for (const text of lines) {
         if (part.added) added.push({ line: afterLine++, text });
         else if (part.removed) removed.push({ line: beforeLine++, text });
         else { beforeLine++; afterLine++; }
       }
     }
     return { added, removed };
   }
   ```

4. **`overrides.ts`** — find `holdfast-ignore <rule-id>: <reason>` on the same
   line or the line above. No reason → not an override.
5. **Rules**, one file each, all with the same shape:

   ```ts
   export type RuleCheck<R> = (rule: R, event: HoldfastEvent) => readonly Finding[];
   ```

   Build in this order, because each is harder than the last:
   `command` → `line` → `test-guard` → `boundary`.

   Example, `line.ts`:

   ```ts
   export const checkLineRule: RuleCheck<LineRule> = (rule, event) => {
     if (event.kind !== 'after-edit' && event.kind !== 'stop') return [];
     const findings: Finding[] = [];
     for (const change of event.changes) {
       if (!rule.matchesPath(change.path)) continue;
       const { added, removed } = changedLines(change.before, change.after);
       for (const { line, text } of added) {
         if (text.length > 2000 || !rule.added?.test(text)) continue;
         findings.push(withOverride(rule, change, line, text));
       }
       for (const { line, text } of removed) {
         if (text.length > 2000 || !rule.removed?.test(text)) continue;
         findings.push({ ruleId: rule.id, mode: rule.mode, message: rule.message, path: change.path, line, excerpt: text.trim() });
       }
     }
     return findings;
   };
   ```

   `rule.matchesPath` comes from the compiled config (globs from `files` and
   `exclude`). `withOverride` builds the finding and attaches an `override` when
   `overrides.ts` finds a valid `holdfast-ignore` comment and the rule allows it.

6. **`evaluate.ts`** — run every rule that applies to the event
   ([Which rules run when](./03-architecture.md#which-rules-run-when)), collect
   findings, compute the outcome.
7. **`format.ts`** — turn a verdict into the message from
   [02-what-we-build.md](./02-what-we-build.md#3-work-normally). Max 20 findings.
8. **`holdfast test`** — for each rule, run its fixture files
   ([05-testing.md](./05-testing.md#layer-1-rule-engine-tests)).

### Done when

- Every rule type has fixtures for "must fire", "must not fire" and "overridden".
- The full LIFEWORLD example `holdfast.yaml` from chapter 2 parses with no errors.
- The engine has zero imports from `node:fs`, `node:child_process` or
  `src/runtime` (add an ESLint `no-restricted-imports` rule to enforce this).

---

## M3 — Claude Code adapter and plugin

> **Status: built.** The adapter, the plugin folder, the marketplace file and
> the build's plugin sync all exist. `claude plugin validate --strict` passes,
> and `test/contracts/claudeCodeHooks.test.ts` drives all four hooks with real
> payload shapes. `HOLDFAST_RECORD` (step 8) works — point it at a directory
> during a live session to capture genuine payloads. Not yet done: running it
> inside a live Claude Code session by hand and checking the captures.

### Steps

1. **Runtime:** `state.ts`, `snapshot.ts`, `baseline.ts`, `changes.ts` as
   described in [How changes are detected](./03-architecture.md#how-changes-are-detected).
2. **Adapter:** `src/adapters/claude-code.ts`. Two functions:

   ```ts
   /** Claude Code hook JSON → holdfast event (or null when the hook isn't relevant) */
   export function fromClaude(input: ClaudeHookInput, runtime: Runtime): HoldfastEvent | null;

   /** Verdict → the JSON Claude Code expects for that event */
   export function toClaude(event: HoldfastEvent, verdict: Verdict, message: string): object {
     switch (event.kind) {
       case 'before-command':
         if (verdict.outcome === 'block') {
           return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: message } };
         }
         return verdict.outcome === 'warn'
           ? { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: message } }
           : {};
       case 'after-edit':
         if (verdict.outcome === 'block') return { decision: 'block', reason: message };
         return verdict.outcome === 'warn'
           ? { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: message } }
           : {};
       case 'stop':
         // Retry limit is decided before calling this: an exhausted limit arrives as 'warn'.
         if (verdict.outcome === 'block') return { decision: 'block', reason: message };
         return verdict.findings.length > 0 ? { systemMessage: message } : {};
       case 'session-start':
         return event.reason === 'compact'
           ? { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: message } }
           : {};
       case 'before-edit':
         return {};
     }
   }
   ```

   Output formats are explained in
   [What each hook returns](./03-architecture.md#what-each-hook-returns).
3. **CLI entry:** `holdfast hook claude-code <event>` reads stdin, calls the
   adapter, prints JSON, **always exits 0**. Wrap everything in `try/catch`; on
   error print `{ "systemMessage": "holdfast error: …" }`.
4. **Plugin folder** in the repo:

   ```
   plugins/claude-code/
     .claude-plugin/plugin.json
     hooks/hooks.json            ← from 03-architecture.md
     skills/                     ← added in M4
     dist/holdfast.cjs           ← copied by the build
   ```

   `plugins/claude-code/.claude-plugin/plugin.json`:

   ```json
   {
     "name": "holdfast",
     "version": "0.1.0",
     "description": "Enforce your project's rules while the agent works: blocks rule-breaking commands and sends rule-breaking edits back to be fixed.",
     "author": { "name": "<your name>" },
     "homepage": "https://github.com/<you>/holdfast",
     "repository": "https://github.com/<you>/holdfast",
     "license": "Apache-2.0",
     "keywords": ["rules", "hooks", "guardrails", "conventions", "tests"]
   }
   ```

   Only `name` is required; the rest helps people find and trust it.

5. **Marketplace file** at the repo root, `.claude-plugin/marketplace.json`:

   ```json
   {
     "name": "holdfast",
     "owner": { "name": "<your name>", "url": "https://github.com/<you>" },
     "plugins": [
       {
         "name": "holdfast",
         "source": "./plugins/claude-code",
         "description": "Enforce your project's rules while the agent works."
       }
     ]
   }
   ```

6. **Update the build** to copy `dist/holdfast.cjs` into `plugins/claude-code/dist/`.
7. **Try it locally**, without installing:

   ```bash
   claude --plugin-dir ./plugins/claude-code
   ```

   After changing code: `npm run build`, then `/reload-plugins` in the session.
8. **Record real hook inputs** for contract tests: set
   `HOLDFAST_RECORD=./test/contracts/claude-code` and have the CLI save every
   stdin payload it receives ([05-testing.md](./05-testing.md#layer-2-hook-contract-tests)).

### Done when

In a scratch repo with the LIFEWORLD rules, inside real Claude Code:

- a blocked command is denied with the reason;
- an `Edit` and a `Write` that break a rule are sent back and fixed;
- a file written through the shell is caught at stop;
- on Windows, the `PowerShell` tool path works too;
- `claude plugin validate ./plugins/claude-code --strict` passes;
- recorded contract fixtures exist for SessionStart, PreToolUse, PostToolUse and Stop.

---

## M4 — Checkers, trust, CI command, skills → v0.1

> **Status: built, except the dogfooding.** `runtime/checker.ts`,
> `runtime/trust.ts`, `holdfast check`, `holdfast trust` and the three skills
> all exist and are tested. Steps 6 and 7 — tagging v0.1.0 and two weeks of
> real use — are what remain, and step 7 gates the tag.

### Steps

1. **`runtime/checker.ts`** — run the `run` command in `cwd`, with a timeout;
   capture combined output; strip terminal color codes; keep the first 40 lines;
   exit code ≠ 0 means a finding.
2. **`runtime/trust.ts`** — the approval flow from
   [Checker commands need approval](./03-architecture.md#checker-commands-need-approval).
3. **`holdfast check`** — the CI mode from
   [CI mode](./03-architecture.md#ci-mode), with `--format text|github|json`.
4. **`holdfast doctor`** — prints: Node version, config valid or errors, which
   agent hooks are installed, whether checkers are trusted, slowest rule timings.
5. **Skills** in `plugins/claude-code/skills/`:

   `setup/SKILL.md`:

   ```markdown
   ---
   description: Create or update holdfast.yaml from this repo's CLAUDE.md, AGENTS.md and GEMINI.md rules. Use when the user wants holdfast set up or asks which of their rules can be enforced.
   disable-model-invocation: true
   ---

   Set up holdfast rules for this repository.

   1. Read every CLAUDE.md, AGENTS.md and GEMINI.md in the repo.
   2. List each rule you find. For each, decide whether code can check it:
      - Checkable: a pattern in added lines, a banned import, a command to block,
        a test that must not be skipped, a command like a type check that must pass.
      - Not checkable: anything that needs judgement ("keep screens thin").
   3. Propose holdfast.yaml using only the rule types in the holdfast docs.
      Default every rule to `mode: warn` unless the source says "never" or
      "banned", then use `block`.
   4. Show the user the full proposed file AND the list of rules you left out,
      with one line each on why.
   5. Only write holdfast.yaml after the user approves. Then run
      `npx holdfast test` and report the result.
   ```

   `trust/SKILL.md` (approve checker commands) and `explain/SKILL.md` (explain a
   rule and show recent hits) follow the same pattern.

6. **Tag v0.1.0** ([06-publishing.md](./06-publishing.md#releasing-a-version)).
7. **Dogfood for two weeks** on LIFEWORLD with the real tool
   ([05-testing.md](./05-testing.md#layer-7-dogfooding-on-lifeworld)).

### Done when

- All layers 1–4 of [05-testing.md](./05-testing.md) pass in CI.
- Two weeks of dogfooding logged, false-alarm rate under 1 in 5.
- `holdfast check` runs in LIFEWORLD's CI on a real pull request.

---

## M5 — Codex adapter → v0.2

### Steps

1. **Read Codex's current hook and plugin docs** and record real hook payloads,
   as in M3. The formats are summarised in
   [Codex and Gemini CLI wiring](./03-architecture.md#codex-and-gemini-cli-wiring).
2. **`src/adapters/codex.ts`** — the same two functions, `fromCodex` and
   `toCodex`. Two things differ from Claude Code
   ([Codex](./03-architecture.md#codex)):
   - **Input:** file edits arrive as an `apply_patch` **patch** in
     `tool_input.command`. Read the patch's file headers to find which files it
     touches, and snapshot those.
   - **Output:** after an edit, always use `additionalContext` (a `block` there
     replaces the tool result); enforce blocking rules at `Stop`, and count stop
     retries per `turn_id`, because Codex has no retry cap of its own.
3. **Plugin folder** `plugins/codex/` with `.codex-plugin/plugin.json`,
   `hooks/hooks.json`, the skills, and `dist/holdfast.cjs`. Add
   `.agents/plugins/marketplace.json` at the repo root pointing to
   `./plugins/codex`, and check which marketplace file Codex reads when both it
   and `.claude-plugin/marketplace.json` exist.
4. **Windows:** confirm the `${PLUGIN_ROOT}` command runs under Codex's
   `cmd.exe` without a `commandWindows` override.
5. **Contract fixtures** in `test/contracts/codex/`, including real `apply_patch`
   payloads for adding, updating, deleting and moving a file.
6. **Install guide**: screenshots of Codex's `/hooks` trust screen, with one line
   explaining each hook.
7. Tag **v0.2.0**.

### Done when

- The same `holdfast.yaml` produces the same findings in Codex and Claude Code
  for the same edits (compare with a scripted task in both).
- Contract tests for Codex pass in CI.

---

## M6 — Gemini CLI adapter and prose rules → v0.3

**First answer Q4:** is Gemini CLI still worth supporting? If its activity keeps
falling, support OpenCode or Cursor instead; the adapter pattern is identical.

### Steps

1. `src/adapters/gemini-cli.ts` — `fromGemini` / `toGemini`. Map `BeforeTool`,
   `AfterTool`, `AfterAgent` and `BeforeAgent`
   ([Gemini CLI](./03-architecture.md#gemini-cli)). Remember: feedback after an
   edit goes in `additionalContext`, never `decision: "deny"`; blocking happens at
   `AfterAgent`; timeouts are milliseconds.
2. `plugins/gemini-cli/` — `gemini-extension.json` and `hooks/hooks.json`.
   Decide how users install from a subfolder
   ([06-publishing.md](./06-publishing.md#gemini-cli)).
3. `rules/prose.ts` — uses the final message: `last_assistant_message` in
   Claude Code and Codex, `prompt_response` in Gemini CLI.
4. Contract fixtures in `test/contracts/gemini-cli/`.
5. Tag **v0.3.0** and submit to Anthropic's community marketplace
   ([06-publishing.md](./06-publishing.md)).

### Done when

- Same-findings comparison passes across all three agents.
- Accepted into Anthropic's community marketplace.

---

## M7 — Launch

Follow the [launch checklist](./06-publishing.md#launch-checklist).

---

## M8 — v1.0

Only after at least **3 outside repos** have used holdfast for a few weeks.

1. Review every issue about the rules format. Make any breaking changes now.
2. Publish a JSON Schema for `holdfast.yaml` so editors can autocomplete it.
3. Write down the compatibility promise: no breaking changes to
   `holdfast.yaml` version 1 without a new `version: 2`.
4. Tag **v1.0.0**.

---

## Definition of done for any new rule type

1. Types added to `engine/events.ts` / `engine/config.ts`
2. Rule implemented in `engine/rules/`, pure
3. Config validation with a clear error message
4. Fixtures: must fire, must not fire, overridden
5. Listed in [Which rules run when](./03-architecture.md#which-rules-run-when)
6. Documented in the README with a real example
7. Works on Windows (CI)
8. `npm run verify` green
