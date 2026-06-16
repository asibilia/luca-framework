# Execute Summary — 03-harness-abstraction (2 waves)

Behavior-preserving structural refactor (WS3): introduce a `Harness` descriptor + `HARNESSES` registry and route `luca init` Step 4 wiring through it.

## Files changed (committed)
- `packages/luca-cli/src/init/helpers/harness.ts` (NEW) — `Harness` interface (`id`, `displayName`, `home()`, `isInstalled()`, `installArtifacts`, `wireHooks(opts)`, optional `mcp.wire(opts)`); `claudeHarness` (no mcp), `antigravityHarness` (mcp.wire → wireAntigravityMcp); `HARNESSES = [claudeHarness, antigravityHarness]`.
- `packages/luca-cli/src/init/index.ts` — re-exports `Harness`, `HARNESSES`, `claudeHarness`, `antigravityHarness`.
- `packages/luca-cli/src/commands/init.ts` — Step 4 now loops `HARNESSES` (`h.wireHooks(opts)` then `await h.mcp?.wire(opts)`); `installSkills`/`installStatusline` kept as direct unconditional calls; import swap.

## Behavior equivalence
Old order: `wireClaudeHooks` → `wireAntigravityHooks` → `wireAntigravityMcp`. Loop produces: claude (`wireClaudeHooks`, no mcp) → antigravity (`wireAntigravityHooks` then `wireAntigravityMcp`). Same 3 effective calls, equivalent order; `installSkills` before / `installStatusline` after, unchanged. Same files + contents written.

## Verification
- `bunx --bun tsc --noEmit` → exit 0.
- ac-01..ac-08 all PASS (interface + registry with both ids; HARNESSES re-exported; init.ts iterates + no hardcoded wireAntigravityMcp call in Step 4; 3 merge fns + both home fns still exported; antigravity MCP invariants intact).
- anti-01 (claude mcp add shell-out kept) ✓; anti-02 (no skip-antigravity flag) ✓; anti-03 (no isInstalled gating in init.ts) ✓; anti-04 (installSkills + installStatusline kept) ✓.

## Commits (not pushed)
- `c0e6728ae` feat(luca-framework): add Harness descriptor + registry
- `5c34aaac4` refactor(luca-framework): route init Step 4 wiring through HARNESSES registry

## Deviations
1. Commit scope `luca-framework` (per config.json allowed scopes) instead of the plan's example `init`.
2. Subagent could not write this summary (report-file policy) — persisted by orchestrator.
