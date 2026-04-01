/**
 * pre-step-lu-allowlist — Advisory PreToolUse hook on Agent.
 *
 * Warns when unregistered Agent() names are spawned during an active lu
 * session. This catches LLM improvisation (e.g., spawning "code-developer"
 * instead of using the registered pipeline agents).
 *
 * Advisory mode: always exits 0 (never blocks). Emits a systemMessage
 * warning so the LLM sees the issue and can self-correct.
 *
 * Future: can be upgraded to blocking (exitBlock) once false positive
 * rate is confirmed to be low.
 *
 * @module pre-step-lu-allowlist
 */

import { existsSync } from "node:fs";

import {
  readStdinJson,
  exitSuccess,
  extractToolInput,
} from "../__helpers/hook-io.ts";

// ─── Registered Agent Prefixes ──────────────────────────────────────────────

/**
 * Complete set of agent name prefixes allowed during lu orchestration.
 * Entries ending with "-" are prefix-matched; others are exact-matched.
 *
 * Kept in sync with:
 * - agent-status-sync.ts (LU_STEP_MAP)
 * - agent-transition-sync.ts (lu orchestrator block)
 * - pre-step-lu.ts (agentPrefixes + subSkills)
 */
const REGISTERED: ReadonlyArray<string> = [
  // Singletons (exact match)
  "cognition",
  "configure",
  "backlog",
  // Phase-suffixed (prefix match)
  "classify-",
  "discuss-",
  "plan-",
  "plan-gaps-",
  "plan-review-",
  "plan-revise-",
  "execute-",
  "execute-gaps-",
  "harness-",
  "fix-",
  "verify-",
  "learn-",
  "process-data-",
  // Code review agents
  "review-arch-",
  "review-dx-",
  "review-security-",
  "review-simplify-",
  // v2 research agents
  "research-scope-",
  "research-arch-",
  "research-impl-",
  "research-eco-",
  "research-risk-",
  "research-synth-",
  "research-expand-",
  "research-graduate-",
  // v2 research reviewers
  "review-accuracy-",
  "review-completeness-",
  "review-actionability-",
  // Milestone agents
  "milestone-learn",
  "milestone-prune",
  "milestone-shadow",
  "milestone-archive",
  "milestone-finalize",
  // Route handlers
  "verify-route",
  "learn-route",
];

/**
 * Check if an agent name is in the allowlist.
 *
 * Entries ending with "-" are prefix-matched via startsWith.
 * All other entries are exact-matched.
 *
 * @param agentName - The Agent() name to check
 * @returns true if the name matches any registered entry
 */
const isRegistered = (agentName: string): boolean => {
  for (const entry of REGISTERED) {
    if (entry.endsWith("-")) {
      if (agentName.startsWith(entry)) return true;
    } else {
      if (agentName === entry) return true;
    }
  }
  return false;
};

// ─── Main ───────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  try {
    const data = await readStdinJson();

    // Only act on Agent tool invocations
    if (!data || data.tool_name !== "Agent") return exitSuccess();

    // Extract agent name
    const toolInput = extractToolInput(data);
    const agentName = toolInput?.name;
    if (typeof agentName !== "string" || agentName.length === 0)
      return exitSuccess();

    // Only check when lu orchestrator is active
    if (!existsSync("/tmp/lu-context.json")) return exitSuccess();

    // Check if agent is in the registered allowlist
    if (isRegistered(agentName)) return exitSuccess();

    // Route handler pattern: {route}-handler is allowed for Step 3
    if (agentName.endsWith("-handler")) return exitSuccess();

    // Unregistered agent detected — emit advisory warning
    // The LLM will see this in the systemMessage and can self-correct
    const warning =
      `[lu-allowlist] WARNING: Agent "${agentName}" is not a registered pipeline agent. ` +
      `Use a registered agent from the Agent Type Mapping table in lu.skill.ts. ` +
      `Registered prefixes include: cognition, classify-, discuss-, plan-, execute-, ` +
      `harness-, fix-, verify-, review-*, learn-, process-data-, milestone-*, research-*.`;

    // Write warning to stderr (visible in Claude Code hook output)
    process.stderr.write(warning + "\n");
  } catch {
    // Hook must NEVER fail — swallow all errors
  }

  return exitSuccess();
};

await main();
