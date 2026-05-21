---
"@alecsibilia/luca-framework": major
"@alecsibilia/luca-mastracode": major
---

Phase 1 of the Claude Code-first migration: extract shared schema into a new `@alecsibilia/luca-core` package, define the new `.luca/` directory contract, and add the `luca migrate-planning` command.

**New package: `@alecsibilia/luca-core`** (private, workspace-only)

Pure TypeScript primitives shared by `luca-framework` and `luca-mastracode`. No I/O, no CLI surface. Consumed via `@alecsibilia/luca-core`, `@alecsibilia/luca-core/state`, `@alecsibilia/luca-core/luca-dir`.

- Trimmed `lucaStateSchema` (14-step `pipelineStep`, down from 22). Legacy values (`classify`, `configure`, `git-setup`, `roadmap`, `phase-order`, `review-audit`, `gap-audit`, `cleanup`) are mapped to canonical replacements via Zod `.preprocess` so existing `state.json` files parse cleanly.
- Dropped fields: `profile`, `workflowVersion`, `skipBranch` (mastracode keeps its own extensions through retirement).
- `coarsePhaseOf(pipelineStep)` exhaustive mapping from each of the 14 steps to one of `IDLE | PLANNING | EXECUTING | REVIEWING | FINALIZING`.
- `.luca/` directory contract: strict path allowlist, path builders (`phasePathFor`, `auditPathFor`, `wavePathFor`, `milestone*PathFor`, `telemetryPathFor`, `archivedPhasePathFor`, `backlogSnapshotPathFor`), and runtime validator (`isValidLucaPath`). Backed by a declarative `LUCA_DIR_CONTRACT` spec.

**`luca migrate-planning` command** (new in `luca-framework`)

```bash
luca migrate-planning [--dry-run] [--force]
```

- Moves root files from `.planning/` to `.luca/` (state.json, lock.json, roadmap.md, config.json, ledger.jsonl) using `git mv` to preserve history.
- Deletes ephemeral files (`.context-metrics.json`, `harness-result.json`).
- Idempotent — re-running skips already-migrated destinations.
- Refuses on uncommitted `.planning/` changes; `--force` overrides.
- Phase directories under `.planning/phases/` intentionally left in place — a follow-up command handles slug normalization once the collision strategy is set.

**Mastracode integration**

`packages/luca-mastracode/src/state/state.ts` now re-exports the shared primitives (`ComplexityLevel`, `OversightMode`, `PhaseStatus`, `RoadmapPhaseSchema`) from `@alecsibilia/luca-core`. Mastracode-only types (`ProfileLevel`, 22-value `PipelineStep`, 2D `BUDGET_MATRIX`, legacy state fields) remain in mastracode through Phase 5 (mastracode retirement).

**Testing**

Test scripts wired for `luca-core` (`bun test`) and `luca-framework` (`bun test`). 127 new tests:
- 105 in luca-core covering state schema (including legacy pipelineStep mapping), `coarsePhaseOf`, `resolveBudgetLimits`, all 9 `.luca/` path builders, and `isValidLucaPath`.
- 22 in luca-framework covering `runMigration` (plan generation, execute, dry-run, idempotency, git-history preservation, dirty-check, --force) and the CLI logging handler.

**Guardrails:** test scripts run on-demand only — NOT wired into pre-commit hooks (per the 2026-03-06 orphan-process learning).

**Docs**

- `CLAUDE.md`, `AGENTS.md`: rewrote the `.planning/` artifact-layout section as `.luca/`.
- `docs/getting-started.md`: rewrote the "Core Concepts" + "Your First Workflow" sections.
- `docs/troubleshooting.md`: rewrote the "Migrating a legacy `.planning/` layout" section to point at the new command.
- `.gitignore`: added `.luca/` runtime patterns (state.json, lock.json, ledger.jsonl, telemetry/).
- Global `~/.claude/rules/planning-structure.md`: rewrote as the canonical `.luca/` contract spec.

**Not in this PR** (deferred to later phases):

- Stage-gate PreToolUse hook (Phase 3)
- MCP server with `luca_*` write tools (Phase 4)
- Skill migration to Claude Code subagents (Phase 5)
- Mastracode retirement (Phase 5)
- Phase directory migration with slug-collision handling
