---
"@luca/engine": patch
---

A step that ends while the engine is deciding no longer runs a second time. The engine read the journal, then awaited (the usage line's files) before starting steps; a step that ended in that gap freed its ticket, and the decision, made from before it ended, started the same step again. In one run a ticket joined the run branch twice in a row, and the second, empty join wiped the record of the first. The engine now decides again when a step ends during a decision, and a join of a ticket that has already joined leaves the run branch and its join record alone (#719).
