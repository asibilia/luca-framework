---
id: "82-A"
title: "CLI/DX Foundation: Status, Doctor, Presets"
phase: 82
wave: 1
complexity: MODERATE
requirements:
  - R3 (CLI Status Command)
  - R4 (Harness-Aware Doctor)
  - R5 (Progressive Config Presets)
todos:
  - "#19: bun luca status command"
  - "#21: Harness-aware doctor"
  - "#11: Progressive config presets"
tasks:
  - id: "82-A-T1"
    title: "Create `bun luca status` command"
    goal: "Add a status subcommand that displays version, harnesses, config profile, test count, and state machine status"
    verify: "`bun luca status` prints formatted output; `bun luca status --json` prints valid JSON"
    files:
      - packages/luca-framework/src/commands/status.ts (create)
      - packages/luca-framework/src/index.ts (modify)
  - id: "82-A-T2"
    title: "Replace node-version doctor check with bun-runtime check"
    goal: "Doctor validates Bun runtime availability and minimum version instead of Node.js"
    verify: "`bun luca doctor` shows 'Bun Runtime' check passing with version info"
    files:
      - packages/luca-framework/src/utils/doctor/checks/bun-runtime.ts (create)
      - packages/luca-framework/src/utils/doctor/checks/node-version.ts (delete)
      - packages/luca-framework/src/utils/doctor/checks/index.ts (modify)
      - packages/luca-framework/src/utils/doctor/index.ts (modify)
  - id: "82-A-T3"
    title: "Add per-harness directory validation and drift detection to doctor"
    goal: "Doctor conditionally runs harness-specific checks and detects source-vs-compiled drift"
    verify: "`bun luca doctor --verbose` shows per-harness directory checks and drift status"
    files:
      - packages/luca-framework/src/utils/doctor/checks/harness-installation.ts (modify)
      - packages/luca-framework/src/utils/doctor/checks/drift-detection.ts (create)
      - packages/luca-framework/src/utils/doctor/checks/index.ts (modify)
      - packages/luca-framework/src/utils/doctor/index.ts (modify)
  - id: "82-A-T4"
    title: "Create progressive config presets"
    goal: "Define Starter/Standard/Full preset tiers with appropriate defaults; wire into wizard and types"
    verify: "Preset definitions export correctly; wizard shows preset selection; LucaConfig accepts preset field"
    files:
      - packages/luca-framework/src/utils/presets.ts (create)
      - packages/luca-framework/src/types.ts (modify)
      - packages/luca-framework/src/utils/wizard.ts (modify)
  - id: "82-A-T5"
    title: "Wire preset into init, update, and config generation"
    goal: "Init command passes selected preset through to config generation; preset stored in manifest and config.json; preset changeable post-init"
    verify: "`bun luca init` with preset selection produces correct config.json; manifest includes preset field"
    files:
      - packages/luca-framework/src/commands/init.ts (modify)
      - packages/luca-framework/src/commands/update.ts (modify)
      - packages/luca-framework/src/utils/wizard.ts (modify)
  - id: "82-A-T6"
    title: "Add tests for status, doctor, and presets"
    goal: "Unit tests covering status output parsing, bun-runtime check, preset definitions, and preset merge logic"
    verify: "`bun test` passes; new test files have meaningful assertions"
    files:
      - __tests__/packages/luca-framework/commands/status.test.ts (create)
      - __tests__/packages/luca-framework/utils/doctor/bun-runtime.test.ts (create)
      - __tests__/packages/luca-framework/utils/presets.test.ts (create)
---

# Plan 82-A: CLI/DX Foundation -- Status, Doctor, Presets

## Objective

Deliver three developer-experience improvements to the Luca CLI: a `bun luca status` command for at-a-glance project state, harness-aware doctor checks that validate the Bun runtime and detect drift, and progressive config presets (Starter / Standard / Full) that simplify onboarding. All three features are independent and can be implemented in parallel within a single wave.

## Context

@packages/luca-framework/src/index.ts -- CLI entry point (44 lines). Uses Citty `defineCommand` with lazy-loaded subcommands. The `status` command will be registered here alongside `init`, `update`, `doctor`, and `run:*`.

@packages/luca-framework/src/commands/doctor.ts -- Doctor command definition. Delegates to `executeDoctor()` from the doctor utility module.

@packages/luca-framework/src/utils/doctor/index.ts -- Doctor executor (97 lines). Imports checks, runs them in parallel, formats output. Currently imports `nodeVersionCheck`, `cursorIdeCheck`, `configValidationCheck`, and `harnessInstallationCheck`.

@packages/luca-framework/src/utils/doctor/types.ts -- `DoctorCheck` interface: `{ name: string; run(): Promise<CheckResult> }`. `CheckResult`: `{ name, status, message, fixCommand, details }`.

@packages/luca-framework/src/utils/doctor/checks/node-version.ts -- Node.js version check (32 lines). Will be replaced with Bun runtime check.

@packages/luca-framework/src/utils/doctor/checks/harness-installation.ts -- Per-harness directory check (82 lines). Already checks `.claude/`, `.cursor/`, `.pi/` subdirectories against a `HARNESS_DIRS` map. Will be enhanced with more granular file-level validation.

@packages/luca-framework/src/utils/doctor/checks/config-validation.ts -- Config schema validation (134 lines). Already validates required fields, branding, and workTracker. Will be complemented by Zod-based schema validation.

@packages/luca-framework/src/utils/manifest.ts -- Manifest utilities (313 lines). Provides `readManifest()`, `hashFile()`, `hashContent()`, `compareFiles()`. The status command and drift check will use `readManifest()` and `hashFile()`.

@packages/luca-framework/src/utils/wizard.ts -- Interactive wizard (359 lines). Uses `@clack/prompts`. Flows: branding -> stack -> harnesses -> workTracker -> confirm. Preset selection will be inserted after stack selection, before harness selection.

@packages/luca-framework/src/types.ts -- Core types (98 lines). `LucaConfig`, `LucaManifest`, `HarnessId`, `BrandingConfig`, `ApprovalConfig`. Preset field will be added to `LucaConfig`.

@packages/luca-framework/src/state/bridge.ts -- State machine bridge CLI. Provides `read-status`, `read-complexity`, `ensure-init`, and transition commands. The status command will use this to display state machine status.

@packages/luca-framework/src/utils/logger.ts -- Logger utility (36 lines). Provides `logger.box()`, `logger.info()`, `logger.success()`, etc. The status command will use `logger.box()` for formatted output.

## Tasks

### Task 1: Create `bun luca status` command (82-A-T1)

**Requirements:** R3.1, R3.2, R3.3, R3.4

**Goal:** Create a new `status` subcommand that displays a formatted summary of the current Luca project state, including version, active harnesses, config profile, file counts, and state machine status.

**Files:** `packages/luca-framework/src/commands/status.ts` (create), `packages/luca-framework/src/index.ts` (modify)

**Steps:**

1. Create `packages/luca-framework/src/commands/status.ts` using `defineCommand` from Citty:

   ```typescript
   import { defineCommand } from "citty";

   export const statusCommand = defineCommand({
     meta: {
       name: "status",
       description: "Show Luca project status",
     },
     args: {
       json: {
         type: "boolean",
         description: "Output as JSON for CI consumption",
         default: false,
       },
     },
     async run({ args }) {
       // Implementation
     },
   });
   ```

2. Inside the `run` handler:
   - Read manifest via `readManifest(process.cwd())` from `../utils/manifest`
   - Read `LUCA_VERSION` from `../utils/manifest`
   - If no manifest exists, print "Not a Luca project" and exit with code 1
   - Extract from manifest: `version`, `harnesses`, `branding.frameworkName`, `stack`, `workTracker`
   - Count files per harness by filtering `manifest.files` entries by their `source` field (e.g., `harness:claude`, `harness:cursor`)
   - Count total framework files (`source === "framework"`)
   - Read state machine status via the bridge: shell out to `bun run packages/luca-framework/src/state/bridge.ts read-status` and parse the JSON, with graceful fallback to `{ status: "unknown" }` on error
   - If `args.json` is true, output the collected data as a single JSON object and return
   - Otherwise, format with `logger.box()` showing a structured summary:

     ```
     Luca v2.4.0 (Luca)

     Stack:      react-ts
     Tracker:    github
     Harnesses:  claude, cursor, pi
     Preset:     standard

     Files:
       Framework:  12
       claude:     8
       cursor:     8
       pi:         2

     State:      idle (no active phase)
     ```

3. Register in `packages/luca-framework/src/index.ts` by adding to `subCommands`:

   ```typescript
   status: () => import("./commands/status").then((m) => m.statusCommand),
   ```

**Verification:**

- [ ] `bun luca status` prints formatted project summary in a Luca project
- [ ] `bun luca status --json` prints valid JSON with all fields
- [ ] Running outside a Luca project prints error and exits with code 1
- [ ] Harness file counts are accurate per manifest
- [ ] State machine status displays correctly (or graceful "unknown" fallback)
- [ ] `bunx --bun tsc --noEmit` passes

### Task 2: Replace node-version check with bun-runtime check (82-A-T2)

**Requirements:** R4.1

**Goal:** The doctor command should validate the Bun runtime (not Node.js) since this project requires Bun. Replace the `node-version.ts` check with a `bun-runtime.ts` check.

**Files:** `packages/luca-framework/src/utils/doctor/checks/bun-runtime.ts` (create), `packages/luca-framework/src/utils/doctor/checks/node-version.ts` (delete), `packages/luca-framework/src/utils/doctor/checks/index.ts` (modify), `packages/luca-framework/src/utils/doctor/index.ts` (modify)

**Steps:**

1. Create `packages/luca-framework/src/utils/doctor/checks/bun-runtime.ts`:

   ```typescript
   import type { CheckResult, DoctorCheck } from "../types";

   /** Minimum supported Bun version */
   const MIN_BUN_VERSION = "1.0.0";

   export const bunRuntimeCheck: DoctorCheck = {
     name: "Bun Runtime",

     async run(): Promise<CheckResult> {
       // Check if Bun global is available
       if (typeof Bun === "undefined") {
         return {
           name: this.name,
           status: "fail",
           message: "Bun runtime not detected",
           fixCommand:
             "curl -fsSL https://bun.sh/install | bash  # install Bun\nhttps://bun.sh/  # or visit website",
           details:
             "Luca requires Bun as its runtime. Node.js is not sufficient.",
         };
       }

       const currentVersion = Bun.version;
       const [major] = currentVersion.split(".").map(Number);

       if (major >= 1) {
         return {
           name: this.name,
           status: "pass",
           message: `Bun ${currentVersion} (${MIN_BUN_VERSION}+ required)`,
           fixCommand: null,
           details: null,
         };
       }

       return {
         name: this.name,
         status: "fail",
         message: `Bun ${currentVersion} (${MIN_BUN_VERSION}+ required)`,
         fixCommand: "bun upgrade  # upgrade to latest Bun",
         details: `Luca requires Bun ${MIN_BUN_VERSION} or later`,
       };
     },
   };
   ```

2. Delete `packages/luca-framework/src/utils/doctor/checks/node-version.ts`.

3. Update `packages/luca-framework/src/utils/doctor/checks/index.ts`:
   - Remove `export { nodeVersionCheck } from './node-version';`
   - Add `export { bunRuntimeCheck } from './bun-runtime';`

4. Update `packages/luca-framework/src/utils/doctor/index.ts`:
   - Replace `const { nodeVersionCheck } = await import("./checks/node-version");` with `const { bunRuntimeCheck } = await import("./checks/bun-runtime");`
   - Replace `nodeVersionCheck` with `bunRuntimeCheck` in the `checks` array

**Verification:**

- [ ] `bun luca doctor` shows "Bun Runtime" check (not "Node.js Version")
- [ ] Check passes with current Bun version
- [ ] `node-version.ts` file is deleted
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes with no regressions

### Task 3: Add per-harness directory validation and drift detection (82-A-T3)

**Requirements:** R4.2, R4.3, R4.4

**Goal:** Enhance doctor with per-harness file-level validation (not just directory existence) and add a drift detection check that compares manifest hashes with current file hashes on disk.

**Files:** `packages/luca-framework/src/utils/doctor/checks/harness-installation.ts` (modify), `packages/luca-framework/src/utils/doctor/checks/drift-detection.ts` (create), `packages/luca-framework/src/utils/doctor/checks/index.ts` (modify), `packages/luca-framework/src/utils/doctor/index.ts` (modify)

**Steps:**

1. **Enhance harness-installation.ts** -- The existing check already validates per-harness subdirectories (`HARNESS_DIRS` map). Extend it to also verify that key files exist within each expected subdirectory. Add a `HARNESS_FILES` map:

   ```typescript
   const HARNESS_FILES: Record<HarnessId, string[]> = {
     claude: ["settings.json"],
     cursor: ["rules/"],
     pi: [],
   };
   ```

   After the existing subdirectory check loop, add a file existence check loop. If expected files are missing, add them to `issues` as warnings (not failures, since files may not exist in all configurations).

2. **Create drift-detection.ts** -- A new doctor check that reads the manifest and compares stored hashes against current file hashes on disk:

   ```typescript
   import { join } from "pathe";
   import type { CheckResult, DoctorCheck } from "../types";
   import { readManifest, hashFile } from "../../manifest";

   export const driftDetectionCheck: DoctorCheck = {
     name: "Drift Detection",

     async run(): Promise<CheckResult> {
       const cwd = process.cwd();
       const manifest = await readManifest(cwd);

       if (!manifest) {
         return {
           name: this.name,
           status: "warning",
           message: "No manifest found -- cannot check drift",
           fixCommand: "bunx luca init",
           details: "Manifest required for drift detection.",
         };
       }

       const drifted: string[] = [];
       const missing: string[] = [];
       let checked = 0;

       for (const [relativePath, entry] of Object.entries(manifest.files)) {
         const absolutePath = join(cwd, relativePath);
         try {
           const exists = await Bun.file(absolutePath).exists();
           if (!exists) {
             missing.push(relativePath);
             continue;
           }
           const currentHash = await hashFile(absolutePath);
           if (currentHash !== entry.originalHash) {
             drifted.push(relativePath);
           }
           checked++;
         } catch {
           missing.push(relativePath);
         }
       }

       if (drifted.length === 0 && missing.length === 0) {
         return {
           name: this.name,
           status: "pass",
           message: `${checked} files match manifest hashes`,
           fixCommand: null,
           details: null,
         };
       }

       const details: string[] = [];
       if (drifted.length > 0) {
         details.push(`Modified: ${drifted.join(", ")}`);
       }
       if (missing.length > 0) {
         details.push(`Missing: ${missing.join(", ")}`);
       }

       return {
         name: this.name,
         status: drifted.length > 0 ? "warning" : "warning",
         message: `${drifted.length} modified, ${missing.length} missing (of ${Object.keys(manifest.files).length} tracked)`,
         fixCommand: "bunx luca update --force",
         details: details.join("\n"),
       };
     },
   };
   ```

   Key design choice: drift is a **warning**, not a failure. Users are expected to modify framework files (user-modified status is normal). The drift check surfaces awareness, not enforcement.

3. **Update checks/index.ts** -- Add `export { driftDetectionCheck } from './drift-detection';`

4. **Update doctor/index.ts** -- Import and add `driftDetectionCheck` to the checks array:
   ```typescript
   const { driftDetectionCheck } = await import("./checks/drift-detection");
   ```
   Add to `checks` array after `harnessInstallationCheck`.

**Verification:**

- [ ] `bun luca doctor` shows "Harness Installation" check with file-level detail
- [ ] `bun luca doctor` shows "Drift Detection" check with hash comparison results
- [ ] Modified files show as warnings (not failures)
- [ ] Missing manifest gracefully degrades to warning
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes with no regressions

### Task 4: Create progressive config presets (82-A-T4)

**Requirements:** R5.1, R5.2, R5.3

**Goal:** Define three preset tiers (Starter, Standard, Full) that map to valid config defaults, add the preset field to `LucaConfig`, and integrate preset selection into the wizard flow.

**Files:** `packages/luca-framework/src/utils/presets.ts` (create), `packages/luca-framework/src/types.ts` (modify), `packages/luca-framework/src/utils/wizard.ts` (modify)

**Steps:**

1. **Add preset type to types.ts** -- Add `PresetId` type and optional `preset` field to `LucaConfig`:

   ```typescript
   /** Progressive configuration preset tiers */
   export type PresetId = "starter" | "standard" | "full";

   export interface LucaConfig {
     branding: BrandingConfig;
     stack: string;
     workTracker: "jira" | "github" | "none";
     harnesses?: HarnessId[];
     approvals?: ApprovalConfig;
     /** Progressive config preset tier */
     preset?: PresetId;
   }
   ```

   Also add `PresetId` to the re-exports in `packages/luca-framework/src/index.ts`.

2. **Create presets.ts** -- Define the three presets with their config overrides:

   ```typescript
   import type { PresetId, ApprovalConfig, HarnessId } from "../types";

   /**
    * Preset configuration shape.
    *
    * Each preset defines overrides for LucaConfig fields.
    * Fields not specified inherit from user input or defaults.
    */
   export interface PresetDefaults {
     /** Display name for the preset */
     label: string;
     /** Short description shown in wizard */
     description: string;
     /** Default harnesses for this preset */
     harnesses: HarnessId[];
     /** Approval gate defaults */
     approvals: ApprovalConfig;
   }

   /**
    * Progressive config presets.
    *
    * - Starter: Minimal setup for learning and small projects
    * - Standard: Balanced defaults for typical projects (current behavior)
    * - Full: All features enabled, thorough verification
    */
   export const PRESETS: Record<PresetId, PresetDefaults> = {
     starter: {
       label: "Starter",
       description: "Minimal setup -- fast scaffolding, fewer files",
       harnesses: ["claude"],
       approvals: {
         plans: false,
         destructive: true,
         external: false,
         custom_triggers: [],
       },
     },
     standard: {
       label: "Standard",
       description: "Balanced defaults for typical projects",
       harnesses: ["claude", "cursor"],
       approvals: {
         plans: true,
         destructive: true,
         external: false,
         custom_triggers: [],
       },
     },
     full: {
       label: "Full",
       description: "All features enabled, thorough verification",
       harnesses: ["claude", "cursor", "pi"],
       approvals: {
         plans: true,
         destructive: true,
         external: true,
         custom_triggers: [],
       },
     },
   };

   export const VALID_PRESETS: readonly PresetId[] = [
     "starter",
     "standard",
     "full",
   ] as const;

   export const DEFAULT_PRESET: PresetId = "standard";

   /**
    * Get preset defaults by ID.
    *
    * @param presetId - The preset tier to look up
    * @returns PresetDefaults for the given preset
    */
   export function getPresetDefaults(presetId: PresetId): PresetDefaults {
     return PRESETS[presetId];
   }
   ```

3. **Add preset selection to wizard.ts** -- Insert a `p.select()` step after the stack selection (line 123, after the `if (p.isCancel(stack))` block) and before the harness selection (line 131):

   ```typescript
   // Group 2.25: Preset selection
   const preset = await p.select({
     message: "Choose a configuration preset",
     options: [
       {
         value: "starter",
         label: "Starter",
         hint: "Minimal -- single harness, fewer approval gates",
       },
       {
         value: "standard",
         label: "Standard",
         hint: "Balanced defaults (recommended)",
       },
       {
         value: "full",
         label: "Full",
         hint: "All features, all harnesses, thorough verification",
       },
     ],
     initialValue: "standard",
   });

   if (p.isCancel(preset)) {
     p.cancel("Setup cancelled.");
     return null;
   }
   ```

   Then use the preset to set `initialValues` for the harness multiselect:

   ```typescript
   const presetDefaults = getPresetDefaults(preset as PresetId);

   const harnesses = await p.multiselect({
     message: "Which AI harness platforms do you use?",
     options: [
       { value: "claude", label: "Claude Code", hint: "(.claude/ directory)" },
       { value: "cursor", label: "Cursor IDE", hint: "(.cursor/ directory)" },
       { value: "pi", label: "Pi", hint: "(.pi/ directory)" },
     ],
     initialValues: presetDefaults.harnesses,
     required: true,
   });
   ```

   Include `preset` in the returned `LucaConfig`:

   ```typescript
   return {
     branding: branding as BrandingConfig,
     stack: stack as string,
     workTracker: workTracker as "jira" | "github" | "none",
     harnesses: harnesses as HarnessId[],
     preset: preset as PresetId,
     approvals: presetDefaults.approvals,
   };
   ```

4. **Update `createConfigFromArgs`** in wizard.ts to accept an optional `--preset` argument and apply preset defaults using `defu`:

   ```typescript
   import { defu } from "defu";
   import { getPresetDefaults, DEFAULT_PRESET, VALID_PRESETS } from "./presets";
   import type { PresetId } from "../types";
   ```

   Add `preset?: string` to the args parameter. Validate and apply:

   ```typescript
   if (args.preset && !VALID_PRESETS.includes(args.preset as PresetId)) {
     throw new Error(
       `Invalid --preset value "${args.preset}". Valid options: ${VALID_PRESETS.join(", ")}`,
     );
   }

   const presetId = (args.preset as PresetId) || DEFAULT_PRESET;
   const presetDefaults = getPresetDefaults(presetId);
   ```

   Use `defu` to merge user-provided config with preset defaults (user args take precedence):

   ```typescript
   return defu(
     {
       branding: mergeBranding({
         frameworkName: args.name,
         commandPrefix: args.prefix,
       }),
       stack: args.stack || "custom",
       workTracker: (args.tracker as "jira" | "github" | "none") || "none",
       harnesses,
       preset: presetId,
     },
     {
       approvals: presetDefaults.approvals,
     },
   ) as LucaConfig;
   ```

**Verification:**

- [ ] `PresetId` type is exported from types.ts and index.ts
- [ ] `PRESETS` record has three entries (starter, standard, full) with correct defaults
- [ ] Wizard shows preset selection after stack, before harnesses
- [ ] Selected preset pre-fills harness selection initial values
- [ ] `createConfigFromArgs({ preset: "starter" })` returns config with starter defaults
- [ ] Invalid preset value throws descriptive error
- [ ] `bunx --bun tsc --noEmit` passes

### Task 5: Wire preset into init, update, and config generation (82-A-T5)

**Requirements:** R5.4

**Goal:** Ensure the selected preset flows through the init command into the generated `config.json` and `manifest.json`, and that preset can be changed post-init via the update command.

**Files:** `packages/luca-framework/src/commands/init.ts` (modify), `packages/luca-framework/src/commands/update.ts` (modify), `packages/luca-framework/src/utils/wizard.ts` (modify)

**Steps:**

1. **Update init command** -- The init command calls `runWizard()` or `createConfigFromArgs()` to get a `LucaConfig`. Since Task 4 already adds `preset` to the returned config, the init command should:
   - Add `--preset` as a CLI argument in the command definition
   - Pass `args.preset` through to `createConfigFromArgs()` when in non-interactive mode
   - The generated `config.json` will automatically include the `preset` field since it serializes the full `LucaConfig`

2. **Update init command args**:

   ```typescript
   args: {
     // ... existing args ...
     preset: {
       type: "string",
       description: "Config preset tier: starter, standard, full",
     },
   },
   ```

3. **Update update command** -- Allow `--preset` to change the preset post-init:
   - Add `--preset` argument to the update command definition
   - When `--preset` is provided, re-read current config, apply new preset defaults via `defu`, and write updated config.json
   - Log the preset change to the user

4. **Ensure config.json includes preset** -- Verify that the config serialization in the init flow writes the `preset` field. The existing init command writes config via `JSON.stringify(config, null, 2)`, so the `preset` field on `LucaConfig` will be included automatically.

5. **Ensure manifest.json includes preset** -- The `LucaManifest` type does not currently include `preset`. Consider whether preset belongs in manifest (it reflects installation-time choices). Decision: store preset only in `config.json`, not in manifest, since preset can be changed post-init and config.json is the mutable configuration file.

**Verification:**

- [ ] `bun luca init --preset=starter` generates config.json with `"preset": "starter"`
- [ ] `bun luca init` interactive mode includes preset in generated config.json
- [ ] `bun luca update --preset=full` updates config.json preset field
- [ ] Preset defaults (approvals, harnesses) apply correctly via `defu` merge
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes with no regressions

### Task 6: Add tests for status, doctor, and presets (82-A-T6)

**Goal:** Cover the new functionality with unit tests to prevent regressions and validate behavior.

**Files:** `__tests__/packages/luca-framework/commands/status.test.ts` (create), `__tests__/packages/luca-framework/utils/doctor/bun-runtime.test.ts` (create), `__tests__/packages/luca-framework/utils/presets.test.ts` (create)

**Steps:**

1. **Status command tests** (`status.test.ts`):
   - Test that the status command module exports `statusCommand` with correct Citty metadata
   - Test JSON output parsing: mock `readManifest` to return a known manifest, invoke the command logic, verify JSON output contains expected fields (`version`, `harnesses`, `stack`, `workTracker`, `fileCounts`)
   - Test error case: when no manifest exists, verify exit code or error message

2. **Bun runtime check tests** (`bun-runtime.test.ts`):
   - Test that `bunRuntimeCheck.run()` returns `status: "pass"` with current Bun version
   - Test that the check name is "Bun Runtime"
   - Test that the message includes the Bun version string
   - Test the minimum version logic (Bun.version is always >= 1.0.0 in practice, so this mainly validates the pass path)

3. **Preset tests** (`presets.test.ts`):
   - Test that `PRESETS` has exactly three entries: `starter`, `standard`, `full`
   - Test that each preset has required fields: `label`, `description`, `harnesses`, `approvals`
   - Test `getPresetDefaults("starter")` returns starter config
   - Test `getPresetDefaults("standard")` returns standard config
   - Test `getPresetDefaults("full")` returns full config
   - Test that starter has fewer harnesses than full
   - Test that `VALID_PRESETS` includes all three preset IDs
   - Test that `DEFAULT_PRESET` is "standard"
   - Test that approval gates differ between presets (e.g., starter.approvals.plans === false, full.approvals.external === true)

4. Use `import { test, expect, describe } from "bun:test"` for all test files per project conventions.

**Verification:**

- [ ] `bun test __tests__/packages/luca-framework/commands/status.test.ts` passes
- [ ] `bun test __tests__/packages/luca-framework/utils/doctor/bun-runtime.test.ts` passes
- [ ] `bun test __tests__/packages/luca-framework/utils/presets.test.ts` passes
- [ ] All existing tests continue to pass: `bun test`
- [ ] `bunx --bun tsc --noEmit` passes

## Success Criteria

- [ ] `bun luca status` shows version, harnesses, config profile, file counts, and state machine status
- [ ] `bun luca status --json` outputs valid JSON for CI consumption
- [ ] `bun luca doctor` checks Bun runtime (not Node.js) and reports version
- [ ] `bun luca doctor` validates per-harness directory structure with file-level detail
- [ ] `bun luca doctor` detects drift between manifest hashes and current file hashes
- [ ] Three config presets exist: Starter (minimal), Standard (default), Full (everything)
- [ ] Wizard offers preset selection during init
- [ ] Preset can be changed post-init via `bun luca update --preset=<tier>`
- [ ] All new code has corresponding tests
- [ ] `bun test` passes
- [ ] `bunx --bun tsc --noEmit` passes
