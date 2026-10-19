---
'@luca/engine': patch
---

Split `claude-launcher.ts`, `git-adapter.ts` and the build test fixtures, and seven big test files, so each is under the repo's 5,000-token file limit. No behaviour change: every module keeps its exports, and the test count and names are unchanged.
