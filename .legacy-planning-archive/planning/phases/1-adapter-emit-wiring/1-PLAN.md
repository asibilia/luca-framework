---
phase: 1
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 1 Plan 1: Adapter Emit Wiring

## Objective

Wire the `emit()` method for Cursor, Windsurf, and VS Code adapters so that compiled output is written to disk. Each adapter's `emit()` currently returns an empty stub (`{ filesWritten: 0, filesPaths: [], warnings: [] }`). After this plan, each adapter will accept an `outputDir`, iterate over all registered entities, compile them via its own `compile*` methods, write the results to the correct directory structure, and return a populated `EmitResult`.

## Context

@src/adapters/**schemas/adapter.schemas.ts — Adapter interface, EmitResult type
@src/adapters/cursor/cursor-adapter.ts — Cursor adapter with stub emit()
@src/adapters/windsurf/windsurf-adapter.ts — Windsurf adapter with stub emit()
@src/adapters/vscode/vscode-adapter.ts — VS Code adapter with stub emit()
@src/adapters/cursor/cursor-hook-map.ts — Cursor event mapping
@src/adapters/windsurf/windsurf-hook-map.ts — Windsurf event mapping
@src/adapters/vscode/vscode-hook-map.ts — VS Code event + tool mapping
@src/adapters/**helpers/register-builtins.ts — Adapter registry
@scripts/build-utils.ts — ensureDir utility, file-writing patterns

## Design Decisions

### Entity Source

Each `emit()` needs entities (agents, skills, rules) to compile and write. The `emit()` signature is `(outputDir: string) => Promise<EmitResult>` — it receives no entity arrays. Two approaches:

1. **Import registries directly** — `emit()` imports `agentRegistry`, `skillRegistry`, `ruleRegistry` from `~/agents`, `~/skills`, `~/rules`. This creates a T3->T2 upward dependency (adapters importing entities), which violates the module boundary rule.

2. **Pre-compile and pass** — Change approach: `emit()` receives pre-compiled output (a `Map<string, string>` of relative paths to content), then just writes files. The adapter factory accepts compiled entities via a setter or the emit method itself takes them.

**Decision: Option 2 — emit() receives a pre-compiled map.** This keeps T3 clean. The caller (build pipeline or orchestrator) is responsible for iterating registries and calling `compileAgent`/`compileSkill`/`compileRule`, then passing the compiled map to `emit()`.

However, the current `Adapter` interface defines `emit` as `(outputDir: string) => Promise<EmitResult>`. Changing the interface signature is out of scope for a TRIVIAL plan. Instead, each adapter factory will accept an initial entity array or the adapter will accumulate compiled output internally via compile calls, then emit() writes whatever was compiled.

**Revised Decision: Internal accumulation pattern.** Each adapter factory gains a private `compiledOutputs: Map<string, string>` buffer. Each `compile*` call stores its result in this buffer keyed by the target relative path. `emit()` writes all buffered entries to `outputDir`. This requires no interface change and no upward imports.

### File Structure per Adapter

**Cursor (.cursor/):**

- `.cursor/rules/{rule-name}.mdc` — one file per rule
- `.cursor/skills/{skill-name}/SKILL.md` — one dir+file per skill
- Agents: not supported (`supportedFeatures.agents: false`), skip

**Windsurf (.windsurf/):**

- `.windsurf/rules/{rule-name}.md` — one file per rule (with trigger frontmatter)
- `.windsurf/workflows/{skill-name}.md` — one file per skill (flat, no subdirs)
- Agents: not supported, skip

**VS Code (.github/):**

- `.github/agents/{agent-name}.agent.md` — one file per agent
- `.github/skills/{skill-name}/SKILL.md` — one dir+file per skill
- `.github/copilot-instructions.md` — single file aggregating all alwaysApply rules
- Agents and skills use the VS Code-specific frontmatter already in compile methods

### File I/O

Use `Bun.file().write()` for file writes and `mkdir` from `node:fs/promises` for directory creation. Follow the existing pattern from `scripts/build-utils.ts` (`ensureDir`).

## Tasks

### 1. Add internal accumulation buffer to Cursor adapter and wire emit()

**Type:** auto
**TDD:** false
**Depends on:** none

Modify `src/adapters/cursor/cursor-adapter.ts`:

1. Add a private `compiledOutputs: Map<string, string>` inside the factory closure
2. Update `compileRule()` to store the compiled result at key `rules/{rule.name}.mdc` in the buffer, then return the compiled string (preserving existing behavior)
3. Update `compileSkill()` to store at `skills/{skill.name}/SKILL.md`
4. Wire `emit()` to:
   - Create `outputDir` and subdirs (`rules/`, `skills/`) via `mkdir({ recursive: true })`
   - Iterate `compiledOutputs`, write each entry to `join(outputDir, key)`
   - Return `EmitResult` with `filesWritten`, `filesPaths`, and `warnings`
   - Clear the buffer after emit

**Files to create/edit:**

- `src/adapters/cursor/cursor-adapter.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `bun run scripts/check-domain-boundaries.ts` passes
- No new imports from T2 (agents/skills/rules registries)

### 2. Add internal accumulation buffer to Windsurf adapter and wire emit()

**Type:** auto
**TDD:** false
**Depends on:** none

Modify `src/adapters/windsurf/windsurf-adapter.ts`:

1. Add a private `compiledOutputs: Map<string, string>` inside the factory closure
2. Update `compileRule()` to store at `rules/{rule.name}.md`
3. Update `compileSkill()` to store at `workflows/{skill.name}.md` (Windsurf calls skills "workflows")
4. Wire `emit()` to:
   - Create `outputDir` and subdirs (`rules/`, `workflows/`) via `mkdir({ recursive: true })`
   - Iterate `compiledOutputs`, write each entry
   - Return populated `EmitResult`
   - Clear the buffer after emit

**Files to create/edit:**

- `src/adapters/windsurf/windsurf-adapter.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `bun run scripts/check-domain-boundaries.ts` passes
- No new imports from T2

### 3. Add internal accumulation buffer to VS Code adapter and wire emit()

**Type:** auto
**TDD:** false
**Depends on:** none

Modify `src/adapters/vscode/vscode-adapter.ts`:

1. Add a private `compiledOutputs: Map<string, string>` and a `ruleWarnings: string[]` inside the factory closure
2. Update `compileAgent()` to store at `agents/{agent.name}.agent.md` (use the internal `compileVscodeAgent` which returns `{ content, warning }` — accumulate warning if present)
3. Update `compileSkill()` to store at `skills/{skill.name}/SKILL.md`
4. Update `compileRule()` to:
   - Call internal `compileVscodeRule` which returns `{ content, warning }`
   - If content is non-empty, store at key `copilot-instructions/{rule.name}.md` (intermediate key)
   - Accumulate warning if present
5. Wire `emit()` to:
   - Create `outputDir` and subdirs (`agents/`, `skills/`)
   - Write agent and skill files from buffer
   - **Aggregate rules**: Collect all `copilot-instructions/*` entries from the buffer, concatenate them separated by `\n\n---\n\n`, and write as single `copilot-instructions.md`
   - Return populated `EmitResult` with warnings from rule compilation
   - Clear the buffer after emit

**Files to create/edit:**

- `src/adapters/vscode/vscode-adapter.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `bun run scripts/check-domain-boundaries.ts` passes
- VS Code rules aggregate into single `copilot-instructions.md`
- Agent warnings (character budget truncation) propagate to EmitResult

## Verification

1. **Type check**: `bunx --bun tsc --noEmit` passes with zero errors
2. **Domain boundaries**: `bun run scripts/check-domain-boundaries.ts` passes — no new T2 imports in T3 adapters
3. **No new files outside scope**: All changes are within `src/adapters/` (T3 domain)
4. **EmitResult contract**: Each adapter's emit() returns `{ filesWritten: N, filesPaths: [...], warnings: [...] }` where N > 0 and filesPaths contains absolute paths
5. **Backward compatibility**: Existing `compile*` methods continue to return the same string output (accumulation is additive, not breaking)

## Success Criteria

- All three adapter `emit()` stubs are replaced with working implementations
- Each adapter writes files to the correct directory structure under `outputDir`
- `EmitResult.filesPaths` contains the absolute paths of all written files
- No module boundary violations (no T3->T2 imports)
- Type check passes cleanly

## Output Specification

Modified files:

- `src/adapters/cursor/cursor-adapter.ts` — emit() wired with internal buffer
- `src/adapters/windsurf/windsurf-adapter.ts` — emit() wired with internal buffer
- `src/adapters/vscode/vscode-adapter.ts` — emit() wired with internal buffer + rule aggregation
