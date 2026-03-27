---
title: "P1: Fix sessions page always empty — API filter + vault default (S-04/S-05)"
area: api
created: 2026-03-27
source: docs/review/studio/02-sessions.md
priority: P1
estimated_size: S
---

## Context

Sessions page shows empty because of two compounding filter failures. The API filters on `memory_type` which MuninnDB doesn't populate, and the vault defaults to `"default"` but session engrams are in the repo vault.

## Task

1. **S-04: Fix API type filter** — `app/api/muninn/engrams/route.ts:43`
   - Replace `e.memory_type === type` with `e.concept?.startsWith(type + ":")`
   - This makes the filter work with MuninnDB's actual data shape

2. **S-05: Fix default vault** — `stores/vault.ts:12`
   - Auto-detect repo vault from `/api/config` on initialization
   - Or: sessions hook explicitly queries the repo vault for `session:*` engrams
   - Per vault routing rules, `session:*` lives in repo vault (`luca-framework`)

## Notes

- Even after fixing S-04, first-time users will still see empty sessions until S-05 is fixed
- The client-side filter at `hooks/use-session-explorer.ts:221` is correct and would work if the API returned data
- See review: `docs/review/studio/02-sessions.md`
