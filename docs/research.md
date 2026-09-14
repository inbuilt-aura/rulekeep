# Which harness to build

Research brief · GitHub data from 14 September 2026

## The answer

Build a **rule enforcer for AI coding agents**: one set of project rules that
Claude Code, Codex and Gemini CLI can't quietly ignore, checked again in CI.
It installs as a plugin, so people use it on the subscription they already pay
for.

| | |
| --- | --- |
| **What** | Hooks that check every command, edit and finished turn against your rules, and send the agent back to fix what breaks them |
| **Works in** | Claude Code first, then Codex and Gemini CLI, plus a CI check using the same rules |
| **How people get it** | Two install commands in their agent. No API key, no account |
| **Price** | Free and open source. A paid team layer only if teams adopt it |

---

## Every idea we checked

| Idea | Verdict | Why |
| --- | --- | --- |
| **Rule enforcer across agents** | ✅ **Build** | The loudest need a plugin can actually solve. The only serious competitor is Anthropic's hookify, which covers Claude Code alone; the other guardrail repos we found have under 120 stars. |
| Undo for Codex | Side project | 449 and 219 👍 on two open Codex issues, and no plugin found. The maintainer says it needs a redesign, so it may come back inside Codex. |
| Testing plugins across agents | Later | Nobody runs one plugin's tests on several agents, and the new Agent Plugins spec defines no test tool. Few people would pay, but we need it for our own plugin. |
| Usage-budget governor | Later | Usage-limit complaints are loud (694 👍 on one issue), but usage trackers and token savers already crowd the space. |
| Test-quality plugin | Fold in | Few plugins exist, but demand is hard to prove. Its strongest part — stopping agents from skipping or deleting tests — becomes a rule in the enforcer. |
| AGENTS.md auto-loader | Avoid | The most-upvoted Claude Code request (5,144 👍) was closed with a workaround. Too likely to be solved inside the product. |
| Workflow framework | Avoid | Superpowers has 286k stars, ECC 258k, spec-kit 136k. Their users already complain about too much process. |
| Memory or token saver | Avoid | claude-mem has 94k stars, and Claude Code now ships memory itself. |
| Standalone multi-provider harness | Avoid | OpenCode (207k stars) already supports 75+ providers, model vendors give their harnesses away, and Roo Code shut down in May. |
| Bring back "Buddy" | Avoid | 1,179 👍 on the request, but a desk companion is hard to charge for. |

---

## Why rule enforcement is the gap

The same complaint shows up across Claude Code's issue tracker: the agent was
told a rule and broke it anyway. The biggest thread,
[“Claude Code is unusable for complex engineering tasks”](https://github.com/anthropics/claude-code/issues/42796),
collected 2,072 👍 before it was closed, and a
[Hacker News discussion](https://news.ycombinator.com/item?id=47660925) of it
reached 1,364 points.

Writing the rule more firmly doesn't help, because written instructions are
exactly what gets ignored. **Hooks** are different: they are code that runs at
fixed moments (before a command, after an edit, before the agent stops) and can
block the step with a reason. The agent reads the reason and fixes its own
mistake.

### Open Claude Code issues about ignored rules (👍, 14 Sep 2026)

| Issue | 👍 |
| --- | ---: |
| [#77136](https://github.com/anthropics/claude-code/issues/77136) Repetitive phrasing despite style instructions | 426 |
| [#65961](https://github.com/anthropics/claude-code/issues/65961) Verbose code comments, ignores instructions to stop | 221 |
| [#19649](https://github.com/anthropics/claude-code/issues/19649) Uses sed and grep instead of its own tools | 116 |
| [#53454](https://github.com/anthropics/claude-code/issues/53454) Can't stop using the word “load-bearing” | 116 |
| [#87971](https://github.com/anthropics/claude-code/issues/87971) Edits files through the shell in Auto Mode | 81 |

### What already exists

| Project | Stars | Agents | What it covers |
| --- | ---: | --- | --- |
| [hookify](https://github.com/anthropics/claude-code/tree/main/plugins/hookify) (Anthropic, official marketplace) | — | Claude Code | Markdown rules that match commands or newly written text with a regex, then warn or block. Can create rules from your past corrections. |
| [wangbooth/Claude-Code-Guardrails](https://github.com/wangbooth/Claude-Code-Guardrails) | 54 | Claude Code | Safety hooks. No updates since September 2025. |
| [tillmeier/claude-code-guardrails](https://github.com/tillmeier/claude-code-guardrails) | 51 | Claude Code | Security and git-safety hooks. |
| [dwarvesf/claude-guardrails](https://github.com/dwarvesf/claude-guardrails) | 34 | Claude Code | Hardened permission settings and shell hooks. |

None of them runs the same rules in more than one agent, looks at the whole
change (including deleted lines), runs real checkers like the TypeScript
compiler, or repeats the check in CI.

---

## What it would do

Each agent calls a small adapter from its hooks. The adapter turns that agent's
hook data into one of three events — a command, an edit, or “about to stop” —
and hands it to a rule engine that knows nothing about any agent. The same
engine runs in CI, so anything that slips past the agent still gets caught
before merge.

```
Claude Code hook ─┐
Codex hook ───────┤                                        ┌─ allow
Gemini CLI hook ──┼─► Adapter ─► Rule engine (plain code) ─┼─ warn
CI / pre-commit ──┘   one event:  change + rules = verdict  └─ block + reason
                      command,                                 the agent reads
                      edit, stop                               and fixes
```

### Rule types, with examples from LIFEWORLD's own rules

Your repo is the first test bed: `app/CLAUDE.md` already lists rules a machine
can check.

| Rule type | Example | Runs when | hookify today* |
| --- | --- | --- | --- |
| Command rules | Block `git push --force`; send `sed -i` edits back to the agent's edit tool | before a command | Yes |
| Line rules on the change | No `any`, no `console.log`, no hard-coded colours in `src/components/`, no `lodash` | after an edit | Regex on the edit's text, no real diff |
| Test-tampering guard | Catch an added `.skip` or `.only`, a deleted test file, or removed `expect(` lines | after an edit, before stop | No |
| Checker rules | Run `tsc --noEmit` and `eslint` on touched files and hand the errors to the agent | after an edit | No |
| Boundary rules | `components/` may not import from `repositories/` (`app/CLAUDE.md` §4) | after an edit | No |
| End-of-turn gate | Re-check the whole `git diff` before the agent stops, catching files written through the shell | before stop | Stop event, no diff |
| Rule reminder | Put the rule summary back into context after the conversation is compacted | after compaction | No |

\* Based on hookify's README (event types and match operators), not on running it.

---

## How to build it

1. **Prove it on LIFEWORLD** — *week 1*
   Write five rules from `app/CLAUDE.md` as plain hooks and work normally for a
   week. Count real catches and false alarms. Continue only if it catches real
   mistakes without getting in the way.
2. **Rule engine and Claude Code plugin** — *weeks 2–4*
   A TypeScript engine with the seven rule types, a setup skill that reads
   CLAUDE.md or AGENTS.md and proposes checkable rules for you to approve, and a
   `check` command for CI.
3. **Codex and Gemini CLI adapters** — *weeks 5–7*
   Codex hooks cover shell commands, file patches and stopping, which is enough.
   This is the part Anthropic won't build, so it ships before launch, not after.
4. **Launch** — *week 8*
   Public repo, marketplace submission, npm package for CI, and a short demo.
5. **Team tier** — *only with real adoption*
   Shared rule sets across repos, a log of every override and who made it, and
   trends over time.

Weeks are rough estimates for one developer working steadily.

### Decide before writing code

- **Runtime.** Hooks that call `node` need Node.js on the user's machine.
  Compiled single-file binaries per OS avoid that but make releases harder.
- **Name.** It can't contain “Claude” or “Anthropic” (Anthropic's rules). Avoid
  “GPT” and “Codex” too. Check GitHub and npm for clashes.
- **Defaults.** Warn by default, block only for rules the user marks as blocking.

### Build rules for ourselves

- **Windows first.** About 1 in 11 open issues in Anthropic's official plugin
  repo mention Windows. No bash-only scripts.
- **No network calls** from hooks, and no telemetry unless the user turns it on.
- **Few dependencies.** Hooks run on other people's machines, often on every edit.

---

## How to test it

Most of the testing is free, because the rule engine is plain code. Only the
last layers need a real agent, and those cost API usage, so they run per release
rather than per commit.

| Layer | Catches | Runs | Cost |
| --- | --- | --- | --- |
| Rule engine tests — before-and-after file fixtures with the expected verdict | Wrong verdicts and false alarms | Every commit | Free |
| Hook contract tests — real hook data recorded from each agent, replayed through the adapter | An agent changing its hook format | Every commit | Free |
| Windows, macOS and Linux (GitHub Actions matrix) | Path and shell breakage | Every commit | Free for public repos |
| `claude plugin validate --strict` | A broken plugin manifest | Every commit | Free |
| Live agent evals — `claude plugin eval`, comparing runs with and without the plugin | The agent still getting around a rule, e.g. skipping a failing test | Each release | API usage, capped with `--max-cost-usd` |
| Weekly canary against the newest Claude Code and Codex | An agent update breaking the hooks | Weekly | Low |
| Dogfooding on LIFEWORLD | The real false-alarm rate | Two weeks before launch | Your time |

Example eval case: a fixture repo with one failing test, the prompt “make the
tests pass”, and a grader that fails the run if `.skip` appears. The plugin
should raise the pass rate compared with running without it. Codex's headless
test command still needs checking against its docs.

---

## How to publish it

1. **Make the GitHub repo its own marketplace.** Add
   `.claude-plugin/marketplace.json`. Users then run
   `/plugin marketplace add you/repo` and `/plugin install name@repo`, or click
   Install in `/plugins` in VS Code.
2. **Version every release.** Use semver and bump `version` in the manifest —
   that's what tells installed copies to update. Keep a changelog.
3. **Submit to Anthropic's community marketplace** at
   [platform.claude.com/plugins/submit](https://platform.claude.com/plugins/submit).
   The repo must be public. It goes through automated checks and a safety
   screen, then is pinned to a commit that updates as you push.
4. **Package it for Codex.** Codex plugins can bundle hooks, skills and MCP
   servers, with their own manifest. Check OpenAI's current listing process
   before launch; not yet verified.
5. **Publish the CI command to npm**, so teams can run `npx <name> check` in
   GitHub Actions with the same rules their agents use.
6. **Launch with one demo:** an agent tries to skip a failing test and gets
   stopped with a reason, then fixes the test properly.

---

## Open source or paid

**Open source (Apache-2.0) and free.** Plugins are plain files anyone can copy,
and both official directories rule out selling them. What people pay for is
something hosted that a copy can't give them. If teams adopt the enforcer, sell
them shared rule sets across repos, an override log and trends. Expect no income
for months; the early return is reputation.

| Model | Real example | Verdict |
| --- | --- | --- |
| Free plugin + paid hosted service | claude-mem Pro at $30/month; ECC Pro at $19 per seat per month; Task Master's team product from $40/month | Works |
| Donations | ccusage: about 332k npm downloads a month, about $116 a month in GitHub Sponsors | Pocket money |
| Selling skill or rule packs | ClaudeKit: $79,097 all-time, but $2,222 in the last 30 days | Fades |
| Paid plugin in official directories | Anthropic lists public repos only; OpenAI plugins can't sell subscriptions | Not allowed |

### Rules to stay inside

- Each user runs it on their own subscription. Other apps may not sign in with
  someone's Claude subscription or resell Claude usage
  ([Claude Code legal page](https://code.claude.com/docs/en/legal-and-compliance)).
- Plugins listed in Anthropic's directory may not fetch instructions from a
  server or hide instructions
  ([directory policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy)).
- No “Claude” or “Anthropic” in the product name.

---

## Risks

| Risk | Answer |
| --- | --- |
| Anthropic covers the Claude Code side itself. Hookify exists, and “Claude Mods” (deeper plugin hooks written in TypeScript) are [due in weeks](https://github.com/anthropics/claude-code/issues/91870). | Working across agents is the moat — Anthropic won't build for Codex or Gemini CLI. Mods could also make our Claude Code adapter stronger. |
| Hooks only enforce what code can check. | “Write less” can't be checked; “no `console.log`” and a list of banned phrases can. Say this plainly in the README. |
| False alarms make people uninstall. | Warn by default, block only when chosen, and allow a one-line override with a reason. |
| Agent updates break hooks. One Codex release broke GSD's hooks so badly Codex wouldn't start. | Contract tests on recorded hook data, plus the weekly canary against new versions. |
| Codex asks users to approve each hook before it runs. | Show the approval step in the install guide so it doesn't look like an error. |
| It may never earn money. | Keep costs near zero: no servers until a team tier has paying demand. |

---

## The crowded parts, in numbers

### Workflow frameworks on top of agents

| Repo | Stars | What it does |
| --- | ---: | --- |
| [obra/superpowers](https://github.com/obra/superpowers) | 286,140 | Brainstorm, plan, then build with tests and review. Listed in both Anthropic's and OpenAI's marketplaces |
| [affaan-m/ECC](https://github.com/affaan-m/ECC) | 257,664 | 68 agents and 292 skills; sells a Pro tier |
| [github/spec-kit](https://github.com/github/spec-kit) | 136,329 | Spec-driven development, 30+ agents |
| [garrytan/gstack](https://github.com/garrytan/gstack) | 132,862 | 23 “virtual team” roles |
| [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) | 68,132 | Lightweight specs for existing codebases |
| [gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done) | 64,542 | Archived in May 2026; continued elsewhere |

### Standalone harnesses

| Repo | Stars | State |
| --- | ---: | --- |
| [OpenCode](https://github.com/anomalyco/opencode) | 207,103 | Growing; 75+ providers and its own paid model gateway |
| [openai/codex](https://github.com/openai/codex) | 123,811 | Growing; free, sells ChatGPT plans |
| [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) | 106,959 | Declining; commits fell from a peak of 1,725 to 142 per quarter |
| [cline/cline](https://github.com/cline/cline) | 67,943 | Steady; raised $32M, sells enterprise |
| [Aider-AI/aider](https://github.com/Aider-AI/aider) | 48,935 | Dormant; no pushes since May |
| [continuedev/continue](https://github.com/continuedev/continue) | 35,895 | Team acqui-hired by Cursor; main branch nearly idle |
| [RooCodeInc/Roo-Code](https://github.com/RooCodeInc/Roo-Code) | 24,304 | Archived; shut down 15 May 2026 |

### Plugin marketplaces

- **295** plugins in Anthropic's official marketplace, **39** of them by Anthropic.
- **2,282** in the community marketplace; in a sample of 148 of their repos, the
  median has **1** star and half haven't been updated in 90 days.
- No marketplace supports paid plugins.

**Plugins per category** (keyword matches across both marketplaces — good for
ranking, not exact counts):

- Crowded: memory 162, orchestration 152, workflow 135, token saving 117, code review 106
- Thin: test generation 21, flaky tests 10, CI failure triage 9, dependency upgrades 2

---

## How this was researched

Six research tracks ran on 14 September 2026: the plugin ecosystem, workflow
frameworks, standalone harnesses, unmet demand (GitHub issues and Hacker News),
official build, test and publish docs, and money and rules. Star and reaction
counts are live GitHub API snapshots, and the key figures here were checked a
second time.

Stars measure attention, not use; several repos here gained six-figure star
counts within months. Category counts come from keyword matching and are good
for ranking only. Reddit couldn't be reached. Anything not confirmed from an
official source is marked as not verified in the text.
