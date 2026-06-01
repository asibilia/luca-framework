---
"@alecsibilia/luca": patch
---

Fix `luca init` crashing with `EEXIST: mkdir '.../.claude/skills/<name>'` when a target path is already occupied by a stale symlink or file.

`installSkills` called `mkdir(target, { recursive: true })` and `copyFile` assuming clean destinations. `mkdir` with `recursive: true` is idempotent for real directories but throws `EEXIST` when the path is a dangling symlink (e.g. left by an older dev install that symlinked `~/.claude/skills/*` into the repo's former `dist/claude/` tree), and `copyFile` would write *through* a stale symlink to its target instead of materializing a real file. The skill/command/agent install now clears any pre-existing non-directory entry (symlink/file) at each target before creating it, so install is robust and idempotent regardless of what previously occupied `~/.claude/`.
