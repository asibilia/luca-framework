---
"@luca/engine": patch
---

New `/luca-pr-address` skill, installed by `luca init` and `luca upgrade`: it addresses a pull request's review. It fetches every finding (line and file comments, each review's own text, and check run annotations), judges each one independently, then fixes it, asks about it, defers it or declines it, and replies on its thread. Comments from the review's owner are never declined or deferred: the agent fixes them or asks a question. It runs the repo's own checks, commits, pushes, posts one summary comment, and ends by refreshing the PR's story so it is `review-ready` again. A summary answers only the findings it lists, so a comment that arrives while a run is working stays open; the helper checks each summary before it is posted, keeps a comment's range and whether it is on a whole file, and waits for checks for a bounded time. It never merges and never force-pushes (#740).
