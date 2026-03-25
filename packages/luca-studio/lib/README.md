# lib/

Shared utility modules for luca-studio. No barrel `index.ts` is provided -- import
individual modules directly to preserve Next.js tree-shaking.

## Directory Contract

| File                        | Purpose                                                     |
| --------------------------- | ----------------------------------------------------------- |
| `atomic-write.ts`           | Atomic file writes with temp + rename                       |
| `config-section-handler.ts` | Config section read/write helpers                           |
| `config-section-schemas.ts` | Zod schemas for config.json sections (studio-local mirrors) |
| `constants.ts`              | Event types, workflow states, nav groups, complexity levels |
| `dag-validation.ts`         | DAG cycle detection for pipeline editor                     |
| `entity-route-helpers.ts`   | CRUD route helpers for agents/skills/rules                  |
| `etag.ts`                   | ETag generation and comparison                              |
| `format.ts`                 | Date/number formatting utilities                            |
| `graph-types.ts`            | Force-graph type definitions                                |
| `muninn-config.ts`          | MuninnDB connection config                                  |
| `muninn-route-helper.ts`    | MuninnDB API route helpers                                  |
| `muninn-schemas.ts`         | MuninnDB Zod schemas                                        |
| `muninn-types.ts`           | MuninnDB TypeScript types                                   |
| `project-root.ts`           | Project root directory resolution                           |
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
