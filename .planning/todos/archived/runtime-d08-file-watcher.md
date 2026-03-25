---
title: "Runtime D08: File watcher with targeted recompilation"
area: tooling
created: 2026-03-24
source: docs/runtime-architecture/research/dev-studio.md
depends_on: [D01, D02]
phase: runtime-d
estimated_files: 2
---

## Context

The file watcher monitors `src/` for changes and triggers targeted recompilation of only the changed domain. This is the key feature that breaks the broken feedback loop -- NEVER triggers `bun run build:all` (which crashes Claude Code sessions). After recompilation, notifies connected browsers via SSE.

IMPORTANT: Targeted recompilation feasibility is rated LOW confidence in the research. This task includes a spike to validate whether per-domain compilers can run independently. If they cannot, falls back to domain-scoped incremental rebuild.

## Task

### 1. Create `packages/luca-studio/src/watcher/file-watcher.ts`

```typescript
/**
 * File watcher for Luca Studio.
 *
 * Monitors src/ for changes using fs.watch() with OS-native APIs.
 * Detects which domain changed by parsing the file path, triggers
 * targeted recompilation, and notifies browsers via SSE.
 *
 * CRITICAL: Never triggers `bun run build:all`. Only runs per-domain compilation.
 *
 * @module studio-file-watcher
 */
import { watch } from "node:fs";
import { resolve, relative } from "path";

import { recompileDomain } from "./recompile";
import { broadcastSse } from "../server";

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

const MONOREPO_ROOT = resolve(import.meta.dir, "..", "..", "..", "..");
const SRC_DIR = resolve(MONOREPO_ROOT, "src");

// ---------------------------------------------------------------------------
// Ignore patterns
// ---------------------------------------------------------------------------

const IGNORE_PATTERNS = [
  ".DS_Store",
  ".git",
  "node_modules",
  "__pycache__",
  ".swp",
  ".swo",
  "~",
];

/**
 * Check if a filename should be ignored by the watcher.
 *
 * @param filename - The filename or relative path that changed
 * @returns true if the file should be ignored
 */
function shouldIgnore(filename: string): boolean {
  for (const pattern of IGNORE_PATTERNS) {
    if (filename.includes(pattern)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Debounce state
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 300;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingDomains: Set<string> = new Set();

// ---------------------------------------------------------------------------
// Domain detection
// ---------------------------------------------------------------------------

/**
 * Detect which src/ domain a file belongs to by parsing its path.
 *
 * Given a relative path like "agents/luca/lu-router.agent.ts",
 * returns "agents".
 *
 * @param relativePath - Path relative to src/
 * @returns Domain name (first directory component) or null
 */
function detectDomain(relativePath: string): string | null {
  const parts = relativePath.split("/");
  if (parts.length < 1) return null;
  const domain = parts[0];
  if (!domain) return null;

  // Known domains that have compilers
  const compilableDomains = [
    "agents",
    "skills",
    "rules",
    "hooks",
    "compilers",
    "shared",
    "complexity",
    "context",
    "planner",
    "harness",
    "iteration",
    "observability",
    "interop",
  ];

  return compilableDomains.includes(domain) ? domain : null;
}

// ---------------------------------------------------------------------------
// Watcher start
// ---------------------------------------------------------------------------

/**
 * Start watching src/ for file changes.
 *
 * Uses fs.watch() with recursive: true for OS-native file watching
 * (kqueue/FSEvents on macOS, inotify on Linux — no polling).
 *
 * Changes are debounced (300ms) to handle event storms during bulk operations.
 * After debounce, triggers targeted recompilation for each changed domain
 * and broadcasts an SSE reload event.
 *
 * @returns A cleanup function to stop the watcher
 */
export function startFileWatcher(): () => void {
  console.log("File watcher started on src/");

  const watcher = watch(SRC_DIR, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    if (shouldIgnore(filename)) return;

    const domain = detectDomain(filename);
    if (!domain) return;

    pendingDomains.add(domain);

    // Debounce: wait for event storm to settle
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const domains = [...pendingDomains];
      pendingDomains.clear();

      console.log(`[watcher] Change detected in: ${domains.join(", ")}`);

      // Recompile each changed domain
      for (const d of domains) {
        const result = await recompileDomain(d);
        if (result.success) {
          console.log(`[watcher] Recompiled ${d} (${result.duration_ms}ms)`);
        } else {
          console.warn(`[watcher] Recompile ${d} failed: ${result.error}`);
        }
      }

      // Broadcast SSE reload event to all connected browsers
      broadcastSse(
        JSON.stringify({
          type: "reload",
          domains,
          timestamp: new Date().toISOString(),
        }),
      );
    }, DEBOUNCE_MS);
  });

  // Cleanup function
  return () => {
    watcher.close();
    if (debounceTimer) clearTimeout(debounceTimer);
    console.log("File watcher stopped");
  };
}
```

### 2. Create `packages/luca-studio/src/watcher/recompile.ts`

```typescript
/**
 * Targeted per-domain recompilation for Luca Studio.
 *
 * Runs only the compiler for the changed domain. NEVER triggers build:all.
 * Falls back to a no-op with a warning if per-domain compilation is not
 * feasible for a given domain.
 *
 * @module studio-recompile
 */
import { resolve } from "path";

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

const MONOREPO_ROOT = resolve(import.meta.dir, "..", "..", "..", "..");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecompileResult {
  success: boolean;
  domain: string;
  duration_ms: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Domain-to-compiler mapping
// ---------------------------------------------------------------------------

/**
 * Maps src/ domain names to the scripts/commands that recompile them.
 *
 * Only entity domains (agents, skills, rules) and hooks have dedicated
 * compilation targets. Core domains (shared, complexity, etc.) do not
 * produce compiled output that needs regeneration.
 *
 * CRITICAL: None of these commands trigger build:all. Each runs only
 * the relevant portion of the compile + deploy pipeline.
 */
const DOMAIN_COMPILE_COMMANDS: Record<string, string[]> = {
  // Entity domains — these produce .claude/ output
  agents: ["bun", "run", "./scripts/build-compile.ts"],
  skills: ["bun", "run", "./scripts/build-compile.ts"],
  rules: ["bun", "run", "./scripts/build-compile.ts"],
  hooks: ["bun", "run", "./scripts/build-compile.ts"],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Recompile a single domain's output.
 *
 * For entity domains (agents, skills, rules, hooks), runs the compile
 * script. For core domains, this is a no-op since they don't produce
 * compiled output files.
 *
 * NOTE: This currently runs the full compile script (build-compile.ts)
 * which recompiles ALL entity domains, not just the changed one.
 * This is the fallback approach since per-domain compilers don't exist
 * as independent scripts. The full compile is still much faster and
 * safer than build:all because it skips the deploy stage and plugin
 * generation.
 *
 * Future improvement: Add a --domain flag to build-compile.ts to
 * compile only the changed domain.
 *
 * @param domain - The src/ domain name (e.g., "agents", "skills")
 * @returns RecompileResult with success status and timing
 */
export async function recompileDomain(
  domain: string,
): Promise<RecompileResult> {
  const start = performance.now();

  const command = DOMAIN_COMPILE_COMMANDS[domain];

  if (!command) {
    // Core domains don't produce compiled output — skip silently
    return {
      success: true,
      domain,
      duration_ms: 0,
    };
  }

  try {
    const result = Bun.spawnSync(command, {
      cwd: MONOREPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        // Signal to build-compile that this is a studio-triggered recompile
        STUDIO_RECOMPILE: "1",
      },
    });

    const duration = Math.round(performance.now() - start);

    if (result.exitCode !== 0) {
      const stderr = result.stderr?.toString() ?? "Unknown error";
      return {
        success: false,
        domain,
        duration_ms: duration,
        error: stderr.slice(0, 500),
      };
    }

    return {
      success: true,
      domain,
      duration_ms: duration,
    };
  } catch (err) {
    const duration = Math.round(performance.now() - start);
    return {
      success: false,
      domain,
      duration_ms: duration,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
```

### 3. Wire the watcher into server.ts

Add to `packages/luca-studio/src/server.ts`, after the server startup:

```typescript
// Start file watcher (unless --no-watch)
import { startFileWatcher } from "./watcher/file-watcher";

if (config.watch) {
  const stopWatcher = startFileWatcher();

  // Cleanup on process exit
  process.on("SIGINT", () => {
    stopWatcher();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    stopWatcher();
    process.exit(0);
  });
}
```

## Verification

```bash
# TypeScript compiles
cd packages/luca-studio && bunx --bun tsc --noEmit

# Start server with watcher:
# bun --hot packages/luca-studio/src/server.ts
# Console should show: "File watcher started on src/"

# Edit any file in src/agents/ (e.g., add a comment)
# Console should show: "[watcher] Change detected in: agents"
# Console should show: "[watcher] Recompiled agents (Xms)"

# Verify debouncing: rapidly edit 3 files in different domains
# Console should show a single batch with all domains, not 3 separate events

# Verify --no-watch flag:
# bun packages/luca-studio/src/server.ts --no-watch
# Console should NOT show "File watcher started"

# Verify build:all is NEVER triggered:
# grep -r "build:all" packages/luca-studio/
# Should return zero results
```

## Notes

- The watcher uses `build-compile.ts` as the recompilation command for entity domains. This recompiles ALL entity domains (not just the changed one) because per-domain compilation is not yet supported as independent scripts. This is still much faster than `build:all` because it skips Stage 2 (deploy) and Stage 3 (plugin generation).
- Future improvement: Add `--domain=agents` flag to `build-compile.ts` so only the changed domain is recompiled.
- Core domains (shared, complexity, context, etc.) don't produce compiled output, so changes to them are a no-op for recompilation. The SSE reload event is still sent so browsers refresh their data views.
- The 300ms debounce handles event storms from IDE auto-save and multi-file refactors.
- The `STUDIO_RECOMPILE=1` env var is set so build scripts can detect Studio-triggered recompiles and potentially optimize behavior.
