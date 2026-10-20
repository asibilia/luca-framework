---
'@luca/engine': patch
'@luca/board': patch
---

Split the board's `reduce-board.ts`, `board-panel.tsx`, `board-server.ts`, `board-state.ts` and test fixtures, the engine's `claude-launcher.ts`, `gate-runner.ts` and `journal-record.ts`, and seven big test files, so spec #625's tickets have room under the repo's 5,000-token file limit. No behaviour change: every module keeps its exports, and the test count and names are unchanged.
