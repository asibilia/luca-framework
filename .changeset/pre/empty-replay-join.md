---
"@luca/engine": patch
---

A join with nothing left to replay (the ticket's change is already on the run branch) now succeeds as a join that adds nothing, instead of failing with `git cherry-pick`'s usage text and leaving the ticket stuck (#716).
