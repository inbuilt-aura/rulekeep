---
name: explain
description: Explain what a holdfast rule does, why it exists, and how to satisfy or override it. Use when the user asks about a rule that fired or what a rule id means.
disable-model-invocation: true
---

Explain a holdfast rule.

1. Read holdfast.yaml (run `holdfast doctor` to find it if you are unsure
   which file is in effect).
2. Find the rule by its `id`. If the user did not name one, list every rule
   with its id, type, mode and message.
3. For that rule, explain in plain language:
   - **What it matches** — translate the regex or globs into words. Give a
     concrete example line or command that would trigger it.
   - **Where it applies** — its `files:` and `exclude:` globs, if any.
   - **When it runs** — before a command, after an edit, or at stop.
   - **What happens** — `block` sends the agent back; `warn` notes it and
     continues; `off` is inert.
4. Say how to satisfy it, and how to override it if this is a genuine
   exception: put `holdfast-ignore <rule-id>: <reason>` in a comment on the
   offending line. Note that overrides are never hidden — they are still
   reported at stop and in CI.
5. If the rule is `allowOverride: false`, say that it cannot be overridden and
   must actually be fixed.
