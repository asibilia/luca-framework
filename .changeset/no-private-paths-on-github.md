---
"@luca/engine": patch
---

Luca's comments, pull requests and PR stories on GitHub no longer include paths from your computer. A stuck comment now names the worktree relative to Luca's runs folder (such as `runs/<run id>/tickets/11`), and says that `/luca-unstick` on the computer that ran the run shows its full path. Any other path in what Luca posts, such as one in a stuck comment's last error, becomes `<runs>`, `<worktree>`, `<tmp>` or `<home>`, keeping only the file's own name after a home folder. Luca's agents and the `luca-pr-address`, `luca-retro` and `luca-spec-check` skills are told to post repo-relative paths only.
