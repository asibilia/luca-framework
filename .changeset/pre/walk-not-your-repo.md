---
"luca-walk": minor
"@luca/engine": patch
---

Luca Walk now acts safely on repos and pull requests that aren't yours. In a repo whose owner isn't your own GitHub account, it changes no labels, keeps its review record on your computer instead of posting it, shows a "Not your repo" badge, and offers a command to copy instead of starting `claude` in the pull request's checkout. On someone else's pull request, "Just comments" comes first and approving or requesting changes asks you to confirm. Everywhere, a story or a `luca-pr-address` comment is believed only when you wrote it.

The engine exports `isOwnRepo`, the one "your repo" rule its default story home already used.
