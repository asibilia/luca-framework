---
'@luca/engine': patch
---

`/luca-unstick` finds a repo's runs from a worktree or a subfolder, not only from the main checkout. It and `/luca-retro` now look up the repo the same way, by its main checkout, with symlinks followed (such as `/tmp` and `/private/tmp` on macOS).
