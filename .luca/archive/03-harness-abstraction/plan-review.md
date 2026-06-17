# Plan Review — Phase 3: harness-abstraction

## Verdict: APPROVED (CONVERGED, 0 blocking)

Behavior-preserving structural refactor verified against live code:
- Refactor target real: `init.ts:221-223` calls exactly `wireClaudeHooks()`/`wireAntigravityHooks()`/`wireAntigravityMcp()` — what the `HARNESSES` loop replaces.
- Exclusions correct: `installSkills` (writes both homes in one call) and `installStatusline` (Claude-only) stay out of the loop.
- Signature compatibility: all three `wire*` share `WireClaudeHooksOptions` → clean pass-through descriptors, no adapter, no content drift.
- Phase-3/4 boundary coherent: Claude omits `mcp` → the Step-5 `claude mcp add` shell-out stays inline (WS4 = phase 4). anti-criteria guard against scope-creep (no removing claude mcp add, no `--skip-antigravity`, no isInstalled gating).
- Behavior-preservation acs sufficient: ac-06 (3 merge fns exported), ac-07 (home fns exported), ac-08 (antigravity MCP invariants), anti-04 (installSkills/installStatusline preserved). A dropped per-harness wireHooks call is structurally precluded (uniform loop, no per-harness branch).

### Advisory (non-blocking)
- **G-CRIT-001** — ac-08 probes the TS const name `MUNINN_MCP_SERVER_URL` rather than the written `serverUrl` JSON key; passes either way; behavior guarantee actually rests on thin-wrapper risk-mitigation + ac-01. Precision note only.
- **G-DX-001** — no positive ac confirms `isInstalled` is defined-but-unused; anti-03 (no isInstalled in init.ts) carries the load-bearing constraint. Optional.

Confidence-log entries could not be written (stage-gate blocks bash in plan step); the four design rationales are captured in the plan's `## Decisions` section — acceptable, not a defect.

## Confidence Gate: ALL-AUTO (empty)

`luca confidence gate --slug 03-harness-abstraction` → counts auto=0, research=0, ask=0 (no entries logged this phase due to the plan-step bash gate). No research, no user questions. Proceeding to execute.
