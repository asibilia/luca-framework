---
"@luca/engine": patch
---

The final review caps a role's failed tries in a row, so a lens that failed once in an early round, then finished, starts a later round with all its tries. The integration lens gets 100 turns and the implementer 150. When a stuck final review ships before its round settled, the PR now lists what the lenses that finished the round found: their open findings, their nits, and the "won't fix" answers they let go. A finding they cleared is no longer listed as open. The implementer that starts a final review fix round is told which slow tests failed, next to its code findings. Stuck comments say "failed tries", not "failed trys".
