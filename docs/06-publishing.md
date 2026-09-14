# 6. Publishing

How to get holdfast from a repo on your machine to people's agents: the files
the repo needs, how versions and releases work, how to list it for Claude Code,
Codex and Gemini CLI, the npm package for CI, and the launch itself.

---

## How people will install it

| Where | How users install | How updates reach them |
| --- | --- | --- |
| **Claude Code** — your own marketplace | `/plugin marketplace add <you>/holdfast` then `/plugin install holdfast@holdfast` | When you bump `version` |
| **Claude Code** — Anthropic's community marketplace | `/plugin install holdfast@claude-community` (after acceptance) | Anthropic's pin follows your commits |
| **Codex** | See [Codex](#codex) | See below |
| **Gemini CLI** | See [Gemini CLI](#gemini-cli) | See below |
| **CI** | `npx holdfast@0 check --base origin/main` | `@0` follows the latest 0.x |

Your GitHub repo is the single source for all of them.

---

## Repo layout at release

```
holdfast/
  .claude-plugin/
    marketplace.json           ← makes the repo a Claude Code marketplace
  plugins/
    claude-code/
      .claude-plugin/plugin.json
      hooks/hooks.json
      skills/setup/SKILL.md  skills/trust/SKILL.md  skills/explain/SKILL.md
      evals/
      dist/holdfast.cjs        ← committed (see below)
    codex/                     ← from v0.2
    gemini-cli/                ← from v0.3
  src/  test/                  ← the code
  examples/
    lifeworld/holdfast.yaml    ← a real, working example
  .github/
    workflows/ci.yml  evals.yml  release.yml  canary.yml
    ISSUE_TEMPLATE/bug.yml  false-alarm.yml  rule-request.yml
  .gitattributes
  package.json                 ← also the npm package for the CLI
  README.md  CHANGELOG.md  LICENSE  TRADEMARK.md  SECURITY.md  CONTRIBUTING.md
```

### Why `dist/holdfast.cjs` is committed

When someone installs a plugin, the agent **copies the plugin's files** from
your repo. No build step runs. So the built file must be in the repo, inside each
plugin folder. CI checks the committed copy matches the source
([05-testing.md](./05-testing.md#ci-workflow)).

Add `.gitattributes` so Windows checkouts don't change its line endings:

```
plugins/*/dist/holdfast.cjs  text eol=lf
```

---

## Files every open-source release needs

### `README.md` — the first screen decides everything

In this order:

1. **One sentence** — "holdfast enforces your project's rules while AI agents
   work — in Claude Code, Codex and Gemini CLI — and again in CI."
2. **A 20-second demo** (GIF or asciinema): the agent adds `.skip` to a failing
   test, holdfast stops it, the agent fixes the real bug.
3. **Install**, one short block per agent.
4. **A 10-line `holdfast.yaml`** example.
5. **What it checks / what it can't check** — honest, side by side.
6. **Does it help?** — the eval Δ table from the latest release.
7. Links: full rule reference, CI setup, FAQ.

### `LICENSE`

Apache-2.0 full text ([07-business.md](./07-business.md#the-licence-apache-20)).

### `TRADEMARK.md`

Short: forks are welcome under the licence, but may not use the name
"holdfast" or a confusingly similar name for a fork or a paid product.

### `SECURITY.md`

- How to report a vulnerability privately (GitHub's private vulnerability
  reporting).
- What holdfast does and doesn't do: runs locally, no network calls, runs
  checker commands only after approval, not a security sandbox.

### `CHANGELOG.md`

One section per version. For every release include the **eval Δ** and any
**rules format changes**.

### Issue templates

| Template | Asks for |
| --- | --- |
| **Bug** | Agent and version, OS, holdfast version, output of `holdfast doctor` |
| **False alarm** | The rule (YAML), the line it fired on, why it's wrong. These are the most valuable reports — make them easy |
| **Rule request** | The rule in plain words, where it's written today (CLAUDE.md etc.), an example of it being broken |

---

## Versions

**Semantic versioning.** Before 1.0: `0.MINOR.PATCH`, where a minor bump may
change the rules format (with a migration note). From 1.0: breaking changes to
`holdfast.yaml` only with `version: 2` in the file.

**One version number everywhere.** `package.json`, every plugin manifest and
the changelog. A script keeps them in sync:

```bash
npm run release:version -- 0.2.0
# updates package.json, plugins/claude-code/.claude-plugin/plugin.json,
# plugins/codex/…, plugins/gemini-cli/…, and adds a CHANGELOG heading
```

**How Claude Code decides there's an update:** it uses the `version` field. If a
plugin has no `version`, every new git commit counts as a new version. Set
`version` in `plugin.json` only (not also in `marketplace.json`), so users get
updates exactly when you release.

---

## Releasing a version

1. Merge everything for the release into `main`. CI green.
2. `npm run release:version -- X.Y.Z` and fill in the changelog.
3. Run the evals ([05-testing.md](./05-testing.md#layer-5-live-agent-evals)) and
   paste the Δ into the changelog.
4. Commit: `Release vX.Y.Z`. Tag: `git tag vX.Y.Z`. Push both.
5. The `release.yml` workflow, on the tag:
   - runs `npm run verify`,
   - creates a GitHub Release with the changelog section,
   - publishes the CLI to npm.
6. Install from the public marketplace on a clean machine and run one real
   task. Don't skip this — it's the only test of what users actually get.

`release.yml` (npm publishing step):

```yaml
name: release
on:
  push:
    tags: ['v*']
permissions:
  contents: write
  id-token: write      # lets npm verify the package was built by this workflow
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
      - run: npm ci
      - run: npm run verify
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      - run: gh release create "$GITHUB_REF_NAME" --notes-file <(node scripts/changelog-section.mjs "$GITHUB_REF_NAME")
        env:
          GH_TOKEN: ${{ github.token }}
```

---

## Claude Code

### Your own marketplace (from v0.1)

The repo's `.claude-plugin/marketplace.json`
([04-build-plan.md](./04-build-plan.md#m3--claude-code-adapter-and-plugin)) makes
the repo installable immediately:

```
/plugin marketplace add <you>/holdfast
/plugin install holdfast@holdfast
```

Rules for the marketplace file:

- Required: `name`, `owner.name`, and `plugins` (each with `name` and `source`).
- `name` is what users type after `@`. Some names are reserved for Anthropic,
  including `claude-plugins-official`, `claude-plugins-community`,
  `claude-community` and `claude-code-plugins`.
- Check it: `claude plugin validate . --strict`.

### Anthropic's community marketplace (from v0.3)

Being listed makes holdfast installable without adding your repo first, and
visible at [claude.com/plugins](https://claude.com/plugins).

1. Make sure the repo is **public** (closed-source plugins aren't accepted).
2. `claude plugin validate ./plugins/claude-code --strict` passes.
3. Submit at **[platform.claude.com/plugins/submit](https://platform.claude.com/plugins/submit)**.
4. Anthropic runs automated validation and a safety screen.
5. Once accepted, the plugin is pinned to a commit in
   [`anthropics/claude-plugins-community`](https://github.com/anthropics/claude-plugins-community),
   and the catalog syncs nightly. Check the current docs for how the pin follows
   new commits before relying on it.

Directory rules that apply to holdfast ([details](./07-business.md#rules-we-must-stay-inside)):
no fetching instructions from a server, no hidden instructions, no sponsored
content. holdfast meets all three by design.

**The official Anthropic marketplace** (`claude-plugins-official`) is curated by
Anthropic — there's no application. Being in the community marketplace with real
usage is the path there.

---

## Codex

([Codex plugins docs](https://learn.chatgpt.com/docs/plugins))

**Package:** `plugins/codex/` with `.codex-plugin/plugin.json`, the default
`hooks/hooks.json` ([03-architecture.md](./03-architecture.md#codex)), the
skills, and `dist/holdfast.cjs`.

**How users install:**

```bash
codex plugin marketplace add <you>/holdfast
codex plugin add holdfast@<marketplace-name>
```

(or `/plugins` inside Codex to browse and install). Then:

1. **Start a new session** — Codex loads a plugin's skills and hooks there.
2. Run `/hooks` and **trust** holdfast's hooks. Codex skips them until you do.

Codex reads a repo's marketplace from `.agents/plugins/marketplace.json` or
`.claude-plugin/marketplace.json`. Give Codex its own
`.agents/plugins/marketplace.json` pointing at `./plugins/codex`, so it never
picks up the Claude Code package by mistake.

OpenAI is also moving plugins to the portable Agent Plugins format (a root
`plugin.json`, with Codex hooks under `extensions.com.openai.hooks`).
`.codex-plugin/plugin.json` still works; revisit this before v1.0.

Things to put in the Codex install guide:

- **Plugins don't work in the Codex IDE extension** — only in Codex CLI and the
  ChatGPT desktop app.
- **The trust step**, with a screenshot and one line per hook explaining what it
  does. Without this, people think holdfast is broken.
- **Re-trust after updates** is only needed if the hook definitions changed.
  Keep `hooks.json` stable between releases so it rarely happens.

**Listing in OpenAI's directory:** submissions go through
[platform.openai.com/plugins](https://platform.openai.com/plugins), as "Skills
only" or "With MCP", and need a verified identity, 5 positive and 3 negative test
cases, and listing details. The submission flow doesn't mention hooks, so it's
unclear whether a hooks-based plugin like holdfast can be listed. Until that's
confirmed, the install-from-GitHub commands above are the Codex distribution
path.

---

## Gemini CLI

([Gemini CLI extensions reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/reference.md))

**Package:** `plugins/gemini-cli/` with `gemini-extension.json` in its root,
hooks in `hooks/hooks.json` (hooks are **not** declared in the manifest), and
`dist/holdfast.cjs`. Use `${extensionPath}` to refer to files inside it.

Minimal `gemini-extension.json`:

```json
{
  "name": "holdfast",
  "version": "0.3.0"
}
```

Check the reference for any other fields you want (description, context files).

**How users install:**

```bash
gemini extensions install https://github.com/<you>/holdfast --auto-update
```

Gemini CLI expects the extension's `gemini-extension.json` at the root of the
source it installs. Since holdfast keeps each agent's package in a subfolder,
either publish the Gemini package from a dedicated branch or release archive
whose root is `plugins/gemini-cli/`, or check whether the install command accepts
a subdirectory. Decide this in M6.

**Updates:** installed extensions are copies. Users run
`gemini extensions update holdfast` (or install with `--auto-update`). Changing
existing hook commands doesn't ask users for consent again.

**Discovery:** add the `gemini-cli-extension` topic to the GitHub repo so it
appears in Gemini CLI's extension gallery.

**Before investing here, answer Q4** ([08-risks-and-decisions.md](./08-risks-and-decisions.md#open-questions)):
since 18 June 2026, "Login with Google" no longer works for Gemini CLI on the
free tier, Google AI Pro or Google AI Ultra (API keys and Code Assist
Standard/Enterprise still work), and Google points users to Antigravity CLI —
whose migration notes don't mention hooks or extensions.

---

## npm package (CI)

The same repo publishes the CLI:

```json
{
  "name": "holdfast",
  "version": "0.1.0",
  "bin": { "holdfast": "dist/holdfast.cjs" },
  "files": ["dist", "README.md", "LICENSE"],
  "engines": { "node": ">=22" },
  "license": "Apache-2.0"
}
```

Add a shebang to the bundle with esbuild's `--banner:js="#!/usr/bin/env node"`.

What users add to their CI:

```yaml
# .github/workflows/holdfast.yml
name: holdfast
on: pull_request
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0          # holdfast needs the base branch to compare against
      - uses: actions/setup-node@v5
        with:
          node-version: 22
      - run: npx holdfast@0 check --base "origin/${{ github.base_ref }}" --format github
```

---

## Launch checklist

### Before

- [ ] Final name chosen and checked on npm, GitHub and the web (Q1)
- [ ] v0.3 released: Claude Code, Codex, Gemini CLI all installable
- [ ] README first screen done, with demo GIF and eval Δ
- [ ] `examples/lifeworld/holdfast.yaml` works as a copy-paste starting point
- [ ] Clean-machine install tested on Windows and macOS for every agent
- [ ] Issue templates live; you can respond to false-alarm reports within 48 hours for the first month
- [ ] Submitted to Anthropic's community marketplace

### Launch day

- [ ] **Show HN** post: what it does, the demo, what it can't do, the eval Δ
- [ ] r/ClaudeCode, r/ClaudeAI and r/codex — one post each, following each
      subreddit's self-promotion rules
- [ ] A short thread on X / Bluesky with the demo

**Don't** post links in other projects' GitHub issues as advertising. If an open
issue asks for exactly what holdfast does, one reply that says you built it,
links it, and discloses you're the author is fine. Once.

### First month after

- [ ] Every false-alarm report answered; each fix gets a new fixture
- [ ] Weekly canary green, or fixed within a day
- [ ] Note which rule types people ask for — that's the v0.4 plan
- [ ] Re-check the research numbers ([research.md](./research.md)) — this space moves monthly
