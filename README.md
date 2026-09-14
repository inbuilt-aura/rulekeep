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

## Status: early build, not yet installable

The rule engine, the CLI (`hook`, `check`, `doctor`) and the full Claude Code
hook wiring work end-to-end today — see [Try it](#try-it-right-now) below. It
is **not yet packaged as something you can install** in Claude Code, Codex or
Gemini CLI; that's the very next step
([`docs/04-build-plan.md`](./docs/04-build-plan.md) M3 onward).

| Piece | State |
| --- | --- |
| Rule engine (`command`, `line`, `boundary`, `test-guard`, `prose`) | ✅ Built, 68 tests |
| `holdfast.yaml` parser, with line-numbered errors | ✅ Built |
| Overrides (`holdfast-ignore <rule>: <reason>`) | ✅ Built |
| Claude Code hook wiring (`hook claude-code <event>`) | ✅ Built, smoke-tested against real hook payloads |
| `holdfast check` — the CI backstop | ✅ Built, drives real `git diff`/`git status` |
| `holdfast doctor` | ✅ Built |
| `checker` rule type (running a real command like `tsc`) | ⬜ Not built — needs `src/runtime/checker.ts` + a trust flow |
| Packaged as an installable Claude Code plugin | ⬜ Not built — needs `.claude-plugin/`, `hooks/hooks.json`, skills |
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
npm run test         # vitest
npm run verify       # all of the above, plus the build
```

The rule engine (`src/engine/`) is pure — no filesystem, no processes, no
clock — enforced by an ESLint rule. Everything that touches disk or git lives
in `src/runtime/`. See
[`docs/03-architecture.md`](./docs/03-architecture.md) for why.

## License

Apache-2.0 — see [LICENSE](./LICENSE). The name `holdfast` is not covered by
that license; see [TRADEMARK.md](./TRADEMARK.md).
