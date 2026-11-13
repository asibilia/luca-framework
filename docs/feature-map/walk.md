# Luca Walk

Luca Walk, the VS Code extension the owner reviews a pull request in (`packages/walk`, spec #752): it reads the pull request's story, walks its stops in full-file diffs, and sends the owner's feedback as one GitHub review. Its tests drive the app through a fake host and a pretend GitHub, with real git.

## The package and its seam

The `@luca/walk` package: its VS Code manifest (the commands, the Stops and Context views, the activation event), the rule that only the wiring imports `vscode`, and its glossary entry.

Reached by: installing `luca-walk.vsix` in the `Luca Walk` VS Code profile.

Tests:

- `packages/walk/src/walk-package.test.ts`

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
