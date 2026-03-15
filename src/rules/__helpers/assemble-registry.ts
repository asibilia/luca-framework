/**
 * Rule registry assembly for the Luca Framework
 *
 * Dynamically assembles the rule registry from:
 * 1. General/framework rules (always loaded)
 * 2. Tech stack profile rules (loaded based on config)
 *
 * Profile loading is controlled by .planning/config.json:
 * - workflow.opinionated_guidelines: master toggle (default: true)
 * - workflow.tech_stack_profiles: array of profile names (default: ["typescript"])
 */

import { join } from "pathe";

import { sanitizeJsonParse } from "~/shared/__helpers/validation-utils";

// Import general/framework rules (always active)
import { atlassianMcpRule } from "../general/atlassian-mcp.rule";
import { complexityGatingRule } from "../general/complexity-gating.rule";
import { cursorRulesRule } from "../general/cursor-rules.rule";
import { domainArchitectureRule } from "../general/domain-architecture.rule";
import { fileNamingRule } from "../general/file-naming.rule";
import { generatedFileGuardRule } from "../general/generated-file-guard.rule";
import { harnessVerificationRule } from "../general/harness-verification.rule";
import { hookSkillBoundaryRule } from "../general/hook-skill-boundary.rule";
import { luWorkflowRule } from "../general/lu-workflow.rule";
import { moduleBoundaryRule } from "../general/module-boundary.rule";
import { mandatoryDocumentationRule } from "../general/mandatory-documentation.rule";
import { noTestsRule } from "../general/no-tests.rule";
import { posthogIntegrationRule } from "../general/posthog-integration.rule";
import { selfImproveRule } from "../general/self-improve.rule";
import { stateMachineBridgeRule } from "../general/state-machine-bridge.rule";
import { vaultRoutingRule } from "../general/vault-routing.rule";
import { profileRegistry, ProfileConfigSchema } from "../profiles/index";

import type { BaseRule } from "../__schemas/rule.schemas";

// ---------------------------------------------------------------------------
// General rules (always loaded regardless of profile config)
// ---------------------------------------------------------------------------
const generalRules: Record<string, () => BaseRule> = {
  "atlassian-mcp": () => atlassianMcpRule,
  "complexity-gating": () => complexityGatingRule,
  "cursor-rules": () => cursorRulesRule,
  "domain-architecture": () => domainArchitectureRule,
  "file-naming": () => fileNamingRule,
  "generated-file-guard": () => generatedFileGuardRule,
  "harness-verification": () => harnessVerificationRule,
  "hook-skill-boundary": () => hookSkillBoundaryRule,
  "mandatory-documentation": () => mandatoryDocumentationRule,
  "module-boundary": () => moduleBoundaryRule,
  "no-tests": () => noTestsRule,
  "posthog-integration": () => posthogIntegrationRule,
  "self-improve": () => selfImproveRule,
  "state-machine-bridge": () => stateMachineBridgeRule,
  "vault-routing": () => vaultRoutingRule,
  "lu-workflow": () => luWorkflowRule,
};

// ---------------------------------------------------------------------------
// Profile-aware rule loading
// ---------------------------------------------------------------------------

/**
 * Read profile config from .planning/config.json at import time.
 *
 * Uses Bun.file() with top-level await for async file read.
 * If the config file is missing or malformed, defaults apply via Zod schema.
 */
async function loadProfileConfig(): Promise<{
  opinionated_guidelines: boolean;
  tech_stack_profiles: string[];
}> {
  try {
    const configPath = join(process.cwd(), ".planning", "config.json");
    const raw = await Bun.file(configPath).text();
    const config = sanitizeJsonParse(raw) as Record<string, any>;
    const workflow = config?.workflow ?? {};
    return ProfileConfigSchema.parse(workflow);
  } catch {
    // Fallback to defaults if config is missing or unreadable
    return ProfileConfigSchema.parse({});
  }
}

/**
 * Collect rules from active tech stack profiles.
 *
 * If opinionated_guidelines is false, no profile rules are loaded.
 * Otherwise, each profile in tech_stack_profiles contributes its rules.
 */
async function loadProfileRules(): Promise<Record<string, () => BaseRule>> {
  const config = await loadProfileConfig();

  if (!config.opinionated_guidelines) {
    return {};
  }

  const profileRules: Record<string, () => BaseRule> = {};

  for (const profileName of config.tech_stack_profiles) {
    const profileThunk = profileRegistry[profileName];
    if (profileThunk) {
      const profile = profileThunk();
      Object.assign(profileRules, profile.rules);
    }
  }

  return profileRules;
}

// ---------------------------------------------------------------------------
// Assembled registry: general + profile rules
// ---------------------------------------------------------------------------

/**
 * Complete rule registry combining general rules with active profile rules.
 *
 * This is the single source of truth consumed by the build pipeline
 * (build-shared.ts) to generate .claude/ rule files.
 */
export const ruleRegistry: Record<string, () => BaseRule> = {
  ...generalRules,
  ...(await loadProfileRules()),
};
