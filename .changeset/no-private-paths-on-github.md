---
"@luca/engine": patch
---

What Luca itself posts on GitHub (its comments, a pull request's title and body, and a shared PR story) no longer shows paths from your computer. A stuck comment names the worktree relative to Luca's runs folder (such as `runs/<run id>/tickets/11`) and says that `/luca-unstick` on the computer that ran the run shows its full path. Other paths it recognizes, such as one in a stuck comment's last error, become `[runs]`, `[worktree]`, `[tmp]`, `[home]` or `[outside]`, keeping at most the file's own name after a home folder, and a computer's name becomes `[host]`. This works on the path shapes Luca knows (home, temp and state folders, in their usual forms), so a path written some other way can still get through. It doesn't reach text an agent posts itself with `gh`, or files agents commit: Luca's agents and the `luca-pr-address`, `luca-retro` and `luca-spec-check` skills are only told to use repo-relative paths.
