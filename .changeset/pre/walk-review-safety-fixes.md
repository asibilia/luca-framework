---
"luca-walk": patch
---

Luca Walk is safer when sending a review. A review GitHub already took is never posted again on a retry. A send stops, keeping every comment, when the pull request has new commits since you opened it or since you wrote a line comment. `Just comments` with no comments sends nothing. A drafts file that can't be read is moved aside instead of written over. A story's stop that points outside the checkout is never opened, and commit ids from GitHub are checked before they reach git.
