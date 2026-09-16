<title>holdfast</title>

# holdfast

> **Your project's rules, enforced while the AI works.**

`holdfast` is a placeholder name — see [`docs/08-risks-and-decisions.md`](./docs/08-risks-and-decisions.md) Q1.

AI coding agents are told a project's rules and break them anyway. holdfast
turns those rules into checks that run automatically while the agent works —
before a command, after an edit, and before it says it's done — so a broken
rule gets caught and explained in the moment, not in review.

```yaml
# holdfast.yaml
version: 1
rules:
  - id: no-any
    type: line
    files: ['src/**/*.ts']
    added: '(:\s*any\b|\bas\s+any\b)'
    mode: block
    message: Don't use `any`. Use `unknown` and narrow it.
```

```
you: "add a function that parses the API response"
agent: writes `const data = response as any;`

holdfast: this edit breaks 1 rule.
  no-any (block)  src/parse.ts:2
    const data = response as any;
    Don't use `any`. Use `unknown` and narrow it.
  Fix the edit, then continue.

agent: rewrites it as `const data: unknown = response;` — and continues
```

## Status: installable in Claude Code; not yet dogfooded

Everything holdfast does in Claude Code is built and tested: all six rule
types, the full hook wiring, the CI command, and the plugin package you can
install ([Try it](#try-it-right-now) below). `claude plugin validate --strict`
passes and 190 tests cover it.

What it has **not** had is real use. The remaining work before calling it v0.1
is dogfooding it on a real project for a couple of weeks and tuning the false
alarms out ([`docs/04-build-plan.md`](./docs/04-build-plan.md) M4 step 7).

| Piece | State |
| --- | --- |
| Rule engine (`command`, `line`, `boundary`, `test-guard`, `prose`) | ✅ Built |
| `checker` rule type (running a real command like `tsc`) | ✅ Built |
| `holdfast.yaml` parser, with line-numbered errors | ✅ Built |
| Overrides (`holdfast-ignore <rule>: <reason>`) | ✅ Built |
| Claude Code hook wiring (`hook claude-code <event>`) | ✅ Built, contract-tested against real hook payloads |
| Installable Claude Code plugin (`plugins/claude-code/`) | ✅ Built, `claude plugin validate --strict` passes |
| Skills (`/holdfast:setup`, `:trust`, `:explain`) | ✅ Built |
| Checker trust flow (`holdfast trust`) | ✅ Built |
| `holdfast check` — the CI backstop | ✅ Built, drives real `git diff`/`git status` |
| `holdfast doctor` | ✅ Built |
| Dogfooded on a real project | ⬜ Not yet — the next step before v0.1 |
| Codex adapter | ⬜ Not built |
| Gemini CLI adapter | ⬜ Not built |

## The full plan

Read [`docs/README.md`](./docs/README.md) first — it's the reading order for
everything else: why this is worth building, what it does, how it works, the
milestone-by-milestone build plan, testing, publishing, and the business and
risk decisions behind it.

## Try it right now

```bash
npm install
npm run build      # produces dist/holdfast.cjs
node dist/holdfast.cjs doctor
```

`doctor` looks for a `holdfast.yaml` starting from your current directory and
reports whether it's valid. Simulating a real hook call end to end (what
Claude Code actually sends and reads):

```bash
# In a scratch git repo with a holdfast.yaml:
echo '{"session_id":"s1","cwd":".","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git push --force"}}' \
  | node dist/holdfast.cjs hook claude-code pre-tool-use
```

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

## License

Apache-2.0 — see [LICENSE](./LICENSE). The name `holdfast` is not covered by
that license; see [TRADEMARK.md](./TRADEMARK.md).
