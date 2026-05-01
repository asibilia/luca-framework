# @alecsibilia/luca-mastracode

Custom [Mastra Code](https://github.com/mastra-ai/mastra) distribution that powers Luca's structured AI coding workflows.

## What This Package Does

Rewires Luca's multi-step development pipeline into Mastra-native primitives:
- **10 modes** (3 stock + 7 pipeline) with per-mode tool permissions and model routing
- **10 subagent types** for parallel delegation (planning, research, review, execution, etc.)
- **16+ custom tools** for pipeline state, checks, verification, and repository management
- **Structured orchestration** — automatic mode transitions, pipeline guards, and read-only enforcement

## Package Structure

```
packages/luca-mastracode/
├── commands/           # Slash command .md files (Mastra Code harness asset)
├── skills/             # Skill .md files (Mastra Code harness asset)
├── rules/              # Always-apply rule .md files (Mastra Code harness asset)
└── src/
    ├── constants/      # Shared constants (mode IDs)
    ├── state/          # Pure data models, schemas, persistence (8 files)
    ├── orchestration/  # Pipeline lifecycle, mode switching, guards (6 files)
    ├── analysis/       # Post-pipeline analysis and reporting (3 files)
    ├── integration/    # External system glue — config, assets, branding (4 files)
    ├── util/           # Shared helpers with no domain knowledge (4 files)
    ├── review-analysis/# PR review primitives — convergence, regression, staleness (4 files)
    ├── rule-engine/    # Rule discovery, loading, and execution (4 files)
    ├── instructions/   # Per-mode instruction .md templates
    ├── modes/          # Mode definitions (10 files)
    ├── subagents/      # Subagent definitions (10 files)
    ├── tools/          # Tool wrappers and registry (26 files)
    │   └── parsers/    # Check output parsers (bun-test, tsc, eslint, generic)
    ├── index.ts        # Public API barrel + boot
    ├── launch.ts       # Main orchestrator — wires harness, TUI, all systems
    ├── create-static-agent.ts  # Agent factory for subagent creation
    ├── agent-constraints.ts    # Constraint definitions for agent behavior
    └── rules-loader.ts         # Loads bundled .md rule files at startup
```

### The Dual-Layer Pattern

Data-intensive modules follow a two-layer pattern:

1. **Data layer** (`src/state/<name>.ts`) — pure functions, Zod schemas, file I/O.
   No tool framework dependencies.
2. **Tool wrapper** (`src/tools/<name>.ts`) — thin Mastra `createTool()` wrapper that
   exposes the data layer as a callable tool action.

This separation allows the data layer to be tested and reused independently of the tool framework.

**Files that follow this pattern:**
- `state/claim-verifier.ts` ↔ `tools/claim-verifier.ts`
- `state/session-ledger.ts` ↔ `tools/session-ledger.ts`
- `state/confidence-journal.ts` ↔ `tools/confidence-journal.ts`
- `state/verification-result.ts` ↔ `tools/verification-result.ts`
- `state/shadow-scanner.ts` ↔ `subagents/shadow-scanner.ts`

### Root-Level Asset Directories

`commands/`, `skills/`, and `rules/` at the package root are **not source code**. They're
markdown-based asset files loaded by the Mastra Code harness at runtime:

- **`commands/`** — Custom slash commands (e.g., `/lu`, `/gh-prepare`)
- **`skills/`** — Skill definitions with `SKILL.md` files
- **`rules/`** — Always-apply rules injected into every agent turn

## How to Add a New Tool

1. Create `src/tools/<tool-name>.ts` with a `createTool()` export
2. Add a `TOOL_MANIFEST` entry in `src/tools/tool-manifest.ts` (tool instance, record key, and per-mode permissions — all in one place)
3. Export from `src/tools/index.ts`
4. Run `bunx --bun tsc --noEmit` to verify

## How to Add a New Mode

1. Create `src/modes/<mode-name>.ts` exporting `{ <name>Mode, build<Name>Instructions, resolve<Name>Model }`
2. Add the mode ID to `src/constants/mode-ids.ts`
3. Create `src/instructions/<mode-name>.md` with the mode's system prompt
4. Register the mode in `src/launch.ts` `createMastraCode()` config
5. Add the model resolver to `PIPELINE_MODE_MODEL_RESOLVERS` in `src/launch.ts`
6. Run `bunx --bun tsc --noEmit` to verify

## Commands

| Action | Command |
|--------|---------|
| Type check | `bunx --bun tsc --noEmit` |
| Start harness | `bun run mastracode` (from monorepo root) |
| Run tests | `bun test` (from this package) |

## Dependencies

- `mastracode` — Base Mastra Code harness (TUI, workspace, tools)
- `@mastra/core` — Core framework (tools, agents, workspace)
- `zod` — Schema validation
