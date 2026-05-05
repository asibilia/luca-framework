---
"@alecsibilia/luca-mastracode": patch
---

Fix: custom slash commands followed by multi-line pasted text no longer fail with "Unknown command". Upstream's slash dispatcher parses with a single-line regex (`/^(\/\/?)(.*)$/`, no `s` flag), so any newline in the input caused the regex to miss and the dispatcher fell through to the unknown-command branch. Added an upstream patch that monkey-patches `tui.handleSlashCommand` to collapse newline-spanning whitespace in slash inputs to single spaces before dispatch — matches the behavior of `processSlashCommand`'s `args.join(' ')` arg substitution, so no information is lost.
