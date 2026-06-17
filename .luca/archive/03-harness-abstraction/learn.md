# Learnings — Phase 3: harness-abstraction

**Outcome:** PASS. Behavior-preserving refactor; both reviewers `issues: []`; verify confirmed behavior-equivalence. No must-fix iterations.

## Validated
- A behavior-preserving refactor verifies best by an explicit **behavior-equivalence diff check** (old call sequence vs new loop produces the same effective calls in equivalent order) plus anti-criteria that pin the unchanged surrounding calls — not just "tsc passes". The verifier's diff-based equivalence finding was the load-bearing evidence.
- Thin pass-through descriptors (`wireHooks: (opts) => wireExisting(opts)`) over the existing pure functions = a safe way to introduce an abstraction without re-authoring logic (zero content drift risk).

## Carry-forward to Phase 4 (claude-parity-and-gating, WS4/WS8) — IMPORTANT
The phase-3 `Harness` abstraction covers only the **hook/MCP axis**. Two harness-specific operations remain hardcoded outside the registry:
1. `installSkills` (init.ts, outside the loop) hardcodes both homes; `installArtifacts` flags are recorded but NOT read. A 3rd harness would not receive skills/agents by adding a descriptor alone.
2. `installStatusline` is Claude-only, not modeled on the descriptor.

**Phase 4 should:** (a) add `claudeHarness.mcp` (the WS4 file-merge `wireClaudeMcp`), (b) activate `isInstalled()` gating + `--skip-antigravity`/`--skip-harness` (WS8), and (c) consider driving `installSkills` off `h.installArtifacts`/`h.home()` and modeling `installStatusline` as an optional per-harness capability (mirroring optional `mcp`), so "add one descriptor" becomes fully true.

## Deferrable (not this milestone unless cheap in phase 4)
- `WireClaudeHooksOptions` is now a generic harness options bag used by all harnesses; the host file `wire-claude-hooks.ts` houses all three. Consider renaming to `WireHooksOptions` / `wire-hooks.ts` (deprecated alias) in a follow-up.
- Add a "reserved for phase-4" JSDoc on the currently-unread descriptor fields (id/displayName/home/isInstalled) and an "Adding a harness" comment above `HARNESSES` for discoverability.
