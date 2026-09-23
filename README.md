# Rulekeep

> **Your project's rules, enforced while the AI works.**

Rulekeep turns project conventions into checks that run while an AI coding
agent works and again in CI. A broken rule is caught and explained in the
moment, rather than waiting for review.

Today, rulekeep supports Claude Code. Codex and Gemini CLI adapters are planned
but are not included yet.

```yaml
# rulekeep.yaml
version: 1
rules:
  - id: no-any
    type: line
    files: ["src/**/*.ts"]
    added: '(:\s*any\b|\bas\s+any\b)'
    mode: block
    message: Don't use `any`. Use `unknown` and narrow it.
```

```
you: "add a function that parses the API response"
agent: writes `const data = response as any;`

rulekeep: this edit breaks 1 rule.
  no-any (block)  src/parse.ts:2
    const data = response as any;
    Don't use `any`. Use `unknown` and narrow it.
  Fix the edit, then continue.

agent: rewrites it as `const data: unknown = response;` — and continues
```

## Status: public pre-release

The Claude Code plugin, hook wiring, CI command, trust flow, and six rule types
are implemented and tested. The repository is public, but version `0.1.0` has
not been published to npm yet.

The remaining release gate is sustained dogfooding on a real project and tuning
false alarms ([`docs/04-build-plan.md`](./docs/04-build-plan.md) M4 step 7).

| Piece                                                              | State                                                |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| Rule engine (`command`, `line`, `boundary`, `test-guard`, `prose`) | ✅ Built                                             |
| `checker` rule type (running a real command like `tsc`)            | ✅ Built                                             |
| `rulekeep.yaml` parser, with line-numbered errors                  | ✅ Built                                             |
| Overrides (`rulekeep-ignore <rule>: <reason>`)                     | ✅ Built                                             |
| Claude Code hook wiring (`hook claude-code <event>`)               | ✅ Built, contract-tested against real hook payloads |
| Installable Claude Code plugin (`plugins/claude-code/`)            | ✅ Built                                             |
| Skills (`/rulekeep:setup`, `:trust`, `:explain`)                   | ✅ Built                                             |
| Checker trust flow (`rulekeep trust`)                              | ✅ Built                                             |
| `rulekeep check` — the CI backstop                                 | ✅ Built, drives real `git diff`/`git status`        |
| `rulekeep doctor`                                                  | ✅ Built                                             |
| Dogfooded on a real project                                        | ⬜ In progress — required before v0.1                |
| Codex adapter                                                      | ⬜ Not built                                         |
| Gemini CLI adapter                                                 | ⬜ Not built                                         |

## Install the Claude Code plugin

In Claude Code, add this repository as a marketplace and install the plugin:

```text
/plugin marketplace add inbuilt-aura/rulekeep
/plugin install rulekeep@rulekeep
```

Start a new session in a repository containing `rulekeep.yaml`, then use
`/rulekeep:setup` to configure it. Checker rules require explicit approval via
`/rulekeep:trust`.

## Try the CLI locally

```bash
npm ci
npm run build      # produces dist/rulekeep.cjs
node dist/rulekeep.cjs doctor
```

`doctor` looks for a `rulekeep.yaml` starting from your current directory and
reports whether it's valid. Simulating a real hook call end to end (what
Claude Code actually sends and reads):

```bash
# In a scratch git repo with a rulekeep.yaml:
echo '{"session_id":"s1","cwd":".","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git push --force"}}' \
  | node dist/rulekeep.cjs hook claude-code pre-tool-use
```

For CI, run the command against the changes from a base ref:

```bash
node dist/rulekeep.cjs check --base origin/main
```

## Contributing

Contributions are welcome. Start with a focused issue, or fork the repository
and open a pull request from a short-lived branch. The `main` branch requires
pull requests and passing CI, so direct pushes are not accepted.

Good first contributions include improving documentation, adding a regression
test, or reporting a reproducible false alarm. See
[`CONTRIBUTING.md`](./CONTRIBUTING.md) for the workflow and review checklist.

## Development

```bash
npm run typecheck   # tsc
npm run lint        # eslint
npm run test        # vitest
npm run verify      # all of the above, plus the build
```

The rule engine (`src/engine/`) is pure — no filesystem, no processes, no
clock — enforced by an ESLint rule. Everything that touches disk or git lives
in `src/runtime/`. See
[`docs/03-architecture.md`](./docs/03-architecture.md) for why.

The full design, build plan, testing strategy, and release process are in
[`docs/README.md`](./docs/README.md).

## License

Apache-2.0 — see [LICENSE](./LICENSE). The name `rulekeep` is not covered by
that license; see [TRADEMARK.md](./TRADEMARK.md).
