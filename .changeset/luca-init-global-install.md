---
"@alecsibilia/luca-framework": minor
"@alecsibilia/luca-mastracode": minor
---

`luca init` now installs Claude artifacts globally; `luca doctor --fix` cleans up stray per-repo installs.

Previously `luca init` copied the bundled skill set (commands, agents, skills) and the stage-gate hook into the **project's** `.claude/` directory. It now installs them into the **global** `~/.claude/` scope, so a single luca CLI version owns one canonical copy across every project. A repo only ever receives `.luca/` planning files.

**What changed**

- `luca init` installs `commands/`, `agents/`, and `skills/` into `~/.claude/` instead of `<repo>/.claude/`.
- The stage-gate hook is registered in `~/.claude/settings.json` as the bare command `luca hook stage-gate` — the `.claude/hooks/stage-gate.sh` wrapper script is gone. In a non-luca repo the handler defaults to IDLE and allows everything.
- `luca init` is now a 5-step flow (fixing a step-numbering bug); new `--skip-claude` flag skips the global Claude integration, and `--skip-project` now scopes to just the `.luca/` skeleton.
- New `luca doctor` check **Stray local install**: detects luca skills/commands/agents and the stage-gate hook wrongly installed into a repo's local `.claude/` by an older `luca init`.
- New `luca doctor --fix` flag: removes those stray artifacts surgically — user-authored files, `settings.local.json`, and unrelated `settings.json` keys are preserved.

After upgrading, run `luca init` once to populate `~/.claude/`, then `luca doctor --fix` in any repo that still has a pre-upgrade per-repo install.
