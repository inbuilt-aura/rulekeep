# Research A: Claude Code plugin ecosystem map

Data pulled 2026-09-14 using `gh api` (repo metadata, marketplace.json files, issues), 12 GitHub search calls, claude.com/plugins (WebFetch), and the Claude Code docs. Raw data is in `scratchpad/a/`: `official.json`, `community.json`, `cc.json`, `s1-s4.json`, `known*.tsv`, `sample_repos.tsv`, `classify2.js`.

## Caveats (read first)
- **Category counts are keyword-based and multi-label.** I ran regex classifiers over plugin names and descriptions (`a/classify2.js`, plus a second niche pass). They show relative density, not exact totals. Some matches are false positives (for example "API contract" tripping "legal"). Use them to rank categories, not to quote precise figures.
- **Star counts look inflated across this ecosystem.** Several skill repos report 100k–290k stars. I can't verify that those stars are organic. One sign of trouble: the top issue on MemPalace/mempalace is "Multiple issues between README claims and codebase" (337 reactions), and other issues there are titled "POSSIBLE SCAM REPO" and "Remove Baldfaced Lies Please". **Install counts on claude.com/plugins are a better adoption signal than stars.**
- The claude.com/plugins numbers came through WebFetch, which runs a summarizing model over the page. Treat exact figures as *likely accurate but UNVERIFIED*.
- Secondary claims from blogs are marked UNVERIFIED.

---

## 1. Official Anthropic marketplaces

### 1a. anthropics/claude-plugins-official
**36,209 stars · last push 2026-09-13 · Apache-2.0 · 1,004 open issues (983 of them real issues, not PRs)**
"Official, Anthropic-managed directory of high quality Claude Code Plugins."

`.claude-plugin/marketplace.json` lists **295 plugins**.

**By the `category` field:**

| Category | Plugins |
|---|---|
| development | 121 |
| productivity | 54 |
| database | 38 |
| monitoring | 21 |
| security | 18 |
| (none) | 14 |
| deployment | 9 |
| design | 8 |
| automation | 3 |
| learning | 3 |
| location | 2 |
| testing | 2 (growthbook, playwright) |
| migration | 1 (aws-transform) |
| math | 1 (math-olympiad) |

**How plugins are sourced:** 154 by URL, 89 via git-subdir, 38 local `plugins/`, 14 local `external_plugins/`.

**Who wrote them:**
- **Anthropic-authored: 39.** The list is agent-sdk-dev, clangd/csharp/gopls/jdtls/kotlin/lua/php/pyright/ruby/rust-analyzer/swift/typescript-lsp, code-modernization, feature-dev, frontend-design, mcp-apps, mcp-server-dev, mcp-tunnels, playground, plugin-dev, ralph-loop, skill-creator, claude-code-setup, claude-md-management, code-review, code-simplifier, commit-commands, cwc-makers, hookify, pr-review-toolkit, project-artifact, receipts, session-report, claude-security, security-guidance, explanatory-output-style, learning-output-style, math-olympiad.
- **Also hosted by Anthropic under `external_plugins/` with no author field:** telegram, discord, imessage, fakechat, plus wrappers for asana, firebase, github, gitlab, laravel-boost, linear, playwright and serena.
- **Partners/vendors: roughly 245.** These are companies: AWS (8+), Google (13+), SAP (7), Oracle/NetSuite (6), Microsoft, Grafana (3), Shopify, Stripe, Vercel, Supabase, Sentry, Datadog, CrowdStrike, Snowflake, Databricks, and others. There are 133 distinct author names, and 82 entries have no author field; I resolved those through their source URLs.
- **Individuals and indie authors: about 5 at most.** superpowers (obra), mattpocock-skills (Matt Pocock), remember (Digital-Process-Tools), atomic-agents (BrainBlend), and serena (Oraios, a small company).
- **Takeaway:** the official directory is mostly Anthropic plus vendor integrations. Indie developers almost never get in.
- **Growth:** a blog said there were "101 plugins … 33 Anthropic-built, 68 partner" in March 2026 (agensi.io, UNVERIFIED). That would mean roughly 3x growth in six months.

### 1b. anthropics/claude-plugins-community
**3,924 stars · last push 2026-08-25 · Apache-2.0 · 46 open issues**
"Community plugin marketplace for Claude Cowork and Claude Code. Read-only mirror — submit plugins at clau.de/plugin-directory-submission."

- **2,282 plugins**, pointing at 2,015 distinct repos from 1,768 distinct GitHub owners.
- Only 157 entries set `category` (104 of those are development) and only 36 set `author`.
- **Who publishes:** in a random sample of 160 owners, 111 were Users and 49 were Organizations, so about 69% individuals.
- **The long tail is very thin.** In a random sample of 148 plugin repos:
  - Stars: median **1**, 75th percentile 7, 90th percentile 71. 114 of 148 (77%) have fewer than 10 stars; only 2 have 1,000 or more.
  - Freshness: 74 of 148 (50%) had no push in over 90 days; 49 were pushed in the last 30 days.
  - Creation dates cluster in **2026-03 (62) and 2026-04 (37)**, which looks like a submission wave after Cowork opened to plugins.
- **Prolific submitters:** adelaidasofia (19), agent-sh (17), gemini-cli-extensions (13), nathanmaine (12), barnburner121 (many one-line generator plugins).

### 1c. anthropics/claude-code, `.claude-plugin/marketplace.json`
**144,921 stars · last push 2026-09-13 · no license detected · 12,536 open issues**

"claude-code-plugins" lists **13 plugins**, all Anthropic staff: agent-sdk-dev, claude-opus-4-5-migration, code-review, commit-commands, explanatory-output-style, feature-dev, frontend-design, hookify, learning-output-style, plugin-dev, pr-review-toolkit, ralph-wiggum, security-guidance.

Open issues labelled on anthropics/claude-code (REST count): **area:plugins 338, area:skills 279, area:hooks 327.**

### 1d. Other Anthropic marketplaces

| Repo | Stars | Last push | License | Plugins |
|---|---|---|---|---|
| anthropics/skills | 176,101 | 2026-09-10 | none detected | 5 (document-skills, example-skills, claude-api, academy-guide, discernment-nudge) |
| anthropics/knowledge-work-plugins | 23,997 | 2026-09-13 | Apache-2.0 | 105, aimed at Cowork (sales, finance, legal, marketing, HR, bio-research, plus partners) |
| anthropics/financial-services | 34,817 | 2026-09-11 | Apache-2.0 | 19 |
| anthropics/life-sciences | 596 | 2026-08-14 | none detected | 21 |

### 1e. claude.com/plugins directory (WebFetch; figures likely accurate but UNVERIFIED)
- Filter "Works with: Cowork, Claude Code". Pagination shows 1/4, with at least 100 plugins on page one.
- Badge: "Anthropic verified". The page says: "Plugins are submitted by developers in the community. We perform basic automated review…"
- **No paid plugins or pricing appear anywhere.** The plugin reference docs also say nothing about licensing or payment.

**Most-installed plugins (page one):**

| Rank | Plugin | Installs | Anthropic verified |
|---|---|---|---|
| 1 | Frontend Design | 1,134,112 | yes |
| 2 | Superpowers | 1,009,371 | no |
| 3 | Code Review | 438,525 | yes |
| 4 | Context7 | 417,801 | no |
| 5 | Skill Creator | 385,083 | yes |
| 6 | Code Simplifier | 346,763 | yes |
| 7 | Playwright | 319,887 | no |
| 8 | GitHub | 319,381 | no |
| 9 | CLAUDE.md Management | 287,247 | yes |
| 10 | Feature Dev | 256,017 | yes |
| 11 | Security Guidance | 241,800 | yes |
| 12 | Vercel | 227,688 | no |
| 13 | TypeScript LSP | 212,522 | yes |
| 14 | Ralph Loop | 196,527 | yes |
| 15 | Claude Code Setup | 195,067 | yes |
| 16 | Commit Commands | 171,244 | yes |
| 17 | Figma | 167,556 | no |
| 18 | Supabase | 118,617 | no |
| 19 | PR Review Toolkit | 114,856 | yes |
| 20 | Pyright LSP | 109,778 | yes |
| 21 | Chrome DevTools | 102,569 | no |
| 22 | Telegram | 100,332 | no |
| … | Remember | 51,442 | no |
| … | CodeRabbit | 32,361 | no |
| … | Session-report | 11,694 | yes |
| … | PagerDuty Pre-Commit Risk Score | 4,985 | no |

**What the install list shows:**
- 13 of the top 20 are Anthropic-authored.
- The only indie plugins in the top 40 are Superpowers and Remember (Serena comes from a small company).
- Installs fall off steeply: #50 has about 26k and #100 about 4k.

### 1f. Adoption index
quemsah/awesome-claude-plugins (1,291 stars, last push 2026-09-13, no license) runs an n8n crawler. It reports "**39,096 total repositories indexed**" that contain Claude Code plugins, as of 2026-09-13.

Its top 100 by stars mixes true plugins with big projects that merely ship a `.claude-plugin` (next.js, storybook, payload, ccxt, mlflow). Plugin shipping has become a default distribution channel for vendors.

### 1g. GitHub topic counts (search API `total_count`)

| Topic | Repos |
|---|---|
| topic:claude-skills | 8,282 |
| topic:claude-code-plugin | 6,292 |
| topic:claude-code-hooks | 403 |
| topic:claude-code-marketplace | 303 |
| topic:claude-code-subagents | 74 |

---

## 2. Top third-party plugins and marketplaces (installable)

Every repo below ships `.claude-plugin/plugin.json` or `marketplace.json`, which I checked through the contents API. Sorted by stars. "Open" is the GitHub open-issue count, which includes PRs.

| # | Repo | Stars | Last push | License | Open | Category | Description (fetched) |
|---|---|---|---|---|---|---|---|
| 1 | obra/superpowers | 286,133 | 2026-09-12 | MIT | 364 | workflow methodology / skills | "An agentic skills framework & software development methodology that works." |
| 2 | mattpocock/skills | 261,150 | 2026-09-04 | MIT | 494 | engineering workflow skills | "Skills for Real Engineers. Straight from my .agents directory." |
| 3 | affaan-m/ECC | 257,656 | 2026-09-12 | MIT | 195 | all-in-one harness (skills, memory, security) | "The agent harness performance optimization system…" |
| 4 | multica-ai/andrej-karpathy-skills | 212,760 | **2026-04-20** | none | 130 | prompt pack (single CLAUDE.md) | "A single CLAUDE.md file to improve Claude Code behavior…" |
| 5 | DietrichGebert/ponytail | 137,217 | 2026-09-07 | MIT | 263 | behavior / persona | "Makes your AI agent think like the laziest senior dev in the room." |
| 6 | nextlevelbuilder/ui-ux-pro-max-skill | 127,350 | 2026-09-10 | MIT | 85 | UI/UX design | "…design intelligence for building professional UI/UX…" |
| 7 | JuliusBrussee/caveman | 105,347 | 2026-09-13 | NOASSERTION | 130 | token reduction / output style | "…cuts 65% of tokens by talking like caveman" |
| 8 | addyosmani/agent-skills | 93,959 | 2026-09-12 | MIT | 117 | engineering skills | "Production-grade engineering skills for AI coding agents." |
| 9 | thedotmack/claude-mem | 93,801 | 2026-09-13 | Apache-2.0 | 176 | memory | "Persistent Context Across Sessions for Every Agent…" |
| 10 | Leonxlnx/taste-skill | 86,827 | 2026-08-24 | MIT | 66 | design taste | "gives your AI good taste. stops … generic slop" |
| 11 | Egonex-AI/Understand-Anything | 82,507 | 2026-09-12 | MIT | 301 | codebase knowledge graph | "Turn any code into an interactive knowledge graph…" |
| 12 | ruvnet/ruflo | 72,312 | 2026-09-13 | MIT | 997 | multi-agent swarms | "The original agent harness. Deploy intelligent multi-player swarms…" |
| 13 | headroomlabs-ai/headroom | 71,889 | 2026-09-13 | Apache-2.0 | 632 | token compression | "Compress tool outputs, logs, files, and RAG chunks…" |
| 14 | career-ops-hq/career-ops | 71,459 | 2026-09-13 | MIT | 519 | job search (non-dev) | "Open-source AI job search…" |
| 15 | pbakaus/impeccable | 67,784 | 2026-09-11 | Apache-2.0 | 28 | design | "The design language that makes your AI harness better at design." |
| 16 | mvanhorn/last30days-skill | 61,963 | 2026-09-13 | MIT | 128 | research | "…researches any topic across Reddit, X, YouTube, HN…" |
| 17 | upstash/context7 | 61,959 | 2026-09-11 | MIT | 64 | docs lookup (MCP) | "Up-to-date code documentation for LLMs…" |
| 18 | MemPalace/mempalace | 59,035 | 2026-09-13 | MIT | 732 | memory | "The best-benchmarked open-source AI memory system." |
| 19 | coreyhaines31/marketingskills | 49,957 | 2026-09-05 | MIT | 112 | marketing / SEO | "Marketing skills for Claude Code and AI agents…" |
| 20 | kepano/obsidian-skills | 48,268 | 2026-09-10 | MIT | 72 | knowledge / Obsidian | "Agent skills for Obsidian…" |
| 21 | Imbad0202/academic-research-skills | 47,857 | 2026-09-13 | other | 30 | academic research | "research → write → review → revise → finalize" |
| 22 | blader/humanizer | 47,608 | 2026-09-06 | MIT | 11 | writing | "removes signs of AI-generated writing from text" |
| 23 | ayghri/i-have-adhd | 44,173 | 2026-09-10 | MIT | 67 | output style | "stop your coding agent from burying the answer" |
| 24 | wshobson/agents | 39,624 | 2026-09-13 | MIT | 4 | plugin marketplace / subagents (94 plugins) | "Multi-harness agentic plugin marketplace…" |
| 25 | cathrynlavery/diagram-design | 39,143 | 2026-09-10 | MIT | 42 | diagrams | "38 editorial diagram types…" |
| 26 | Yeachan-Heo/oh-my-claudecode | 39,129 | 2026-09-13 | MIT | 6 | multi-agent orchestration | "Teams-first Multi-agent orchestration for Claude Code" |
| 27 | openai/codex-plugin-cc | 33,103 | **2026-07-08** | Apache-2.0 | **495** | cross-model bridge | "Use Codex from Claude Code to review code or delegate tasks." |
| 28 | mukul975/Anthropic-Cybersecurity-Skills | 32,723 | 2026-08-31 | Apache-2.0 | 45 | security skills | "817 structured cybersecurity skills…" |
| 29 | rohitg00/agentmemory | 28,402 | 2026-09-07 | Apache-2.0 | 587 | memory | "#1 Persistent memory for AI coding agents…" |
| 30 | jarrodwatts/claude-hud | 27,948 | 2026-09-12 | MIT | 20 | status line / HUD | "shows … context usage, active tools, running agents…" |
| 31 | gastownhall/beads | 27,119 | 2026-09-13 | MIT | 1,156 | memory / issue tracking | "A memory upgrade for your coding agent" |
| 32 | OthmanAdi/planning-with-files | 26,852 | 2026-09-13 | MIT | 8 | planning | "Persistent file-based planning…" |
| 33 | phuryn/pm-skills | 26,287 | 2026-07-03 | MIT | 41 | product management | "PM Skills Marketplace: 100+ agentic skills…" |
| 34 | alirezarezvani/claude-skills | 25,911 | 2026-08-30 | MIT | 16 | skill mega-collection | "380 Claude Code skills…" |
| 35 | EveryInc/compound-engineering-plugin | 25,060 | 2026-09-13 | MIT | 95 | workflow methodology | "Official Compound Engineering plugin…" |
| 36 | VoltAgent/awesome-claude-code-subagents | 25,040 | 2026-09-07 | MIT | 14 | subagent collection | "100+ specialized Claude Code subagents" |
| 37 | mksglu/context-mode | 22,594 | 2026-09-13 | NOASSERTION | 241 | context / token optimization | "Sandboxes tool output (98% reduction)…" |
| 38 | snarktank/ralph | 21,774 | **2026-02-02** | MIT | 74 | autonomous loop | "autonomous AI agent loop … until all PRD items are complete" |

### Not installable plugins, but they define the space
| Repo | Stars | Last push | License | Open | Notes |
|---|---|---|---|---|---|
| garrytan/gstack | 132,862 | 2026-09-11 | MIT | 888 | "23 opinionated tools…"; no `.claude-plugin`, installed by setup script |
| github/spec-kit | 136,324 | 2026-09-12 | MIT | 319 | spec-driven development CLI |
| Graphify-Labs/graphify | 116,382 | 2026-09-12 | Apache-2.0 | 1,325 | codebase knowledge graph skill |
| rtk-ai/rtk | 80,171 | 2026-09-13 | Apache-2.0 | 1,732 | token-reducing CLI proxy |
| ComposioHQ/awesome-claude-skills | 74,960 | 2026-08-10 | none | 1,447 | list |
| hesreallyhim/awesome-claude-code | 53,969 | 2026-09-13 | NOASSERTION | 1,041 | list |
| bmad-code-org/BMAD-METHOD | 52,972 | 2026-09-13 | NOASSERTION | 37 | agile AI methodology |
| gsd-build/get-shit-done | 64,542 | 2026-05-31 | MIT | 0 | **ARCHIVED**; moved to open-gsd/gsd-core (9,410 stars, 2026-09-13, MIT, 125 open) |
| davila7/claude-code-templates | 30,700 | 2026-09-13 | MIT | 250 | CLI |
| oraios/serena | 29,269 | 2026-09-12 | MIT | 179 | MCP |
| SuperClaude-Org/SuperClaude_Framework | 23,886 | 2026-08-21 | MIT | 73 | framework |
| sirmalloc/ccstatusline | 12,866 | 2026-09-07 | MIT | 120 | status line |
| ccusage/ccusage | 18,530 | 2026-09-13 | NOASSERTION | 31 | usage tracking |
| NVIDIA/SkillSpector | 17,082 | 2026-09-12 | Apache-2.0 | 129 | "Security scanner for AI agent skills" |

### Third-party marketplaces and curated lists
| Repo | Stars | Last push | License | Open | Notes |
|---|---|---|---|---|---|
| wshobson/agents | 39,624 | 2026-09-13 | MIT | 4 | 94 plugins |
| alirezarezvani/claude-skills | 25,911 | 2026-08-30 | MIT | 16 | 99 plugins |
| sickn33/agentic-awesome-skills | 46,366 | 2026-09-13 | MIT | 0 | 59 plugins |
| composio-community/awesome-claude-plugins | 1,958 | 2026-07-26 | none | 347 | list |
| obra/superpowers-marketplace | 1,256 | 2026-09-08 | MIT | 49 | marketplace |
| ccplugins/awesome-claude-code-plugins | 936 | 2026-08-12 | Apache-2.0 | 207 | list |
| Piebald-AI/claude-code-lsps | 517 | 2026-07-25 | none | 7 | LSP plugins |
| trailofbits/skills-curated | 499 | 2026-07-14 | CC-BY-SA-4.0 | 19 | "community-vetted" |
| karanb192/claude-code-hooks | 511 | 2026-09-13 | MIT | 4 | hooks |
| davepoon/buildwithclaude | 3,443 | 2026-09-09 | MIT | 18 | hub |

**Everyone is going multi-harness.** wshobson/agents, ECC, compound-engineering, claude-mem, gstack, context-mode and caveman all advertise Codex, Cursor or OpenCode support. Being Claude-only is no longer the default for top repos.

---

## 3. Category map

### 3a. Keyword density across the official and community marketplaces (2,577 plugins, multi-label, approximate)

Totals below come from the targeted niche pass (official + community); "off N" is how many of those are in the official marketplace.

**Dense**

| Category | Hits | Official | Examples |
|---|---|---|---|
| SEO / marketing / ads | 211 | 15 | ads-agent, adspirer, claude-seo |
| memory / cross-session | 162 | 3 | agent-memory, agent-recall, agent-knowledge |
| token / cost reduction and tracking | 117 | 9 | |
| code review | 106 | 12 | adversarial-review, coderabbit, greptile, qodo |
| docs generation | 93 | 14 | |
| session observability / transcripts | 91 | 10 | |
| commit / PR helpers | 88 | 9 | commit-commands, babysit-pr |
| Codex / Gemini / GPT / Grok bridges | 84 | 1 | adversarial-review, agent-discussion |
| finance | 77 | 4 | |
| job search / career | 76 | 0 | |
| notifications (sound / Telegram / Discord) | 73 | 3 | agent-ping, bells-and-whistles |
| education | 73 | 3 | |
| health | 71 | 1 | |
| e2e / browser testing | 66 | 4 | |
| debugging | 66 | 11 | |
| "N specialized agents" collections | 60 | 1 | 10x-team, agentic-swe |
| guardrails / destructive-command blockers | 56 | 2 | |
| TDD | 49 | 2 | |
| spec-driven | 44 | 0 | |
| mobile | 44 | 4 | |
| crypto / web3 | 42 | 0 | |

The first classifier pass (community only, `classify2.js`) gives similar orderings: multi-agent orchestration 152, memory 150, spec/planning 135, git/PR 110, status line/dashboards 109, cross-model 105, code review 96, autonomous loops 85, subagent/role collections 71, meta plugin/skill/CLAUDE.md tooling 70, guardrails 60, cost/token 59, notifications 40.

**Thin (official + community combined)**

| Category | Hits | Official | Examples |
|---|---|---|---|
| incident / postmortem | 38 | 7 | |
| code search / indexing | 34 | 4 | |
| refactoring | 34 | 3 | |
| onboarding / codebase explanation | 32 | 4 | |
| team / org governance | 32 | 1 | noisy |
| legal | 31 | 2 | |
| accessibility | 30 | 1 | |
| status line | 29 | 0 | |
| performance profiling | 27 | 5 | codspeed |
| game dev | 25 | 2 | |
| **unit test generation** | **21** | **0** | |
| API contract / OpenAPI | 16 | 1 | |
| data science / notebooks | 15 | 3 | |
| monorepo | 13 | 0 | |
| embedded / hardware | 13 | 1 | |
| **flaky tests** | **10** | 1 | |
| FinOps / cloud cost | 10 | 3 | |
| **release management** | **10** | 0 | |
| **plugin / skill security scanning** | **10** | 0 | clawkeeper, promptguard, security-sweep |
| **CI failure triage** | **9** | 0 | buildkite, gh-guard, deploycheck |
| **framework / version migration** | **8** | 3 | |
| **DB schema migration** | **6** | 1 | db-migration-guard, prisma |
| **i18n / localization** | **5** | 0 | |
| desktop apps | 5 | 0 | |
| **skill / plugin eval** | **4** | 1 | deepeval |
| legacy / COBOL modernization | 4 | 2 | aws-transform, code-modernization |
| **dependency upgrades** | **2** | 0 | dep-diff, gh-guard |
| **license / SBOM** | **1** | 0 | |

About 569 of the 2,282 community plugins matched none of my developer-focused patterns. Most of those are vendor API wrappers and vertical business tools.

### 3b. Section sizes in hesreallyhim/awesome-claude-code (53,969 stars, curated)
Entries per heading:
- Security 19
- Documentation/Learning 18
- Agent Orchestration 16, plus Ralph Wiggum 6
- Usage & Cost 14
- Memory & Context Persistence 12
- Providers/Runtime 9
- Status Lines 8
- Session Monitors 8
- Alternative Clients 8
- Remote Control/Notifications/Voice 7
- Design & UI/UX 7
- Linting 6
- Observability 5
- Skills 5
- Multi-Purpose 5
- Creative Media 4
- Infrastructure & DevOps 3
- Writing 3
- Research 3
- Configuration 3
- **Testing 2**

### 3c. Targeted GitHub sweeps
- `topic:claude-code test in:name,description` returned 2,613 repos. **No dedicated test-generation plugin in the top 20 has more than 1k stars.** The testing-related results were guard-skills (1,237), agent-qa (907), SkillForge (892) and skillgrade (706). The rest are incidental matches.
- `topic:claude-code migration OR upgrade OR dependency OR CI in:name,description` returned 2,737 repos. **None of the top 20 is a dependency-upgrade, framework-migration or CI-fix plugin.** Matches are incidental ("zero-dependency", "memory upgrade").

### 3d. Saturated categories, with evidence
1. **Workflow methodologies (spec-driven, plan/execute, "how to engineer with agents").** superpowers 286k stars and about 1.0M installs; mattpocock/skills 261k; gstack 133k; spec-kit 136k; addyosmani/agent-skills 94k; GSD 64k (archived, forked to gsd-core); BMAD 53k; planning-with-files 27k; compound-engineering 25k; plus 135 community plugins matching spec/planning. Anthropic's feature-dev plugin has 256k installs.
2. **Memory and context persistence.** claude-mem 94k, MemPalace 59k, agentmemory 28k, beads 27k, hindsight 23.5k, mem0, and 150–162 marketplace hits. **Claude Code now has auto memory built in** ("How Claude remembers your project").
3. **Token and cost reduction or tracking.** caveman 105k, rtk 80k, headroom 72k, context-mode 22.6k, ccusage 18.5k, CodexBar 21k, codeburn 11k, and 117 hits. Built-in "Manage costs effectively" and a status line cover the basics.
4. **Code review.** 106 hits, plus official Code Review (439k installs), PR Review Toolkit (115k), CodeRabbit, Greptile, Qodo, openai/codex-plugin-cc (33k), alibaba/open-code-review (23k), and **built-in `/code-review ultra`**. mattpocock/skills issue #483 is a "/code-review name clash with Claude Code built-in".
5. **Multi-agent orchestration and subagent or role collections.** ruflo 72k, oh-my-claudecode 39k, wshobson/agents 40k, VoltAgent 25k, alirezarezvani 26k, Claude-Code-Game-Studios 25k, and 152 orchestration hits plus 71 "AI team" hits. **Agent teams, agent view and inter-session messaging are now built in.**
6. **Design and UI taste skills.** ui-ux-pro-max 127k, taste-skill 87k, impeccable 68k, diagram-design 39k, and official frontend-design with 1.13M installs, the most-installed plugin.
7. **Cross-model bridges.** 84–105 hits, openai/codex-plugin-cc (official from OpenAI), xai-org/grok-build-plugin-cc, claude-octopus 4k, claude-council 740.
8. **Status line / HUD and notifications.** claude-hud 28k, ccstatusline 12.9k, 40–73 notification plugins. Built-in status line and **channels** exist, and the official Telegram plugin has 100k installs.
9. **Git and commit helpers.** 88–110 hits; official commit-commands has 171k installs.
10. **SEO and marketing.** 211 hits, marketingskills 50k, claude-seo 16.8k, notfair 3.8k.
11. **Vendor MCP wrappers** (DB, cloud, observability). About 245 partner plugins; the vendors ship these themselves.

### 3e. Thin or empty categories, with evidence
- **Test generation and test quality** (unit tests, mutation testing, flaky-test triage). 21 unit-test and 10 flaky-test hits; the official category "testing" has 2 plugins; awesome-claude-code Testing has 2 entries; no test-gen plugin above 1k stars.
- **Maintenance chores.** Dependency upgrades 2, CI failure triage 9, release management 10, framework migration 8, DB schema migration 6, i18n 5, license/SBOM 1. The GitHub sweep found no notable repo.
- **Plugin and skill supply-chain hygiene** (security scan, conflicts, context budget, stale pins). About 10 marketplace plugins. The largest standalone tool, NVIDIA/SkillSpector (17k), is not a plugin; skills-janitor has 117 stars.
- **Plugin and skill evals.** 4 hits. But `claude plugin eval` now exists natively (experimental "Test plugins with evals"), so this category has been partly absorbed by the platform.
- **Additional LSP languages.** Anthropic ships 12 LSP plugins. Open requests: Vue/Volar (#232, 40 reactions) and Scala/Metals (claude-code #45132, 94 reactions); Piebald-AI/claude-code-lsps (517 stars) is the only aggregator.
- **Non-English output and localization.** Isolated hits: fluent-korean 1,261 stars, claude-code-zh-cn 759 stars.

---

## 4. Quality signals

### 4a. Stale or abandoned despite high stars
Last push more than 60 days before 2026-09-14:
- **Archived:** gsd-build/get-shit-done (64.5k), last push 2026-05-31; replaced by open-gsd/gsd-core.
- multica-ai/andrej-karpathy-skills (212.8k), 2026-04-20.
- eyaltoledano/claude-task-master (28.1k), 2026-04-28.
- travisvn/awesome-claude-skills (15.0k), 2026-04-28, 810 open.
- snarktank/ralph (21.8k), 2026-02-02.
- Donchitos/Claude-Code-Game-Studios (25.0k), 2026-05-21.
- disler/claude-code-hooks-mastery (3.9k), 2026-03-04.
- parcadei/Continuous-Claude-v3 (3.9k), 2026-01-26.
- anthropics/claude-code-security-review (6.2k), 2026-02-11.
- winfunc/opcode (22.4k), 2025-10-16, 332 open.
- wshobson/commands (2.6k), 2025-10-12.
- lst97/claude-code-sub-agents (1.7k), 2025-08-15.
- openai/codex-plugin-cc (33.1k), 2026-07-08, **495 open**.
- phuryn/pm-skills (26.3k), 2026-07-03.
- zilliztech/claude-context (12.5k), 2026-07-14.
- arscontexta (3.5k), 2026-02-24.
- zscole/adversarial-spec (556), 2026-01-22.
- hamelsmu/claude-review-loop (725), 2026-03-15.

Most top-30 repos pushed within the last 7 days. In the community long tail, 50% were not pushed in more than 90 days.

### 4b. High open-issue loads
| Repo | Open issues |
|---|---|
| gastownhall/beads | 1,156 |
| anthropics/claude-plugins-official | 1,004 |
| ruvnet/ruflo | 997 |
| gstack | 888 |
| MemPalace | 732 |
| headroom | 632 |
| agentmemory | 587 |
| career-ops | 519 |
| codex-plugin-cc | 495 |
| mattpocock/skills | 494 |
| superpowers | 364 |

wshobson/agents (4) and oh-my-claudecode (6) triage aggressively.

### 4c. Recurring complaints (most-discussed issues in the biggest repos)

**1. Install and packaging breakage, especially version skew between plugin.json, npm and bundles**
- claude-mem #3857 "v13.24.0 ships the 13.23.1 bundle: manifest/worker version mismatch makes the hook kill the worker" (24 comments) and #3940 (same class); #121 "6.0.5 broke the plugin — db migration miss".
- oh-my-claudecode #3497 "v4.15.5 published to npm … main still at 4.15.4 — plugin installs stuck"; #3872 better-sqlite3 has no Node 26 prebuild (88 comments).
- context-mode #658 "plugin.json points to wrong skills path and stale MCP server path"; #231 better-sqlite3 NODE_MODULE_VERSION mismatch.
- ui-ux-pro-max #353 (npm ships an older version), #215 install `--global` error (44 reactions), #474 "hard-coded ~/.claude paths".
- mattpocock/skills #692 "new install instructions not working for claude".
- Official directory: "remember: marketplace pins 0.25.0, which silently captures 0 exchanges" (#5926) and pins 0.30.0 missing a fix (#6031); "aws-core: marketplace pins … pre-fix commit" (#5931); "Marketplace commit pins don't cover runtime-fetched MCP payloads" (#5749).
- claude-code issues: #45810 "Marketplace update button is disabled"; #63986 "Support version pinning"; #31388 "Plugin paths hardcoded with absolute paths".

**2. Windows is a second-class platform**
- 87 of 983 open issues in the official plugins repo mention Windows, PowerShell, MSIX or Store Python.
- security-guidance hooks never run on Windows (#6086); Store Python can't read the plugin dir (#6085, #6028, #5904, #5748).
- hookify has non-ASCII and JSON path errors on Windows (#6092, #5730).
- skill-creator eval scripts fail silently on Windows (#5744, #5927, #5928).
- Third-party: claude-mem #380 Windows worker port 37777 (37 comments); context-mode #15 and #156; caveman #366 PowerShell 7 installer; oh-my-claudecode #1390 ask-codex needs tmux on Windows and #1459 statusline broken on PowerShell 7; codex-plugin-cc #618 `/codex:transfer always fails on Windows`.

**3. Orphaned background processes and resource leaks**
- 60 official-repo open issues mention orphan, leak, CPU or pollers.
- telegram 409-conflict pollers at 100% CPU (#2229); orphaned bun holds the bot token (#1916); 27 orphans at 131% CPU (#5745); discord leaks about 1.4 GB/day (#6089).
- **285 of 983 open official-repo issues concern the telegram, discord or imessage channel plugins.**
- codex-plugin-cc #543 "brokers never self-terminate → … 272 procs, ~2.2GB"; #108; #163 "158 orphans".

**4. Context bloat, slowness and skill over-prescription**
- superpowers #743 "slowness in responses since using the skill" (26 comments), #895 "plans over-specify implementation" (36 reactions), #512 skill efficiency, #2017 retuning for newer models.
- wshobson/agents #93 "Large cumulative agent descriptions will impact performance", #500 "30 duplicate agent names cause runtime collisions", #643 duplicate agents with divergent content.
- mattpocock/skills #483 name clash with a built-in; #831 "Can we get the old grill-me back?" (34 reactions; behavior regressed after an update).

**5. Trust and truthfulness of claims**
- MemPalace #27 README claims vs code (337 reactions), #618 "POSSIBLE SCAM REPO", #524.
- The "save 60–90% tokens" style claims across the cost category are unaudited.

**6. Directory and submission friction**
- claude-plugins-official #1272 "marked as Published … but not available" (35 comments), #984, #1887.
- claude-code #80263 "Plugin submissions reach 'Published' but never propagate".
- #28125 "Cowork can't add private GitHub marketplace" (38 comments).

**7. Harness overreach and unclear value**
- ruflo #958 "Still can't figure out how to get v3 to actually perform work."
- Its tracker is dominated by auto-generated "[Dream Cycle]" and "[verification]" issues.

**8. Platform capability gaps affecting plugin authors**
- claude-code #91870 "Function Hooks - make plugins 10x more powerful" (161 comments, 144 reactions).
- #75972 "Plugin-sourced hooks.json never fires"; #11011 skill scripts fail on first run (relative paths).

---

## 5. Features Anthropic has built in (plugin categories at risk)

From the code.claude.com docs index: auto memory; Code Review and `/code-review ultra`; agent teams, agent view and cross-session messaging; custom status line; channels (push events and chat into a session); cost management and a team analytics dashboard; permission modes, sandboxed Bash and sandbox environments; checkpointing; `/loop`, cron scheduling and `/goal` (Ralph-style completion loops); worktrees; `claude plugin eval` (experimental); skills.

The plugin reference now supports skills, agents, hooks, MCP, LSP, output styles, themes, monitors, channels, `bin` executables, `dependencies` with semver, `userConfig` with sensitive values in the keychain, `${CLAUDE_PLUGIN_DATA}`, managed scope, and `claude plugin validate`. **There is still no licensing, payment or entitlement mechanism.**

A separate blog confirms that the official marketplace has "No payments" (agent37.com, dated 2025-12-26, UNVERIFIED as current).

---

## 6. Most promising gaps

1. **Plugin stack doctor / supply-chain hygiene** — a local plugin that audits what's installed.
   - **What it checks:**
     - Name collisions with built-ins and between plugins (mattpocock #483, wshobson #500/#643).
     - Always-loaded context cost per skill or agent description (superpowers #743, wshobson #93).
     - Stale marketplace pins against upstream releases (official #5926/#6031/#5931).
     - Manifest vs bundle version skew (claude-mem #3857/#3940, OMC #3497).
     - Hardcoded paths (#31388, ui-ux-pro-max #474).
     - Orphaned MCP or broker processes (codex-plugin-cc #543, telegram #5745).
     - Prompt-injection or malicious patterns in third-party skills (~10 marketplace plugins; SkillSpector isn't a plugin).
   - **Why it's a gap:** the evidence of pain is strong and few plugins do this.
   - **Risk to check:** Claude Code has a built-in `/skill-doctor` report whose scope I did not look into (UNVERIFIED). Confirm what it covers before building.
2. **Test engineering plugin.**
   - Generates behavior-level unit and property tests.
   - Mutation-tests AI-written code.
   - Triages flaky tests from CI logs.
   - Enforces "no test deleted or weakened" in a hook.
   - **Why it's a gap:** unit-test-gen 21, flaky 10, official testing category 2, curated list Testing 2, and no test-gen plugin above 1k stars, while code review is saturated.
3. **Maintenance-chore autopilot built on /loop, scheduling and channels.**
   - Handles dependency upgrades with changelog-aware breaking-change fixes, CI failure triage and fix PRs, framework or DB migrations, release notes, i18n extraction, and license/SBOM checks.
   - **Why it's a gap:** marketplace counts are 2, 9, 8, 6, 10, 5 and 1; the GitHub sweep found no notable repo. It suits subscription users because it reuses their quota for unattended work.
4. **Windows-first reliability, as a differentiator rather than a product.**
   - 87 official-repo issues and Windows bugs in nearly every top plugin show that "works on Windows/PowerShell and with no Node native modules" is an open quality bar.
   - Any plugin that ships cross-platform CI (native Windows runner, no tmux or bun/better-sqlite3 prebuild traps) stands out.
5. **Verified or benchmarked claims layer.**
   - A plugin that measures, on the user's own repos, what a skill or plugin actually changes. Tokens, pass rate and time with and without it, built on `claude plugin eval`.
   - It addresses the credibility problem (MemPalace #27; unaudited "60–90% savings" claims) and the "which of the 39k plugin repos should I trust" problem.
   - **Risk:** the native eval command could be extended by Anthropic.

**Avoid unless strongly differentiated:** memory, token savers, code review, orchestration or "AI team" packs, workflow methodologies, design-taste skills, status lines, notifications or chat bridges, cross-model bridges, SEO/marketing. Each has 50k+-star incumbents, 50–200 marketplace entries, or a built-in replacement.

---

## Sources
- GitHub REST (via gh):
  - anthropics/claude-plugins-official, anthropics/claude-plugins-community and anthropics/claude-code `.claude-plugin/marketplace.json`
  - anthropics/knowledge-work-plugins, financial-services, life-sciences, skills
  - Repo metadata for all repos cited
  - Issues for obra/superpowers, affaan-m/ECC, thedotmack/claude-mem, mattpocock/skills, openai/codex-plugin-cc, ruvnet/ruflo, JuliusBrussee/caveman, mksglu/context-mode, Yeachan-Heo/oh-my-claudecode, wshobson/agents, garrytan/gstack, MemPalace/mempalace, rohitg00/agentmemory, nextlevelbuilder/ui-ux-pro-max-skill, anthropics/claude-plugins-official, anthropics/claude-code (labels area:plugins/skills/hooks)
- GitHub search: topic:claude-code-plugin, "claude code plugin", topic:claude-code, topic:claude-code-marketplace, and topic counts for claude-skills, claude-code-hooks, claude-code-subagents; plus two targeted sweeps.
- quemsah/awesome-claude-plugins README (adoption index, 39,096 repos)
- hesreallyhim/awesome-claude-code README
- https://claude.com/plugins
- https://code.claude.com/docs/en/plugins-reference
- https://code.claude.com/docs/llms.txt
- https://www.agent37.com/blog/monetize-claude-code-skills (UNVERIFIED)
- https://www.agensi.io/learn/claude-code-plugin-marketplace-guide (UNVERIFIED)
