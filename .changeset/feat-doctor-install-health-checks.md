---
"@alecsibilia/luca": patch
---

Add three `luca doctor` checks (and harden a fourth) that catch the environment problems v12→v13 upgraders hit during install:

- **Global `~/.claude` symlinks** (`scope: global`, auto-fixable) — `lstat`-scans `~/.claude/{skills,commands,agents,hooks}` for broken symlinks left by older dev installs that pointed into a repo's former `dist/claude/`. These dangling links make `luca init` crash with `EEXIST: mkdir '.../.claude/skills/<name>'`. `luca doctor --fix` removes them.
- **MuninnDB MCP wiring** (`scope: global`) — verifies the pipeline can actually reach memory: probes MuninnDB's MCP endpoint (`http://127.0.0.1:8750/mcp` — distinct from the `8476` service/dashboard port) and checks whether a `muninn` server is registered in `~/.claude.json` / project `.mcp.json`. Warns (never fails) with the exact `claude mcp add --transport sse …` command when it's up-but-unregistered or registered-but-down.
- **Legacy global package** (`scope: global`) — warns when the pre-v13 `@alecsibilia/luca-framework` is still installed in Bun's global prefix alongside `@alecsibilia/luca` (both expose the same `luca` binary; whichever was installed last wins). Points at `bun rm -g @alecsibilia/luca-framework`.
- **Stray-local-install hardening** — the existing check now uses `lstat` instead of `existsSync`, so dangling symlinks in a project's `.claude/` are detected (and removable by `--fix`) instead of being silently invisible.
