# Phase 172: CLI Command Surface & Prerequisites - Research

**Researched:** 2026-03-16
**Domain:** CLI restructuring, Bun runtime detection, citty subcommands
**Confidence:** HIGH

## Summary

This phase restructures the existing Luca CLI to support global installation commands while preserving backward compatibility with existing per-project `init` behavior. The core challenge is splitting the current `init.ts` (which does per-project scaffolding) into a new global setup orchestrator while moving the wizard/file-generation logic to `vault:init`.

Research confirms that all decisions in CONTEXT.md are technically sound. The existing codebase has clean separation of concerns (detect.ts, wizard.ts, files.ts, branding.ts) that makes the restructuring low-risk. citty's `--version` flag does not conflict with a `version` subcommand. Bun's `import.meta.dir` is reliable for runtime context detection.

**Primary recommendation:** Restructure incrementally -- create new files first (vault-init.ts, runtime-context.ts, prerequisites.ts, luca-home.ts, version.ts, reinit.ts), then modify init.ts last to minimize risk.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library        | Version | Purpose                      | Why Standard                              |
| -------------- | ------- | ---------------------------- | ----------------------------------------- |
| citty          | ^0.2.0  | CLI command framework        | Already used, defines all CLI commands    |
| @clack/prompts | ^1.0.0  | Interactive terminal prompts | Already used by wizard.ts, init.ts        |
| consola        | ^3.4.0  | Logging                      | Already used via logger.ts                |
| zod            | ^4.3.6  | Schema validation            | Project convention (schema-first parsing) |
| pathe          | ^2.0.3  | Path utilities               | Already used across all utils             |

### Supporting

| Library         | Version  | Purpose                  | When to Use                                      |
| --------------- | -------- | ------------------------ | ------------------------------------------------ |
| semver          | ^7.7.3   | Version comparison       | Already a dependency, use for Bun version checks |
| update-notifier | ^7.3.1   | Version update detection | Already used by version-check.ts                 |
| lodash          | ^4.17.23 | Utility functions        | Project convention                               |

### Alternatives Considered

| Instead of                                | Could Use                                      | Tradeoff                                                                                  |
| ----------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| semver (for Bun version check)            | Manual comparison (like doctor/bun-runtime.ts) | doctor already has `isSemverGte()` -- use semver for consistency since it is a dependency |
| @clack/prompts (for prerequisite prompts) | consola                                        | @clack/prompts is already the pattern for all interactive CLI flows                       |

**Installation:**
No new dependencies needed. All required libraries are already in `package.json`.

## Architecture Patterns

### Recommended Project Structure (new/changed files)

```
packages/luca-framework/src/
├── cli.ts                          # MODIFY: add vault:init, reinit, version subcommands
├── commands/
│   ├── init.ts                     # MODIFY: becomes global setup orchestrator
│   ├── vault-init.ts               # NEW: per-repo wizard (current init behavior moves here)
│   ├── reinit.ts                   # NEW: force rebuild stub
│   └── version.ts                  # NEW: version + update check display
├── utils/
│   ├── prerequisites.ts            # NEW: Bun/OS/arch detection
│   ├── runtime-context.ts          # NEW: global vs dev mode detection
│   └── luca-home.ts                # NEW: ~/.luca/ directory management
```

### Pattern 1: citty Subcommand Registration (colon-namespaced)

**What:** Register new subcommands in cli.ts using the existing colon-namespace pattern
**When to use:** For all new CLI commands
**Example:**

```typescript
// Source: packages/luca-framework/src/cli.ts (existing pattern)
const main = defineCommand({
  meta: { name: "luca", version: LUCA_VERSION, description: "..." },
  subCommands: {
    init: () => import("./commands/init").then((m) => m.initCommand),
    "vault:init": () =>
      import("./commands/vault-init").then((m) => m.vaultInitCommand),
    reinit: () => import("./commands/reinit").then((m) => m.reinitCommand),
    version: () => import("./commands/version").then((m) => m.versionCommand),
    // ... existing commands
  },
});
```

### Pattern 2: Command Module Export Pattern

**What:** Each command file exports a named `defineCommand()` result
**When to use:** All command files follow this pattern
**Example:**

```typescript
// Source: packages/luca-framework/src/commands/doctor.ts (existing pattern)
import { defineCommand } from "citty";
export default defineCommand({ meta: { name: "doctor", ... }, args: { ... }, async run({ args }) { ... } });

// OR named export (init.ts pattern):
export const initCommand = defineCommand({ ... });
```

### Pattern 3: Runtime Context Detection via import.meta.dir

**What:** Use Bun's `import.meta.dir` to detect whether running from global install or monorepo dev
**When to use:** New `runtime-context.ts` utility
**Example:**

```typescript
// Source: Bun documentation - import.meta.dir returns absolute dir of current file
import { homedir } from "node:os";

export function detectRuntimeContext(): RuntimeContext {
  const scriptDir = import.meta.dir;
  // If path contains 'packages/luca-framework/' -> monorepo dev mode
  const isDev = scriptDir.includes("packages/luca-framework/");
  return {
    mode: isDev ? "dev" : "global",
    packageDir: scriptDir,
    homeDir: homedir(),
  };
}
```

### Pattern 4: Lazy Directory Creation (Bun-native)

**What:** Create `~/.luca/` structure on demand using `mkdir` with recursive
**When to use:** `luca-home.ts` utility
**Example:**

```typescript
// Source: existing pattern in files.ts using mkdir with recursive
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "pathe";
import { homedir } from "node:os";

export async function ensureLucaHome(): Promise<LucaHomePaths> {
  const root = join(homedir(), ".luca");
  const paths = {
    root,
    bin: join(root, "bin"),
    manifests: join(root, "manifests"),
    backups: join(root, "backups"),
  };
  for (const dir of Object.values(paths)) {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }
  return paths;
}
```

### Anti-Patterns to Avoid

- **Duplicating wizard logic:** vault-init.ts should import from wizard.ts and files.ts, not copy their code
- **Breaking existing init callers:** `runInit()` is exported from index.ts and used by create-luca -- it must keep working
- **Modifying existing utility signatures:** wizard.ts, detect.ts, files.ts should remain backward-compatible

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem                   | Don't Build              | Use Instead                         | Why                                                                     |
| ------------------------- | ------------------------ | ----------------------------------- | ----------------------------------------------------------------------- |
| Bun version detection     | Custom version parser    | `Bun.version` + semver              | semver is already a dependency; doctor/bun-runtime.ts shows the pattern |
| OS/arch detection         | Custom platform sniffing | `process.platform` + `process.arch` | Built-in, reliable, cross-platform                                      |
| Home directory resolution | Custom $HOME parsing     | `os.homedir()` or `Bun.env.HOME`    | Node/Bun built-in, handles edge cases                                   |
| Path joining              | String concatenation     | `pathe` (join, resolve)             | Already used everywhere in the codebase                                 |
| Interactive prompts       | Custom readline          | @clack/prompts                      | Already the project standard                                            |
| Version comparison        | Manual string comparison | semver.gte()                        | Already a dependency                                                    |

**Key insight:** Every capability needed is already available via existing dependencies or Bun built-ins. No new packages are needed.

## Common Pitfalls

### Pitfall 1: Breaking the `runInit()` Export

**What goes wrong:** `runInit()` is exported from `index.ts` and used by `create-luca` (see `bin/luca.js` and index.ts line 8). If init.ts's export signature changes, downstream consumers break.
**Why it happens:** Refactoring init.ts to be a global orchestrator while forgetting about the `runInit()` contract.
**How to avoid:** Keep `initCommand` and `runInit()` exports from init.ts. The command's `run()` function changes behavior, but the export shape stays the same.
**Warning signs:** TypeScript errors in index.ts or bin/luca.js after changes.

### Pitfall 2: citty `--version` Flag vs `version` Subcommand

**What goes wrong:** Concern that adding a `version` subcommand might conflict with the built-in `--version` flag.
**Why it happens:** Assumption that citty might route `--version` to the `version` subcommand.
**How to avoid:** Verified in citty source (index.mjs line 300): `--version` is handled as a special case BEFORE subcommand resolution. Only triggers when it's the sole argument (`rawArgs.length === 1 && rawArgs[0] === "--version"`). No conflict exists.
**Warning signs:** None -- this is safe.

### Pitfall 3: `import.meta.dir` in Compiled/Bundled Contexts

**What goes wrong:** `import.meta.dir` might resolve to unexpected paths when running from `dist/` (unbuild output) vs `src/` (dev mode).
**Why it happens:** unbuild transforms the source, and `import.meta.dir` resolves based on the actual file location on disk.
**How to avoid:** The detection logic checks for `packages/luca-framework/` in the path, which works regardless of `src/` vs `dist/` because both are under the package directory. When installed globally, the path would be in `node_modules/` or Bun's global install directory, neither of which contains `packages/luca-framework/`.
**Warning signs:** `detectRuntimeContext()` returning wrong mode. Add a debug log showing the resolved path.

### Pitfall 4: `hasLuca` Detection in init.ts

**What goes wrong:** Current init.ts checks `context.hasLuca` and refuses to run if Luca is already installed. The new init (global setup) should NOT check this -- it orchestrates fresh global setup.
**Why it happens:** Forgetting to remove or change the `hasLuca` guard when restructuring init.ts.
**How to avoid:** The `hasLuca` check should move to vault-init.ts (which handles per-project setup), not remain in the new global init flow. New init should check for global Luca state instead.
**Warning signs:** Users unable to run `luca init` for global setup because they have `.cursor/luca/` in their current directory.

### Pitfall 5: Existing `luca init` Users Confused by Changed Behavior

**What goes wrong:** Users accustomed to `luca init` for per-project setup find it now does global setup instead.
**Why it happens:** Breaking change in command semantics.
**How to avoid:** New init.ts should detect context: if user is in a project without global Luca installed, run the global setup. If global Luca exists but project not initialized, guide them to `vault:init`. Show clear messaging about what each command does.
**Warning signs:** User confusion in GitHub issues. Add clear guidance messages in the CLI output.

## Code Examples

Verified patterns from the existing codebase:

### Registering a New Subcommand

```typescript
// Source: packages/luca-framework/src/cli.ts (line 19-29)
subCommands: {
  init: () => import("./commands/init").then((m) => m.initCommand),
  "vault:init": () => import("./commands/vault-init").then((m) => m.vaultInitCommand),
  reinit: () => import("./commands/reinit").then((m) => m.reinitCommand),
  version: () => import("./commands/version").then((m) => m.versionCommand),
  // existing commands preserved
  update: () => import("./commands/update").then((m) => m.updateCommand),
  status: () => import("./commands/status").then((m) => m.statusCommand),
  doctor: () => import("./commands/doctor").then((m) => m.default),
  "add-skill": () => import("./commands/add-skill").then((m) => m.addSkillCommand),
  "run:claude": () => import("./commands/run").then((m) => m.runClaudeCommand),
  "run:cursor": () => import("./commands/run").then((m) => m.runCursorCommand),
},
```

### Prerequisite Detection (Bun-native)

```typescript
// Source: Bun API docs + existing doctor/checks/bun-runtime.ts pattern
import { homedir } from "node:os";
import semver from "semver";

const MIN_BUN_VERSION = "1.0.0";

export function checkBunPrerequisite(): PrerequisiteResult {
  if (typeof Bun === "undefined") {
    return { installed: false, version: null, path: null };
  }
  return {
    installed: true,
    version: Bun.version,
    path: Bun.which("bun"),
    meetsMinimum: semver.gte(Bun.version, MIN_BUN_VERSION),
  };
}

export function checkPlatform(): PlatformInfo {
  return {
    os: process.platform, // 'darwin', 'linux', 'win32'
    arch: process.arch, // 'arm64', 'x64'
    homeDir: homedir(),
  };
}
```

### vault-init.ts Reusing Existing Wizard

```typescript
// Source: packages/luca-framework/src/commands/init.ts (current behavior)
import { defineCommand } from "citty";
import { detectProjectContext } from "../utils/detect";
import {
  runWizard,
  createConfigFromArgs,
  loadConfigFromFile,
} from "../utils/wizard";
import { generateFiles, setupCleanupHandler } from "../utils/files";

export const vaultInitCommand = defineCommand({
  meta: {
    name: "vault:init",
    description: "Initialize Luca in a project repository",
  },
  args: {
    // Same args as current init.ts (quick, config, name, prefix, stack, tracker, harness, preset, no-tour)
  },
  async run({ args }) {
    // This is the current init.ts run() body, almost verbatim
    setupCleanupHandler();
    const context = await detectProjectContext();
    if (context.hasLuca) {
      /* warn and exit */
    }
    // ... wizard flow, generateFiles, tour
  },
});
```

## State of the Art

| Old Approach                     | Current Approach                                            | When Changed           | Impact                              |
| -------------------------------- | ----------------------------------------------------------- | ---------------------- | ----------------------------------- |
| `luca init` = per-project wizard | `luca init` = global setup, `luca vault:init` = per-project | Phase 172 (this phase) | Breaking behavior change for `init` |
| No global state (~/.luca/)       | ~/.luca/ with bin/, manifests/, backups/                    | Phase 172 (this phase) | Enables global binary management    |
| No runtime context detection     | `import.meta.dir` based detection                           | Phase 172 (this phase) | Commands adapt behavior to context  |

**Deprecated/outdated:**

- `rm -rf .planning/ .cursor/luca/ && bunx luca init` (current init.ts line 80): This guidance will change. The new guidance will be `luca reinit` or `luca vault:init --force`.

## Open Questions

Things that couldn't be fully resolved:

1. **`reinit` command scope**
   - What we know: CONTEXT.md says "force rebuild stub" for reinit.ts. The scope guardrail says "Does NOT cover: Settings merge logic (Phase 175)".
   - What's unclear: How much should reinit do in this phase? Just a placeholder that prints "coming in Phase 175"? Or should it do a basic re-run of init?
   - Recommendation: Create a minimal stub that prints a message and exits. The real logic comes in Phase 175.

2. **`version` command vs `--version` flag UX**
   - What we know: `--version` (citty built-in) prints just the version number. The `version` subcommand can show more info (version + update check + platform info).
   - What's unclear: Should `version` subcommand also trigger the update notifier synchronously (blocking), or keep it async like the current background check in cli.ts?
   - Recommendation: Make `version` subcommand synchronous -- user explicitly asked for version info, so they expect to wait. Keep cli.ts background check as-is for all other commands.

3. **Backward compatibility for `runInit()` export**
   - What we know: `runInit()` is exported from index.ts (line 8) and called by `bin/luca.js`. It currently does `runMain(initCommand)`.
   - What's unclear: Should `runInit()` now invoke the new global init, or the old per-project init (vault-init)?
   - Recommendation: `runInit()` should continue to invoke `initCommand` (now the global init), since that is the primary user-facing entry point. Document this change.

## Sources

### Primary (HIGH confidence)

- `packages/luca-framework/src/cli.ts` - Existing CLI structure, subcommand registration pattern
- `packages/luca-framework/src/commands/init.ts` - Current init command, full implementation analyzed
- `packages/luca-framework/src/utils/wizard.ts` - Wizard flow, createConfigFromArgs, loadConfigFromFile
- `packages/luca-framework/src/utils/detect.ts` - Project context detection
- `packages/luca-framework/src/utils/files.ts` - File generation, cleanup handler
- `packages/luca-framework/src/utils/manifest.ts` - LUCA_VERSION resolution, import.meta.dir usage
- `packages/luca-framework/src/types.ts` - All type definitions
- `packages/luca-framework/src/commands/run.ts` - Colon-namespace pattern for subcommands
- `packages/luca-framework/src/commands/status.ts` - Command module export pattern
- `packages/luca-framework/src/utils/doctor/checks/bun-runtime.ts` - Bun detection pattern
- `node_modules/citty/dist/index.mjs` (line 300) - `--version` vs subcommand resolution verified
- `packages/luca-framework/package.json` - Dependencies, bin entries, version

### Secondary (MEDIUM confidence)

- [Bun import.meta docs](https://bun.com/reference/globals/ImportMeta) - `import.meta.dir` behavior
- [citty GitHub](https://github.com/unjs/citty) - Framework documentation

### Tertiary (LOW confidence)

- None

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - All libraries already in use, no new dependencies
- Architecture: HIGH - Patterns verified directly in codebase source code
- Pitfalls: HIGH - Verified citty source code for --version conflict; analyzed all import paths for runInit() breakage
- Code examples: HIGH - Derived from existing codebase patterns, not hypothetical

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable -- no fast-moving dependencies)

## Appendix: Existing Code Dependency Map

Understanding which files import what is critical for safe restructuring.

### init.ts imports (all reusable by vault-init.ts)

```
init.ts
├── citty (defineCommand, runMain)
├── @clack/prompts (p)
├── utils/logger (logger)
├── utils/detect (detectProjectContext)
├── utils/wizard (runWizard, createConfigFromArgs, loadConfigFromFile)
├── utils/files (generateFiles, setupCleanupHandler)
├── utils/tour (lazy import)
└── types (LucaConfig)
```

### wizard.ts exports (consumed by init.ts, will be consumed by vault-init.ts)

```
wizard.ts exports:
├── runWizard(context) -> LucaConfig | null
├── createConfigFromArgs(args) -> LucaConfig
├── loadConfigFromFile(path) -> LucaConfig
├── VALID_STACKS, VALID_TRACKERS, VALID_HARNESSES, DEFAULT_HARNESSES
```

### files.ts exports (consumed by init.ts, will be consumed by vault-init.ts)

```
files.ts exports:
├── generateFiles({ config, cwd? }) -> { success, data?, stats?, error? }
├── setupCleanupHandler()
├── cleanupFiles()
```

### detect.ts exports (consumed by init.ts and wizard.ts)

```
detect.ts exports:
├── detectProjectContext(cwd?) -> ProjectContext
├── formatStack(stack) -> string
```

All utility files have clean, testable APIs that vault-init.ts can import directly without modification.
