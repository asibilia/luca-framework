PERSPECTIVE: dx
VERDICT: APPROVE
FINDINGS:
- [NOTE] Harness descriptor has 4 fields consumed nowhere
  File: packages/luca-cli/src/init/helpers/harness.ts:33-39
  Detail: Only `wireHooks` and `mcp` are read by the Step-4 loop (init.ts:219-222). `id`, `displayName`, `home`, `isInstalled` are defined on both descriptors but have zero consumers across src/. Unlike `installArtifacts` (whose JSDoc explicitly labels it forward-scaffolding), these four are undocumented dead surface — a reader can't tell if they're intentional scaffolding or vestigial. Either add a one-line "reserved for phase-4 doctor/parity" note like `installArtifacts` has, or drop them until a consumer lands.
  Cross-phase: false
- [NOTE] "Add a 3rd harness" workflow is not documented anywhere discoverable
  File: packages/luca-cli/src/init/helpers/harness.ts:24-31
  Detail: The Harness JSDoc says "adding a new harness becomes 'add one descriptor'", but there is no README/docs entry and the contract is implicit (interface + manual append to the `HARNESSES` array at line 72). Grep confirms `HARNESSES`/`Harness` appear only in source, not in docs/. The descriptor's own JSDoc is the only guide. For the stated DX goal (discoverable extension point) a short "Adding a harness" note — even a code comment above `HARNESSES` listing the 3 steps (define descriptor, fill required wireHooks, append to registry) — would make the workflow self-service.
  Cross-phase: false
- [NOTE] `mcp` asymmetry across harnesses is correctly documented
  File: packages/luca-cli/src/init/helpers/harness.ts:42-47
  Detail: The optional `mcp` field's JSDoc explains why Claude omits it (Step-5 `claude mcp add` shell-out) — good. This is the right pattern; calling it out as a positive so it isn't "simplified away" before claude-parity (phase 4) lands its own mcp wiring.
  Cross-phase: true

VERIFIED (no issues found):
- File naming: harness.ts is kebab-case — compliant.
- No-classes / functional: both descriptors are plain object literals; HARNESSES is a const array; wrappers are arrow fns (harness.ts:51-72). Compliant.
- Import organization: external (node:fs) then local, grouped, type-only import separated (harness.ts:1-9). Compliant with import-standards.
- Type-export hygiene: `Harness` is re-exported as `export type` from init/index.ts:46 (not as a value). Correct.
- Descriptors are faithful thin wrappers: verified wireClaudeHooks/wireAntigravityHooks/wireAntigravityMcp signatures (wire-claude-hooks.ts:94/121/153 — all `(opts: WireClaudeHooksOptions) => Promise<void>`) and home fns (install-skills.ts:47/52) match the interface and the wrappers re-author no logic.
- Step-4 loop readability: init.ts:219-222 is a clean `for (const h of HARNESSES)` with a guarded `if (h.mcp)` — far more readable than per-harness hardcoding, and the section comment + success message stay accurate.
- JSDoc presence: `Harness` interface, both descriptors, `HARNESSES`, and `HarnessInstallArtifacts` all carry doc comments — above-average for this codebase.

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 0
  NOTE_COUNT: 3
  CROSS_PHASE_COUNT: 1
