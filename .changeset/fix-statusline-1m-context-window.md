---
"@alecsibilia/luca": patch
---

Statusline: recognize native 1M context windows.

The context-usage segment inferred the window size from a legacy `[1m]` model-id suffix and defaulted everything else to 200k, so current-generation models with native 1M windows (Fable/Mythos 5, Opus 4.6/4.7/4.8, Sonnet 4.6, Sonnet 5) rendered as `###/200k` and pegged the bar at 100% far too early.

`contextLimit` now checks a known-1M model-id list alongside the `[1m]` suffix. Unrecognized ids (e.g. Haiku 4.5) still fall back to the conservative 200k so the bar over-warns rather than under-warns. Re-run `luca init` (or copy the rebuilt bundle) to refresh the installed `~/.claude/luca-statusline.ts`.
