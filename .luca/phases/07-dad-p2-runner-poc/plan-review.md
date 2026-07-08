# DAD-P2 — Plan Review

> Trace ID: DAD-P2 · Phase `07-dad-p2-runner-poc` · Reviewer: `plan-reviewer` (cold isolation).

## Verdict

**STATUS: PASSED · CONVERGENCE: CONVERGED · BLOCKING: 0 · ADVISORY: 5 (all applied)**

## Ground-truth confirmation

- Write path is code-identity: `decideAdvance` (`luca-state-advance.ts:134`) + `mutateState` writes the FULL `LucaState` (`mutate-state.ts:162-163`). Daemon routing the write through the handler → byte-identical `state.json`. ac-05 parity is genuine, not re-implementation.
- Fallback IS the same code the CLI calls today (`state.ts:57` → `lucaStateAdvanceTool.handler`). Degradation transparent.
- Governance daemon-independent: `ownerSessionId` stamped/exempted entirely in the PreToolUse hook (`handle-stage-gate-hook.ts:131-147`, `300-314`); `state advance` never touches it.
- Lock primitives exist: `acquire`/`release`/`forceUnlock`/`isPidAlive` (`pipeline-lock.ts:166/218/261/103`).
- Machine has ONLY `assign` actions (`pipeline-machine.ts:197-202`) — ac-11 guardrail real.
- `.luca/tmp/` gitignored (`.gitignore:71`) → socket violates no contract. Dep split (opaque `createPipelineActorHandle`) right-sized, not over-engineered.
- anti-01..06 correctly fence the additive-only safety property.

## Advisories (all folded into the plan)

- **G-DX-001** (highest value) — ac-09 could pass for the wrong reason (cold advance serializes on `state.json.lock`, independent of the daemon's `lock.json`). **Fixed:** split into ac-09.1 (cold advance exits 0 after `kill -9`) + ac-09.2 (`forceUnlock` reaps the stale dead-PID `lock.json` so a fresh `luca start` re-acquires).
- **G-ARCH-001** — the mirror seeds position but not counter context. **Fixed:** t5 documents "mirror tracks position only; counters authoritative in `state.json`" in the go/no-go caveats.
- **G-SEC-001** — governance holds only because the socket route is entered inside `luca state advance` (hook sees the triplet). **Fixed:** added anti-07 + t3 note (no bypassing raw client).
- **G-DX-002** — ac-06/09/10 are POSIX-only runtime spikes, timing-sensitive. **Fixed:** reframed as runtime spikes feeding the go/no-go; ac-10 specifies ≥20 samples post-warmup; a miss is a NO-GO input, not a hard blocker.
- **G-DX-003** — ac-15 must be bounded. **Fixed:** `timeout 120 bun test`; `tsc` is the pipeline gate proper.

The plan is honestly additive; no-go is a valid outcome (t5). CONVERGED.
