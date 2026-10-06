---
"@luca/engine": patch
"@luca/board": patch
---

Undoing a stuck ticket's join never rewinds the run branch over other work (#519). No ticket joins while a stuck ticket's join is still on the run branch. An undo that takes later joins with it clears those tickets' joins too, so they join again instead of being undone a second time. An undo that would rewind over other work is refused: the run branch is left alone and the ticket is stuck (`undo_refused`). A ticket already joining finishes its join before a retried ticket joins.
