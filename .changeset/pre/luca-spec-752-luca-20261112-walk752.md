---
"@luca/engine": minor
"luca-walk": minor
---

`@luca/engine` (and so `@alecsibilia/luca`): `/luca-pr-address` now skips the hidden review-record line that Luca Walk adds to the end of each review it sends, so that line is never treated as a finding.

`luca-walk`: Luca Walk is a new VS Code app. It opens a pull request, walks you through its story one stop at a time in full-file diffs, lets you write comments as drafts, and sends them as one GitHub review. It is private and is installed from a `.vsix` file. ([#752](https://github.com/asibilia/luca-framework/issues/752))
