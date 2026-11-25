---
"@luca/engine": patch
---

`luca check` now runs every check without git's repo-local environment variables (`GIT_DIR`, `GIT_INDEX_FILE`, `GIT_WORK_TREE`, `GIT_OBJECT_DIRECTORY`, `GIT_COMMON_DIR`, `GIT_CONFIG_PARAMETERS` and the rest of `git rev-parse --local-env-vars`, plus `GIT_CONFIG_KEY_<n>`/`GIT_CONFIG_VALUE_<n>`). Run from a git hook, they made tests that build scratch repos write to the real repo: its config, branch and tags. Other `GIT_*` settings, such as `GIT_SSH_COMMAND`, are kept. The recommended `pre-push` hook now also runs `unset $(git rev-parse --local-env-vars)` before `exec luca check --skip-slow`. It also exits 0 when `$CI` is set, and the documented `prepare` script doesn't turn the hooks folder on in CI, so a CI job's push (such as changesets/action's Version PR) never runs the hook.
