# Research — context-compaction #318 remainder

## Summary

Workstream 4 (CLAUDE.md compact block) has **no existing generation surface**: `luca init` writes only `.luca/state.json`, `.luca/config.json`, and `.gitignore` — no CLAUDE.md materialization or merge exists anywhere in luca-cli or luca-tools, so the block must either be a new init helper (modeled on `ensureLucaGitignore`) or a repo-local edit. The envelope work for verifier/reviewer/learner is prose-only: all three already write their canonical artifacts, but none of their bodies constrain what they RETURN, and `/lu` line 249 already *claims* they return compact envelopes — an assertion the subagent bodies don't yet enforce. Separately, `commands/lu.ts` (the /lu slash command, a distinct shipped surface from the /lu skill) still describes the pre-#318 researcher flow and has no handoff section at all.

## Key Findings

### 1. CLAUDE.md compact block — where it belongs

- **HIGH** — `luca init` does NOT materialize any CLAUDE.md. `packages/luca-cli/src/init/helpers/write-project-skeleton.ts:22-80` writes only `state.json`, `config.json`, and gitignore entries; `packages/luca-cli/src/init/index.ts:1-57` exports skeleton/hooks/skills/statusline/harness helpers — none touch CLAUDE.md. Grep for `CLAUDE` in `packages/luca-cli/src` matched only hook matchers (`wire-claude-hooks.ts:29,268`) and comments (`install-hooks.ts:17,52`).
- **HIGH** — No CLAUDE.md template/generator in luca-tools either. All 5 `CLAUDE.md` matches in `packages/luca-tools/src` are reads or allowlists: `skills/milestone-audit/index.ts:133` and `skills/phase-execute/index.ts:925` (`cat CLAUDE.md`), `subagents/shadow-scanner.ts:79` (root-markdown allowlist), `compile/render-body.ts:112` + fixture (prose references). Option (c) "shared template constant in luca-tools" has no existing infrastructure.
- **HIGH** — Prior art: this repo's own `CLAUDE.md:50-59` `## Compact Instructions` block. It preserves phase/task position, decisions, blockers, file paths, and the vault name — but NOT the `session:phase-boundary-handoff` concept, the run id (`state.json` `sessionId`), or `pipelineStep` explicitly.
- **HIGH** — Prior art for an idempotent per-repo append: `ensureLucaGitignore` at `write-project-skeleton.ts:120-151` (labeled block header, only-append-missing, never duplicates on re-run). An `ensureCompactInstructions` helper following this exact pattern is the natural option-(a) implementation.
- **MEDIUM** — The block cannot bake literal values: `config.json` is written with `muninn: { vault: null }` at init (`write-project-skeleton.ts:68`, filled later by `luca vault:init`), and the run id is per-run (`state.json` `sessionId`, seeded at `write-project-skeleton.ts:48`). The block must say *where to read* the vault (`.luca/config.json` → `muninn.vault`) and run id (`.luca/state.json` → `sessionId`), plus the fixed concept name `session:phase-boundary-handoff` (canonical spelling at `packages/luca-tools/src/artifacts/skills/lu-handoff/index.ts:91,126`).

### 2. Compact-envelope consumption — verifier / reviewer / learner

- **HIGH** — Artifact writes already exist: verifier writes `verify.json` (`packages/luca-tools/src/artifacts/subagents/verifier.ts:74,112,133`); reviewer writes `audits/<reviewer>.md` (`reviewer.ts:24,31,116`); learner writes `learn.md` (`learner.ts:100,144`).
- **HIGH** — **Verifier has NO return-shape instruction.** Its gotcha at `verifier.ts:35` says the orchestrator reads the JSON, not prose, but nothing tells it to return a short envelope; nothing stops it returning its full criterion-by-criterion analysis in-context. Minimal edit: add a gotcha + an "Output" line — return only `status`/`recommendation`/`convergence` + criteria met/unmet counts + the `verify.json` path.
- **HIGH** — **Reviewer's Output Format (`reviewer.ts:114-137`) specifies only the audit FILE content**, not the final message — a reviewer will plausibly return the full FINDINGS block in-context too (7 parallel reviewers × full findings = the exact bloat #318 targets). Minimal edit: return only `PERSPECTIVE`, `VERDICT`, the four `CONSOLIDATED` counts, and the audit path.
- **HIGH** — **Learner's TO_PERSIST block must stay in the return.** `learner.ts:104-137` (Step 3, "Output exactly") is the orchestrator's only channel to the MuninnDB writes (subagents lack MCP — `learner.ts:36,44`), and `/lu` consumes it at `skills/lu/index.ts:119`. The envelope edit is scoped *around* it: return ONLY the `## Learnings (for orchestrator to persist)` block (Wrote/Persist/Skip + TO_PERSIST + SKIPPED) — do not restate learn.md's full sections or the Signal Synthesis in the reply.
- **HIGH** — **/lu side**: the step table rows for `verify`/`review`/`learn` (`packages/luca-tools/src/artifacts/skills/lu/index.ts:117-119`) carry no "hold only the envelope" instruction, unlike the `research` row (line 110) which does. Line 249 asserts the envelope claim — currently true only for the researcher. Minimal edits: append envelope-retention clauses to rows 117-119 (verify: keep recommendation + path, re-Read `verify.json` fields when branching; review: keep verdict + counts per perspective; learn: keep the TO_PERSIST block until persisted, then drop it).
- **MEDIUM** — Researcher pattern to copy: gotcha + Output-mode split at `subagents/researcher.ts:38-39,65-66`. A shared-prefix rule was considered and rejected implicitly — `shared/shared-prefix.ts:38` covers only persistence ownership; per-subagent edits match the existing pattern.

### 3. Dangling #318 items STEP 0/1 missed

- **HIGH** — **`commands/lu.ts` still has the OLD researcher behavior.** `packages/luca-tools/src/artifacts/commands/lu.ts:56`: "Spawn `researcher` … **Persist its output by writing `research.md` with the `Write` tool**" — the orchestrator-writes flow that STEP 1 removed from the skill. The header comment (`commands/lu.ts:5-7`) confirms both surfaces ship intentionally, so this is a live contradiction.
- **HIGH** — **`commands/lu.ts` has no phase-boundary handoff/yield at all.** Its `learn` row (`commands/lu.ts:65`) goes straight to `luca phase advance` → next phase with no lu-handoff invocation, no boundary telemetry, no yield.
- **MEDIUM** — **`session-pause` skill still creates the contract-illegal `.continue-here.md`**: `packages/luca-tools/src/artifacts/skills/session-pause/index.ts:14,46,104,117`; `skills/workflow-save/index.ts:132` also lists `.continue-here.md` as an artifact. phase-execute itself is clean — its only mention (`skills/phase-execute/index.ts:414`) is a prohibition.
- **MEDIUM** — `modes/research.ts` (the research MODE agent, `modes/index.ts:25,39,57`) still inlines 5 researcher-subagent returns into the mode agent for synthesis (`modes/research.ts:104-129`). Different consumption path from /lu (mode agent absorbs the bloat, not the root orchestrator); predates the envelope decision.

## Implications for Planning

1. **Workstream 4 = option (a)+(b) combined**: new `ensure`-style init helper in `packages/luca-cli/src/init/helpers/` (kebab-case, modeled on `ensureLucaGitignore`'s idempotent labeled-block append) appending a `## Compact Instructions` block to the consumer repo's CLAUDE.md, wired into init + exported from `init/index.ts`; plus update this repo's own `CLAUDE.md:50-59` with the missing items (handoff concept name, run-id/pipelineStep pointers). Block references lookup locations, never literal vault/run-id values.
2. **Envelope work is 5 small prose edits**: `verifier.ts`, `reviewer.ts`, `learner.ts`, and `skills/lu/index.ts:117-119` (three table-row clauses). After these, line 249's claim becomes true rather than aspirational.
3. **`commands/lu.ts` must be brought in line with the skill** — row 56 (researcher writes research.md itself) and a handoff/yield addition to row 65. Otherwise the two shipped /lu surfaces contradict and the #318 win is lost whenever the command body is the active surface.
4. `session-pause`/`workflow-save` `.continue-here.md` removal is a candidate follow-up wave item (route through `lu-handoff` + `execute/progress.jsonl` per the decision doc), separable from the two main workstreams.

## Open Questions

1. Which surface is authoritative when both `/lu` command and `/lu` skill are installed — should the command body textually mirror the skill's step table to prevent future drift?
2. Should the init-time CLAUDE.md block be gated behind a flag (some consumer repos may not want Luca touching CLAUDE.md), and should `luca doctor` verify its presence?
3. Is `modes/research.ts` (5-subagent synthesis inside the mode agent) in scope for #318, or acceptable because the bloat lives in a spawned mode agent's context?
4. Does the verifier envelope need the failing-criterion detail inline for the `fix` loop-back branch, or is re-Reading `verify.json` at branch time sufficient?
