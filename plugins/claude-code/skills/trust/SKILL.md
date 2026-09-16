---
name: trust
description: Approve the checker commands in this repo's holdfast.yaml so they can run. Use when holdfast says a repo wants to run commands that are not trusted yet.
disable-model-invocation: true
---

Approve this repo's checker commands.

A `checker` rule runs a real shell command taken from the repo's
holdfast.yaml. holdfast never runs one until the user has approved that exact
set of commands, because a repo you just cloned could otherwise run anything.

1. Run `holdfast trust --list` and show the user the exact commands, verbatim.
2. Ask them to confirm they want these to run on their machine. **Do not skip
   this.** Read the commands yourself first; if any looks like it does
   something other than checking code (downloading and executing something,
   touching credentials, deleting files, contacting the network), say so
   plainly before asking.
3. Only if they approve, run `holdfast trust`.
4. Confirm with `holdfast trust --list` that it now reports "trusted".

To undo this later: `holdfast trust --revoke`. Approval is tied to the exact
commands — if they change in the repo, they must be approved again.
