# Plan: Harness Abstraction (WS3) — behavior-preserving structural refactor

## Objective
Introduce a `Harness` descriptor + `HARNESSES` registry and route `luca init` Step 4 hook/MCP wiring through it. Same files, same contents written as today — zero behavior change.

## Context
Step 4 (`init.ts` ~216-231) hardcodes `installSkills(); wireClaudeHooks(); wireAntigravityHooks(); wireAntigravityMcp(); installStatusline()`. WS3 replaces the hardcoded `wire*` sequence with a registry iteration. `merge*` pure fns in `wire-claude-hooks.ts` are the testable core and stay intact + exported. Phase-1/2 antigravity MCP invariants (`MUNINN_MCP_SERVER_URL`, `enabledTools:['*']`, `chmodSync 0o600`, `readMuninnToken` gate) must be untouched.

### Scope notes (read before reviewing)
- `isInstalled()` is DEFINED this phase (forward-scaffolding for phase 4 / WS8) but init does NOT branch on it — every harness still wires unconditionally, exactly as today. "isInstalled defined but not gating" is INTENTIONAL, not a defect.
- Claude has NO `mcp` on its descriptor this phase. The Step-5 `claude mcp add` shell-out stays inline (phase 4 / WS4 replaces it with `wireClaudeMcp`).
- `installSkills` (writes to both homes in one call) and `installStatusline` (Claude-only concept) stay as direct calls — they are not part of the per-harness hook/mcp loop. Only the `wire*` sequence is registry-driven.
- Registry home: new `packages/luca-cli/src/init/helpers/harness.ts`, colocated with the `wire*`/`install*` helpers it wraps. Justified: keeps the descriptor next to its implementations; barrel re-exports it.

## Phases

### Phase 1: Harness descriptor + registry

#### Wave 1: Define type and registry (tracer bullet)
- [ ] **Task 1.1.1**: Create `harness.ts` with the `Harness` interface (`id`, `displayName`, `home()`, `isInstalled()`, `installArtifacts`, `wireHooks(opts)`, optional `mcp?: { wire(opts): Promise<void> }`) and `HARNESSES: Harness[]`.
  - Files: `packages/luca-cli/src/init/helpers/harness.ts` (new)
  - Verification: ac-01, ac-02, ac-07
- [ ] **Task 1.1.2**: Implement `claudeHarness` (home=`defaultClaudeHome`, `isInstalled`=`existsSync(home())`, `wireHooks`→`wireClaudeHooks`, no `mcp`) and `antigravityHarness` (home=`defaultAntigravityHome`, `wireHooks`→`wireAntigravityHooks`, `mcp.wire`→`wireAntigravityMcp`).
  - Files: `packages/luca-cli/src/init/helpers/harness.ts`
  - Verification: ac-02, ac-03, ac-08, anti-03
- [ ] **Task 1.1.3**: Re-export `Harness`, `HARNESSES`, `claudeHarness`, `antigravityHarness` from the init barrel.
  - Files: `packages/luca-cli/src/init/index.ts`
  - Verification: ac-04, ac-06

### Phase 2: Consume the registry

#### Wave 2: Refactor init Step 4 to iterate
- [ ] **Task 2.1.1**: Replace the hardcoded `wireClaudeHooks(); wireAntigravityHooks(); wireAntigravityMcp()` calls in Step 4 with a loop over `HARNESSES` calling `h.wireHooks(opts)` then `await h.mcp?.wire(opts)`; keep `installSkills` + `installStatusline` calls as-is and unconditional.
  - Files: `packages/luca-cli/src/commands/init.ts`
  - Verification: ac-05, anti-01, anti-02, anti-04
- [ ] **Task 2.1.2**: Update `init.ts` imports — pull `HARNESSES` from `../init`; drop now-unused direct `wireClaudeHooks`/`wireAntigravityHooks`/`wireAntigravityMcp` imports only if no longer referenced. Verify gate.
  - Files: `packages/luca-cli/src/commands/init.ts`
  - Verification: ac-01

## Deliverables
- **D1**: `Harness` descriptor abstraction exists and `luca init` routes hook/MCP wiring through `HARNESSES` (WS3 core ask) → ac-01, ac-02, ac-05
- **D2**: Both `claude` and `antigravity` descriptors present in the registry (WS3 "add a 3rd harness = one descriptor") → ac-03
- **D3**: Per-harness pure `merge*` fns remain intact + exported (testable core preserved) → ac-06
- **D4**: Phase-1/2 antigravity MCP invariants + home exports preserved (behavior preservation) → ac-08, ac-07, anti-03

## Verification Criteria
- **ac-01**: `bunx --bun tsc --noEmit` exits 0.
- **ac-02**: `grep -E 'interface Harness' packages/luca-cli/src/init/helpers/harness.ts` matches.
- **ac-03**: `grep -E 'HARNESSES' packages/luca-cli/src/init/helpers/harness.ts` matches an array containing both a claude and an antigravity descriptor (read-confirm both `id: 'claude'` and `id: 'antigravity'` present).
- **ac-04**: `grep -E 'HARNESSES' packages/luca-cli/src/init/index.ts` matches (re-exported from barrel).
- **ac-05**: `grep -E 'HARNESSES' packages/luca-cli/src/commands/init.ts` matches AND Step 4 no longer contains the literal hardcoded `wireAntigravityMcp(` call (read-confirm the loop replaced it).
- **ac-06**: `grep -E 'export function mergeStageGateRegistration|export function mergeAntigravityHookRegistration|export function mergeAntigravityMcpRegistration' packages/luca-cli/src/init/helpers/wire-claude-hooks.ts` matches all three.
- **ac-07**: `grep -E 'export function defaultClaudeHome|export function defaultAntigravityHome' packages/luca-cli/src/init/helpers/install-skills.ts` matches both.
- **ac-08**: `grep -E "MUNINN_MCP_SERVER_URL|enabledTools|0o600|readMuninnToken" packages/luca-cli/src/init/helpers/wire-claude-hooks.ts` matches all four tokens (antigravity MCP invariants untouched).

### Anti-criteria (regression guards)
- **anti-01**: MUST NOT — the Step-5 `claude mcp add` shell-out removed. Probe: `grep -E "'mcp',\s*$|'mcp'," packages/luca-cli/src/commands/init.ts` still matches the `claude mcp add` Bun.spawn block.
- **anti-02**: MUST NOT — a `--skip-antigravity` / `--skip-harness` flag added this phase. Probe: `grep -E 'skip-antigravity|skip-harness' packages/luca-cli/src/commands/init.ts` returns no match.
- **anti-03**: MUST NOT — any wiring gated on `isInstalled()` in init this phase. Probe: `grep -E 'isInstalled' packages/luca-cli/src/commands/init.ts` returns no match.
- **anti-04**: MUST NOT — `installStatusline` or `installSkills` dropped from Step 4. Probe: `grep -E 'installStatusline|installSkills' packages/luca-cli/src/commands/init.ts` matches both.

## Risks & Mitigations
- Risk: dropping a `wire*` import that's still referenced → tsc break. Mitigation: ac-01 gate after Task 2.1.2.
- Risk: reviewer flags `isInstalled` as unused-for-gating. Mitigation: documented as intentional forward-scaffolding (scope notes + anti-03).
- Risk: subtle write-content drift. Mitigation: descriptors are thin wrappers calling the EXACT existing fns — no merge logic re-authored.

## Decisions
- 2026-06-14 — Registry lives in new `harness.ts` colocated with wiring helpers; barrel re-exports.
- 2026-06-14 — Claude descriptor omits `mcp` this phase; Step-5 shell-out stays (phase 4 / WS4).
- 2026-06-14 — `mcp` modeled as optional `{ wire(opts) }` wrapping `wireAntigravityMcp` (thin pass-through, defers buildEntry/isCorrect richness to WS4).
- 2026-06-14 — `installSkills`/`installStatusline` excluded from the loop (multi-home / Claude-only); only `wire*` is registry-driven.
