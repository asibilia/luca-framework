/**
 * Vault resolution from `.planning/config.json`.
 *
 * Replaces the `bun -e` JSON extraction pattern used in hooks that need
 * the MuninnDB vault name.
 *
 * @module vault
 */

import { projectDir } from "./hook-io.ts";

/**
 * Resolves the MuninnDB vault name from `.planning/config.json`.
 *
 * Reads the `muninn.vault` field from config. Falls back to `'default'`
 * on any error or missing file.
 *
 * @returns The vault name string (e.g., "luca-framework" or "default")
 */
export const resolveVault = async (): Promise<string> => {
  try {
    const configPath = `${projectDir()}/.planning/config.json`;
    const file = Bun.file(configPath);
    if (await file.exists()) {
      const config = JSON.parse(await file.text());
      const vault = config?.muninn?.vault;
      if (typeof vault === "string" && vault.length > 0) {
        return vault;
      }
    }
  } catch {
    // Config not available or malformed — fall back to default
  }
  return "default";
};
