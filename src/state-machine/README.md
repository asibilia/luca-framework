# DEPRECATED: src/state-machine/

> This directory has been superseded by `packages/luca-state/`.
> All new development should target the package.

## Migration

As of Phase 40-41, the state machine source code has been extracted to a standalone package at `packages/luca-state/`. The bridge CLI path has changed:

| Before                                      | After                                             |
| ------------------------------------------- | ------------------------------------------------- |
| `bun run src/state-machine/bridge.ts <cmd>` | `bun run packages/luca-state/src/bridge.ts <cmd>` |

## Why files are still here

Files in this directory are preserved during the transition period for backward compatibility. Source files in `src/hooks/`, `src/skills/`, `src/agents/`, and `src/rules/` have been updated to reference the new package path.

## Canonical locations

- **Package source:** `packages/luca-state/src/`
- **Package tests:** `packages/luca-state/src/__tests__/`
- **Bridge CLI:** `packages/luca-state/src/bridge.ts`
- **Bin entry:** `packages/luca-state/bin/luca-state.js`
