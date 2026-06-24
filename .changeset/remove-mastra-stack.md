---
---

chore: remove the legacy Mastra Code stack ahead of v13 GA.

Deletes the `@alecsibilia/luca-framework` (the old Mastra Code CLI) and
`@alecsibilia/luca-mastracode` (the custom Mastra Code distribution)
packages, the root `.mastracode/` symlink dir, the `mastracode` run
script and `@mastra/*`/`mastracode` workspace-catalog entries, the
`bunfig.toml` Mastra release-age excludes, and the `mastracode` commit
scope. The GA stack ships as `@alecsibilia/luca` (bundling `luca-cli`,
`luca-core`, `luca-tools`) and targets the Claude Code and Antigravity
harnesses only.

No published-package impact for `@alecsibilia/luca`: it never depended
on the Mastra family, so no version bump is needed. Follow-up: deprecate
the already-published `@alecsibilia/luca-framework` on npm.
