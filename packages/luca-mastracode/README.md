# @alecsibilia/luca-mastracode

Custom [Mastra Code](https://mastra.ai/) harness that powers the **Luca** AI development workflow — structured pipeline modes, specialized subagents, and domain-specific tools on top of any repository.

## What this package does

- Registers **10 modes** (build, fast, plan, discuss + 6 pipeline modes: triage → research → architect → execute → review → finalize)
- Wires **10 subagents** (researcher, planner, executor, verifier, reviewer, learner, etc.)
- Provides **16 custom tools** (workflow state, PR review, rule engine, claim verifier, etc.)
- Manages pipeline transitions, token budgets, and read-only enforcement
- Bundles slash commands, skills, and rules into `.mastracode/` at startup

## Directory layout

```
├── commands/           Mastra Code slash command definitions (.md)
├── rules/              Mastra Code alwaysApply rules (.md)
├── skills/             Mastra Code skill bundles (SKILL.md + assets)
└── src/
    ├── constants/      Shared constants (mode IDs)
    ├── state/          Data models, schemas, persistence (8 files)
    ├── orchestration/  Pipeline lifecycle, guards, TUI, read-only enforcement
    ├── analysis/       Post-pipeline analysis (postmortem, phase-diff, retro)
    ├── integration/    External system glue (branding, config, model routing)
    ├── util/           Shared helpers (atomic-write, refs, token-budget, TUI text)
    ├── review-analysis/  PR review primitives (convergence, regression, stale-filter)
    ├── rule-engine/    Rule discovery, loading, and execution engine
    ├── modes/          Mode definitions (one file per mode)
    ├── subagents/      Subagent definitions (one file per subagent)
    ├── tools/          Mastra tool wrappers + permission system
    ├── instructions/   LLM instruction prompts for each mode (.md)
    ├── index.ts        Package entry point + public API barrel
    ├── launch.ts       Main orchestrator — wires harness, modes, hooks
    ├── create-static-agent.ts  Agent factory with dynamic instructions/model
    ├── agent-constraints.ts    Universal hard constraints for all modes
    └── rules-loader.ts         Load bundled .md rules from rules/ directory
```

## Dual-layer pattern

Core logic is separated from framework wrappers:

| Data layer (`state/`)        | Tool wrapper (`tools/`)         |
|------------------------------|---------------------------------|
| `claim-verifier.ts`          | `tools/claim-verifier.ts`       |
| `session-ledger.ts`          | `tools/session-ledger.ts`       |
| `confidence-journal.ts`      | `tools/confidence-journal.ts`   |
| `verification-result.ts`     | `tools/verification-result.ts`  |
| `shadow-scanner.ts`          | `subagents/shadow-scanner.ts`   |

Data layer files are pure functions with no Mastra dependencies — they can be tested and used independently. Tool wrappers in `tools/` create Mastra `createTool()` wrappers that expose the data layer to agents.

## Adding a new mode

1. Create `src/modes/your-mode.ts` — export mode definition + model resolver + instruction builder
2. Create `src/instructions/your-mode.md` — LLM prompt for the mode
3. Add mode registration in `src/launch.ts` (inside the `modes: [...]` array)
4. If the mode uses custom tools, add entries to `src/tools/mode-permissions.ts`

## Adding a new tool

1. Create `src/tools/your-tool.ts` — export a `createTool()` instance
2. Register it in `src/tools/build-mode-tools.ts` (import + `TOOL_REGISTRY` entry)
3. Add per-mode permissions in `src/tools/mode-permissions.ts`
4. Export from `src/tools/index.ts`

## Commands

```bash
bun run start        # Run the harness (equivalent to `bun run mastracode`)
bun run typecheck    # Type-check with tsc --noEmit
```

## See also

- [ARCHITECTURE.md](./ARCHITECTURE.md) — dependency layers, file categorization, design decisions
- [docs/guides/coding-standards.md](../../docs/guides/coding-standards.md) — project-wide coding standards
