# Luca Walk

Luca Walk, the VS Code extension the owner reviews a pull request in (`packages/walk`, spec #752): it reads the pull request's story, walks its stops in full-file diffs, and sends the owner's feedback as one GitHub review. Its tests drive the app through a fake host and a pretend GitHub, with real git.

## The package and its seam

The `@luca/walk` package: its VS Code manifest (the commands, the Stops and Context views, the activation event), the rule that only the wiring imports `vscode`, and its glossary entry.

Reached by: installing `luca-walk.vsix` in the `Luca Walk` VS Code profile.

Tests:

- `packages/walk/src/walk-package.test.ts`

## Building and installing

`bun run build` bundles the extension into `dist/extension.js` (CommonJS for VS Code's Node, requiring only `vscode` and Node's own modules), `bun run package` writes `luca-walk.vsix`, git ignores both, and the README says how to install it in the `Luca Walk` profile.

Reached by: `bun run build` and `bun run package` in `packages/walk`, then `code --profile "Luca Walk" --install-extension packages/walk/luca-walk.vsix`.

Tests:

- `packages/walk/src/walk-install.test.ts`
- `packages/walk/src/walk-build.e2e.test.ts`

## Opening a pull request and its summary

`Open pull request` reads a number or a URL, makes Luca Walk's own clone and a checkout of the pull request's head under its folder (never moving a checkout with changes), opens it, and shows the story's summary, or why there is none, on the Summary panel. Loading reads GitHub's head once and brings a checkout left behind by a moved pull request there (the same refusal for changes that are not committed), so the walk, browsing, sending and the record all use that one head.

Reached by: `Luca Walk: Open pull request`, and the Summary panel's buttons.

Tests:

- `packages/walk/src/open-pull-request.test.ts`
- `packages/walk/src/open-pull-request.e2e.test.ts`
- `packages/walk/src/load-pull-request.test.ts`

## The list of review-ready pull requests

`Open a review-ready pull request` joins the pull requests `gh search prs` finds with the open pull requests that have a private story, lists each once, and opens the one picked.

Reached by: `Luca Walk: Open a review-ready pull request`.

Tests:

- `packages/walk/src/review-ready-list.test.ts`
- `packages/walk/src/review-ready-list.e2e.test.ts`

## Browsing without a story

`Browse the diff` (the Summary panel's button, for no story, a stale or broken story, or a newer format) makes one stop per changed file, in path order, from the diff between the merge base of `origin/<base branch>` and the head. Each stop opens its diff at the file's first hunk, the Context view says there is no story, and Next and Back work.

Reached by: the Summary panel's `Browse the diff` button.

Tests:

- `packages/walk/src/browse-diff.test.ts`

## The walk

`Start the walk` goes to the first stop and lists every stop in the Stops view (`current`, `done`); each stop opens the whole file in VS Code's diff editor (the base side from the `luca-walk-base` documents) at its first change. Next and Back move through stops and through a stop's changes, `Back to the walk` returns to the change the owner was last on, and the place in the walk is kept in the pull request's drafts file. A stop whose path leaves the checkout (a `..` part, an absolute path, or a symlink out) is refused, never opened.

Reached by: `Luca Walk: Start the walk` (and the Summary panel's button), `Next stop`, `Previous stop`, `Next change in this file`, `Previous change in this file`, `Back to the walk`, and the Stops view.

Tests:

- `packages/walk/src/walk-stops.test.ts`

## The context box

On every cursor move, the Context view shows the story's context for the change under the cursor (where it sits, how we got here, why, architecture, check this, proof, serves, blast radius, flags), the stop's changes when the cursor is on none, or that the file is not part of the walk. Everything is escaped, and links open in the browser.

Reached by: moving the cursor in a file of the pull request, with the Context view open.

Tests:

- `packages/walk/src/context-box.test.ts`

## The map

`Show the map` opens the Map panel: one box per file on the story's map (marked `start here`, `new`, `deleted`, `renamed from`, `loose end`), the links between files, and the architecture note. Clicking a box goes to the first stop with a change in that file.

Reached by: `Luca Walk: Show the map`, and the Summary panel's `Show the map` button.

Tests:

- `packages/walk/src/map.test.ts`

## Review threads and /luca-pr-address's replies

On loading, the review threads already on the pull request are shown read-only in the checkout's files, labelled `On GitHub` (a file thread on line 1); a reply with `/luca-pr-address`'s reply marker shows as `luca-pr-address` when the signed-in user wrote it. The Summary panel lists the agent's summary comments under `Replies from /luca-pr-address:`, newest first.

Reached by: opening a pull request that has review threads or `/luca-pr-address` comments.

Tests:

- `packages/walk/src/review-threads.test.ts`

## Feedback kept until it is sent

Comments on lines (either side of the diff), suggested changes, file comments, pull request comments and "this file looks good" marks are shown as `Draft` threads and kept at once in the pull request's drafts file, so a new window finds them again. A draft can be edited or deleted before it is sent. Each draft keeps the head it was written or last edited at. A drafts file that can't be read is moved aside as `pr-<number>.corrupt-<time>.json`, never written over, and the owner is told where.

Reached by: the comment controller's comment box, `Luca Walk: Suggest a change`, `Comment on this file`, `Comment on the pull request` and `This file looks good`.

Tests:

- `packages/walk/src/draft-feedback.test.ts`

## Sending one review

`Send the review` asks for a verdict and posts every draft as one GitHub review: `APPROVE` or `REQUEST_CHANGES` on someone else's pull request (`Just comments` listed first, and a real verdict confirmed), `COMMENT` and the `signed-off` or `changes-wanted` label on the owner's own in their own repo, and a plain `COMMENT` with no label on the owner's own in a repo that isn't theirs. A comment GitHub won't attach to its line goes as quoted text (quoted, like a suggested change's lines, from the commit as GitHub shows the file, so a symlink never quotes a file outside the checkout), a leftover pending review of the app's own is deleted (any other stops the send), a failed send keeps every draft, and in the owner's own repo the review's text ends with the review record. With no story, or a stale one, the drafts are checked and quoted against the merge base of `origin/<base branch>` and the head, the commit the plain diff shows. A send reads GitHub's head again and stops, keeping every draft, when it moved or when a line comment was written at another head; a send GitHub took but whose answer was lost is found by its record and never posted twice; and `Just comments` with no comments sends nothing.

Reached by: `Luca Walk: Send the review`.

Tests:

- `packages/walk/src/send-review.test.ts`
- `packages/walk/src/send-review-outcome.test.ts`
- `packages/walk/src/send-review-head.test.ts`

## Remembering what was reviewed

After a send, the review record (the commit sent at and the files that looked good) is kept in `reviewed/` under Luca Walk's folder and, in the owner's own repo, written as the review's hidden last line, with every hyphen escaped. The local record wins over one on GitHub. With no local record, the newest review by the signed-in user that holds one is read; a record that fails its schema counts as none. A second visit walks only the stops whose files changed since the record's commit (browsing the plain diff too), starts from a fresh place rather than the one kept before that review, keeps the "looks good" marks of unchanged files, and the summary says what changed, that nothing did, or that the commit is gone from the history. `/luca-pr-address` leaves the record line out of its findings.

Reached by: `Luca Walk: Send the review`, then opening the pull request again after new commits.

Tests:

- `packages/walk/src/second-visit.test.ts`
- `packages/walk/src/review-record.test.ts`
- `packages/engine/skills/luca-pr-address/scripts/pr-findings.test.ts`

## Repos and pull requests that aren't yours

"Your repo" is one whose owner is the signed-in user's own account (the engine's `isOwnRepo`; an organization's repo is not, and no repo is when `gh` can't say who is signed in). In a repo that isn't yours, a `Not your repo` badge shows in the status bar, `Send the review` creates and changes no labels, the review record is kept only on this computer, and a send in progress (the pending review's id and its drafts' fingerprints) is kept under `sending/` so a retry after GitHub took the review never posts it twice, while a pending review left with no record of it stops the send. `Write the story` copies a command that starts `claude` in a new empty folder instead of starting it in the checkout. On someone else's pull request, `Just comments` comes first and `Signed off` or `Changes wanted` asks before it approves or requests changes. Everywhere, a shared story is used only when the signed-in user wrote its comments (a note says when someone else's is left out), and only the signed-in user's comments show as `luca-pr-address`.

Reached by: opening a pull request in an organization's or someone else's repo, or by someone else, then `Luca Walk: Send the review` or `Write the story`.

Tests:

- `packages/walk/src/not-your-repo-send.test.ts`
- `packages/walk/src/not-your-repo-load.test.ts`
- `packages/walk/src/send-in-progress.test.ts`
- `packages/walk/src/whose-comments.test.ts`
