---
"@luca/engine": patch
---

Prepare runs one at a time by default (`prepare_concurrency`) (#492), a commit with nothing left to commit no longer crashes the run (#494), and prepare's files from before an upgrade aren't committed (#496).
