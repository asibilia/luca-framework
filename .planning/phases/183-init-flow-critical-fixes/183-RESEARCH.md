# Phase 183: Init Flow Critical Fixes - Research

**Researched:** 2026-03-17
**Domain:** CLI init flow, MuninnDB binary management, vault initialization
**Confidence:** HIGH

## Summary

This research investigates the two P0 bugs in the `luca init` global install flow: (1) the MuninnDB download URL 404 and (2) `vault:init` deploying the full harness to the project `.claude/` directory instead of only creating `.planning/` config files in global mode.

All six key files have been read and analyzed. The bugs are well-localized, the fix sites are clear, and the existing infrastructure (runtime context detection, health check utilities, binary status checks) provides the building blocks needed. The CONTEXT.md from phase-discuss has locked the approach for all four gray areas.

**Primary recommendation:** Fix the download URL pattern first (unblocks binary availability), then gate vault:init behavior on runtime mode, then add the health-gate and binary verification improvements.

## Per-File Findings

### 1. `packages/luca-framework/src/utils/muninndb-download.ts`

**Purpose:** Builds download URLs, fetches binary, writes to disk, verifies checksum.

**Key constants (lines 25-34):**

```
MUNINNDB_DOWNLOAD_BASE = "https://github.com/nicholasgasior/muninn/releases/download"
MUNINNDB_DEFAULT_VERSION = process.env.MUNINNDB_VERSION ?? "latest"
```

**The Bug (REQ-01) -- `buildDownloadUrl()` (lines 119-131):**

- Constructs URL: `{base}/{version}/muninndb-{target}`
- When version is `"latest"`, this produces: `.../releases/download/latest/muninndb-darwin-arm64`
- GitHub does NOT support this pattern. The correct patterns are:
  - **Tag-based (preferred):** `.../releases/download/v0.5.0/muninndb-darwin-arm64`
  - **Latest redirect:** `.../releases/latest/download/muninndb-darwin-arm64` (note: `latest` comes BEFORE `download`)
- The current base URL ends with `/download`, so appending `latest` makes it `/download/latest/` which is wrong.

**Additional finding:** The GitHub repo `nicholasgasior/muninn` returns 404 from the GitHub API (`gh api repos/nicholasgasior/muninn/releases/latest`). This means either:

- The repo is private/nonexistent at that path
- The repo name has changed
- This needs to be verified with the actual repo owner

**Impact:** This 404 is the root cause of all MuninnDB download failures in global mode.

**Functions in this file:**
| Function | Lines | Purpose | Needs Change? |
|----------|-------|---------|---------------|
| `validateDownloadUrl()` | 55-76 | HTTPS validation | No |
| `resolvePlatformForDownload()` | 92-96 | Platform target resolution | No |
| `buildDownloadUrl()` | 119-131 | URL construction | **YES -- core bug** |
| `fetchChecksumSidecar()` | 169-191 | SHA-256 sidecar fetch | No |
| `verifyBinaryChecksum()` | 209-219 | SHA-256 verification | No |
| `downloadMuninndbBinary()` | 252-379 | Download orchestrator | **YES -- add tag resolution, binary verification** |

### 2. `packages/luca-framework/src/commands/vault-init.ts`

**Purpose:** The `luca vault:init` command for per-project initialization.

**The Bug (REQ-04) -- `generateFiles()` call (line 181):**

```typescript
const result = await generateFiles({ config });
```

- This unconditionally calls `generateFiles()` which deploys the FULL harness (39 agents, 49 skills, 23 rules, 9 hooks, settings.json) into the project directory.
- In global mode, Step 3 of `luca init` already deploys these to `~/.claude/`. Running `generateFiles()` again duplicates them into the project's `.claude/`, which is wrong.

**Key observation:** The file does NOT import or call `detectRuntimeContext()`. There is no global vs dev mode check.

**What `generateFiles()` does (from `files.ts` lines 127-522):**

- Creates `.planning/`, `.claude/`, `.cursor/`, `.pi/` directories
- Copies base templates (BRAIN.md, config.json, WORKING.md, etc.) to `.planning/`
- Copies stack-specific templates
- Copies framework files to `.cursor/luca/`
- Installs Claude Code hooks to `.claude/hooks/`
- Installs Cursor hooks to `.cursor/hooks/`
- Copies per-harness templates (agents, rules, skills, settings) to `.claude/`, `.cursor/`, `.pi/`
- Creates manifest

**What vault:init should do in global mode:**

- Only create `.planning/` directory and its config files (config.json, BRAIN.md)
- Skip ALL harness file generation (`.claude/`, `.cursor/`, `.pi/`)
- Still run the vault wizard (steps at lines 198-248)

**Functions in this file:**
| Function | Lines | Purpose | Needs Change? |
|----------|-------|---------|---------------|
| `vaultInitCommand.run()` | 109-291 | Main command handler | **YES -- add mode detection, conditional file generation** |

### 3. `packages/luca-framework/src/commands/init.ts`

**Purpose:** The `luca init` global setup orchestrator (5-step flow).

**Step 2: MuninnDB (lines 557-619):**

- Calls `checkMuninndbBinary()` to check if binary exists
- If not installed, calls `downloadMuninndbBinary()` (which will 404 -- Bug 1)
- After download/detection, re-checks binary and starts service via `startMuninndb()`
- `startMuninndb()` returns `MuninndbServiceStatus` with `.healthy` boolean
- Tracks `muninndbHealthy` state variable (line 518)

**Step 4/5: Vault setup (lines 639-665):**

- Checks if cwd has `package.json`
- If yes, prompts to run `vault:init`
- Calls `runMain(vaultInitCommand)` which runs the full vault:init command
- Does NOT pass any context about MuninnDB health status to vault:init

**Key gap (REQ-03):** There is no health gate between Step 2 and Step 4. Even if MuninnDB fails to download or start, the vault setup still proceeds and prompts for an API key (which requires MuninnDB to be running to generate).

**Functions in this file:**
| Function | Lines | Purpose | Needs Change? |
|----------|-------|---------|---------------|
| `runDeployStep()` | 91-326 | Artifact deployment to ~/.claude/ | No |
| `initCommand.run()` | 507-737 | Main init orchestrator | **YES -- add health gate before vault step** |

### 4. `packages/luca-framework/src/utils/vault-setup.ts`

**Purpose:** Vault wizard flow -- vault name suggestion, API key prompt, config writing.

**`runVaultWizard()` (lines 140-216):**

- Shows vault name prompt
- Shows API key guidance (references MuninnDB Web UI at `http://localhost:8477`)
- Prompts for API key
- Does NOT check if MuninnDB is running before showing the API key prompt

**`verifyVaultConnection()` (lines 374-381):**

- Already delegates to `checkMuninndbService()` to check health
- Returns boolean
- Currently called AFTER vault wizard completes (vault-init.ts line 234)

**Key gap (REQ-03):** `runVaultWizard()` should check MuninnDB health BEFORE prompting for API key. If unhealthy, return early with advice to run `luca vault:init` later.

**Functions in this file:**
| Function | Lines | Purpose | Needs Change? |
|----------|-------|---------|---------------|
| `suggestVaultName()` | 84-90 | Derive vault name from context | No |
| `sanitizeVaultName()` | 107-113 | Kebab-case sanitization | No |
| `runVaultWizard()` | 140-216 | Interactive vault wizard | **YES -- add health pre-check** |
| `writeVaultConfig()` | 234-258 | Write vault name to config.json | No |
| `writeApiKeyToEnv()` | 280-310 | Write API key to .env | No |
| `ensureEnvInGitignore()` | 327-349 | Protect .env in .gitignore | No |
| `verifyVaultConnection()` | 374-381 | Health check delegation | No |

### 5. `packages/luca-framework/src/utils/runtime-context.ts`

**Purpose:** Detects whether Luca is running from global install or monorepo dev mode.

**`detectRuntimeContext()` (lines 44-56):**

- Uses `import.meta.dir` to determine script location
- Checks if path contains `packages/luca-framework/` to determine dev mode
- Returns `{ mode: "global" | "dev", packageDir: string, homeDir: string }`

**IMPORTANT:** The CONTEXT.md references `isGlobalInstall()` but this function does NOT exist. The equivalent is:

```typescript
const ctx = detectRuntimeContext();
const isGlobal = ctx.mode === "global";
```

**Functions in this file:**
| Function | Lines | Purpose | Needs Change? |
|----------|-------|---------|---------------|
| `detectRuntimeContext()` | 44-56 | Mode detection | No (already works) |
| `resolveMonorepoRoot()` | 74-80 | Find monorepo root | No |

### 6. `packages/luca-framework/src/utils/muninndb-service.ts`

**Purpose:** Start/stop/restart MuninnDB service, get status.

**`startMuninndb()` (lines 57-122):**

- Checks if already running via `checkMuninndbService()`
- Spawns detached process via `Bun.spawn()`
- Writes PID to pidfile
- Calls `waitForMuninndbHealthy()` to poll health endpoint
- Returns `MuninndbServiceStatus` with `.healthy`, `.port`, `.pid`, `.running`

**Functions in this file:**
| Function | Lines | Purpose | Needs Change? |
|----------|-------|---------|---------------|
| `startMuninndb()` | 57-122 | Start service | No |
| `stopMuninndb()` | 141-209 | Stop service | No |
| `restartMuninndb()` | 225-230 | Restart service | No |
| `getMuninndbStatus()` | 250-260 | Combined binary+service status | No |

### 7. `packages/luca-framework/src/utils/muninndb-health.ts`

**Purpose:** Binary existence check and service health check.

**`checkMuninndbBinary()` (lines 35-78):**

- Checks file existence via `Bun.file(path).exists()`
- Checks executable permission via `test -x`
- Attempts to get version via `muninndb --version`
- Returns `MuninndbBinaryStatus`: `{ installed, path, version, executable }`
- **Already verifies existence and executable permission** (REQ-02 partially satisfied)

**What's missing for REQ-02:** No file size > 0 check. After `downloadMuninndbBinary()` writes the file, there's no explicit verification that the file was written correctly before proceeding. The existing `checkMuninndbBinary()` checks existence and permissions but not file size.

**`checkMuninndbService()` (lines 98-146):**

- Sends GET to `http://localhost:{port}/health` with 3-second timeout
- Returns `MuninndbServiceStatus`: `{ running, port, pid, healthy }`
- This is exactly what's needed for the health gate (REQ-03)

**`waitForMuninndbHealthy()` (lines 177-196):**

- Polls `checkMuninndbService()` every 500ms up to timeout (default 10s)
- Already used by `startMuninndb()` after spawning the process

## Specific Change Recommendations

### Change 1: Fix Download URL Pattern (REQ-01)

**File:** `muninndb-download.ts`
**Location:** `buildDownloadUrl()` (lines 119-131), `downloadMuninndbBinary()` (lines 252-379)
**Confidence:** HIGH

**Problem:** When version is `"latest"`, the URL becomes `.../releases/download/latest/...` which 404s.

**Solution (from CONTEXT.md):** Add a `resolveLatestTag()` function:

1. When version is `"latest"`, fetch `https://api.github.com/repos/nicholasgasior/muninn/releases/latest`
2. Extract `tag_name` from JSON response
3. Use the resolved tag in the standard URL pattern: `.../releases/download/{tag}/...`
4. If API call fails (rate limit, network), fall back to redirect-based URL: change base to `.../releases/latest/download` (swap `latest` before `download`)

**Implementation detail:**

- Add new function `resolveLatestReleaseTag(repoSlug: string): Promise<string | null>` in `muninndb-download.ts`
- Modify `buildDownloadUrl()` to accept an async tag resolution OR make `downloadMuninndbBinary()` resolve the tag before calling `buildDownloadUrl()`
- Since `buildDownloadUrl()` is currently synchronous, the resolution should happen in `downloadMuninndbBinary()` which is already async
- Cache the resolved tag in a module-level variable to avoid repeated API calls

**Risk:** The repo `nicholasgasior/muninn` returned 404 from the GitHub API during research. The repo URL may need updating. The planner should flag this as requiring verification of the actual repo path before implementation.

### Change 2: Binary Verification After Download (REQ-02)

**File:** `muninndb-download.ts`
**Location:** `downloadMuninndbBinary()`, after line 311 (`chmod 755`)
**Confidence:** HIGH

**Problem:** After download, the code proceeds without verifying the binary is valid.

**Solution:** After writing the binary and setting permissions, verify:

1. File exists at `binaryPath` (already implicitly true since we just wrote it, but good to confirm)
2. File size > 0 bytes via `Bun.file(binaryPath).size`
3. File has executable permission via the existing `checkMuninndbBinary()` function

**Implementation detail:**

- After line 311 (`await Bun.$\`chmod 755 ${binaryPath}\`.quiet()`), add:
  ```typescript
  const fileSize = Bun.file(binaryPath).size;
  if (fileSize === 0) {
    try {
      unlinkSync(binaryPath);
    } catch {}
    return failure("Downloaded binary is empty (0 bytes)");
  }
  ```
- The existing `checkMuninndbBinary()` already verifies existence + executable permission. Could call it here for belt-and-suspenders, but the inline size check is more direct and avoids a redundant filesystem round-trip.

### Change 3: Health Gate Before API Key Prompt (REQ-03)

**Files:** `vault-setup.ts` and `init.ts`
**Locations:**

- `vault-setup.ts` `runVaultWizard()` -- add health check at top (after line 146)
- `init.ts` `initCommand.run()` -- add health gate before Step 4 (around line 640)
  **Confidence:** HIGH

**Problem:** The API key prompt shows even when MuninnDB is not running.

**Solution (from CONTEXT.md):**

In `runVaultWizard()` (vault-setup.ts):

- After line 146 (`const suggested = suggestVaultName(context, cwd)`), add a health check
- Call `checkMuninndbService()` (already imported)
- If not healthy, log warning with `p.log.warn()` and return `null` with actionable message
- Message: "MuninnDB is not running. Run `luca vault:init` later after starting MuninnDB."

In `init.ts` (belt-and-suspenders):

- Before the vault:init prompt at line 646, check `muninndbHealthy` (already tracked at line 518)
- If not healthy, skip the vault:init suggestion and log guidance

### Change 4: Detect Global Mode in vault:init (REQ-04)

**File:** `vault-init.ts`
**Location:** `vaultInitCommand.run()` (lines 109-291)
**Confidence:** HIGH

**Problem:** `generateFiles()` at line 181 deploys the full harness to the project directory, which is wrong in global mode.

**Solution (from CONTEXT.md):**

- Import `detectRuntimeContext` from `../utils/runtime-context`
- At the top of `run()`, call `const ctx = detectRuntimeContext()`
- If `ctx.mode === "global"`:
  - Skip `generateFiles()` entirely
  - Instead, create only `.planning/` directory and its config files
  - Still run the vault wizard (lines 198-248)
- If `ctx.mode === "dev"`:
  - Keep current behavior (full `generateFiles()` call)

**Implementation detail:**

- Need a lighter function (or inline code) that creates only `.planning/config.json` and `.planning/BRAIN.md` from templates
- Could extract the template-copying logic for just `.planning/` from `generateFiles()`, or create a new `generatePlanningOnly()` function
- The existing `generateFiles()` already creates `.planning/` as its first step (lines 156-183), but also creates all the harness directories. A simple approach: add a `planningOnly?: boolean` option to `generateFiles()` that short-circuits after the `.planning/` directory creation.

## Dependencies Between Changes

```
Change 1 (URL fix)
  └── Change 2 (binary verification) -- depends on download working
       └── Change 3 (health gate) -- depends on binary + service being available
            └── Change 4 (global mode) -- independent but affects flow integration

Recommended implementation order:
1. Change 1: Fix download URL (unblocks everything)
2. Change 2: Binary verification (quick follow-up to Change 1)
3. Change 4: Global mode detection in vault:init (independent, can parallel with 1-2)
4. Change 3: Health gate (integrates with all other changes)
```

## Risk Areas and Gotchas

### CRITICAL: MuninnDB Repo May Not Exist

The GitHub API returned 404 for `nicholasgasior/muninn`. Three possibilities:

1. The repo is private (unauthenticated API access denied)
2. The repo path is wrong (different owner or name)
3. The repo was deleted or renamed

**Mitigation:** Before implementing Change 1, verify the actual repo URL. Check if there's an env var override (`MUNINNDB_DOWNLOAD_BASE`) that points to the correct location. The planner should add a verification task as the very first action.

### `buildDownloadUrl()` is Synchronous

The current `buildDownloadUrl()` is a synchronous function. The GitHub API tag resolution is async. Options:

- Make the async resolution happen in `downloadMuninndbBinary()` (recommended -- it's already async)
- Keep `buildDownloadUrl()` synchronous and pass the resolved version into it

### `generateFiles()` is Not Granular

`generateFiles()` has no option to generate only `.planning/` files. Options:

- Add a `planningOnly?: boolean` parameter to `generateFiles()`
- Create a separate `generatePlanningFiles()` function
- Inline the minimal file creation in `vault-init.ts` for global mode

The cleanest approach is adding the `planningOnly` option, since the directory creation and template copying for `.planning/` is already the first step in `generateFiles()`.

### Vault Wizard Still Needs Config

Even in global mode, the vault wizard needs a `LucaConfig` to suggest vault names and write config files. The wizard flow (lines 130-178 in vault-init.ts) produces this config. So the wizard must still run in global mode -- only the `generateFiles()` call should be conditional.

### Health Check Import in vault-setup.ts

`checkMuninndbService` is already imported in vault-setup.ts (line 35). No new import needed for the health gate.

### init.ts Already Tracks Health State

The `muninndbHealthy` variable at line 518 of init.ts already tracks whether MuninnDB is healthy. This can be used directly for the health gate at Step 4.

## Standard Stack

No new dependencies needed. All changes use existing utilities:

| Utility                    | Location             | Purpose                           |
| -------------------------- | -------------------- | --------------------------------- |
| `detectRuntimeContext()`   | `runtime-context.ts` | Global vs dev mode detection      |
| `checkMuninndbService()`   | `muninndb-health.ts` | Health endpoint check             |
| `checkMuninndbBinary()`    | `muninndb-health.ts` | Binary existence/permission check |
| `waitForMuninndbHealthy()` | `muninndb-health.ts` | Polling health check              |
| `Bun.file().size`          | Bun built-in         | File size verification            |

## Architecture Patterns

### Error Recovery Pattern

All changes follow the existing pattern: try the operation, on failure log a warning and provide an actionable recovery command (`luca vault:init`). Never abort the entire init flow for a single step failure.

### Schema-First Validation

All return types are already Zod-validated (`MuninndbInstallResult`, `MuninndbServiceStatus`, `MuninndbBinaryStatus`). New code should continue parsing through these schemas.

### Functional Composition

No classes. All new functions should be pure or async functions following the existing pattern in the utils/ directory.

## Don't Hand-Roll

| Problem           | Don't Build        | Use Instead                                                           |
| ----------------- | ------------------ | --------------------------------------------------------------------- |
| Health checking   | Custom HTTP check  | `checkMuninndbService()` from `muninndb-health.ts`                    |
| Binary validation | Custom file checks | `checkMuninndbBinary()` from `muninndb-health.ts` + `Bun.file().size` |
| Mode detection    | Path heuristics    | `detectRuntimeContext()` from `runtime-context.ts`                    |
| Health polling    | Custom retry loop  | `waitForMuninndbHealthy()` from `muninndb-health.ts`                  |

## Common Pitfalls

### Pitfall 1: GitHub API Rate Limiting

**What goes wrong:** Unauthenticated GitHub API has 60 requests/hour limit.
**Why it happens:** If `resolveLatestReleaseTag()` is called repeatedly (tests, retries).
**How to avoid:** Cache the resolved tag at module scope. Fall back to redirect URL on API failure.

### Pitfall 2: Redirect-Based URL Assumptions

**What goes wrong:** The fallback URL `releases/latest/download/` may not work if the repo doesn't have a release tagged as "latest" in GitHub.
**How to avoid:** The API resolution is primary; redirect is fallback. If both fail, return a clear error.

### Pitfall 3: Race Condition Between Download and Health Check

**What goes wrong:** Starting MuninnDB immediately after download may fail if the binary needs additional setup.
**How to avoid:** The existing `waitForMuninndbHealthy()` with 10-second timeout handles this. No change needed.

### Pitfall 4: Vault Wizard Returning null in Global Mode

**What goes wrong:** If the health gate in `runVaultWizard()` returns null, the caller in vault-init.ts interprets null as "user cancelled" and shows different output.
**How to avoid:** Distinguish between "user cancelled" and "health check failed" returns. Could add a result type, or handle the health check at the caller level (init.ts) before invoking vault:init.

## Open Questions

1. **MuninnDB repo path:** Is `nicholasgasior/muninn` the correct GitHub repo path? The API returned 404. This MUST be verified before implementation.
2. **Template extraction for global mode:** Should we add a `planningOnly` parameter to `generateFiles()`, create a separate function, or inline the minimal creation? The planner should decide based on maintainability preference.
3. **Checksum sidecar on redirect URL:** If the fallback redirect URL is used, will the checksum sidecar (`{url}.sha256`) also be available at the redirected location? This may need `skipChecksum` behavior for the fallback path.

## Sources

### Primary (HIGH confidence)

- Direct file reads: `muninndb-download.ts`, `vault-init.ts`, `init.ts`, `vault-setup.ts`, `runtime-context.ts`, `muninndb-service.ts`, `muninndb-health.ts`, `muninndb-schemas.ts`, `files.ts`
- `.planning/phases/183-init-flow-critical-fixes/183-CONTEXT.md` -- locked decisions
- `.planning/REQUIREMENTS.md` -- REQ-01 through REQ-04
- `.planning/todos/done/luca-init-global-install-issues.md` -- original bug report

### Secondary (MEDIUM confidence)

- GitHub URL pattern knowledge (`.../releases/download/{tag}/...` vs `.../releases/latest/download/...`)

### Tertiary (LOW confidence)

- MuninnDB repo availability at `nicholasgasior/muninn` -- returned 404, needs verification

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH -- all utilities already exist in the codebase
- Architecture: HIGH -- changes follow existing patterns exactly
- Pitfalls: HIGH -- identified from direct code reading and API testing
- Repo URL validity: LOW -- could not verify the MuninnDB GitHub repo exists

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable domain, no fast-moving dependencies)
