# luca-walk

## 0.2.0-alpha.0

### Minor Changes

- 18eb879: `@luca/engine` (and so `@alecsibilia/luca`): `/luca-pr-address` now skips the hidden review-record line that Luca Walk adds to the end of each review it sends, so that line is never treated as a finding.

  `luca-walk`: Luca Walk is a new VS Code app. It opens a pull request, walks you through its story one stop at a time in full-file diffs, lets you write comments as drafts, and sends them as one GitHub review. It is private and is installed from a `.vsix` file. ([#752](https://github.com/asibilia/luca-framework/issues/752))

- 60f958a: Luca Walk now acts safely on repos and pull requests that aren't yours. In a repo whose owner isn't your own GitHub account, it changes no labels, keeps its review record on your computer instead of posting it, shows a "Not your repo" badge, and offers a command to copy instead of starting `claude` in the pull request's checkout. On someone else's pull request, "Just comments" comes first and approving or requesting changes asks you to confirm. Everywhere, a story or a `luca-pr-address` comment is believed only when you wrote it.

  The engine exports `isOwnRepo`, the one "your repo" rule its default story home already used.

### Patch Changes

- ab46279: Luca Walk is safer when sending a review. A review GitHub already took is never posted again on a retry. A send stops, keeping every comment, when the pull request has new commits since you opened it or since you wrote a line comment. `Just comments` with no comments sends nothing. A drafts file that can't be read is moved aside instead of written over. A story's stop that points outside the checkout is never opened, and commit ids from GitHub are checked before they reach git.
