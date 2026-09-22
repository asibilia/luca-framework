# Context — context-compaction #318 remainder

User decisions from /phase-discuss (2026-07-17). Scope: finish issue #318 on branch `trace-insights-step0` (PR #323); STEP 0 (lu-handoff) + STEP 1 (researcher envelope, /lu boundary yield, phase-execute §4.5 fix, decision doc) already landed.

## Decisions

### 1. CLAUDE.md Compact Instructions block — auto-append via init [user-input]

`luca init` gets a new **idempotent `ensureCompactInstructions` helper** modeled line-for-line on `ensureLucaGitignore` (`packages/luca-cli/src/init/helpers/write-project-skeleton.ts:120-151`): labeled block header, append-only-if-missing, never duplicates on re-run, never fights a user-modified copy. No flag gate. Additionally update **this repo's own `CLAUDE.md`** Compact Instructions section with the missing #318 items.

Block content references **lookup locations, never literal values** (vault is null at init; run id is per-run):
- pipelineStep + currentPhase: read `.luca/state.json`
- run id: `.luca/state.json` → `sessionId`
- vault: `.luca/config.json` → `muninn.vault`
- handoff memory: concept `session:phase-boundary-handoff` (canonical spelling per `skills/lu-handoff/index.ts:91,126`) — recall it after compaction
- open blockers/decisions: preserved via the handoff memory, not the summary

### 2. `.continue-here.md` cleanup — in scope [user-input]

Same defect class STEP 1 fixed in phase-execute: the stage-gate hook rejects the path, so the current instructions are broken anyway. Fix `skills/session-pause/index.ts` (writes `.luca/phases/<slug>/.continue-here.md` at lines 14,46,104,117) and `skills/workflow-save/index.ts:132` (lists it as an artifact) — route through `lu-handoff` + `execute/progress.jsonl` per `docs/decisions/orchestrator-context-pruning.md`.

## Auto-resolved (no user input needed)

- **`commands/lu.ts` mirrors the skill** [auto]: fix row 56 (researcher writes research.md itself, orchestrator holds summary) and add the phase-boundary handoff/yield to row 65 — textually consistent with `skills/lu/index.ts`'s section so the two shipped surfaces never contradict.
- **`modes/research.ts` out of scope** [auto]: the 5-subagent synthesis bloat lives in a spawned mode agent's context, not the root orchestrator — not the #318 target. Note as possible future work only.
- **Verifier envelope detail** [auto]: return envelope only (`status`/`recommendation`/`convergence` + met/unmet counts + `verify.json` path); the orchestrator re-Reads `verify.json` at branch time (file-based consumption already assumed by `verifier.ts:35`).

## Locked scope (from research.md)

1. `ensureCompactInstructions` init helper + wiring + export (`packages/luca-cli/src/init/`)
2. This repo's `CLAUDE.md` Compact Instructions update
3. Envelope prose edits: `subagents/verifier.ts`, `subagents/reviewer.ts`, `subagents/learner.ts` (TO_PERSIST stays in return), `skills/lu/index.ts:117-119` rows
4. `commands/lu.ts` sync (rows 56 + 65)
5. `.continue-here.md` removal: `skills/session-pause/index.ts`, `skills/workflow-save/index.ts`

Out of scope: `modes/research.ts`, full-auto re-invoker (deferred to #319 work), any luca-core changes.

## Verification gate

`bunx --bun tsc --noEmit` exit 0; luca-tools tests green; init helper needs a test (idempotency: fresh append, no-op on re-run, no duplicate on modified block) matching the `ensureLucaGitignore` test pattern if one exists.
