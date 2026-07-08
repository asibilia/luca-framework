---
id: dad-p1a-parity-machine
title: DAD-P1a — XState machine + golden parity test (THE GATE)
trace_id: DAD-P1a
complexity: COMPLEX
waves:
  - wave: 1
    tasks: [t1, t2]
  - wave: 2
    tasks: [t3, t4]
  - wave: 3
    tasks: [t5, t6, t7]
  - wave: 4
    tasks: [t8]
---

# DAD-P1a — XState Machine + Golden Parity Test (THE GATE)

Goal: author an XState v5 machine that reproduces EVERY allow/deny verdict (+ resulting step + reason-code) of the current `checkPipelineGuard`/`PIPELINE_TRANSITIONS`, proven by a golden parity test over all 169 (from,to) pairs. Must be GREEN (`bun test packages/luca-core`) before P1b/P1c/P1t. Research: Muninn `research:dad-p1a-parity-machine` (repo vault). Guardrails from Research/16: `transition()` is a free fn returning tuple `[next,actions]`; oracle is `snapshot.can(event)`; verify API against `node_modules/xstate/**/*.d.ts`; path B authoring; forward gates ABSENT + budget ADVISORY during parity (else machine over-denies). Machine lives in `packages/luca-core/src/state/machine/`; use RELATIVE `.ts` imports (not the non-existent `@luca/core/...` aliases).

## Tasks

### Wave 1 — Install + gating spikes (must run first)
- **t1 — Install & pin xstate.** `bun add xstate` into `packages/luca-core`. Pin the EXACT resolved semver (no `^`). Spike 1: confirm named exports resolve against `node_modules/xstate/**/*.d.ts` — `transition`, `initialTransition`, `resolveState` from `xstate`; `getAdjacencyMap`, `toDirectedGraph` from `xstate/graph` (NOT `@xstate/graph`). Record a `spikes.md` note (scratch, in-context) with the resolved version.
  Verification: ac-01, ac-02
- **t2 — Gating spikes 2/3/6.** With xstate installed, empirically verify against a throwaway machine: (spike 2) `snapshot.can({type:'ADVANCE',to:'research'})` is `true` for the legal self-loop `research→research`; (spike 3) `resolveState({value})` behavior on an unknown/invalid value (throw vs deny-snapshot) — confirms unknown steps must be handled ABOVE the machine; (spike 6) whether `getAdjacencyMap` records the `research→research` self-loop. Record each result + the resulting harness decision. **Spike-2 fallback (the load-bearing one):** if `.can()` returns `false`/unreliable for the legal self-loop, do NOT abandon parity — derive the allow verdict from `transition()` yielding `leaf===to`, or model the self-loop as an explicit external (re-entering) transition; the machine-verdict adapter (t4) absorbs whichever primitive the spike validates.
  Verification: ac-03

### Wave 2 — Author machine + adapter (path B)
- **t3 — `pipeline-machine.ts` (generated, path B).** Generate the XState config from `PipelineStepValues` + `PIPELINE_TRANSITIONS` (relative imports). `id:'luca'`, `initial:'idle'`. Top-level children mirror `PIPELINE_STEP_TO_COARSE_PHASE`: `idle` is a top-level ATOMIC leaf (the IDLE coarse phase = a single leaf, not a compound), and 4 compound parents — planning→triage/research/discuss/architect/plan/plan-review; executing→execute/checks; reviewing→verify/review/learn; finalizing→finalize. Total = 13 leaves (idle + 12 nested). `ADVANCE` event = `{type:'ADVANCE',to:PipelineStep}`; each edge guarded by `toIs(step)` (event.to===step); multi-target leaves are first-match-wins guarded arrays; cross-branch targets via `#id`. Enforce state-level exhaustiveness with a bespoke `satisfies Record<PipelineStep,...>` on the source table. **Forward gates ABSENT; budget guard ABSENT/advisory** (every legal edge unconditional beyond `toIs`).
  Verification: ac-04, ac-05, ac-06, anti-01, anti-05
- **t4 — `machine-verdict.ts` adapter.** Reproduce the full `checkPipelineGuard` contract: unknown-step handling ABOVE the machine (`VALID` set → `unknown-current-step`/`unknown-requested-step` before any `resolveState`); for valid pairs `resolveState({value:stepToStateValue(from),context})` → `snapshot.can(event)` oracle → on deny classify `from===to?same-step-no-op:illegal-transition` → on allow `[next]=transition(machine,snapshot,event)`, resulting leaf = `stateValueToLeaf(next.value)`. Return `{allowed,reason,resultingStep}`.
  Verification: ac-07, ac-08

### Wave 3 — Golden parity harness
- **t5 — `fixtures.ts`.** `ALL_PAIRS` = PipelineStepValues×PipelineStepValues (169), each `{from,to,legal:isLegalTransition,selfLoop}`; `LEGAL_PAIRS` (21); `STEP_TO_STATE_VALUE` + `stateValueToLeaf`; `parityContext(...)`; `EXPECTED_PAIR_COUNT=169`, `EXPECTED_LEGAL_COUNT=21`.
  Verification: ac-14, ac-15
- **t6 — `pipeline-machine.parity.test.ts` (the golden gate).** `test.each(ALL_PAIRS)`: (a) `machineVerdict.allowed === checkPipelineGuard.allowed`; (b) identical resulting step (on allow, drive `transition()` and assert leaf===`to`; on deny, neither moves off `from`). Reason-code secondary gate over the 148 illegal pairs (`machineVerdict.reason === checkPipelineGuard.reason`). Unknown-step fixtures: `bogus→triage`→`unknown-current-step`, `idle→bogus`→`unknown-requested-step`. Exhaustiveness tripwire: `ALL_PAIRS.length===169`, `LEGAL_PAIRS.length===21`.
  Verification: ac-09, ac-10, ac-11, ac-12, ac-13
- **t7 — `pipeline-machine.graph.test.ts` (structural drift guard).** `getAdjacencyMap(machine,{events})` → collapse to `Set<`${from}->${to}`>` → `toEqual` the 21 `LEGAL_PAIRS` edge set (adjust for self-loop per spike 6). Plus a `toDirectedGraph` golden snapshot (13 leaves total — `idle` atomic + 12 across 4 compound parents; 21 edges).
  Verification: ac-16

### Wave 4 — Gate
- **t8 — Gate green.** `bunx --bun tsc --noEmit` exit 0; `bun test packages/luca-core/src/state/machine` green; `bun test packages/luca-core` green (THE blocking gate).
  Verification: ac-17, ac-18, anti-02, anti-03, anti-04

## Verification Criteria
- **ac-01**: `packages/luca-core/package.json` pins `xstate` at an exact version (the dependency string has no `^`/`~` range prefix).
- **ac-02**: the spike-1 note lists each required export (`transition`, `initialTransition`, `resolveState`, `getAdjacencyMap`, `toDirectedGraph`) as resolved in the installed `node_modules/xstate` typings.
- **ac-03**: the spike note records a decision for each gating spike — spike 2 (`research→research` `.can()`), spike 3 (unknown-value `resolveState`), spike 6 (adjacency self-loop).
- **ac-04**: the step table feeding `pipeline-machine.ts` is constrained by a `satisfies Record<PipelineStep, ...>` annotation.
- **ac-05**: the machine's leaf-state set equals the 13 `PipelineStep` values.
- **ac-06**: the only guard type on any machine edge is the `toIs(step)` requested-step matcher (no verdict-reading forward/budget guard is present).
- **ac-07**: `machine-verdict.ts` classifies a bogus step above the machine (a non-`VALID` step never reaches `resolveState`).
- **ac-08**: `machine-verdict.ts` emits each of the 5 reason codes for the corresponding legacy input class (ok, same-step-no-op, illegal-transition, unknown-current-step, unknown-requested-step).
- **ac-09**: the parity test's `allowed`-equality assertion runs once per `ALL_PAIRS` entry against `checkPipelineGuard`.
- **ac-10**: the parity test asserts an identical resulting step for each legacy-allowed pair.
- **ac-11**: the parity test asserts identical `reason` codes across the 148 illegal pairs.
- **ac-12**: unknown-step fixtures assert `unknown-current-step` for `bogus→triage` (matching the legacy oracle).
- **ac-13**: unknown-step fixtures assert `unknown-requested-step` for `idle→bogus` (matching the legacy oracle).
- **ac-14**: the exhaustiveness tripwire asserts `ALL_PAIRS.length === 169`.
- **ac-15**: the exhaustiveness tripwire asserts `LEGAL_PAIRS.length === 21`.
- **ac-16**: the graph test asserts the machine's `getAdjacencyMap` edge set equals the 21 legal-pair edge set.
- **ac-17**: `bun test packages/luca-core` passes (THE GATE).
- **ac-18**: `bunx --bun tsc --noEmit` exits 0.
- **anti-01**: MUST NOT modify `PIPELINE_TRANSITIONS` — `git diff` shows `configs/pipeline-transitions.ts` unchanged (the machine reads the table, never edits it).
- **anti-02**: MUST NOT modify `checkPipelineGuard` — `git diff` shows `orchestration/pipeline-guard.ts` unchanged (it stays the parity oracle).
- **anti-03**: MUST NOT repoint `luca state advance` or the pipeline-guard hook — `git diff` lists no file under `packages/luca-cli/src/write-surface/` (that is P1b).
- **anti-04**: MUST NOT repoint the pipeline-guard hook — `git diff` lists no file under `packages/luca-tools/src/hooks/pipeline-guard/` (that is P1b).
- **anti-05**: MUST NOT demote/edit any config table — `git diff` shows `configs/budget-matrix.ts`, `coarse-phase-map.ts`, `stage-tool-matrix.ts`, `step-artifacts.ts`, `relaxation-paths.ts` unchanged (P1c/P1t).

## Deliverables
- **D1**: xstate installed + pinned; gating spikes recorded → ac-01, ac-02, ac-03
- **D2**: machine + adapter authored via path B, parity-safe (no forward/budget guards) → ac-04, ac-05, ac-06, ac-07, ac-08
- **D3**: golden parity harness green over 169 pairs (THE GATE) → ac-09, ac-10, ac-11, ac-12, ac-13, ac-14, ac-15, ac-16, ac-17
- **D4**: no regression, no scope creep into P1b/P1c/P1t → ac-18, anti-01, anti-02, anti-03, anti-04, anti-05

## Notes / Decisions (locked from research)
- Parity target = `checkPipelineGuard` (the rich oracle); the second surface (`luca-state-advance.ts` generic-throw) is P1b's problem — note only.
- Import convention = relative `.ts` (machine is inside luca-core); Design/03's `@luca/core/...` aliases do not exist.
- 3-vs-5 fix-budget edge scope is a P1c decision — machine `context` shape must not preclude 5, but P1a enforces nothing.
- **Accepted architectural change:** `xstate` becomes luca-core's FIRST non-zod runtime dependency (luca-core is imported by luca-cli + luca-tools). This is intentional (the machine lives in luca-core); confirm CLI bundle impact is acceptable at execute.
- **Intra-wave sequencing:** a SINGLE executor sequences tasks within each wave (no parallel fan-out) — t4 imports t3's machine; t6/t7 import t5's fixtures. Order within wave 2 = t3→t4; within wave 3 = t5→(t6,t7).
