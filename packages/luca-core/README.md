# @alecsibilia/luca-core

Core types, schemas, and deterministic contracts shared by the luca toolchain.

## Scope

`luca-core` is the foundation layer that has no runtime dependencies beyond `zod`. It is consumed by:

- `@alecsibilia/luca-cli` — the user-facing `luca` CLI surface
- `@alecsibilia/luca-tools` — Claude Code artifacts (skills, modes, subagents, hooks) and MCP tooling
- `@alecsibilia/luca` — the umbrella package that bundles cli + tools

Every consumer imports the canonical state schema, `pipelineStep` enum, coarse-phase mapping, and `.luca/` directory contract from here. This guarantees that hooks, MCP tools, skills, and the CLI all see the same shape of truth.

## Modules

| Subpath | Contents |
|---|---|
| `@alecsibilia/luca-core/state` | `lucaStateSchema`, `PipelineStep`, `coarsePhaseOf()` |
| `@alecsibilia/luca-core/luca-dir` | `.luca/` path allowlist, `isValidLucaPath()`, `phasePathFor()`, etc. |

## What lives here vs. elsewhere

- **luca-core**: pure types, schemas, deterministic algorithms. Minimal I/O (filesystem reads/writes of `.luca/` artifacts: ledger, verification result, etc.). No CLI surface, no MCP server, no Claude Code artifacts.
- **luca-cli**: `luca` CLI commands (`luca state advance`, `luca confidence log`, `luca retro`, etc.). Imports algorithms + schemas from luca-core.
- **luca-tools**: Claude Code skills, modes, subagents, hooks, MCP tooling. Imports algorithms + schemas from luca-core.

If a function spawns a subprocess, talks to a network service, or owns user-facing argv parsing, it does NOT belong here.
