/**
 * Per-adapter compatibility validators and aggregation utility.
 *
 * Standalone validation functions (NOT on the Adapter interface) that inspect
 * compiled adapter output against each IDE's known constraints and produce
 * structured `CompatibilityReport` results.
 *
 * Each validator reads file paths from `EmitResult.filesPaths`, inspects file
 * content via `Bun.file()`, categorizes files by feature (rules, skills, hooks,
 * agents), and applies IDE-specific constraint checks.
 *
 * @module
 */
import type { EmitResult } from "../__schemas/adapter.schemas";
import type {
  CompatibilityReport,
  FeatureMapping,
  FeatureMappingStatus,
  AggregatedReport,
} from "../__schemas/compatibility-report.schemas";

// ---------------------------------------------------------------------------
// Constants — IDE-specific limits
// ---------------------------------------------------------------------------

/** Maximum characters per Windsurf workspace rule file. */
const WINDSURF_WORKSPACE_RULE_CHAR_LIMIT = 12_000;

/** Maximum characters for Windsurf global rules total. */
const WINDSURF_GLOBAL_RULES_CHAR_LIMIT = 6_000;

/** Maximum characters per Windsurf workflow file. */
const WINDSURF_WORKFLOW_CHAR_LIMIT = 12_000;

/** Valid Windsurf trigger values for workspace rule frontmatter. */
const WINDSURF_VALID_TRIGGERS = [
  "always_on",
  "model_decision",
  "glob",
  "manual",
] as const;

/** Maximum characters per VS Code agent profile. */
const VSCODE_AGENT_CHAR_LIMIT = 30_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Categorized file paths organized by feature type.
 */
type CategorizedFiles = {
  rules: string[];
  skills: string[];
  hooks: string[];
  agents: string[];
  other: string[];
};

/**
 * Categorize file paths by feature based on path segments.
 *
 * Assigns each file to a feature category (rules, skills, hooks, agents)
 * by inspecting path segments. Files that don't match any category are
 * placed in "other".
 *
 * @param filePaths - Array of absolute file paths
 * @returns Object mapping feature names to arrays of file paths
 */
function categorizeFiles(filePaths: string[]): CategorizedFiles {
  const categories: CategorizedFiles = {
    rules: [],
    skills: [],
    hooks: [],
    agents: [],
    other: [],
  };

  for (const filePath of filePaths) {
    const lower = filePath.toLowerCase();
    if (lower.includes("/rules/") || lower.endsWith(".mdc")) {
      categories.rules.push(filePath);
    } else if (lower.includes("/skills/") || lower.includes("skill.md")) {
      categories.skills.push(filePath);
    } else if (lower.includes("/hooks/") || lower.includes("hooks.json")) {
      categories.hooks.push(filePath);
    } else if (lower.includes("/agents/") || lower.endsWith(".agent.md")) {
      categories.agents.push(filePath);
    } else {
      categories.other.push(filePath);
    }
  }

  return categories;
}

/**
 * Read file content via Bun.file(). Returns empty string if the file
 * cannot be read (missing, permissions, etc.).
 *
 * @param filePath - Absolute path to the file
 * @returns File content as string, or empty string on failure
 */
async function readFileContent(filePath: string): Promise<string> {
  try {
    return await Bun.file(filePath).text();
  } catch {
    return "";
  }
}

/**
 * Extract YAML frontmatter from a markdown string.
 *
 * Parses the text between the first `---` and second `---` delimiters.
 * Returns key-value pairs as a record. Does not use a full YAML parser --
 * extracts simple `key: value` lines for lightweight validation.
 *
 * @param content - Full markdown content
 * @returns Record of frontmatter key-value pairs, or null if no frontmatter found
 */
function extractFrontmatter(content: string): Record<string, string> | null {
  if (!content.startsWith("---")) {
    return null;
  }

  const closingIndex = content.indexOf("\n---", 3);
  if (closingIndex === -1) {
    return null;
  }

  const frontmatterBlock = content.slice(4, closingIndex);
  const result: Record<string, string> = {};

  for (const line of frontmatterBlock.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      if (key.length > 0) {
        result[key] = value;
      }
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Determine feature mapping status from item and degraded counts.
 *
 * @param itemCount - Total items in this feature
 * @param degradedCount - Number of degraded/warned items
 * @param isSupported - Whether the IDE supports this feature
 * @returns The resolved feature mapping status
 */
function resolveStatus(
  itemCount: number,
  degradedCount: number,
  isSupported: boolean,
): FeatureMappingStatus {
  if (!isSupported) {
    return "unsupported";
  }
  if (degradedCount > 0) {
    return "partially_mapped";
  }
  return "fully_mapped";
}

/**
 * Build a CompatibilityReport from feature mappings and adapter metadata.
 *
 * @param adapterId - Adapter ID (e.g., "cursor")
 * @param adapterName - Human-readable adapter name
 * @param adapterVersion - Adapter version string
 * @param targetIde - Target IDE name
 * @param features - Array of per-feature mapping results
 * @returns A fully-populated CompatibilityReport
 */
function buildReport(
  adapterId: string,
  adapterName: string,
  adapterVersion: string,
  targetIde: string,
  features: FeatureMapping[],
): CompatibilityReport {
  const totalWarnings = features.reduce((sum, f) => sum + f.warnings.length, 0);
  const fullyCompatible = features.every(
    (f) => f.status === "fully_mapped" || f.status === "unsupported",
  );

  return {
    adapter_id: adapterId,
    adapter_name: adapterName,
    adapter_version: adapterVersion,
    target_ide: targetIde,
    generated_at: new Date().toISOString(),
    features,
    fully_compatible: fullyCompatible,
    total_warnings: totalWarnings,
  };
}

// ---------------------------------------------------------------------------
// Windsurf validator
// ---------------------------------------------------------------------------

/**
 * Validate Windsurf adapter output against Windsurf IDE constraints.
 *
 * Checks:
 * - No workspace rule file exceeds 12,000 characters
 * - Global rules total does not exceed 6,000 characters
 * - All workflow files are under 12,000 characters
 * - Required `trigger` frontmatter is present in workspace rules
 * - Trigger values are one of: `always_on`, `model_decision`, `glob`, `manual`
 *
 * @param emitResult - The EmitResult from the Windsurf adapter's emit() call
 * @returns A CompatibilityReport for the Windsurf adapter
 *
 * @example
 * ```typescript
 * const adapter = createWindsurfAdapter();
 * const emitResult = await adapter.emit(outputDir);
 * const report = await validateWindsurfOutput(emitResult);
 * console.log(report.total_warnings); // Number of constraint violations
 * ```
 */
export async function validateWindsurfOutput(
  emitResult: EmitResult,
): Promise<CompatibilityReport> {
  const files = categorizeFiles(emitResult.filesPaths);
  const features: FeatureMapping[] = [];

  // --- Rules ---
  {
    const warnings: string[] = [];
    let degradedCount = 0;
    let globalRulesTotalChars = 0;

    for (const filePath of files.rules) {
      const content = await readFileContent(filePath);
      if (content.length === 0) {
        warnings.push(`Rule file is empty or unreadable: ${filePath}`);
        degradedCount++;
        continue;
      }

      const isGlobalRule = filePath.toLowerCase().includes("/global/");

      // Track global rules total character count
      if (isGlobalRule) {
        globalRulesTotalChars += content.length;
      }

      // Check workspace rule character limit (12K)
      if (content.length > WINDSURF_WORKSPACE_RULE_CHAR_LIMIT) {
        warnings.push(
          `Rule file exceeds ${WINDSURF_WORKSPACE_RULE_CHAR_LIMIT} char limit ` +
            `(${content.length} chars): ${filePath}`,
        );
        degradedCount++;
      }

      // Check for required trigger frontmatter
      const fm = extractFrontmatter(content);
      if (!fm) {
        warnings.push(
          `Rule file missing YAML frontmatter with trigger field: ${filePath}`,
        );
        degradedCount++;
      } else if (!fm.trigger) {
        warnings.push(
          `Rule file missing required 'trigger' in frontmatter: ${filePath}`,
        );
        degradedCount++;
      } else {
        // Validate trigger value
        const triggerValue = fm.trigger.trim();
        const validTriggers: readonly string[] = WINDSURF_VALID_TRIGGERS;
        if (!validTriggers.includes(triggerValue)) {
          warnings.push(
            `Rule file has invalid trigger value '${triggerValue}' ` +
              `(expected one of: ${WINDSURF_VALID_TRIGGERS.join(", ")}): ${filePath}`,
          );
          degradedCount++;
        }
      }
    }

    // Check global rules total limit (6K)
    if (globalRulesTotalChars > WINDSURF_GLOBAL_RULES_CHAR_LIMIT) {
      warnings.push(
        `Global rules total exceeds ${WINDSURF_GLOBAL_RULES_CHAR_LIMIT} char limit ` +
          `(${globalRulesTotalChars} chars total)`,
      );
      // Only increment degraded if not already counted
      degradedCount++;
    }

    features.push({
      feature: "rules",
      status: resolveStatus(files.rules.length, degradedCount, true),
      notes: degradedCount > 0 ? `${degradedCount} rule issue(s) found` : "",
      item_count: files.rules.length,
      degraded_count: degradedCount,
      warnings,
    });
  }

  // --- Skills (Windsurf Workflows) ---
  {
    const warnings: string[] = [];
    let degradedCount = 0;

    for (const filePath of files.skills) {
      const content = await readFileContent(filePath);
      if (content.length === 0) {
        warnings.push(`Workflow file is empty or unreadable: ${filePath}`);
        degradedCount++;
        continue;
      }

      // Check workflow character limit (12K)
      if (content.length > WINDSURF_WORKFLOW_CHAR_LIMIT) {
        warnings.push(
          `Workflow file exceeds ${WINDSURF_WORKFLOW_CHAR_LIMIT} char limit ` +
            `(${content.length} chars): ${filePath}`,
        );
        degradedCount++;
      }
    }

    features.push({
      feature: "skills",
      status: resolveStatus(files.skills.length, degradedCount, true),
      notes:
        degradedCount > 0
          ? `${degradedCount} workflow(s) exceeding character limits`
          : "",
      item_count: files.skills.length,
      degraded_count: degradedCount,
      warnings,
    });
  }

  // --- Hooks ---
  {
    const warnings: string[] = [];
    let degradedCount = 0;

    for (const filePath of files.hooks) {
      const content = await readFileContent(filePath);
      if (content.length === 0) {
        warnings.push(`Hook file is empty or unreadable: ${filePath}`);
        degradedCount++;
        continue;
      }

      // Check character limit for hook/workflow files (12K same as workflows)
      if (content.length > WINDSURF_WORKFLOW_CHAR_LIMIT) {
        warnings.push(
          `Hook file exceeds ${WINDSURF_WORKFLOW_CHAR_LIMIT} char limit ` +
            `(${content.length} chars): ${filePath}`,
        );
        degradedCount++;
      }
    }

    features.push({
      feature: "hooks",
      status: resolveStatus(files.hooks.length, degradedCount, true),
      notes: degradedCount > 0 ? `${degradedCount} hook(s) with issues` : "",
      item_count: files.hooks.length,
      degraded_count: degradedCount,
      warnings,
    });
  }

  // --- Agents ---
  // Windsurf has no agent format (agents: false in supportedFeatures)
  {
    features.push({
      feature: "agents",
      status: "unsupported",
      notes: "Windsurf does not support agent profiles",
      item_count: 0,
      degraded_count: 0,
      warnings: [],
    });
  }

  // Include warnings from EmitResult
  const emitWarnings = emitResult.warnings;
  if (emitWarnings.length > 0) {
    const rulesFeature = features.find((f) => f.feature === "rules");
    if (rulesFeature) {
      rulesFeature.warnings.push(...emitWarnings);
    }
  }

  return buildReport(
    "windsurf",
    "Windsurf / Codeium",
    "2026.03",
    "Windsurf",
    features,
  );
}

// ---------------------------------------------------------------------------
// VS Code validator
// ---------------------------------------------------------------------------

/**
 * Validate VS Code adapter output against VS Code / GitHub Copilot constraints.
 *
 * Checks:
 * - Agent profiles have required frontmatter: `name`, `description`
 * - Agent profiles do not exceed 30,000 characters
 * - Skills have `name` and `description` in SKILL.md frontmatter
 * - Hook JSON files have valid structure
 * - Hook stability warnings are present
 *
 * @param emitResult - The EmitResult from the VS Code adapter's emit() call
 * @returns A CompatibilityReport for the VS Code adapter
 *
 * @example
 * ```typescript
 * const adapter = createVscodeAdapter();
 * const emitResult = await adapter.emit(outputDir);
 * const report = await validateVscodeOutput(emitResult);
 * console.log(report.features); // Per-feature breakdown
 * ```
 */
export async function validateVscodeOutput(
  emitResult: EmitResult,
): Promise<CompatibilityReport> {
  const files = categorizeFiles(emitResult.filesPaths);
  const features: FeatureMapping[] = [];

  // --- Agents ---
  {
    const warnings: string[] = [];
    let degradedCount = 0;

    for (const filePath of files.agents) {
      const content = await readFileContent(filePath);
      if (content.length === 0) {
        warnings.push(`Agent profile is empty or unreadable: ${filePath}`);
        degradedCount++;
        continue;
      }

      // Check character limit (30K)
      if (content.length > VSCODE_AGENT_CHAR_LIMIT) {
        warnings.push(
          `Agent profile exceeds ${VSCODE_AGENT_CHAR_LIMIT} char limit ` +
            `(${content.length} chars): ${filePath}`,
        );
        degradedCount++;
      }

      // Check required frontmatter: name, description
      const fm = extractFrontmatter(content);
      if (!fm) {
        warnings.push(`Agent profile missing YAML frontmatter: ${filePath}`);
        degradedCount++;
      } else {
        if (!fm.name) {
          warnings.push(
            `Agent profile missing required 'name' in frontmatter: ${filePath}`,
          );
          degradedCount++;
        }
        if (!fm.description) {
          warnings.push(
            `Agent profile missing required 'description' in frontmatter: ${filePath}`,
          );
          degradedCount++;
        }
      }
    }

    features.push({
      feature: "agents",
      status: resolveStatus(files.agents.length, degradedCount, true),
      notes:
        degradedCount > 0
          ? `${degradedCount} agent profile(s) with issues`
          : "",
      item_count: files.agents.length,
      degraded_count: degradedCount,
      warnings,
    });
  }

  // --- Skills ---
  {
    const warnings: string[] = [];
    let degradedCount = 0;

    for (const filePath of files.skills) {
      const content = await readFileContent(filePath);
      if (content.length === 0) {
        warnings.push(`Skill file is empty or unreadable: ${filePath}`);
        degradedCount++;
        continue;
      }

      // Check required frontmatter: name, description
      const fm = extractFrontmatter(content);
      if (!fm) {
        warnings.push(
          `Skill file missing YAML frontmatter with name/description: ${filePath}`,
        );
        degradedCount++;
      } else {
        if (!fm.name) {
          warnings.push(
            `Skill file missing required 'name' in frontmatter: ${filePath}`,
          );
          degradedCount++;
        }
        if (!fm.description) {
          warnings.push(
            `Skill file missing required 'description' in frontmatter: ${filePath}`,
          );
          degradedCount++;
        }
      }
    }

    features.push({
      feature: "skills",
      status: resolveStatus(files.skills.length, degradedCount, true),
      notes:
        degradedCount > 0
          ? `${degradedCount} skill(s) with frontmatter issues`
          : "",
      item_count: files.skills.length,
      degraded_count: degradedCount,
      warnings,
    });
  }

  // --- Hooks ---
  {
    const warnings: string[] = [];
    let degradedCount = 0;
    const previewWarning =
      "VS Code hooks are in Preview (March 2026). This configuration may break in future VS Code releases.";

    // Add a standing warning about Preview status
    if (files.hooks.length > 0) {
      warnings.push(previewWarning);
    }

    for (const filePath of files.hooks) {
      const content = await readFileContent(filePath);
      if (content.length === 0) {
        warnings.push(`Hook file is empty or unreadable: ${filePath}`);
        degradedCount++;
        continue;
      }

      // Check that hook JSON files have valid structure
      if (filePath.endsWith(".json")) {
        try {
          const parsed = JSON.parse(content);

          // Check for _warning field (stability warning)
          if (parsed && typeof parsed === "object" && !parsed._warning) {
            warnings.push(
              `Hook file missing stability warning (_warning field): ${filePath}`,
            );
            degradedCount++;
          }
        } catch {
          warnings.push(`Hook file contains invalid JSON: ${filePath}`);
          degradedCount++;
        }
      }
    }

    features.push({
      feature: "hooks",
      status: resolveStatus(files.hooks.length, degradedCount, true),
      notes:
        files.hooks.length > 0
          ? "VS Code hooks are in Preview (unstable API)"
          : "",
      item_count: files.hooks.length,
      degraded_count: degradedCount,
      warnings,
    });
  }

  // --- Rules ---
  {
    const warnings: string[] = [];
    let degradedCount = 0;

    for (const filePath of files.rules) {
      const content = await readFileContent(filePath);
      if (content.length === 0) {
        warnings.push(`Rule file is empty or unreadable: ${filePath}`);
        degradedCount++;
        continue;
      }
    }

    features.push({
      feature: "rules",
      status: resolveStatus(files.rules.length, degradedCount, true),
      notes: "",
      item_count: files.rules.length,
      degraded_count: degradedCount,
      warnings,
    });
  }

  // Include warnings from EmitResult
  const emitWarnings = emitResult.warnings;
  if (emitWarnings.length > 0) {
    const agentsFeature = features.find((f) => f.feature === "agents");
    if (agentsFeature) {
      agentsFeature.warnings.push(...emitWarnings);
    }
  }

  return buildReport(
    "vscode",
    "VS Code / GitHub Copilot",
    "1.0.0",
    "VS Code",
    features,
  );
}

// ---------------------------------------------------------------------------
// Aggregation utility
// ---------------------------------------------------------------------------

/**
 * Aggregate multiple per-adapter compatibility reports into a single report.
 *
 * Collects all per-adapter reports and wraps them with a shared generation
 * timestamp. Used after running all per-adapter validators to produce the
 * final `compatibility-report.json`.
 *
 * @param reports - Array of per-adapter CompatibilityReport objects
 * @returns An AggregatedReport with current timestamp and all adapter reports
 *
 * @example
 * ```typescript
 * const windsurfReport = await validateWindsurfOutput(windsurfEmit);
 * const vscodeReport = await validateVscodeOutput(vscodeEmit);
 *
 * const aggregated = aggregateReports([windsurfReport, vscodeReport]);
 * await Bun.write("dist/compatibility-report.json", JSON.stringify(aggregated, null, 2));
 * ```
 */
export function aggregateReports(
  reports: CompatibilityReport[],
): AggregatedReport {
  return {
    generated_at: new Date().toISOString(),
    adapters: reports,
  };
}
