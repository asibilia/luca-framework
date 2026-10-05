---
"@luca/engine": patch
"@luca/board": patch
---
A resumed run now reads the repo's `.luca/config.json` again and takes its new `prepare`, `prepare_timeout_ms`, and `prepare_concurrency`; every other field, such as `checks`, stays as the run started with it. A config it can't use is noted in the journal and on the board, and the run goes on with its own (#PRNUM).
