# Reviews and shipping

How a ticket and the whole run branch are reviewed, and how a run ends in a PR.

## The ticket review

A fresh reviewer checks that one ticket's committed diff meets its acceptance criteria, and findings go back to a fixer in a capped loop.

Reached by: every ticket, after its gates pass; the board shows it as "Reviewing".

Tests:

- `packages/engine/src/core/decide-review.test.ts`
- `packages/engine/src/core/ticket-review.e2e.test.ts`
- `packages/board/server/review-fix-loop.test.ts`

## The final review and shipping

Five lenses review the whole run branch before the PR opens, with their own fix rounds, and a stuck final review can be shipped by the owner's `ship` reply.

Reached by: every run, once its tickets are done or skipped; the board shows the five lenses.

Tests:

- `packages/engine/src/core/decide-final-review.test.ts`
- `packages/engine/src/core/final-review.test.ts`
- `packages/engine/src/core/final-review.e2e.test.ts`
- `packages/engine/src/core/run-ship-uncommitted.test.ts`
- `packages/engine/src/core/run-ship-uncommitted.e2e.test.ts`
- `packages/board/server/final-review-panel.test.ts`
- `packages/board/server/final-review-hidden.test.ts`

## The pull request and changesets

A run ends in one PR with a Summary, Merge danger, and Evidence, its open findings, and the run's changeset in a repo that uses changesets.

Reached by: the end of every run that built something; a spec with more than one release label is refused at intake.

Tests:

- `packages/engine/src/core/pull-request-text.test.ts`
- `packages/engine/src/core/evidence-text.test.ts`
- `packages/engine/src/core/run-pull-request.test.ts`
- `packages/engine/src/core/run-pull-request.e2e.test.ts`
- `packages/engine/src/core/decide-changesets.test.ts`
- `packages/engine/src/core/run-changeset.e2e.test.ts`
- `packages/engine/src/core/decide-release-labels.test.ts`
