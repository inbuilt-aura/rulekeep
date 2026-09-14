# holdfast — build guide

> **Your project's rules, enforced while the AI works.**

This folder is the complete plan for building **holdfast**: a plugin that makes
AI coding agents (Claude Code, Codex, Gemini CLI) follow a project's rules, and
checks the same rules again in CI. It covers what to build, why, how to build
it, how to test it, how to publish it, and how it could make money.

`holdfast` is a working name. See [Q1](./08-risks-and-decisions.md#open-questions).

---

## The idea in 30 seconds

Every project tells its AI agent the rules — in `CLAUDE.md`, `AGENTS.md`,
`GEMINI.md`. The agent breaks them anyway. Thousands of people have said so on
GitHub.

holdfast turns those rules into **hooks**: small checks the agent runs
automatically before a command, after an edit, and before it says it's done.
When a rule is broken, the agent is told exactly what and why, and fixes it
while it still has the task in mind.

```
 you write rules once            the agent works             holdfast checks
 ┌────────────────┐         ┌──────────────────────┐     ┌─────────────────────┐
 │ holdfast.yaml  │ ──────► │ runs a command       │ ──► │ command rules       │
 │                │         │ edits a file         │ ──► │ line, boundary,     │
 │ no `any`       │         │                      │     │ test-guard rules    │
 │ no hex colors  │         │ says "done"          │ ──► │ checkers, full diff │
 │ tests stay on  │         └──────────▲───────────┘     └──────────┬──────────┘
 └────────────────┘                    │   "rule X broken here,     │
                                       └─────  fix it" ◄────────────┘

 same rules in CI:  npx holdfast check --base origin/main
```

- **Works in** Claude Code, Codex and Gemini CLI, plus CI.
- **People install it** as a plugin, on the subscription they already pay for.
  No API key, no account.
- **Free and open source** (Apache-2.0).

---

## Read in this order

| # | Chapter | What's in it | Read it if you… |
| --- | --- | --- | --- |
| 1 | [Why build this](./01-why.md) | The problem, proof people have it, why hooks work, competitors, why this idea beat nine others | want to know if it's worth building |
| 2 | [What we build](./02-what-we-build.md) | Users, what they see, the `holdfast.yaml` format, all seven rule types, overrides, commands, what's out of scope, versions | need the product spec |
| 3 | [How it works](./03-architecture.md) | Components, data flow for each agent, how diffs are computed, the exact hook formats, performance, security | are about to write code |
| 4 | [Build plan](./04-build-plan.md) | Step-by-step from an empty folder to v1.0, with code for the key files and a "done when" for every milestone | are building it |
| 5 | [Testing](./05-testing.md) | Seven test layers, example tests, CI workflow, plugin evals, dogfooding on LIFEWORLD | are building or reviewing it |
| 6 | [Publishing](./06-publishing.md) | Repo files, versioning, releasing, Anthropic's marketplace, Codex and Gemini packaging, npm, launch checklist | are ready to release |
| 7 | [Open source or paid](./07-business.md) | Licence, why not to charge now, what could be sold later, the rules we must follow | are thinking about money |
| 8 | [Risks and decisions](./08-risks-and-decisions.md) | Ten risks with answers, open questions, decision log | are making a call |
| — | [Research](./research.md) | The market data: every harness and plugin we checked, with numbers | want the evidence |

---

## Where to start

**Don't start by building the tool.** Start with milestone 0 in
[04-build-plan.md](./04-build-plan.md): write five rules for LIFEWORLD as plain
hooks, in one afternoon, and use Claude Code normally for a week. If the hooks
catch real mistakes without getting in the way, build the rest. If they don't,
you've lost a week, not two months.

---

## Words used in this guide

| Word | Meaning |
| --- | --- |
| **Agent** | An AI coding tool that edits files and runs commands: Claude Code, Codex, Gemini CLI |
| **Hook** | A command the agent runs automatically at a fixed moment (before a tool, after a tool, before stopping). It gets JSON describing what's happening and can answer "allow", "block" or "here's feedback" |
| **Plugin** | A package that adds hooks, skills and other features to an agent. Installed from a GitHub repo |
| **Marketplace** | A list of plugins a user can install from. Any GitHub repo with a `marketplace.json` can be one |
| **Skill** | Instructions the agent follows when asked, like `/holdfast:setup` |
| **Rule** | One check in `holdfast.yaml`, such as "no `any` in app code" |
| **Adapter** | The part of holdfast that translates one agent's hook format into holdfast's own format, and back |
| **Rule engine** | The part that decides whether a change breaks a rule. Knows nothing about any agent |
| **Turn** | One round of work: the user asks, the agent works, the agent stops and replies |
| **Compaction** | When a conversation gets too long, the agent summarises older parts to save space |
| **Eval** | An automated test where a real agent does a task, and graders check the result |
| **CI** | Continuous integration: checks that run automatically on every pull request, e.g. GitHub Actions |
| **Dogfooding** | Using your own tool on your own work before giving it to others |

---

## Status

| | |
| --- | --- |
| **Stage** | Plan written. No code yet |
| **Next step** | Milestone 0 — the one-week proof on LIFEWORLD |
| **Research date** | 14 September 2026. Star counts, issue reactions and agent features change fast; re-check before launch |
| **Where the code will live** | Its own GitHub repo, not inside LIFEWORLD. This folder is the plan only |
