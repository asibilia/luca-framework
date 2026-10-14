---
"@luca/engine": patch
"@luca/board": patch
---

A repo can give its test commands longer than 5 minutes with `test_timeout_ms` in `.luca/config.json` (#542). Every run of a test command uses it (baseline, red check, already-done check, gates), for both `bun` and `pass_fail` commands; types and lint keep 5 minutes. A test command that runs out of time says so and names `test_timeout_ms`, and a resume picks up a new value.
