---
"@luca/engine": patch
---

The prepare command gets its own time limit (30 minutes by default, `prepare_timeout_ms` in `.luca/config.json`), and a command that times out is stopped with everything it started (#485).
