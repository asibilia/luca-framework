---
"@alecsibilia/luca": minor
---

Ship a Claude Code statusline with `luca init`.

A new bundled statusline script renders a single-line TUI footer: model name, repo + git branch (with dirty marker), context-window usage as a colored 10-slot bar chart (green → yellow ≥60% → red ≥80%, with token counts derived from the session transcript's main-chain usage records), luca pipeline step + phase progress from `.luca/state.json`, and session line delta.

Delivery follows the hook-handler pattern:

- **Source** (`luca-tools`): `src/statusline/handler.ts` — self-contained, fail-open bun script (always exits 0; every segment degrades independently).
- **Build** (`luca` umbrella): `build:done` bundles it via `bun build --target bun` to `dist/claude/.claude/luca-statusline.ts`.
- **Install** (`luca-cli`): new `installStatusline()` helper wired into `luca init` Step 4 — copies the script to `~/.claude/luca-statusline.ts` and merges a `statusLine` entry into global `settings.json`. A user-authored custom statusline is never clobbered (registration is skipped); a luca-owned entry is refreshed idempotently.
