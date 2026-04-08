/**
 * CLI command: luca vault:init
 *
 * Per-project MuninnDB vault wiring. Detects the project context,
 * runs the vault wizard (vault name + API key prompts), writes
 * `.planning/config.json` and `.env`, and verifies connectivity.
 *
 * @example
 * ```bash
 * # Interactive mode (default)
 * luca vault:init
 *
 * # Skip vault setup (create .planning/ directory only)
 * luca vault:init --skip-vault
 * ```
 */
import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "pathe";

import { detectProjectContext } from "../utils/detect";
import {
  runVaultWizard,
  writeVaultConfig,
  writeApiKeyToEnv,
  ensureEnvInGitignore,
  verifyVaultConnection,
} from "../utils/vault-setup";

export const vaultInitCommand = defineCommand({
  meta: {
    name: "vault:init",
    description: "Set up MuninnDB vault for a project",
  },
  args: {
    "skip-vault": {
      type: "boolean",
      description: "Skip MuninnDB vault setup (only create .planning/ directory)",
      default: false,
    },
  },
  async run({ args }) {
    p.intro("luca vault:init");

    const cwd = process.cwd();

    // Detect project context
    const context = await detectProjectContext();

    // Guard: check if vault is already configured
    const configPath = join(cwd, ".planning", "config.json");
    if (existsSync(configPath)) {
      p.log.warn("Vault already configured (.planning/config.json exists).");
      p.log.info("To reconfigure, delete .planning/config.json and run again.");
      p.outro("Vault setup skipped.");
      return;
    }

    // Ensure .planning/ directory exists
    const planningDir = join(cwd, ".planning");
    if (!existsSync(planningDir)) {
      mkdirSync(planningDir, { recursive: true });
      p.log.success("Created .planning/ directory");
    }

    // Vault setup
    if (args["skip-vault"]) {
      p.log.info("Skipping MuninnDB vault setup (--skip-vault)");
      p.outro("Project directory prepared. Run `luca vault:init` later to set up the vault.");
      return;
    }

    const vaultResult = await runVaultWizard(context, cwd);

    if (!vaultResult) {
      p.outro("Vault setup cancelled.");
      return;
    }

    const envPath = join(cwd, ".env");

    await writeVaultConfig(vaultResult.vaultName, configPath);
    p.log.success("Vault name written to .planning/config.json");

    await writeApiKeyToEnv(vaultResult.apiKey, envPath, vaultResult.vaultName);
    p.log.success("API key written to .env");

    await ensureEnvInGitignore(cwd);
    p.log.success(".env protected in .gitignore");

    const reachable = await verifyVaultConnection(vaultResult.vaultName);
    if (reachable) {
      p.log.success(
        `MuninnDB reachable — vault "${vaultResult.vaultName}" is ready`,
      );
    } else {
      p.log.warn(
        `MuninnDB not reachable. Vault "${vaultResult.vaultName}" will activate when MuninnDB starts.`,
      );
    }

    p.outro("Vault configured! Run `luca run` to launch the harness.");
  },
});
