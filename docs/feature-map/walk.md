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

`Open pull request` reads a number or a URL, makes Luca Walk's own clone and a checkout of the pull request's head under its folder (never moving a checkout with changes), opens it, and shows the story's summary, or why there is none, on the Summary panel.

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

`Start the walk` goes to the first stop and lists every stop in the Stops view (`current`, `done`); each stop opens the whole file in VS Code's diff editor (the base side from the `luca-walk-base` documents) at its first change. Next and Back move through stops and through a stop's changes, `Back to the walk` returns to the change the owner was last on, and the place in the walk is kept in the pull request's drafts file.

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

On loading, the review threads already on the pull request are shown read-only in the checkout's files, labelled `On GitHub` (a file thread on line 1); a reply with `/luca-pr-address`'s reply marker shows as `luca-pr-address`. The Summary panel lists the agent's summary comments under `Replies from /luca-pr-address:`, newest first.

Reached by: opening a pull request that has review threads or `/luca-pr-address` comments.

Tests:

- `packages/walk/src/review-threads.test.ts`

## Feedback kept until it is sent

Comments on lines (either side of the diff), suggested changes, file comments, pull request comments and "this file looks good" marks are shown as `Draft` threads and kept at once in the pull request's drafts file, so a new window finds them again. A draft can be edited or deleted before it is sent.

Reached by: the comment controller's comment box, `Luca Walk: Suggest a change`, `Comment on this file`, `Comment on the pull request` and `This file looks good`.

Tests:

- `packages/walk/src/draft-feedback.test.ts`
