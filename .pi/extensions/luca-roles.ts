/**
 * Luca Agent Roles Extension for Pi
 *
 * Enforces tool-restricted agent roles by reading persona files from
 * .pi/agents/, parsing YAML frontmatter for allowed tools, and blocking
 * unauthorized tool calls when a role is active.
 *
 * Source: src/hooks/pi-extensions/luca-roles.ts
 * Deployed to: .pi/extensions/luca-roles.ts
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

import type { AgentFrontmatter } from "./__helpers/frontmatter";
import { parseFrontmatter } from "./__helpers/frontmatter";
import { resolveAgentModel, getModelTier } from "./__helpers/model-routing";
import { createJsonResponse, createTextResponse } from "./__helpers/response";
import { normalizeToolName } from "./__helpers/sanitize";

import type { PiExtensionAPI, PiExtensionContext } from "./__types/pi-context";

/** Parsed agent role from .pi/agents/*.md frontmatter. */
interface AgentRole extends AgentFrontmatter {
  tools: string[];
}

/**
 * Pi extension: Agent role activation and tool restriction enforcement.
 *
 * Registers tools for listing available agent roles from .pi/agents/,
 * activating a role to enforce its tool restrictions, deactivating
 * the active role, and querying the current role state.
 *
 * @param pi - Pi ExtensionAPI instance
 */
export default function lucaRoles(pi: PiExtensionAPI) {
  const cwd = process.cwd();
  const agentsDir = join(cwd, ".pi", "agents");

  /** Currently active role (null = unrestricted). */
  let activeRole: AgentRole | null = null;

  /** Original active tools before role was applied (for restoration). */
  let originalTools: string[] | null = null;

  /** Original model before role was applied (for restoration). */
  let originalModel: string | null = null;

  /** Original thinking level before role was applied (for restoration). */
  let originalThinkingLevel: string | null = null;
  let thinkingLevelCaptured = false;

  /** Tools always allowed when a role is active (for role management). */
  const ROLE_MANAGEMENT_TOOLS = [
    "luca_list_roles",
    "luca_activate_role",
    "luca_deactivate_role",
    "luca_active_role",
  ];

  /**
   * Parse agent frontmatter and normalize tool names for role enforcement.
   *
   * Reads YAML frontmatter from an agent file's content and normalizes
   * the tool names for case-insensitive restriction matching.
   *
   * @param content - Full markdown content of a .pi/agents/*.md file
   * @returns Parsed agent role with normalized tools, or null if no valid frontmatter
   */
  function parseAgentRole(content: string): AgentRole | null {
    const fm = parseFrontmatter(content);
    if (!fm) return null;
    return {
      ...fm,
      tools: fm.tools.map(normalizeToolName),
    };
  }

  /**
   * Load all available agent roles from .pi/agents/.
   *
   * Reads every .md file in the agents directory, parses its YAML
   * frontmatter, and returns an array of structured agent roles
   * with normalized tool names for restriction enforcement.
   *
   * @returns Array of parsed agent roles, empty if agents directory missing
   */
  function loadRoles(): AgentRole[] {
    if (!existsSync(agentsDir)) return [];

    const files = readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
    const roles: AgentRole[] = [];

    for (const file of files) {
      const content = readFileSync(join(agentsDir, file), "utf-8");
      const role = parseAgentRole(content);
      if (role) roles.push(role);
    }

    return roles;
  }

  // Tool: List available agent roles
  pi.registerTool({
    name: "luca_list_roles",
    label: "List Agent Roles",
    description:
      "List all available agent roles from .pi/agents/ with their tool restrictions and model preferences.",
    parameters: {},
    async execute() {
      const roles = loadRoles();
      const summary = roles.map((r) => ({
        name: r.name,
        description: r.description,
        tools: r.tools,
        model: r.model ?? "default",
      }));
      return createJsonResponse(summary);
    },
  });

  // Tool: Activate a specific agent role
  pi.registerTool({
    name: "luca_activate_role",
    label: "Activate Agent Role",
    description:
      "Activate an agent role to enforce its tool restrictions. Only tools listed in the role's frontmatter will be allowed. Use luca_deactivate_role to remove restrictions.",
    parameters: {
      type: "object",
      properties: {
        role: {
          type: "string",
          description:
            "Agent role name to activate (e.g., lu-executor, code-architect, lu-verifier)",
        },
      },
      required: ["role"],
    },
    async execute(_toolCallId: string, params: { role: string }) {
      const roles = loadRoles();
      const normalizedRoleName = params.role.trim().toLowerCase();
      const role = roles.find(
        (r) => r.name.trim().toLowerCase() === normalizedRoleName,
      );

      if (!role) {
        const available = roles.map((r) => r.name).join(", ");
        return createTextResponse(
          `Role "${params.role}" not found. Available: ${available}`,
        );
      }

      // Store original tools for restoration
      if (!originalTools) {
        originalTools = pi.getActiveTools?.() ?? null;
      }

      activeRole = role;

      // Use setActiveTools to enforce restrictions natively
      if (pi.setActiveTools && role.tools.length > 0) {
        // Always include luca role management tools so the agent can deactivate
        const allowedTools = [...role.tools, ...ROLE_MANAGEMENT_TOOLS];
        pi.setActiveTools(allowedTools);
      }

      // Resolve and apply model for this role
      const resolvedModel = resolveAgentModel(role, cwd);
      if (pi.setModel) {
        if (!originalModel) {
          originalModel = pi.getModel?.() ?? null;
        }
        pi.setModel(resolvedModel);
      }

      // Set thinking level based on model tier
      const tier = getModelTier(resolvedModel);
      if (pi.setThinkingLevel) {
        if (!thinkingLevelCaptured) {
          originalThinkingLevel = pi.getThinkingLevel?.() ?? null;
          thinkingLevelCaptured = true;
        }
        if (tier === "capable") {
          pi.setThinkingLevel("high");
        } else if (thinkingLevelCaptured) {
          // Restore thinking level when switching to non-capable tier
          pi.setThinkingLevel(originalThinkingLevel ?? "normal");
        }
      }

      const modelInfo = pi.setModel ? ` | model: ${resolvedModel}` : "";
      return createTextResponse(
        `Activated role "${role.name}" — allowed tools: ${role.tools.join(", ")}${modelInfo}`,
      );
    },
  });

  // Tool: Deactivate current role
  pi.registerTool({
    name: "luca_deactivate_role",
    label: "Deactivate Role",
    description:
      "Deactivate the current agent role, removing all tool restrictions.",
    parameters: {},
    async execute() {
      const previous = activeRole?.name ?? "none";
      activeRole = null;

      // Restore original tools
      if (pi.setActiveTools && originalTools) {
        pi.setActiveTools(originalTools);
        originalTools = null;
      }

      // Restore original model
      if (pi.setModel && originalModel) {
        pi.setModel(originalModel);
        originalModel = null;
      }

      // Restore original thinking level
      if (pi.setThinkingLevel && thinkingLevelCaptured) {
        pi.setThinkingLevel(originalThinkingLevel ?? "normal");
        originalThinkingLevel = null;
        thinkingLevelCaptured = false;
      }

      return createTextResponse(
        `Deactivated role "${previous}" — all tools now unrestricted`,
      );
    },
  });

  // Tool: Get current active role
  pi.registerTool({
    name: "luca_active_role",
    label: "Get Active Role",
    description:
      "Get the currently active agent role and its tool restrictions.",
    parameters: {},
    async execute() {
      if (!activeRole) {
        return createJsonResponse({ active: false, role: null });
      }
      return createJsonResponse({
        active: true,
        role: activeRole.name,
        tools: activeRole.tools,
        model: activeRole.model ?? "default",
      });
    },
  });

  // Enforce tool restrictions via tool_call event (fallback for older Pi versions)
  pi.on("tool_call", async (event: any, _ctx: PiExtensionContext) => {
    if (!activeRole) return; // No role active, allow all
    if (activeRole.tools.length === 0) return; // No restrictions defined

    // If setActiveTools is available, it handles enforcement — skip event-based blocking
    if (pi.setActiveTools) return;

    // Fallback: event-based blocking for older Pi versions
    const toolName = normalizeToolName(event.toolName || "");

    // Check if the tool is in the allowed list (normalized comparison)
    const allowed = activeRole.tools.some((t) => t === toolName);

    if (!allowed) {
      return {
        block: true,
        reason: `Role "${activeRole.name}" does not allow tool "${event.toolName}". Allowed: ${activeRole.tools.join(", ")}`,
      };
    }
  });

  // Re-apply role after session switch (setActiveTools/setModel reset on switch)
  pi.on("session_switch", async (_event: any, _ctx: PiExtensionContext) => {
    if (!activeRole) return;

    if (pi.setActiveTools && activeRole.tools.length > 0) {
      const allowedTools = [...activeRole.tools, ...ROLE_MANAGEMENT_TOOLS];
      pi.setActiveTools(allowedTools);
    }

    // Re-apply model routing for the active role
    if (pi.setModel) {
      const resolvedModel = resolveAgentModel(activeRole, cwd);
      pi.setModel(resolvedModel);

      if (getModelTier(resolvedModel) === "capable" && pi.setThinkingLevel) {
        pi.setThinkingLevel("high");
      }
    }
  });

  // Reset role state on new session
  pi.on("session_start", async () => {
    activeRole = null;
    if (originalTools && pi.setActiveTools) {
      pi.setActiveTools(originalTools);
      originalTools = null;
    }
    if (originalModel && pi.setModel) {
      pi.setModel(originalModel);
      originalModel = null;
    }
    if (thinkingLevelCaptured && pi.setThinkingLevel) {
      pi.setThinkingLevel(originalThinkingLevel ?? "normal");
      originalThinkingLevel = null;
      thinkingLevelCaptured = false;
    }
  });
}
