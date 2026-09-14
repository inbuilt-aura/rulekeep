# 1. Why build this

This chapter explains the problem, the proof that people have it, why hooks
solve it when instructions don't, and why this idea beat the others we checked.
The raw market data is in [research.md](./research.md).

---

## The problem in one sentence

**AI coding agents are told the project's rules, and break them anyway.**

Every project that uses Claude Code, Codex or Gemini CLI writes its rules down:
in `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`. LIFEWORLD is a good example.
`app/CLAUDE.md` says, among many other things:

- TypeScript strict, **no `any`**
- **No hard-coded colors** in components; use `constants/theme.ts`
- `components/` **must not import** repositories or stores
- **Never `console.log`** user data; use `services/logger.ts`
- **No `moment`, `lodash`, `axios`**

The agent reads these rules at the start of a session. Then, somewhere in a long
task, it writes `as any`, adds a hex color to a component, or runs `sed -i` to
edit a file. Nobody notices until review — or until it ships.

## Proof that people have this problem

These numbers come from GitHub on 14 September 2026.

| Issue | 👍 | What people are saying |
| --- | ---: | --- |
| [claude-code#42796](https://github.com/anthropics/claude-code/issues/42796) | 2,072 | "Claude Code is unusable for complex engineering tasks" (closed). Its [Hacker News thread](https://news.ycombinator.com/item?id=47660925) reached 1,364 points |
| [claude-code#77136](https://github.com/anthropics/claude-code/issues/77136) | 426 | Repetitive phrasing, even with style instructions |
| [claude-code#65961](https://github.com/anthropics/claude-code/issues/65961) | 221 | Verbose code comments; "ignores instructions to stop" |
| [claude-code#19649](https://github.com/anthropics/claude-code/issues/19649) | 116 | Uses `sed` and `grep` instead of its own tools |
| [claude-code#53454](https://github.com/anthropics/claude-code/issues/53454) | 116 | Can't stop using the word "load-bearing" |
| [claude-code#87971](https://github.com/anthropics/claude-code/issues/87971) | 81 | Reads, writes and edits files through the shell in Auto Mode |

The same complaint appears for other agents. Gemini CLI has
[#13852 "GEMINI.md instructions ignored"](https://github.com/google-gemini/gemini-cli/issues/13852),
and Codex users ask for automatic checks after edits
([codex#8745](https://github.com/openai/codex/issues/8745), 490 👍).

## Why writing the rule better doesn't fix it

The usual advice is "make your CLAUDE.md clearer" or "say it in capital letters".
It doesn't work reliably, for three reasons:

1. **Instructions compete with everything else in context.** In a long task the
   rules file is a small part of what the model is reading.
2. **Context gets compacted.** When a conversation gets long, the agent
   summarises older parts. Rules can get summarised away.
3. **Nobody checks.** An instruction has no consequence. If the agent breaks it,
   nothing happens.

The issues above are people who already wrote the instruction. That's the point:
**instructions are exactly what gets ignored.**

## Why hooks do fix it

A **hook** is a small program the agent runs automatically at fixed moments:

| Moment | What a hook can do |
| --- | --- |
| Before a shell command runs | Block it and say why |
| After a file is edited | Tell the agent "this edit broke rule X, fix it" |
| When the agent wants to stop | Say "not yet — these problems are still open" |
| After the conversation is compacted | Put the rules back into context |

A hook is code, not a suggestion. It runs every time, and the agent sees its
answer immediately, while it still has the task in mind. It then fixes the
problem itself. That loop — **break a rule, get told why, fix it** — is what
people are asking for.

All three major agents now support hooks: Claude Code (many events), Codex
(12 events including before-tool, after-tool and stop) and Gemini CLI. That's
new in 2026, and it's what makes a cross-agent tool possible.

## Why one tool for every agent

Teams don't use one agent anymore. One developer uses Claude Code, another uses
Codex, CI runs something else. Today, each agent needs its own rules file and
its own hooks, written differently.

This tool gives a team **one rules file** that is enforced:

- inside Claude Code,
- inside Codex,
- inside Gemini CLI,
- and in CI, on every pull request — so a rule broken by *any* tool, or by a
  human, still gets caught.

It's also the part the big companies are least likely to build. Anthropic can
improve Claude Code's hooks; it will not build enforcement for Codex. OpenAI will
not build it for Claude Code.

## What exists today, and why it isn't enough

| Tool | What it does | What's missing |
| --- | --- | --- |
| **hookify** (Anthropic, official marketplace) | You write rules as small markdown files; it matches commands or edited text with a regex and warns or blocks. It can also suggest rules from your past corrections. | Claude Code only. Matches text, not a real diff, so it can't see a whole-file rewrite or a test deleted through the shell. Runs no checkers (like `tsc`). No CI mode. Its hooks call `python3`, which usually isn't on Windows. |
| Small guardrail repos (34–54 stars) | Mostly security or git-safety hooks | Claude Code only, single-purpose, several unmaintained |
| Linters and pre-commit hooks (ESLint, Husky, lefthook) | Check code when you commit | Run *after* the agent is done. The agent never sees the error while working, so it can't fix it in the same task. Can't check agent behaviour, like skipping tests or using `sed`. |

The gap: **one rules file, enforced while the agent works, in every agent, and
again in CI.**

## Why not the other ideas

We checked ten ideas. The full comparison is in [research.md](./research.md).
In short:

| Idea | Why not (now) |
| --- | --- |
| A new standalone agent like OpenCode | OpenCode has 207k stars and 75+ providers; model companies give theirs away free; Roo Code shut down in May 2026. No room for a solo developer. |
| A workflow framework | Superpowers (286k stars), ECC (258k), spec-kit (136k) own it, and their users already complain about too much process. |
| Memory or token saving | claude-mem (94k stars), and Claude Code now has memory built in. |
| Loading AGENTS.md automatically | Most-upvoted Claude Code request (5,144 👍). Too likely to be built into the product. |
| Undo for Codex | Real demand (449 👍), no competitor — but Codex-only and small. A good side project later. |
| Testing plugins across agents | Real gap, few buyers. We build a small version for ourselves (see [05-testing.md](./05-testing.md)). |

## Why now

Three things changed in 2026:

1. **Codex shipped hooks and plugins.** Before, cross-agent enforcement was
   impossible.
2. **The Agent Plugins spec** (August 2026) started to standardise how plugins
   are packaged across tools — but it deliberately leaves hooks out. Nobody owns
   cross-agent hooks yet.
3. **Anthropic is making Claude Code hooks much more powerful** ("Claude Mods",
   [announced as weeks away](https://github.com/anthropics/claude-code/issues/91870)).
   More people will start writing hooks, and they'll need a way to make them
   work everywhere.

## What success looks like

Proposed goals, to check honestly after launch:

| Stage | Goal |
| --- | --- |
| Week 1 (proof) | On LIFEWORLD, the hooks catch at least 5 real rule breaks in a week, with fewer than 1 false alarm in 5 warnings |
| v0.1 (Claude Code) | 3 real repos besides LIFEWORLD use it for 2 weeks and keep it installed |
| v0.3 (all three agents) | Accepted into Anthropic's community marketplace; installable in Codex and Gemini CLI |
| 6 months | People file issues asking for new rule types — the sign it's being used, not just starred |

If the week-1 proof fails — too few real catches, or too many false alarms — we
stop and rethink before writing the full tool. That's cheap to find out, and
it's the first step in [04-build-plan.md](./04-build-plan.md).
