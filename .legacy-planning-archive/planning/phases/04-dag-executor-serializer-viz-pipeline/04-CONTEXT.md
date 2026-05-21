# Phase 4 Context: DAG Executor, Serializer, Visualizer, Pipeline, Registration

## Objective

Complete the workflow domain with the remaining 5 helpers: DAG executor (wave execution with adapter delegation), checkpoint serializer, topology transformer for visualization, reference phase pipeline DAG, and domain registration.

## Decisions

### Wave Structure (locked by dependencies)

- Wave 1: A08 (serializer) + A09 (visualizer) + A10 (phase pipeline) — all independent, depend only on completed A01-A04
- Wave 2: A07 (executor) — depends on A05 (sorter, done), A06 (validator, done), A08 (serializer from Wave 1)
- Wave 3: A11 (domain registration) — depends on all A01-A10

### Key Implementation Notes

- A07 (executor): HIGH risk — coordinates wave execution, adapter delegation, checkpoint/resume. Uses functional closures.
- A08 (serializer): Checkpoint/resume with DAGCheckpointSchema. Uses checkpointSchemaVersion for forward compatibility.
- A09 (visualizer): Transforms DAG to topology format for luca-observer. Pure function.
- A10 (pipeline): Defines the reference Luca workflow as a concrete DAG using the builder API from A04.
- A11 (registration): Updates tsconfig paths, boundary check script (already has entries from Phase 1), and any remaining docs.

### Zod v4 Pitfall

Apply Zod v4 syntax for z.function() if encountered (validated in Phase 2).

## No Gray Areas

All todos have exact TypeScript implementations. Execute verbatim.
