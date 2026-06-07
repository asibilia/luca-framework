# lib/

Shared utility modules for luca-studio. No barrel `index.ts` is provided -- import
individual modules directly to preserve Next.js tree-shaking.

## Directory Contract

| File                        | Purpose                                                     |
| --------------------------- | ----------------------------------------------------------- |
| `atomic-write.ts`           | Atomic file writes with temp + rename                       |
| `compile-events.ts`         | Compile-event helpers for the studio pipeline               |
| `config-section-handler.ts` | Config section read/write helpers                           |
| `config-section-schemas.ts` | Zod schemas for config.json sections (studio-local mirrors) |
| `constants.ts`              | Event types, workflow states, nav groups, complexity levels |
| `dag-validation.ts`         | DAG cycle detection for pipeline editor                     |
| `entity-route-helpers.ts`   | CRUD route helpers for agents/skills/rules                  |
| `etag.ts`                   | ETag generation and comparison                              |
| `file-watcher.ts`           | File system watcher utilities                               |
| `format.ts`                 | Date/number formatting utilities                            |
| `git-types.ts`              | Git-related TypeScript types                                |
| `graph-types.ts`            | Force-graph type definitions                                |
| `muninn-config.ts`          | MuninnDB connection config                                  |
| `muninn-helpers.ts`         | MuninnDB query and mutation helpers                         |
| `muninn-route-helper.ts`    | MuninnDB API route helpers                                  |
| `muninn-schemas.ts`         | MuninnDB Zod schemas                                        |
| `muninn-types.ts`           | MuninnDB TypeScript types                                   |
| `observation-helpers.ts`    | Observation/telemetry helper functions                      |
| `project-root.ts`           | Project root directory resolution                           |
| `request-guards.ts`         | Request validation and authorization guards                 |
| `safe-json-parse.ts`        | Safe JSON parsing with error handling                       |
| `semantic-validators.ts`    | Semantic validation pipeline functions                      |
| `ts-round-trip.ts`          | TypeScript source round-trip editing                        |
| `types.ts`                  | Studio-local type definitions (mirrored schemas)            |
| `utils.ts`                  | General utility functions (cn, etc.)                        |
| `validation-pipeline.ts`    | Multi-step validation pipeline                              |
| `workflow-constants.ts`     | Workflow node type colors and display config                |
| `workflow-topology.ts`      | Topology graph data generation                              |
| `workflow-types.ts`         | Workflow Zod schemas and TypeScript types                   |

## Schema Coupling Policy

Several files contain schemas that intentionally mirror `packages/luca-framework/src/`
schemas. They are duplicated (not imported) to avoid a cross-package runtime dependency.
Run `bun run check:studio-drift` to detect mismatches. See the coupling policy doc in
`types.ts` and `config-section-schemas.ts` for details.
