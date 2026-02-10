---
phase: 01
plan: 04
subsystem: cli
tags: [wizard, clack, file-generation, manifest, cleanup]
dependency-graph:
  requires: [01-02, 01-03]
  provides: [init-wizard, file-generation, manifest-tracking]
  affects: [01-05]
tech-stack:
  added: []
  patterns: [cleanup-handler, atomic-file-generation, sha256-hashing]
key-files:
  created:
    - packages/luca-framework/src/utils/wizard.ts
    - packages/luca-framework/src/utils/files.ts
    - packages/luca-framework/src/utils/manifest.ts
  modified:
    - packages/luca-framework/src/commands/init.ts
    - packages/luca-framework/src/utils/branding.ts
    - packages/luca-framework/src/utils/template.ts
    - packages/luca-framework/templates/base/.cursor/
    - packages/luca-framework/templates/base/.planning/
decisions:
  - decision: "Filter undefined before spread merge"
    rationale: "Spread operator includes undefined, breaking default fallbacks"
  - decision: "Detect dist vs src context for template paths"
    rationale: "Bundled output lives in dist/, requires different relative path"
  - decision: "Track created paths for cleanup"
    rationale: "SIGINT and errors must clean up partial installations"
metrics:
  duration: "~25 minutes"
  completed: 2026-02-04
---

# Phase 1 Plan 4: Init Wizard & File Generation Summary

**One-liner:** Complete init command with @clack/prompts wizard, file generation with cleanup, and manifest tracking with SHA-256 hashes.

## What Was Accomplished

Implemented the full initialization workflow for Luca:

1. **Interactive Wizard** (`wizard.ts`)
   - Beautiful @clack/prompts UI with intro, groups, selects
   - Branding questions with inline validation
   - Stack selection with detection hints
   - Work tracker selection (Jira, GitHub, None)
   - Confirmation before file generation
   - Support for cancel at any point

2. **File Generation** (`files.ts`)
   - Directory structure creation with tracking
   - Base template copying with branding substitution
   - Stack-specific template support (placeholder for future)
   - Framework file installation
   - SIGINT handler for cleanup on Ctrl+C
   - Error recovery with automatic cleanup

3. **Manifest Tracking** (`manifest.ts`)
   - SHA-256 hashing for file content
   - Track original hash and source (framework vs user)
   - Version, timestamp, and configuration storage
   - Read/write manifest utilities for future updates

4. **Init Command Wiring** (`init.ts`)
   - Three modes: interactive, quick, config file
   - Existing installation detection
   - Success output with next steps
   - Clean error handling

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 4d28536 | feat | Create interactive wizard with @clack/prompts |
| 25f6429 | feat | Create file generation and cleanup utilities |
| c55ce81 | feat | Create manifest utilities with file hashing |
| 3ba03de | feat | Wire init command to wizard and file generation |
| a6c1adc | fix | Filter undefined values in mergeBranding |
| ce61dae | fix | Correct getTemplatesDir path for bundled context |
| 6c3e1c2 | fix | Rename template directories with leading dots |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Undefined values overriding defaults in mergeBranding**
- **Found during:** Task 4 verification
- **Issue:** `createConfigFromArgs({ name: undefined })` caused `{ ...defaults, name: undefined }` to have undefined frameworkName
- **Fix:** Filter out undefined values before spreading in `mergeBranding()`
- **Files modified:** `packages/luca-framework/src/utils/branding.ts`
- **Commit:** a6c1adc

**2. [Rule 1 - Bug] Incorrect template path in bundled context**
- **Found during:** Task 4 verification
- **Issue:** `getTemplatesDir()` calculated path from source structure, not bundle
- **Fix:** Detect if running from `dist/` and adjust relative path accordingly
- **Files modified:** `packages/luca-framework/src/utils/template.ts`
- **Commit:** ce61dae

**3. [Rule 1 - Bug] Template directories missing leading dots**
- **Found during:** Task 4 verification
- **Issue:** Templates at `cursor/` and `planning/` generated to wrong paths
- **Fix:** Renamed to `.cursor/` and `.planning/` in template directory
- **Files modified:** `packages/luca-framework/templates/base/`
- **Commit:** 6c3e1c2

## Verification Results

### Build
- ✅ `bun run build` succeeds (41.4 kB bundle)

### Quick Mode
- ✅ `luca init --quick` creates correct structure
- ✅ `.planning/` and `.cursor/` directories created
- ✅ `manifest.json` contains file hashes
- ✅ `BRAIN.md` has substituted branding ("Luca Brain")

### Explicit Args Mode
- ✅ `luca init --name MyBot --prefix mb` uses custom branding
- ✅ Output shows "MyBot initialized!"
- ✅ BRAIN.md shows "# MyBot Brain"

### Config File Mode
- ✅ `luca init --config test.json` reads configuration
- ✅ All branding values applied from file

### Error Handling
- ✅ Existing installation detected and reported
- ✅ Invalid config file shows helpful error

## Files Created

```
packages/luca-framework/src/utils/
├── wizard.ts      # @clack/prompts wizard (220 lines)
├── files.ts       # File generation & cleanup (231 lines)
└── manifest.ts    # Manifest utilities (129 lines)
```

## Key APIs Delivered

```typescript
// wizard.ts
runWizard(context: ProjectContext): Promise<LucaConfig | null>
createConfigFromArgs(args): LucaConfig
loadConfigFromFile(path: string): Promise<LucaConfig>

// files.ts
generateFiles(options): Promise<{ success, manifest?, error? }>
cleanupFiles(): Promise<void>
setupCleanupHandler(): void

// manifest.ts
hashFile(path: string): Promise<string>
createManifest(options): Promise<LucaManifest>
writeManifest(manifest, cwd): Promise<void>
readManifest(cwd): Promise<LucaManifest | null>
```

## Next Phase Readiness

Ready for Plan 01-05 (Polish & Documentation):
- All core functionality working
- No framework templates yet (shows "Framework templates not found" - expected)
- Stack templates beyond base are placeholders
- Interactive wizard can be tested manually

## Open Items for Future

1. **Framework templates** - `.cursor/luca/` content not yet defined
2. **Stack templates** - `react-ts` stack template not implemented
3. **Version injection** - LUCA_VERSION hardcoded as "0.0.1"
4. **Interactive mode testing** - Requires manual testing (TTY prompts)

---

*Summary generated: 2026-02-04*
