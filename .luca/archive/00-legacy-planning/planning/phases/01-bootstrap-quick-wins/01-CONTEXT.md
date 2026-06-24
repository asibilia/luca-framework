# Phase 1: Bootstrap + Non-Studio Quick Wins — Context

## Decisions

### 1. Package Rename Scope [researched]

**Decision:** Rename active code references only. Skip historical files in `.planning/milestones/*.json` (archived memory snapshots contain "luca-observer" as historical data).

**Files to rename/update:**

- `packages/luca-observer/` directory → `packages/luca-studio/`
- `packages/luca-observer/package.json` name field → `@alecsibilia/luca-studio`
- Root `package.json` workspace reference
- `tsconfig.json` project reference (line 36)
- Any scripts referencing `luca-observer`
- Documentation references in active docs (not archived milestones)

**Approach:** Use `git mv packages/luca-observer packages/luca-studio` for history preservation, then bulk find/replace for remaining references. Verify with `bun install` and `bunx --bun tsc --noEmit`.

### 2. Agent Team Prompt Audit Fixes [researched]

**Decision:** Apply all 8 fixes in the priority order specified in the todo. Fixes 1-3 are HIGH impact and should land first. The gold standard template (XML-block structure from codebase-map) should be followed.

**Key constraint:** These modify `src/skills/` source files. After changes, `bun run build:all` must be run by the user OUTSIDE the Claude Code session to update compiled output in `.claude/`. NEVER invoke build:all inside the session.

**Files:** 5 skill files (phase-execute, phase-research, phase-discuss, lu, pr-address)

### 3. Adapter Compatibility Report [researched]

**Decision:** Follow the detailed schema spec from the todo verbatim. The schema goes in `src/adapters/__schemas/compatibility-report.schemas.ts`. Each adapter gets a `validate()` method. The aggregated report writes to `dist/compatibility-report.json`.

**Key constraint:** Same as audit fixes — requires `bun run build:all` after changes. The schema uses `snake_case` per API conventions.

**Files:** 1 new schema file, 3 adapter files modified, build orchestration modified

### 4. Build Constraint Communication [researched]

**Decision:** Both non-studio items (audit fixes, adapter report) require `bun run build:all` to produce compiled output. This MUST be run by the user outside the Claude Code session (per MEMORY.md: build:all crashes Claude Code). The executor must emit explicit instructions to the user at phase completion.

## Deferred Ideas

None — all three work items are well-scoped with no scope creep risk.

## Phase Constraints

- Package rename MUST complete before any W2+ Studio work begins
- Audit fixes and adapter report are fully independent of each other and of the rename
- All three can be organized as sub-waves within the phase for parallelism
- Post-phase user action: `bun run build:all` (outside Claude Code session)
