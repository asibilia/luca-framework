/**
 * Vault setup utilities for MuninnDB integration.
 *
 * Provides functions for the vault wizard flow: suggesting a vault name,
 * running an interactive prompt sequence, writing config/env files, and
 * verifying connectivity. Used by `vault-init.ts` and `init.ts` commands.
 *
 * @example
 * ```typescript
 * import {
 *   suggestVaultName,
 *   runVaultWizard,
 *   writeVaultConfig,
 *   writeApiKeyToEnv,
 *   ensureEnvInGitignore,
 *   verifyVaultConnection,
 * } from "../utils/vault-setup";
 *
 * const vaultName = suggestVaultName(context);
 * const result = await runVaultWizard(context);
 * if (result) {
 *   writeVaultConfig(result.vaultName, configPath);
 *   writeApiKeyToEnv(result.apiKey, envPath);
 *   ensureEnvInGitignore(cwd);
 *   await verifyVaultConnection(result.vaultName);
 * }
 * ```
 */
import { chmodSync } from 'node:fs'

import { sanitizeVaultName } from '@alecsibilia/luca-core'
import * as p from '@clack/prompts'
import { join, basename } from 'pathe'
import { z } from 'zod'

import { checkMuninndbService } from './muninndb-health'
import { isMuninnRegistered } from './muninn-mcp-registration'
import { resolveMuninndbPort } from './muninndb-schemas'
import { sanitizeJsonParse } from './sanitize'

// Re-export for backward compatibility with framework consumers.
export { sanitizeVaultName }

import type { ProjectContext } from '../types'

// ─── Schema ──────────────────────────────────────────────────────────────────

/**
 * Zod schema for vault wizard output.
 *
 * Captures the vault name and MuninnDB API key collected during the
 * interactive wizard flow.
 */
export const VaultConfigSchema = z.object({
    /** Sanitized vault name in lowercase kebab-case. */
    vaultName: z.string().min(1),
    /**
     * MuninnDB API key. OPTIONAL — it is an instance-level credential needed
     * only ONCE to register the MuninnDB MCP server, which then reaches every
     * vault (the vault is a per-tool-call parameter). When a `muninn` MCP
     * server is already registered, the wizard records just the vault name and
     * leaves this unset.
     */
    apiKey: z.string().min(1).optional(),
})

/** Vault configuration inferred from the Zod schema. */
export type VaultConfig = z.infer<typeof VaultConfigSchema>

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * MuninnDB web dashboard URL. The dashboard is served on the same port as
 * the MuninnDB service (default 8476), NOT a separate port — so we derive
 * it from `resolveMuninndbPort()` to honor a `MUNINNDB_PORT` override
 * instead of hardcoding.
 */
function muninndbWebUiUrl(): string {
    return `http://127.0.0.1:${resolveMuninndbPort()}`
}

// ─── Functions ───────────────────────────────────────────────────────────────

/**
 * Derive a suggested vault name from the project context.
 *
 * Uses the project name from `package.json` if available, otherwise falls
 * back to the current working directory basename. The result is sanitized
 * to lowercase kebab-case (alphanumeric and dashes only).
 *
 * @param context - Detected project context from `detectProjectContext()`.
 * @param cwd - Working directory to use as fallback name source.
 * @returns A sanitized, lowercase kebab-case vault name string.
 *
 * @example
 * ```typescript
 * const name = suggestVaultName({ projectName: "My Cool App" });
 * // Returns: "my-cool-app"
 *
 * const fallback = suggestVaultName({ projectName: null });
 * // Returns: basename of cwd, sanitized
 * ```
 */
export function suggestVaultName(
    context: ProjectContext,
    cwd: string = process.cwd()
): string {
    const raw = context.projectName ?? basename(cwd)
    return sanitizeVaultName(raw)
}

/**
 * Run the interactive MuninnDB vault wizard using @clack/prompts.
 *
 * Performs a health pre-check before showing any prompts. If MuninnDB is not
 * running, returns `null` immediately with a warning message telling the user
 * to run `luca vault:init` later (REQ-03). This prevents the confusing UX of
 * prompting for an API key when the MuninnDB Web UI is unreachable.
 *
 * When MuninnDB is healthy, guides the user through:
 * 1. Reviewing/editing the suggested vault name
 * 2. Understanding where to get an API key (MuninnDB Web UI)
 * 3. Entering their API key (password input)
 * 4. Confirming the configuration before proceeding
 *
 * Returns `null` if MuninnDB is unhealthy or the user cancels at any step.
 * Both cases return `null`, but they are distinguished by the log messages
 * emitted before returning.
 *
 * @param context - Detected project context from `detectProjectContext()`.
 * @param cwd - Working directory for vault name fallback.
 * @returns A validated `VaultConfig` object, or `null` if unhealthy/cancelled.
 *
 * @example
 * ```typescript
 * const result = await runVaultWizard(context);
 * if (!result) {
 *   console.log("Vault setup skipped.");
 *   return;
 * }
 * console.log(result.vaultName, result.apiKey);
 * ```
 */
export async function runVaultWizard(
    context: ProjectContext,
    cwd: string = process.cwd()
): Promise<VaultConfig | null> {
    const suggested = suggestVaultName(context, cwd)

    // Health gate: check if MuninnDB is reachable before prompting for API key (REQ-03)
    const serviceStatus = await checkMuninndbService()
    if (!serviceStatus.healthy) {
        p.log.warn(
            'MuninnDB is not running. Vault setup requires MuninnDB to be active.'
        )
        p.log.info(
            'Start MuninnDB and run `luca vault:init` to complete vault setup.'
        )
        return null
    }

    p.log.info('MuninnDB Vault Setup')
    p.log.message(
        'MuninnDB provides cognitive memory for Luca -- patterns, decisions, and pitfalls persist across sessions.'
    )

    // Step 1: Vault name
    const vaultName = await p.text({
        message: 'Vault name',
        placeholder: suggested,
        defaultValue: suggested,
        validate: (value) => {
            const sanitized = sanitizeVaultName(value ?? '')
            if (sanitized.length === 0) {
                return 'Vault name must contain at least one alphanumeric character.'
            }
        },
    })

    if (p.isCancel(vaultName)) return null

    const finalVaultName = sanitizeVaultName(String(vaultName))

    // Step 2: API key — but ONLY if it's actually needed. The key is an
    // instance-level credential used once to register the MuninnDB MCP server;
    // a registered server already reaches EVERY vault (vault is a per-call
    // parameter). So when one is registered, record just the vault name and
    // skip the key entirely — there is no such thing as a per-vault key.
    if (await isMuninnRegistered(cwd)) {
        p.log.success(
            'MuninnDB MCP server already registered — it reaches every vault, ' +
                'so no API key is needed here.'
        )
        return { vaultName: finalVaultName }
    }

    p.note(
        [
            'No MuninnDB MCP server is registered with Claude Code yet. The key',
            'below is an INSTANCE-level credential, captured once to register',
            'the server — that single registration then reaches every vault.',
            '',
            'Generate one in the MuninnDB Web UI:',
            '',
            `  ${muninndbWebUiUrl()}`,
            '',
            'Settings > API Keys > create a new key. You can also skip this and',
            'register the server later (see `luca doctor`).',
        ].join('\n'),
        'API Key (one-time)'
    )

    // Step 3: API key input
    const apiKey = await p.password({
        message: 'MuninnDB API key (leave empty to skip)',
    })

    if (p.isCancel(apiKey)) return null

    const trimmedKey = String(apiKey ?? '').trim()

    if (trimmedKey.length === 0) {
        // Still record the vault name — the key is optional and only used to
        // register the MCP server, which can be done later.
        p.log.warn(
            'No API key provided. Vault name recorded; register the MuninnDB ' +
                'MCP server later (see `luca doctor`).'
        )
        return { vaultName: finalVaultName }
    }

    // Step 4: Confirmation
    const confirmed = await p.confirm({
        message: `Set vault "${finalVaultName}" and write the API key to .env?`,
        initialValue: true,
    })

    if (p.isCancel(confirmed) || !confirmed) return null

    const parseResult = VaultConfigSchema.safeParse({
        vaultName: finalVaultName,
        apiKey: trimmedKey,
    })

    if (!parseResult.success) {
        p.log.error('Invalid vault configuration. Please try again.')
        return null
    }

    return parseResult.data
}

/**
 * Write the vault name to `.luca/config.json`.
 *
 * Reads the existing config file, sets or updates the `muninn.vault` field,
 * and writes it back. Creates the file with a minimal structure if it does
 * not exist.
 *
 * @param vaultName - The vault name to write.
 * @param configPath - Absolute path to `.luca/config.json`.
 *
 * @example
 * ```typescript
 * writeVaultConfig("my-project", "/path/to/.luca/config.json");
 * // config.json now contains: { "muninn": { "vault": "my-project" }, ... }
 * ```
 */
export async function writeVaultConfig(
    vaultName: string,
    configPath: string
): Promise<void> {
    let config: Record<string, unknown> = {}

    const file = Bun.file(configPath)
    if (await file.exists()) {
        try {
            config = sanitizeJsonParse(await file.text()) as Record<
                string,
                unknown
            >
        } catch {
            // Corrupted JSON -- start fresh with just the muninn field
        }
    }

    // Set muninn.vault, preserving other muninn fields if present
    const existing =
        typeof config.muninn === 'object' && config.muninn !== null
            ? (config.muninn as Record<string, unknown>)
            : {}

    config.muninn = { ...existing, vault: vaultName }

    await Bun.write(configPath, JSON.stringify(config, null, 2) + '\n')
}

/**
 * Write the MuninnDB API key to a `.env` file as a single `MUNINN_DB_API_KEY`.
 *
 * The key is INSTANCE-level, not per-vault: one MuninnDB instance issues one
 * key that reaches every vault (the vault is a per-tool-call parameter). So
 * there is exactly one env var. Earlier per-vault aliasing
 * (`MUNINN_DB_<VAULT>_API_KEY`, `MUNINN_DB_DEFAULT_API_KEY`) wrote the SAME
 * value under several names, which was redundant: consumers that look up a
 * per-vault/default key (e.g. a tool's `muninn-config`) already fall back
 * to the generic `MUNINN_DB_API_KEY`, and the instance-level key is valid for
 * every vault — so the single generic var is sufficient. This value is also a
 * convenience reference for the one-time `claude mcp add … --header
 * "Authorization: Bearer <key>"` registration.
 *
 * Creates the `.env` file if it does not exist; replaces an existing
 * `MUNINN_DB_API_KEY=` line in place, otherwise appends it. After writing,
 * permissions are set to `0600` (owner read/write only).
 *
 * @param apiKey - The MuninnDB API key value to write.
 * @param envPath - Absolute path to the `.env` file.
 *
 * @example
 * ```typescript
 * await writeApiKeyToEnv("sk-abc123", "/path/to/.env");
 * // .env now contains: MUNINN_DB_API_KEY=sk-abc123  (perms 0600)
 * ```
 */
export async function writeApiKeyToEnv(
    apiKey: string,
    envPath: string
): Promise<void> {
    const envLines = [`MUNINN_DB_API_KEY=${apiKey}`]

    const file = Bun.file(envPath)

    if (await file.exists()) {
        let content = await file.text()

        for (const envLine of envLines) {
            const keyName = envLine.split('=')[0]
            const lines = content.split('\n')
            const existingIndex = lines.findIndex((line) =>
                line.startsWith(`${keyName}=`)
            )

            if (existingIndex >= 0) {
                // Replace existing line
                lines[existingIndex] = envLine
                content = lines.join('\n')
            } else {
                // Append to end, ensuring newline before the new entry
                const separator = content.endsWith('\n') ? '' : '\n'
                content = content + separator + envLine + '\n'
            }
        }

        await Bun.write(envPath, content)
    } else {
        // Create new .env file
        await Bun.write(envPath, envLines.join('\n') + '\n')
    }

    // Restrict permissions: owner read/write only (SEC-002)
    chmodSync(envPath, 0o600)
}

/**
 * Ensure `.env` is listed in `.gitignore` to prevent secret leaks.
 *
 * Checks whether `.gitignore` exists and contains a `.env` entry. If
 * the file is missing, creates it with `.env` as the sole entry. If the
 * file exists but lacks a `.env` line, appends one.
 *
 * @param cwd - Working directory containing `.gitignore`.
 *
 * @example
 * ```typescript
 * await ensureEnvInGitignore("/path/to/project");
 * // .gitignore now contains a .env entry
 * ```
 */
export async function ensureEnvInGitignore(cwd: string): Promise<void> {
    const gitignorePath = join(cwd, '.gitignore')
    const file = Bun.file(gitignorePath)

    if (await file.exists()) {
        const content = await file.text()
        const lines = content.split('\n').map((l) => l.trim())

        // Check for exact .env match (not .env.local, .env.example, etc.)
        const hasEnvEntry = lines.some((line) => line === '.env')

        if (!hasEnvEntry) {
            const separator = content.endsWith('\n') ? '' : '\n'
            await Bun.write(
                gitignorePath,
                content + separator + '\n# Environment secrets\n.env\n'
            )
        }
    } else {
        // Create new .gitignore with .env entry
        await Bun.write(gitignorePath, '# Environment secrets\n.env\n')
    }
}

/**
 * Verify MuninnDB vault connectivity by checking the health endpoint.
 *
 * Delegates to `checkMuninndbService()` from `muninndb-health.ts` which
 * handles the HTTP health check with timeout, PID file reading, and
 * structured status reporting.
 *
 * Returns `true` if the service reports healthy, `false` otherwise.
 * This is a non-blocking check -- callers should warn on failure
 * but never abort the flow.
 *
 * @param vaultName - The vault name (used for logging context, not in the request).
 * @param port - MuninnDB port (default: 8476, or `MUNINNDB_PORT` env var).
 * @returns `true` if the health endpoint responds successfully.
 *
 * @example
 * ```typescript
 * const reachable = await verifyVaultConnection("my-project");
 * if (!reachable) {
 *   console.warn("MuninnDB not reachable -- vault setup will complete on next start.");
 * }
 * ```
 */
export async function verifyVaultConnection(
    vaultName: string,
    port?: number
): Promise<boolean> {
    const resolvedPort = resolveMuninndbPort(port)
    const status = await checkMuninndbService(resolvedPort)
    return status.healthy
}
