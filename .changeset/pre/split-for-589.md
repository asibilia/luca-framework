---
'@luca/engine': patch
'@luca/board': patch
---

Split `run-modes.ts`, `engine-config.ts`, `decide-build.ts`, `role-prompts.ts`, `decide-final-review.ts` and the board's `board-vocabulary.ts`, four big test files, the board README and two engine docs pages, so spec #589's tickets have room under the repo's 5,000-token file limit. No behaviour change: every module keeps its exports, and the test count and names are unchanged.
