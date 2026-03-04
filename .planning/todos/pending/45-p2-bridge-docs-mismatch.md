---
title: "P2: Fix bridge CLI documentation (14 vs 15 subcommands)"
area: dx
created: 2026-03-04
source: repo-review audit (dx-reviewer)
priority: P2
---

## Context

Bridge documentation claims 14 subcommands but implementation has 15. `read-ledger` is implemented but missing from JSDoc and architecture docs. Usage message is also hard to copy-paste with no examples.

## Task

1. Update JSDoc in `packages/luca-framework/src/state/bridge.ts:8-22` — say "15 subcommands"
2. Add `read-ledger` to the usage string with clear description
3. Update `docs/architecture-overview.md:128` — says "14 subcommands"
4. Create `docs/state-bridge-api.md` with full CLI reference and examples
5. Add `--help` / `-h` flag support to bridge CLI
6. Enhance error messages with actionable guidance (valid field names, examples)

## Notes

- Quick doc fixes: 1-2 hours
- CLI help system: additional 2-3 hours
- Error message improvements: see bridge.ts lines 414-416, 479-493
- SETTABLE_FIELDS constant exists but isn't shown in error messages
