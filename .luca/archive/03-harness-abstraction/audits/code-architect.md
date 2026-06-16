# Architecture Audit — Phase 3: harness-abstraction

Reviewed commits `c0e6728ae`, `5c34aaac4`. **Verdict: APPROVED — `issues: []` (no correctness/security/missing-requirement).**

## Verified
- Registry loop is real + clean (init.ts:219-222): iterates `HARNESSES`, `h.wireHooks()` + conditional `h.mcp.wire()`. A 3rd harness's hooks+MCP are picked up automatically.
- `mcp` optional is the right model this phase: only Antigravity drives MCP via luca's file-merge; Claude's MCP is the Step-5 shell-out (phase-4 seam, documented at harness.ts:42-47). Forcing a no-op Claude `mcp` entry would be a lie until WS4.
- `isInstalled` forward-scaffold coherent (defined via `existsSync(home())`, intentionally not gating — phase 4).
- `installArtifacts` flags honestly documented as inert today.
- Descriptors are thin pass-throughs to the exact existing fns; placement (init/helpers/) + barrel exports correct; functional/no-classes compliant.

## Extensibility gap — LOW / informational, **carry-forward to phase 4 (WS4/WS8)**
The abstraction captures the **hook/MCP axis** but two harness-specific operations remain outside the registry, hardcoded:
1. **`installSkills`** (init.ts:218, outside the loop) hardcodes both homes (install-skills.ts:90-91,138-149). A 3rd harness would NOT get skills/agents by adding a descriptor — `installArtifacts` is the field that *should* drive this but isn't read yet.
2. **`installStatusline`** (init.ts:223) is Claude-only, not modeled on the descriptor.

So today "add one descriptor" is true only for hook/MCP; skills/statusline/Claude-MCP still require file edits. Both are documented seams, not hidden coupling → not must-fix against this behavior-preserving phase. **Phase 4 should consider driving installSkills off `h.installArtifacts`/`h.home()` and modeling statusline as an optional per-harness capability (mirroring optional `mcp`).**

## Minor (deferrable)
- `WireClaudeHooksOptions` is now a generic harness-wiring options bag used by all harnesses + re-exported; the host file `wire-claude-hooks.ts` likewise houses all three. Consider renaming to `WireHooksOptions`/`wire-hooks.ts` (with deprecated alias) in a follow-up. Cosmetic.
- DX notes: add a one-line "reserved for phase-4" JSDoc on id/displayName/home/isInstalled; add an "Adding a harness" comment above `HARNESSES` for discoverability.
