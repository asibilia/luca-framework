# @alecsibilia/luca-core

Core types, schemas, and deterministic contracts shared by the luca toolchain.

## Scope

`luca-core` is the foundation layer that has no runtime dependencies beyond `zod`. It is consumed by:

- `@alecsibilia/luca-framework` — the user-facing `luca` CLI
- `@alecsibilia/luca-mastracode` — the (gradually retiring) Mastra Code harness

Both packages import the canonical state schema, `pipelineStep` enum, coarse-phase mapping, and `.luca/` directory contract from here. This guarantees that hooks, MCP tools, skills, and the legacy harness all see the same shape of truth.

## Modules

| Subpath | Contents |
|---|---|
| `@alecsibilia/luca-core/state` | `lucaStateSchema`, `PipelineStep`, `coarsePhaseOf()` |
| `@alecsibilia/luca-core/luca-dir` | `.luca/` path allowlist, `isValidLucaPath()`, `phasePathFor()`, etc. |

## What lives here vs. elsewhere

- **luca-core**: pure types, schemas, pure functions. No I/O. No CLI. No MCP server.
- **luca-framework**: CLI commands, MCP server, hook entry points, init logic. Imports schemas + helpers from luca-core.
- **luca-mastracode**: legacy harness (retiring). Imports schemas from luca-core during gradual migration.

If a function touches the filesystem, spawns a process, or talks to a service, it does NOT belong here.
