---
"@luca/engine": patch
---

The final review caps a role's failed tries in a row, so a lens that failed once in an early round, then finished, starts a later round with all its tries. The integration lens gets 100 turns and the implementer 150. A PR shipped from a stuck final review now lists the open findings of the lenses that finished the round it never settled. The implementer that starts a final review fix round is told which slow tests failed, next to its code findings. Stuck comments say "failed tries", not "failed trys".
