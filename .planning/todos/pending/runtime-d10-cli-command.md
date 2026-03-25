---
title: "Runtime D10: CLI command for luca studio"
area: tooling
created: 2026-03-24
source: docs/runtime-architecture/research/dev-studio.md
depends_on: [D01, D02]
phase: runtime-d
estimated_files: 2
---

## Context

Add a `luca studio` CLI command that starts the Studio dev server. Uses `--port`, `--no-open`, and `--no-watch` flags. The command is added to the existing CLI entrypoint in `packages/luca-framework/`.

## Task

### 1. Add root package.json script

In the root `package.json`, add to `scripts`:

```json
"studio": "bun --hot packages/luca-studio/src/server.ts"
```

This uses `--hot` for soft server reload (preserves process state and open connections). NOT `--watch` (which does hard restart and drops WebSocket connections).

### 2. Add studio subcommand to the Luca CLI

Locate the CLI entrypoint in `packages/luca-framework/bin/luca.js` or the citty command definitions. Add a `studio` subcommand that delegates to the Studio server:

```typescript
// In the CLI command definitions file, add:

/**
 * The `luca studio` command starts the Luca Studio dev server.
 *
 * Delegates to bun --hot packages/luca-studio/src/server.ts with
 * flag passthrough for --port, --no-open, --no-watch.
 *
 * @example
 *   luca studio                    # Start with defaults (port 4040, open browser, watch enabled)
 *   luca studio --port=5050        # Custom port
 *   luca studio --no-open          # Don't open browser
 *   luca studio --no-watch         # Disable file watcher
 */
```

The implementation depends on the existing CLI framework (citty). The command should:

1. Resolve the path to `packages/luca-studio/src/server.ts` relative to the monorepo root
2. Spawn `bun --hot <path> [flags]` as a child process
3. Forward all `--port`, `--no-open`, `--no-watch` flags to the child process
4. Forward stdout/stderr to the terminal
5. Handle SIGINT/SIGTERM for clean shutdown

If adding to citty:

```typescript
import { defineCommand } from "citty";
import { resolve } from "path";

export const studioCommand = defineCommand({
  meta: {
    name: "studio",
    description: "Start Luca Studio development server",
  },
  args: {
    port: {
      type: "string",
      description: "Server port (default: 4040)",
    },
    "no-open": {
      type: "boolean",
      description: "Don't open browser on start",
      default: false,
    },
    "no-watch": {
      type: "boolean",
      description: "Disable file watcher",
      default: false,
    },
  },
  async run({ args }) {
    const monorepoRoot = resolve(import.meta.dir, "..", "..", "..");
    const serverPath = resolve(
      monorepoRoot,
      "packages",
      "luca-studio",
      "src",
      "server.ts",
    );

    const spawnArgs = ["bun", "--hot", serverPath];
    if (args.port) spawnArgs.push(`--port=${args.port}`);
    if (args["no-open"]) spawnArgs.push("--no-open");
    if (args["no-watch"]) spawnArgs.push("--no-watch");

    const proc = Bun.spawn(spawnArgs, {
      cwd: monorepoRoot,
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
    });

    // Wait for process to exit
    await proc.exited;
  },
});
```

### 3. Register the command

Register `studioCommand` in the CLI's command registry (typically in `packages/luca-framework/src/cli/` or the main CLI definition).

The exact registration depends on the existing CLI structure. Find where other subcommands (like `init`, `bridge`, etc.) are registered and add `studio` alongside them.

## Verification

```bash
# Root script works
bun run studio --no-open
# Expected: Server starts on port 4040, console shows Studio URL

# With custom port
bun run studio -- --port=5050 --no-open
# Expected: Server starts on port 5050

# luca CLI command (if luca is installed globally or linked)
luca studio --no-open
# Expected: Server starts on port 4040

# Ctrl+C cleanly shuts down
# Start server, press Ctrl+C
# Expected: Process exits cleanly, no orphaned processes

# --no-watch flag
bun run studio -- --no-watch --no-open
# Expected: Console does NOT show "File watcher started"
```

## Notes

- The root `package.json` script uses `bun --hot` for development workflow. The `luca studio` CLI command also uses `--hot` so WebSocket connections survive server code changes.
- The CLI command resolves paths relative to the monorepo root, not relative to the current working directory. This allows running `luca studio` from any directory within the monorepo.
- If the luca CLI is not installed globally, `bun run studio` from the monorepo root is the primary way to start Studio.
- The `--no-open` flag is useful in SSH/remote development environments where a browser cannot be opened.
- The `--no-watch` flag is useful for static inspection mode when you don't want recompilation triggered by source changes.
