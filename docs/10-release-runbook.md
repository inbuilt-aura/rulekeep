# 10. Release runbook — from "captures pass" to published

Do this **after** `scripts/check-captures.mjs` reports every field present
([09-dogfooding.md](./09-dogfooding.md)). That result is what turns the contract
tests from an assumption into a fact, and nothing below is worth doing until
it holds.

Each step says what to run, and what "done" looks like. Stop at any step that
does not match.

---

## Step 0 — Decide honestly whether to continue

The build plan gates v0.1.0 on **two weeks of real use, false-alarm rate under
1 in 5** ([04-build-plan.md](./04-build-plan.md) M4 step 7).

If you have only done the one capture session, you have proved the plumbing
works. You have not yet proved the tool is pleasant to live with, and that is
what decides whether anyone keeps it installed.

**Two honest options:**

| | When it fits |
| --- | --- |
| **Tag v0.1.0 now, keep the repo private** | You want a version to point at while you dogfood. Nothing is published; nothing is public. |
| **Wait for the two weeks, then publish** | The plan as written. Recommended. |

A third option that is *not* recommended: publish publicly on one session's
evidence. A tool that misfires on a stranger's repo gets uninstalled once and
never reinstalled, and first impressions on Hacker News do not come twice.

---

## Step 1 — Commit the captured fixtures

The captures are the first real evidence in the repo that the adapter matches
Claude Code. Keep one payload per event.

```bash
mkdir -p test/contracts/claude-code
# copy one representative capture per event, with a stable name:
#   test/contracts/claude-code/session-start.json
#   test/contracts/claude-code/pre-tool-use.json
#   test/contracts/claude-code/post-tool-use.json
#   test/contracts/claude-code/stop.json
```

Open each one and **remove anything you would not put in a public repo** — the
payloads contain absolute paths and the agent's last message. Replace your real
paths with something like `/repo`.

Then ask for a test that replays these fixtures through the adapter, so a
future change that breaks the real contract fails the suite.

**Done when:** four fixtures committed, scrubbed, and a test reads them.

---

## Step 2 — Version numbers

Already done and already guarded: both `package.json` and the plugin manifest
say `0.1.0`, and `test/plugin.test.ts` fails if they ever drift apart. (They
did drift — `0.0.1` against `0.1.0` — which is why there is now a test.)

To bump for a later release, change both, in the same commit:

```bash
node -e "const f='package.json',j=require('./'+f);j.version='0.2.0';require('fs').writeFileSync(f,JSON.stringify(j,null,2)+'\n')"
node -e "const f='plugins/claude-code/.claude-plugin/plugin.json',j=require('./'+f);j.version='0.2.0';require('fs').writeFileSync(f,JSON.stringify(j,null,2)+'\n')"
npm run verify
```

**Done when:** `npm run verify` is green, which now includes the version check.

> Claude Code decides an update exists from the plugin manifest's `version`
> field. Set it there, not in `marketplace.json`.

---

## Step 3 — Write the four missing files

None exist yet. Ask Claude Code to draft each, then read it yourself before
committing — these are the files strangers judge the project by.

| File | Must say |
| --- | --- |
| `SECURITY.md` | How to report a vulnerability privately (GitHub private reporting). That rulekeep runs locally, makes no network calls, runs checker commands only after explicit approval — **and is not a security sandbox**. An agent with shell access can always work around a hook. |
| `CHANGELOG.md` | One section per version. For 0.1.0: the six rule types, the Claude Code plugin, the trust flow, `check` for CI. |
| `CONTRIBUTING.md` | How to run `npm run verify`. That the engine (`src/engine/**`) stays pure and eslint enforces it. That every new rule type needs the treatment in [04-build-plan.md](./04-build-plan.md) "Definition of done for any new rule type". |
| `.github/ISSUE_TEMPLATE/` | Three: **bug** (agent + version, OS, `rulekeep doctor` output), **false alarm** (the rule YAML, the line, why it is wrong), **rule request**. |

The false-alarm template matters most. It is the report that tells you whether
the tool is actually usable, so make it the easiest one to file.

**Done when:** all four exist, you have read them, `npm run verify` is green.

---

## Step 4 — Add the release workflow

`.github/workflows/release.yml`, triggered on a `v*` tag: runs `npm run verify`,
publishes to npm with provenance, creates a GitHub Release. The full YAML is in
[06-publishing.md](./06-publishing.md#releasing-a-version).

It needs a secret:

1. Create an npm **automation** token at npmjs.com → Access Tokens.
2. `gh secret set NPM_TOKEN` and paste it.

**Done when:** `gh secret list` shows `NPM_TOKEN`.

---

## Step 5 — Make the repo public

Everything above can be done private. This step cannot be undone quietly — the
code, the commit history and the docs all become visible.

Before flipping it, check:

- [ ] No credentials in the history. Match the *shape* of a real secret, not
      the words — `grep -i token` returns hundreds of harmless prose hits and
      teaches you to ignore it:

      ```bash
      git log -p | grep -nE "(gh[pousr]_[A-Za-z0-9]{20,}|npm_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)"
      ```

      No output means clean. **Checked on 2026-09-17: clean.**
- [ ] No absolute paths that identify your machine in the committed fixtures
- [ ] README's first screen reads well to someone who has never heard of this
- [ ] `examples/lifeworld/rulekeep.yaml` works as a copy-paste starting point

```bash
gh repo edit inbuilt-aura/rulekeep --visibility public --accept-visibility-change-consequences
```

**Done when:** `gh repo view --json visibility` says `PUBLIC`.

> Anthropic's directory does not accept closed-source plugins, so public is
> required before any marketplace submission ([07-business.md](./07-business.md)).

---

## Step 6 — Tag and publish

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow runs `verify`, publishes to npm, and creates the Release.

```bash
gh run watch          # wait for it
npm view rulekeep     # should show 0.1.0
```

**Done when:** `npm view rulekeep version` prints `0.1.0` and the GitHub Release
exists.

---

## Step 7 — Install it the way a stranger would

**Do not skip this.** Everything up to here tested your working copy. This is
the only test of what people actually receive.

On a different machine if you can, or at least a different folder:

```
/plugin marketplace add inbuilt-aura/rulekeep
/plugin install rulekeep@rulekeep
```

Then run one real task in a project that has a `rulekeep.yaml`, and confirm a
rule still fires.

Also check the CI path:

```bash
npx rulekeep@0 check --base origin/main
```

**Done when:** both work from the published artifacts, with nothing local
involved.

If something is broken here, fix it and release `0.1.1` rather than leaving a
broken `0.1.0` as the first thing anyone installs.

---

## Step 8 — Then, and only then, tell people

The launch checklist is in
[06-publishing.md](./06-publishing.md#launch-checklist). Its "Before" section
asks for things that do not exist yet — a demo GIF, the Codex and Gemini
adapters (v0.3), the eval numbers. Publishing v0.1.0 to npm does not oblige you
to announce it.

A sensible order:

1. **v0.1.0 on npm, quiet.** Use it. Let a few people you know try it.
2. **v0.2 / v0.3** — Codex (M5) and Gemini CLI (M6) adapters.
3. **Submit to Anthropic's community marketplace** — needs public repo and
   `claude plugin validate --strict` passing, both already true.
4. **Then** Show HN, r/ClaudeCode, and the rest.

Announcing a tool that only supports one agent, with no demo and no usage
evidence, spends attention you only get once.

---

## If a step fails

| Symptom | Likely cause |
| --- | --- |
| `npm publish` says the name is taken | Someone took `rulekeep` in the meantime. Check first: `npm view rulekeep`. |
| The release workflow fails on publish | `NPM_TOKEN` missing, expired, or not an automation token |
| `/plugin install` cannot find it | Repo still private, or `.claude-plugin/marketplace.json` not on the default branch |
| Installed plugin does nothing | The committed `plugins/claude-code/dist/rulekeep.cjs` is stale. CI checks this, but confirm: `git diff --exit-code -- plugins/claude-code/dist/` |
| A rule misfires for someone else | Get the YAML and the line. That is a false-alarm report, and it is the most useful issue anyone can file. |
