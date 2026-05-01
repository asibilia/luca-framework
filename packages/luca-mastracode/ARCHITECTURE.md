# Architecture

## Dependency Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                         launch.ts                                │
│         (orchestrator — wires everything, starts TUI)            │
├─────────────────────────────────────────────────────────────────┤
│   orchestration/         │   modes/        │   subagents/        │
│   (pipeline guard,       │   (mode defs,   │   (delegated        │
│    continuation,         │    instructions) │    agents)          │
│    read-only, patches)   │                 │                     │
├──────────────────────────┼─────────────────┼─────────────────────┤
│                         tools/                                   │
│   (tool wrappers, registry, permissions, parsers)               │
├─────────────────────────────────────────────────────────────────┤
│   state/          │   analysis/      │   review-analysis/        │
│   (data models,   │   (postmortem,   │   (convergence,           │
│    persistence)   │    retro, diff)  │    regression, staleness) │
├───────────────────┼──────────────────┼───────────────────────────┤
│   integration/         │   rule-engine/   │   util/              │
│   (config, branding,   │   (define, run,  │   (atomic-write,     │
│    assets, model)      │    recurrence)   │    refs, budget, tui)│
├────────────────────────┼──────────────────┼──────────────────────┤
│                       constants/                                 │
│                    (mode-ids — shared enum)                      │
└─────────────────────────────────────────────────────────────────┘
```

**Rule:** Each layer may import from layers below it, never above.
`constants/` sits at the bottom — imported by everything, imports nothing.

## Key Patterns

### mode-ids.ts Hub

`src/constants/mode-ids.ts` exports the `MODES` constant used by 15+ files across
modes, tools, orchestration, and state. It lives in `constants/` (not `modes/`)
because tools and state shouldn't depend on the modes layer.

### tool-manifest.ts

Single source of truth for tool registration and mode access. Each entry in
`TOOL_MANIFEST` maps a snake_case key to: the tool instance, its camelCase
record key, and per-mode permissions (`'*'` = all actions, `string[]` = whitelist).

`MODE_PERMISSIONS` is derived programmatically from `TOOL_MANIFEST` (keyed by mode
instead of by tool) for backward compatibility with `workflow-state.ts`.

`buildModeTools({ mode_id })` reads from the manifest, applies `createScopedTool()`
for action-restricted entries, and returns the filtered tool set for a given mode.

Adding a new tool requires only one manifest entry — no multi-file sync.

### Model Resolver Pipeline

Each mode file exports a `resolve<Name>Model()` function. In `launch.ts`:

```
PIPELINE_MODE_MODEL_RESOLVERS = {
    [MODES.triage]: resolveTriageModel,
    [MODES.research]: resolveResearchModel,
    ...
}
```

On mode switch, the resolver for the new mode is called to determine which model
should be activated (based on user's model pack settings).

### Pipeline Guard

The pipeline guard (`orchestration/pipeline-guard.ts`) tracks tool calls during
pipeline mode turns and detects when an agent finishes without calling
`switch-mode`. Uses escalating enforcement: nudge → force.

### Read-Only Enforcement

`orchestration/read-only-enforcement.ts` disables write/execute workspace tools
in read-only modes (plan, discuss, triage, research, review) by intercepting
`harness.workspaceFn` and calling `workspace.setToolsConfig({ enabled: false })`
for write tools.

### Upstream Patches

`orchestration/upstream-patches.ts` contains monkey-patches for known mastracode bugs:
1. Ask-user label truncation (pi-tui width assertion crash)
2. Double-slash autocomplete prefix
3. Model-pack-on-login override

All patches are defensive — they log warnings and no-op if upstream internals change.

## File Categorization

### constants/ (1 file)
| File | Purpose |
|------|---------|
| `mode-ids.ts` | `MODES` enum + `PIPELINE_STEPS_ORDERED` array |

### state/ (8 files)
| File | Lines | Purpose |
|------|-------|---------|
| `claim-verifier.ts` | 632 | Claim verification engine |
| `confidence-journal.ts` | 271 | Confidence score tracking |
| `luca-store.ts` | 292 | Pipeline state persistence |
| `session-ledger.ts` | 384 | JSONL event ledger |
| `shadow-scanner.ts` | 194 | Dead code / shadow file detection |
| `state.ts` | 299 | Core state types + read/write |
| `todos.ts` | 376 | Todo list management |
| `verification-result.ts` | 241 | Verification result storage |

### orchestration/ (6 files)
| File | Purpose |
|------|---------|
| `context-refresher.ts` | Refreshes agent context on budget thresholds |
| `continuation-messages.ts` | Builds kick-off messages for mode transitions |
| `pipeline-guard.ts` | Detects incomplete pipeline turns |
| `pipeline-tui.ts` | Pipeline progress header for TUI |
| `read-only-enforcement.ts` | Disables write tools in read-only modes |
| `upstream-patches.ts` | Monkey-patches for upstream mastracode bugs |

### analysis/ (3 files)
| File | Purpose |
|------|---------|
| `phase-diff.ts` | Diff pipeline phases for progress tracking |
| `postmortem.ts` | Post-pipeline analysis report generation |
| `retro.ts` | Retrospective summary generation |

### integration/ (4 files)
| File | Purpose |
|------|---------|
| `branding.ts` | App name, version resolution |
| `install-bundled-assets.ts` | Copies commands/skills/rules to project |
| `mastracode-config.ts` | Settings path resolution, model pack config |
| `model-routing.ts` | Per-mode model selection logic |

### util/ (4 files)
| File | Purpose |
|------|---------|
| `atomic-write.ts` | Atomic file write helper |
| `refs.ts` | Mutable ref pattern for cross-module state sharing |
| `token-budget.ts` | Token usage monitoring |
| `tui-text-helpers.ts` | Terminal text width/clipping utilities |
