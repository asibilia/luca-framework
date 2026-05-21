---
phase: 176
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: [173, 175]
---

# Phase 176 Plan 1: Vault Setup & Init Flow Integration

## Objective

Add MuninnDB vault setup to the `luca vault:init` command and wire the complete 5-step init flow together. Currently `vault:init` handles project scaffolding (branding, stack, wizard) but has zero MuninnDB vault awareness -- no vault name suggestion, no API key handling, no `.env` writing, no `.gitignore` safety. This phase closes that gap so a single `luca init` run gets a user from zero to a fully wired Luca installation with cognitive memory.

## Context

@packages/luca-framework/src/commands/init.ts — Global orchestrator (prereqs, MuninnDB binary, deploy, suggests vault:init)
@packages/luca-framework/src/commands/vault-init.ts — Per-project wizard (branding, stack, tracker) -- needs vault wiring
@packages/luca-framework/src/utils/wizard.ts — Interactive wizard logic
@packages/luca-framework/src/utils/detect.ts — Project context detection
@packages/luca-framework/src/utils/files.ts — File generation
@packages/luca-framework/src/types.ts — LucaConfig type
@.planning/config.json — Example config with `muninn.vault` field

## Tasks

### 1. Create vault-setup utility module

**Type:** auto
**TDD:** false
**Depends on:** none

Create `packages/luca-framework/src/utils/vault-setup.ts` with the core vault setup functions:

1. `suggestVaultName(context: ProjectContext): string` — Derive a vault name from project context (package.json name, directory name, or prompt). Sanitize to lowercase kebab-case.

2. `runVaultWizard(context: ProjectContext): Promise<VaultConfig | null>` — Interactive @clack/prompts flow:
   - Show detected project name, suggest vault name (editable)
   - Explain MuninnDB Web UI for API key generation (display URL)
   - Prompt for API key (password input, validate non-empty)
   - Confirm vault name + key before proceeding
   - Return `{ vaultName: string, apiKey: string }` or null if cancelled

3. `writeVaultConfig(vaultName: string, configPath: string): void` — Read `.planning/config.json`, set `muninn.vault` field, write back.

4. `writeApiKeyToEnv(apiKey: string, envPath: string): void` — Append `MUNINN_API_KEY=<key>` to `.env` file (create if missing, skip if already present).

5. `ensureEnvInGitignore(cwd: string): void` — Check `.gitignore` exists and contains `.env`. If not, append it. If no `.gitignore`, create one with `.env` entry.

6. `verifyVaultConnection(vaultName: string): Promise<boolean>` — Hit MuninnDB health endpoint to verify the vault is reachable. Return boolean, non-blocking (warn on failure, don't abort).

Define a Zod schema for VaultConfig (`vault-setup.schemas.ts` is not needed -- keep it inline since it's small).

**Files to create/edit:**

- `packages/luca-framework/src/utils/vault-setup.ts` (new)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Functions are exported and importable

### 2. Integrate vault wizard into vault-init command

**Type:** auto
**TDD:** false
**Depends on:** 1

Update `packages/luca-framework/src/commands/vault-init.ts` to run the vault wizard after file generation succeeds:

1. After `generateFiles()` succeeds (line 167), add vault setup step:
   - Call `runVaultWizard(context)` to get vault name + API key
   - Call `writeVaultConfig()` to persist vault name to `.planning/config.json`
   - Call `writeApiKeyToEnv()` to write key to `.env`
   - Call `ensureEnvInGitignore()` to protect secrets
   - Call `verifyVaultConnection()` to confirm connectivity (non-blocking)

2. Add `--skip-vault` flag to allow skipping the MuninnDB vault step.

3. In quick mode (`--quick`), skip vault wizard but log that user should run it later.

4. Update the success output to include vault status in the "Next steps" box.

**Files to create/edit:**

- `packages/luca-framework/src/commands/vault-init.ts` (edit)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- The vault wizard step appears after file generation in the command flow
- `--skip-vault` flag is registered and honored

### 3. Wire init.ts 5-step flow and post-init readout

**Type:** auto
**TDD:** false
**Depends on:** 2

Update the `luca init` orchestrator to present a clean 5-step flow and add a comprehensive post-init readout:

1. Update step numbering / comments in `init.ts` to reflect the canonical 5-step flow:
   - Step 1: Prerequisites (Bun runtime check)
   - Step 2: MuninnDB (binary download + service start)
   - Step 3: Build artifacts (already the deploy step)
   - Step 4: Deploy to ~/.claude/
   - Step 5: Vault setup (suggest vault:init or auto-run)

2. Enhance the post-init readout (Step 8 area) to show a comprehensive status summary:
   - Prerequisites: Bun version, platform
   - MuninnDB: running/not running, port, binary path
   - Artifacts: count deployed, target directory
   - Vault: configured/not configured, vault name if set
   - Next steps: what to do next based on what was completed vs skipped

3. The flow when user confirms "Run vault:init?" should pass through cleanly to the updated vault-init command (which now includes vault setup from Task 2).

**Files to create/edit:**

- `packages/luca-framework/src/commands/init.ts` (edit)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Post-init readout includes all 5 steps' status
- Flow from init -> vault:init works end-to-end

## Verification

1. **Type check**: `bunx --bun tsc --noEmit` passes with zero errors
2. **Manual flow**: `luca init` shows clean 5-step progression
3. **Vault wizard**: `luca vault:init` prompts for vault name and API key
4. **Config written**: `.planning/config.json` contains `muninn.vault` after wizard
5. **Env written**: `.env` contains `MUNINN_API_KEY=` after wizard
6. **Gitignore safe**: `.gitignore` contains `.env` entry
7. **Skip flags**: `--skip-vault` and `--quick` bypass vault wizard gracefully

## Success Criteria

- Running `luca init` in a fresh directory completes all 5 steps (prereqs -> MuninnDB -> build -> deploy -> vault)
- Running `luca vault:init` in an existing project sets up MuninnDB vault config
- `.env` is never committed (gitignore guard)
- Post-init readout gives user clear picture of what's configured and what's next
- All skip flags work independently (`--skip-prerequisites`, `--skip-muninndb`, `--skip-deploy`, `--skip-vault`)

## Output Specification

- `packages/luca-framework/src/utils/vault-setup.ts` — New vault setup utility (6 functions)
- `packages/luca-framework/src/commands/vault-init.ts` — Updated with vault wizard integration
- `packages/luca-framework/src/commands/init.ts` — Updated 5-step flow + post-init readout
