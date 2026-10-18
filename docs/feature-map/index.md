# Feature map

This is the map of what Luca does, and which tests prove it (#583). Each section is one feature a user would recognise, with how a user reaches it and the test files that cover it.

Why it exists: an agent that adds a test should know where the feature already has tests, and put the new one beside them. This repo's `.luca/config.json` sets `feature_map` to this folder (#597), so every `*.md` page in it together is the map:

- The red check refuses a new test file that no page lists.
- The test-writer adds a new test file under the feature it tests, on its area's page, in the same change. It may edit any page here, though it may write nothing else outside test files.
- `packages/engine/src/gates/feature-map-docs.test.ts` checks that every `*.test.ts` file under `packages/` and `scripts/` is listed on some page, and that every listed file exists.

To add a feature, add a section to its area's page: a heading, one sentence, a `Reached by:` line, and a `Tests:` list with each path in backticks. A new area gets a new page, kept under the file size limit. The words come from `GLOSSARY.md`; the engine and board READMEs say how each feature works.

## Pages

- [building.md](building.md): starting a run, building one ticket, the red check, the feature map, the gates, and joins.
- [reviews-and-shipping.md](reviews-and-shipping.md): the ticket review, the final review, and the pull request.
- [run-control.md](run-control.md): stuck work, crash recovery, the config, limits, tokens, and looking back.
- [agents.md](agents.md): agents, their guards and messages, memory, the decision model, and the tracker.
- [board-and-cli.md](board-and-cli.md): the board, the command line, the publish package, the docs, and repo tooling.
