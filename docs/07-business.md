# 7. Open source or paid

**Decision: open source (Apache-2.0), free, no paid features in the plugin.**
A paid team service comes later, and only if teams adopt the free tool.

This chapter explains why, what could be sold later, and the rules we must stay
inside.

---

## Why not charge for the plugin

### 1. Plugins are plain files

A Claude Code or Codex plugin installs as readable files on the user's machine.
Anyone can copy it. Licence keys inside a plugin are trivial to remove.

### 2. The official directories don't allow it

| Directory | Rule |
| --- | --- |
| Anthropic (Claude Code) | "The repo must be public — closed-source plugins are not accepted." No payments, no revenue share ([submission docs](https://claude.com/docs/plugins/submit)) |
| OpenAI (ChatGPT, Codex) | Plugins may not sell subscriptions or link to checkout ([app guidelines](https://developers.openai.com/plugins/app-guidelines)) |

Being listed in the directories is how people find plugins. A paid plugin gives
that up.

### 3. The numbers from people who tried

| Model | Real example | Result |
| --- | --- | --- |
| Donations | ccusage: ~332k npm downloads a month | ~$116 a month in GitHub Sponsors |
| Selling skill packs | ClaudeKit: $99 one-time kits | $79,097 all-time, but only $2,222 in the last 30 days — fading |
| Free tool + paid hosted service | claude-mem Pro $30/month; ECC Pro $19 per seat per month; Task Master's team product from $40/month | Recurring revenue |

People don't pay for text files. They pay for something **hosted**, for
**teams**, or for **saved time they can measure**.

## The licence: Apache-2.0

| Option | Used by | Verdict for us |
| --- | --- | --- |
| **Apache-2.0** | Codex CLI, Cline, claude-mem (switched to it when launching paid tiers) | ✅ Permissive, and includes a patent grant companies' lawyers like |
| MIT | Superpowers, BMAD, spec-kit | Fine too; no patent grant |
| AGPL | Rare in this space | Scares companies away; doesn't protect plain files |
| Commons Clause / BSL / FSL | Task Master (Commons Clause), Crush (FSL) | Not "open source"; causes forks and distrust |

Also add:

- **`TRADEMARK.md`** — says others may fork the code but not call their fork
  "holdfast" or "holdfast Pro". This is the cheap protection that actually works
  (BMAD does this).
- **A contributor licence agreement (CLA)** — only if you might add a paid
  hosted product that reuses contributed code. Optional; decide before accepting
  outside pull requests.

## What could be sold later

Only if **several teams** use the free tool and ask for these. Don't build them
first.

| Paid feature | Why a team would pay | Why a copy can't replace it |
| --- | --- | --- |
| **Shared rule sets** across all the organisation's repos | One place to change a rule for 40 repos | Hosted and synced |
| **Override log** — who silenced which rule, when, and why | Compliance and review | Needs a server to collect it |
| **Trends** — which rules fire most, which agents break them | Shows whether AI-written code is getting better | Needs history over time |
| **Org policy** — rules individual repos can't turn off | Security and compliance teams | Enforced by the service |

**Price benchmarks** from comparable tools: $10–30 per month for individuals,
$20–40 per seat per month for teams.

**How it would work technically:** the open-source plugin stays complete and
works offline. The team service is a separate, closed repo. The plugin talks to
it only if the user adds a team token — never by default.

## Rules we must stay inside

These are not optional. Breaking them can get the plugin removed or the project
a legal letter.

### Anthropic

| Rule | Source |
| --- | --- |
| Each user runs it on **their own** subscription. We never sign in on someone's behalf, store their credentials, or route their usage | [Claude Code legal page](https://code.claude.com/docs/en/legal-and-compliance) |
| No **"Claude"**, **"Claude Code"** or **"Anthropic"** in the product or company name. (Anthropic made "Clawdbot" rename) | Same page |
| Plugins in Anthropic's directory may not **fetch instructions from a server** or contain **hidden or encoded instructions** | [Directory policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy) |
| No sponsored content inside the plugin | Directory policy |
| A hosted service needs a privacy policy, collects only what it needs, and uses OAuth for sign-in | Directory policy |

### OpenAI

| Rule | Source |
| --- | --- |
| No "GPT" in the product name. Avoid "Codex" too | OpenAI brand guidelines |
| No selling subscriptions inside a plugin | [App guidelines](https://developers.openai.com/plugins/app-guidelines) |

### What this means for holdfast

holdfast is safe on all of these by design: it runs inside the user's own agent,
makes **no network calls**, contains no hidden instructions, and its rules come
from a file in the user's own repo — not from a server.

## Honest expectations

- **Months 0–6:** no income. The return is reputation, a portfolio project and
  learning what teams actually need.
- **If adoption comes:** talk to the teams using it before building anything
  paid. Ask what they'd pay for; don't guess.
- **If adoption doesn't come:** the tool still works for LIFEWORLD and any
  project you build next. That alone is worth the first milestone.
