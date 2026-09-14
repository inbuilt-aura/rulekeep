# 8. Risks, open questions and decisions

The things that could go wrong, what we do about each, the questions still
open, and a log of what's been decided.

---

## Risks

### 1. Anthropic covers the Claude Code side itself

**What could happen:** Anthropic already ships hookify, and "Claude Mods"
(plugins that change Claude Code with TypeScript functions) are
[announced as weeks away](https://github.com/anthropics/claude-code/issues/91870).
Anthropic says it plans to move existing Claude Code features into mods. A
built-in rules feature is plausible.

**Likelihood:** medium. **Impact:** high for a Claude-Code-only tool.

**What we do:**
- **Cross-agent is not optional.** The Codex adapter ships before launch, not
  after. Anthropic won't build enforcement for Codex or Gemini CLI.
- **The CI check is ours alone.** A rule broken by any agent — or a human — is
  caught at the pull request.
- **Watch Claude Mods closely.** When it ships, test whether the Claude Code
  adapter should become a mod. It may make ours better, not obsolete.

### 2. Hooks can only enforce what code can check

**What could happen:** users expect "make the agent follow CLAUDE.md" and get
"make the agent follow the regex-checkable parts of CLAUDE.md". They feel misled.

**What we do:**
- The README's first screen lists what holdfast can and can't check.
- `/holdfast:setup` explains, for each rule it *doesn't* propose, why it can't
  be checked by code.

### 3. False alarms make people uninstall

**What could happen:** a rule fires on correct code (a hex color inside a
comment, `any` inside a string). After a few of these, people remove the tool.

**What we do:**
- **Warn by default.** Blocking is opt-in per rule.
- **Every rule ships with example files** that must and must not fire, tested in
  CI ([05-testing.md](./05-testing.md)).
- **Measure the false-alarm rate** during dogfooding and publish it.
- **One-line override** with a reason, for real exceptions.

### 4. Agent updates break hooks

**What could happen:** an agent changes its hook data format. A Codex release
once broke GSD's hooks so badly that Codex wouldn't start
([research](./research.md)).

**What we do:**
- **Contract tests** replay real, recorded hook data from each agent on every
  commit.
- **A weekly canary** installs the newest Claude Code, Codex and Gemini CLI and
  runs smoke tests.
- **Fail open.** If holdfast crashes or can't parse the input, the agent carries
  on and the user sees one warning. A broken holdfast must never stop someone
  working.

### 5. Hooks make the agent slow

**What could happen:** a check runs after every edit and adds seconds each time.

**What we do:**
- **Budget:** command, line, boundary and test-guard rules must finish in under
  **200 ms** per hook call on a normal laptop. CI measures this.
- **Slow checkers run once, at stop**, not after every edit.
- **Bundle into one file** so Node starts fast, with no dependency loading.

### 6. The agent works around the rules

**What could happen:** the agent writes a file through the shell instead of the
edit tool, so after-edit rules never see it. Or it adds override comments
everywhere.

**What we do:**
- **The end-of-turn gate** re-checks the whole change against the session's
  starting point, however files were written.
- **Overrides are always reported**, and `allowOverride: false` rules can't be
  silenced.
- **Be honest in the README:** holdfast is a guardrail for habits, not a
  security sandbox.

### 7. Codex's hook approval scares users

**What could happen:** Codex asks users to review and trust each hook before it
runs. People think something is wrong, or approve nothing.

**What we do:** the Codex install guide shows the approval screen and explains
what each hook does, in one line each.

### 8. Windows breaks

**What could happen:** Windows is where plugins break most (about 1 in 11 open
issues in Anthropic's official plugin repo mention it). Paths arrive with
backslashes; `python3` and bash scripts often don't exist.

**What we do:**
- Hooks call `node` directly — no bash scripts, no Python.
- Every path is normalised to forward slashes before matching.
- CI runs the full test suite on Windows on every commit.

### 9. It never makes money

**What could happen:** people use it, nobody pays.

**What we do:** keep costs near zero (no servers), and only build a paid team
service after teams ask for one ([07-business.md](./07-business.md)).

### 10. The name clashes

**What could happen:** "holdfast" is taken on npm or GitHub, or someone objects.

**What we do:** pick the final name before the first public release. Check npm,
GitHub, and a web search. Never use Claude, Anthropic, GPT or Codex in it.

---

## Open questions

Answer these as the project goes. Record answers in the decision log below.

| # | Question | When to answer | How to decide |
| --- | --- | --- | --- |
| Q1 | Final product name? | Before first public release | Check npm, GitHub, web; short, easy to type, no vendor names |
| Q2 | Require Node.js, or ship compiled binaries? | End of milestone 1 | If any dogfood tester lacks Node, reconsider. v1 assumption: require Node 22+ |
| Q3 | ~~Does Codex's stop hook support sending the agent back to work?~~ **Answered: yes.** `decision: "block"` on `Stop` makes Codex continue with the reason as a new prompt ([Codex hooks docs](https://learn.chatgpt.com/docs/hooks)) | — | Confirm with a real Codex install in M5 |
| Q3b | ~~Which shell runs Codex hook commands on Windows?~~ **Per Codex source: `cmd.exe`.** Use the `${PLUGIN_ROOT}` brace form, which Codex substitutes itself | — | Confirm on Windows in M5 |
| Q3c | How do users install the Gemini CLI extension from a subfolder of the repo? | Milestone 6 | Test `gemini extensions install`; fall back to a release branch or archive |
| Q4 | Does Gemini CLI still matter? | Before milestone 6 | Activity dropped sharply in 2026; consumer "Login with Google" ended 18 June 2026; Google points users to Antigravity CLI, whose migration notes don't mention hooks. **Leaning no** — consider OpenCode or Cursor support instead |
| Q5 | Should `/holdfast:setup` use the agent to propose rules, or a fixed parser? | Milestone 2 | Agent-proposed is more useful; always require the user to approve the file |
| Q6 | Is a CLA needed? | Before accepting outside pull requests | Only if a paid, closed team service might reuse contributed code |
| Q7 | Move the Claude Code adapter to Claude Mods? | When Mods ship | Only if it gives something hooks can't, like faster checks or better messages |

---

## Decision log

| Date | Decision | Why | Revisit if |
| --- | --- | --- | --- |
| 2026-09-14 | Build a cross-agent rule enforcer | Strongest unmet need a plugin can solve; weak competition outside Claude Code | Week-1 proof on LIFEWORLD fails |
| 2026-09-14 | Claude Code first, then Codex, then Gemini CLI | Claude Code has the richest hooks and the most demand evidence | Codex demand grows faster |
| 2026-09-14 | TypeScript on Node, bundled into one file | Runs on every OS without bash or Python; Claude Code, Codex and Gemini users are developers who mostly have Node | Testers lack Node (Q2) |
| 2026-09-14 | No network calls, no telemetry | Hooks run on every edit on other people's machines; also required by Anthropic's directory policy | Never for the free tool |
| 2026-09-14 | Warn by default; block is opt-in | False alarms are the main uninstall risk | Users consistently switch everything to block |
| 2026-09-14 | Apache-2.0, free | Plugins are copyable; directories don't allow paid plugins | Teams ask for a hosted service |
| 2026-09-14 | Working name `holdfast` | Placeholder only | Q1 |
