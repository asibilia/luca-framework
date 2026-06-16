# Learnings — Phase 2: planning-time-confidence-emission

## Outcome
Planner now emits per-decision confidence at plan time; `luca confidence log` accepts `--researchable`/`--resolution` end-to-end; Phase-1 carry-forward polish applied. tsc + build PASS; verifier PASS; 2 reviewers APPROVE (0 must-fix).

## Net-new learnings (persisted to MuninnDB)
- **pitfall (resolves Phase-1's schema-drift):** the `luca confidence log` CLI path goes through `runWriteHandler(... lucaConfidenceLogTool, payload)` → `inputSchema.safeParse`, which **strips unknown keys** (no `.strict()`). Adding CLI flags is a silent no-op unless the handler's `inputSchema` AND its `appendConfidenceEntry` payload-spread are updated too. The handler is the CLI write path — it is NOT MCP-only; "we don't use MCP" only means no MCP server/registration, not that this handler is dead.
- **decision:** the `architect` mode-agent is the sole owner of plan-time confidence emission; `phase-plan` only points to it (avoids double-emission).

## Carry-forward to finalize (should-fix, non-blocking)
- `--resolution` invalid-value error should cite `luca confidence log --help`.
- `lucaConfidenceLogTool.description` prose still ends at `reviewHint?` — add `researchable?`/`resolution?` for agent field-discovery.
- The manual `--resolution` enum check in `confidence.ts` duplicates the Zod `inputSchema` enum — removable (~10 lines); let the shared handler validate.

## Notes
- Executor relinked the global `luca` bin via `release:local` to spot-check from source — this also freshened the global bin (mitigates the stale-bin pitfall for the rest of this run).
- `bun packages/luca-cli/src/index.ts <cmd>` does not work (barrel exports `runMain` but doesn't call it) — use the linked bin.
