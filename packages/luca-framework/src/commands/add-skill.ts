import { existsSync } from "node:fs";
import { defineCommand } from "citty";
import { join } from "pathe";

import { copyTemplates, getTemplatesDir } from "../utils/template";
import { readManifest, writeManifest, hashFile } from "../utils/manifest";
import { logger } from "../utils/logger";
import {
  SKILL_MANIFEST,
  getSkillByName,
  getAllSkillNames,
} from "../utils/skill-manifest";
import type { LucaConfig, HarnessId, FileSource } from "../types";
import { sanitizeJsonParse } from "../utils/sanitize";

/**
 * CLI command: luca add-skill
 *
 * Install additional skills on demand after initial setup.
 * Supports installing a single skill by name or listing all available skills.
 *
 * @example
 * ```bash
 * # Install a specific skill
 * luca add-skill jira-issue
 *
 * # List all available skills with tier and installed status
 * luca add-skill --list
 * ```
 */
export const addSkillCommand = defineCommand({
  meta: {
    name: "add-skill",
    description: "Install additional skills on demand",
  },
  args: {
    skill: {
      type: "positional",
      description: "Skill name to install (kebab-case)",
      required: false,
    },
    list: {
      type: "boolean",
      description: "List all available skills with tier and installed status",
      default: false,
    },
  },
  async run({ args }) {
    const cwd = process.cwd();

    // Handle --list flag
    if (args.list) {
      await listSkills(cwd);
      return;
    }

    // Require a skill name if not listing
    if (!args.skill) {
      logger.error("Please specify a skill name or use --list to see options.");
      logger.info("");
      logger.info("Usage:");
      logger.info("  luca add-skill <skill-name>");
      logger.info("  luca add-skill --list");
      process.exit(1);
    }

    await installSkill(args.skill, cwd);
  },
});

/**
 * List all available skills grouped by tier with installed status.
 *
 * Reads installed harnesses from the manifest and checks each skill
 * directory for existence to determine installed status.
 *
 * @param cwd - Working directory
 */
async function listSkills(cwd: string): Promise<void> {
  const manifest = await readManifest(cwd);
  const harnesses: HarnessId[] = (manifest?.harnesses as HarnessId[]) ?? [
    "claude",
  ];

  // Group skills by tier
  const tiers = {
    core: SKILL_MANIFEST.filter((s) => s.tier === "core"),
    standard: SKILL_MANIFEST.filter((s) => s.tier === "standard"),
    extended: SKILL_MANIFEST.filter((s) => s.tier === "extended"),
  };

  const tierLabels = {
    core: "Core (always installed)",
    standard: "Standard (standard+ presets)",
    extended: "Extended (full preset only)",
  };

  for (const [tier, skills] of Object.entries(tiers)) {
    const label = tierLabels[tier as keyof typeof tierLabels];
    logger.info("");
    logger.info(`--- ${label} ---`);

    for (const skill of skills) {
      const installed = isSkillInstalled(skill.name, harnesses, cwd);
      const status = installed ? "[installed]" : "[available]";
      const category = `(${skill.category})`;
      logger.info(
        `  ${status} ${skill.name} ${category} - ${skill.description}`,
      );
    }
  }

  logger.info("");
  logger.info(`Total: ${SKILL_MANIFEST.length} skills`);
}

/**
 * Check if a skill is installed in any active harness.
 *
 * @param skillName - Skill directory name
 * @param harnesses - Active harness IDs
 * @param cwd - Working directory
 * @returns true if the skill directory exists in at least one harness
 */
function isSkillInstalled(
  skillName: string,
  harnesses: HarnessId[],
  cwd: string,
): boolean {
  for (const harnessId of harnesses) {
    const skillDir = join(cwd, `.${harnessId}`, "skills", skillName);
    if (existsSync(skillDir)) {
      return true;
    }
  }
  return false;
}

/**
 * Install a single skill into all active harnesses.
 *
 * Validates the skill name, checks if already installed, copies
 * the skill template from the framework's template directory to
 * each active harness, and updates the manifest.
 *
 * @param skillName - Skill name to install (kebab-case)
 * @param cwd - Working directory
 */
async function installSkill(skillName: string, cwd: string): Promise<void> {
  // Validate the skill exists in manifest
  const skillEntry = getSkillByName(skillName);
  if (!skillEntry) {
    logger.error(`Unknown skill: "${skillName}"`);
    logger.info("");
    logger.info("Available skills:");
    const allNames = getAllSkillNames();
    logger.info(`  ${allNames.join(", ")}`);
    logger.info("");
    logger.info("Run `luca add-skill --list` for detailed information.");
    process.exit(1);
  }

  // Read manifest for harness list
  const manifest = await readManifest(cwd);
  if (!manifest) {
    logger.error("No manifest found. Run `luca init` first.");
    process.exit(1);
  }

  const harnesses: HarnessId[] = (manifest.harnesses as HarnessId[]) ?? [
    "claude",
  ];

  // Check if already installed
  if (isSkillInstalled(skillName, harnesses, cwd)) {
    logger.warn(`Skill "${skillName}" is already installed.`);
    return;
  }

  // Load config from manifest for template processing
  const configPath = join(cwd, ".planning", "config.json");
  let config: LucaConfig;
  try {
    const configContent = await Bun.file(configPath).text();
    const parsed = sanitizeJsonParse(configContent) as Record<string, unknown>;
    config = {
      branding: manifest.branding,
      stack: manifest.stack,
      workTracker: manifest.workTracker as "jira" | "github" | "none",
      harnesses,
    };
    if (parsed.preset) {
      config.preset = parsed.preset as "starter" | "standard" | "full";
    }
  } catch {
    // Fallback: use manifest data directly
    config = {
      branding: manifest.branding,
      stack: manifest.stack,
      workTracker: manifest.workTracker as "jira" | "github" | "none",
      harnesses,
    };
  }

  const templatesDir = getTemplatesDir();
  let totalCopied = 0;

  for (const harnessId of harnesses) {
    const skillTemplateDir = join(
      templatesDir,
      "harness",
      harnessId,
      "skills",
      skillName,
    );

    if (!existsSync(skillTemplateDir)) {
      logger.warn(
        `Skill template not found for ${harnessId}: ${skillTemplateDir}`,
      );
      continue;
    }

    const destDir = join(cwd, `.${harnessId}`, "skills", skillName);
    const { processed, copied } = await copyTemplates({
      sourceDir: skillTemplateDir,
      destDir,
      config,
    });

    const fileCount = processed.length + copied.length;
    totalCopied += fileCount;

    // Update manifest with new file entries
    for (const file of [...processed, ...copied]) {
      const relPath = join(`.${harnessId}`, "skills", skillName, file);
      const absPath = join(cwd, relPath);
      try {
        const hash = await hashFile(absPath);
        manifest.files[relPath] = {
          originalHash: hash,
          source: `harness:${harnessId}` as FileSource,
        };
      } catch {
        // Skip files that can't be hashed
      }
    }

    logger.info(`  Installed ${fileCount} files for ${harnessId}`);
  }

  if (totalCopied === 0) {
    logger.error(`Failed to install skill "${skillName}".`);
    process.exit(1);
  }

  // Persist updated manifest
  manifest.updatedAt = new Date().toISOString();
  await writeManifest(manifest, cwd);

  logger.info(
    `Skill "${skillName}" installed (${totalCopied} files across ${harnesses.length} harnesses).`,
  );
}
