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
import { z } from "zod";
import * as p from "@clack/prompts";
import { chmodSync, existsSync } from "node:fs";
import { join, basename } from "pathe";

import { MUNINNDB_DEFAULT_PORT } from "./muninndb-schemas";

import type { ProjectContext } from "../types";

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
  /** MuninnDB API key for authentication. */
  apiKey: z.string().min(1),
});

/** Vault configuration inferred from the Zod schema. */
export type VaultConfig = z.infer<typeof VaultConfigSchema>;

// ─── Constants ───────────────────────────────────────────────────────────────

const MUNINNDB_WEB_UI_URL = "http://localhost:8477";

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
  cwd: string = process.cwd(),
): string {
  const raw = context.projectName ?? basename(cwd);
  return sanitizeVaultName(raw);
}

/**
 * Sanitize a string into a valid vault name (lowercase kebab-case).
 *
 * Converts to lowercase, replaces non-alphanumeric characters with dashes,
 * collapses consecutive dashes, and trims leading/trailing dashes.
 *
 * @param name - Raw input string to sanitize.
 * @returns A cleaned vault name.
 *
 * @example
 * ```typescript
 * sanitizeVaultName("My Cool App!")  // "my-cool-app"
 * sanitizeVaultName("@scope/pkg")    // "scope-pkg"
 * ```
 */
export function sanitizeVaultName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Run the interactive MuninnDB vault wizard using @clack/prompts.
 *
 * Guides the user through:
 * 1. Reviewing/editing the suggested vault name
 * 2. Understanding where to get an API key (MuninnDB Web UI)
 * 3. Entering their API key (password input)
 * 4. Confirming the configuration before proceeding
 *
 * Returns `null` if the user cancels at any step.
 *
 * @param context - Detected project context from `detectProjectContext()`.
 * @param cwd - Working directory for vault name fallback.
 * @returns A validated `VaultConfig` object, or `null` if cancelled.
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
  cwd: string = process.cwd(),
): Promise<VaultConfig | null> {
  const suggested = suggestVaultName(context, cwd);

  p.log.info("MuninnDB Vault Setup");
  p.log.message(
    "MuninnDB provides cognitive memory for Luca -- patterns, decisions, and pitfalls persist across sessions.",
  );

  // Step 1: Vault name
  const vaultName = await p.text({
    message: "Vault name",
    placeholder: suggested,
    defaultValue: suggested,
    validate: (value) => {
      const sanitized = sanitizeVaultName(value ?? "");
      if (sanitized.length === 0) {
        return "Vault name must contain at least one alphanumeric character.";
      }
    },
  });

  if (p.isCancel(vaultName)) return null;

  const finalVaultName = sanitizeVaultName(String(vaultName));

  // Step 2: API key guidance
  p.note(
    [
      "To generate an API key, open the MuninnDB Web UI:",
      "",
      `  ${MUNINNDB_WEB_UI_URL}`,
      "",
      "Navigate to Settings > API Keys and create a new key.",
      "If MuninnDB is not running, you can set this up later.",
    ].join("\n"),
    "API Key",
  );

  // Step 3: API key input
  const apiKey = await p.password({
    message: "MuninnDB API key (leave empty to skip)",
  });

  if (p.isCancel(apiKey)) return null;

  const trimmedKey = String(apiKey ?? "").trim();

  if (trimmedKey.length === 0) {
    p.log.warn(
      "No API key provided. You can set MUNINN_API_KEY in .env later.",
    );
    return null;
  }

  // Step 4: Confirmation
  const confirmed = await p.confirm({
    message: `Set vault "${finalVaultName}" with the provided API key?`,
    initialValue: true,
  });

  if (p.isCancel(confirmed) || !confirmed) return null;

  const parseResult = VaultConfigSchema.safeParse({
    vaultName: finalVaultName,
    apiKey: trimmedKey,
  });

  if (!parseResult.success) {
    p.log.error("Invalid vault configuration. Please try again.");
    return null;
  }

  return parseResult.data;
}

/**
 * Write the vault name to `.planning/config.json`.
 *
 * Reads the existing config file, sets or updates the `muninn.vault` field,
 * and writes it back. Creates the file with a minimal structure if it does
 * not exist.
 *
 * @param vaultName - The vault name to write.
 * @param configPath - Absolute path to `.planning/config.json`.
 *
 * @example
 * ```typescript
 * writeVaultConfig("my-project", "/path/to/.planning/config.json");
 * // config.json now contains: { "muninn": { "vault": "my-project" }, ... }
 * ```
 */
export async function writeVaultConfig(
  vaultName: string,
  configPath: string,
): Promise<void> {
  let config: Record<string, unknown> = {};

  const file = Bun.file(configPath);
  if (await file.exists()) {
    try {
      config = JSON.parse(await file.text()) as Record<string, unknown>;
    } catch {
      // Corrupted JSON -- start fresh with just the muninn field
    }
  }

  // Set muninn.vault, preserving other muninn fields if present
  const existing =
    typeof config.muninn === "object" && config.muninn !== null
      ? (config.muninn as Record<string, unknown>)
      : {};

  config.muninn = { ...existing, vault: vaultName };

  await Bun.write(configPath, JSON.stringify(config, null, 2) + "\n");
}

/**
 * Append `MUNINN_API_KEY=<key>` to a `.env` file.
 *
 * Creates the `.env` file if it does not exist. If the file already contains
 * a `MUNINN_API_KEY=` line, the existing value is replaced. Otherwise the
 * key is appended on a new line.
 *
 * After writing, the file permissions are set to `0600` (owner read/write
 * only) to prevent other users on the system from reading the API key.
 *
 * @param apiKey - The MuninnDB API key value to write.
 * @param envPath - Absolute path to the `.env` file.
 *
 * @example
 * ```typescript
 * await writeApiKeyToEnv("sk-abc123", "/path/to/.env");
 * // .env now contains: MUNINN_API_KEY=sk-abc123
 * // File permissions: 0600 (owner read/write only)
 * ```
 */
export async function writeApiKeyToEnv(
  apiKey: string,
  envPath: string,
): Promise<void> {
  const envLine = `MUNINN_API_KEY=${apiKey}`;
  const file = Bun.file(envPath);

  if (await file.exists()) {
    const content = await file.text();
    const lines = content.split("\n");
    const existingIndex = lines.findIndex((line) =>
      line.startsWith("MUNINN_API_KEY="),
    );

    if (existingIndex >= 0) {
      // Replace existing line
      lines[existingIndex] = envLine;
      await Bun.write(envPath, lines.join("\n"));
    } else {
      // Append to end, ensuring newline before the new entry
      const separator = content.endsWith("\n") ? "" : "\n";
      await Bun.write(envPath, content + separator + envLine + "\n");
    }
  } else {
    // Create new .env file
    await Bun.write(envPath, envLine + "\n");
  }

  // Restrict permissions: owner read/write only (SEC-002)
  chmodSync(envPath, 0o600);
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
  const gitignorePath = join(cwd, ".gitignore");
  const file = Bun.file(gitignorePath);

  if (await file.exists()) {
    const content = await file.text();
    const lines = content.split("\n").map((l) => l.trim());

    // Check for exact .env match (not .env.local, .env.example, etc.)
    const hasEnvEntry = lines.some((line) => line === ".env");

    if (!hasEnvEntry) {
      const separator = content.endsWith("\n") ? "" : "\n";
      await Bun.write(
        gitignorePath,
        content + separator + "\n# Environment secrets\n.env\n",
      );
    }
  } else {
    // Create new .gitignore with .env entry
    await Bun.write(gitignorePath, "# Environment secrets\n.env\n");
  }
}

/**
 * Verify MuninnDB vault connectivity by hitting the health endpoint.
 *
 * Sends a GET request to `http://localhost:{port}/health` with a 3-second
 * timeout. Returns `true` if the service responds with an OK status, `false`
 * otherwise. This is a non-blocking check -- callers should warn on failure
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
  port?: number,
): Promise<boolean> {
  const resolvedPort =
    port ??
    (process.env.MUNINNDB_PORT
      ? parseInt(process.env.MUNINNDB_PORT, 10)
      : MUNINNDB_DEFAULT_PORT);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`http://localhost:${resolvedPort}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    return response.ok;
  } catch {
    return false;
  }
}
