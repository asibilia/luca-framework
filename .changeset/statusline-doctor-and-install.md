---
"@alecsibilia/luca-cli": minor
---

feat(cli): `luca statusline install` + a `Claude statusline` doctor check

Versions ≤13.0.1 shipped the bundled statusline script in the tarball but the published init never registered it in `~/.claude/settings.json`, so the footer silently never appeared on fresh machines. Two additions close that gap:

- **`luca statusline install`** — manually installs the bundled script into `~/.claude/` (or `--home <dir>`) and registers the `statusLine` entry, reusing the same idempotent installer as `luca init` (user-authored statuslines and `statusLine: null` opt-outs are preserved; exits non-zero on any skip so the reason is visible).
- **`luca doctor`** now includes a global-scope `Claude statusline` check that distinguishes registered / not-registered / script-missing / user-custom / user-disabled / unparsable-settings states, with `luca doctor --fix` support.
