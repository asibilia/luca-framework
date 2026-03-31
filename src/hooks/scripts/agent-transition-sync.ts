/**
 * agent-transition-sync -- Deterministic PostToolUse hook on Agent.
 *
 * Fires state transitions and context writes automatically when agents
 * complete, replacing ~50 LLM-dependent bash commands in skill templates.
 *
 * Intercepts PostToolUse:Agent, reads `tool_input.name`, identifies which
 * orchestrator is active (by checking /tmp context files), and fires the
 * mapped side-effects via luca-bridge and context-cli.
 *
 * Always exits 0 -- async hook, non-blocking.
 *
 * @module agent-transition-sync
 */

import { existsSync } from "node:fs";

import { readStdinJson, exitSuccess, projectDir } from "../__helpers/hook-io.ts";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TransitionEffect {
  readonly type: "transition";
  readonly event: string;
}

interface ContextWriteEffect {
  readonly type: "context-write";
  readonly orchestrator: string;
  readonly state: string;
}

type SideEffect = TransitionEffect | ContextWriteEffect;

interface AgentMapping {
  /** Prefix to match against agent name (e.g., "discuss-" matches "discuss-246") */
  readonly prefix: string;
  /** Side-effects to fire when this agent completes */
  readonly effects: readonly SideEffect[];
  /** Prefixes to EXCLUDE from matching (e.g., "plan-review-" excluded from "plan-") */
  readonly excludePrefixes?: readonly string[];
}

interface OrchestratorMapping {
  /** Path to check for active orchestrator context file */
  readonly contextFile: string;
  /** Agent mappings for this orchestrator */
  readonly agents: readonly AgentMapping[];
}

// ─── Orchestrator Mappings ──────────────────────────────────────────────────

/**
 * Ordered list of orchestrator mappings. Checked in priority order:
 * phase-execute > pr-address > verify > milestone-complete > lu
 *
 * Sub-orchestrators are checked first because they run WITHIN lu,
 * so their context files exist alongside lu's.
 */
const ORCHESTRATOR_MAPPINGS: readonly OrchestratorMapping[] = [
  // ── phase-execute ───────────────────────────────────────────────────────
  {
    contextFile: "/tmp/phase-execute-context.json",
    agents: [
      {
        prefix: "execute-",
        effects: [
          { type: "context-write", orchestrator: "phase-execute", state: "executed" },
        ],
      },
      {
        prefix: "verify-",
        effects: [
          { type: "transition", event: "VERIFY_PASSED" },
          { type: "context-write", orchestrator: "phase-execute", state: "verified" },
        ],
      },
      // NOTE: review-arch-*, review-dx-*, review-security-*, review-simplify-*
      // are SKIPPED -- review loop needs special handling (parallel agents,
      // REVIEW_COMPLETE fires only after ALL reviewers finish). Kept in template.
      {
        prefix: "learn-",
        effects: [
          { type: "transition", event: "LEARN_COMPLETE" },
          { type: "context-write", orchestrator: "phase-execute", state: "learned" },
        ],
      },
    ],
  },

  // ── pr-address ──────────────────────────────────────────────────────────
  {
    contextFile: "/tmp/pr-address-context.json",
    agents: [
      {
        prefix: "fetch",
        effects: [
          { type: "context-write", orchestrator: "pr-address", state: "fetched" },
        ],
      },
      {
        prefix: "validate",
        effects: [
          { type: "context-write", orchestrator: "pr-address", state: "validated" },
        ],
      },
      {
        prefix: "debate",
        effects: [
          { type: "context-write", orchestrator: "pr-address", state: "debated" },
        ],
      },
      {
        prefix: "fix",
        effects: [
          { type: "context-write", orchestrator: "pr-address", state: "fixed" },
        ],
      },
      {
        prefix: "learn",
        effects: [
          { type: "context-write", orchestrator: "pr-address", state: "learned" },
        ],
      },
      {
        prefix: "respond",
        effects: [
          { type: "context-write", orchestrator: "pr-address", state: "pushed" },
        ],
      },
    ],
  },

  // ── verify ──────────────────────────────────────────────────────────────
  {
    contextFile: "/tmp/verify-context.json",
    agents: [
      {
        prefix: "extract",
        effects: [
          { type: "context-write", orchestrator: "verify", state: "extracted" },
        ],
      },
      {
        prefix: "diagnose",
        effects: [
          { type: "context-write", orchestrator: "verify", state: "diagnosed" },
        ],
      },
      {
        prefix: "review",
        effects: [
          { type: "context-write", orchestrator: "verify", state: "reviewed" },
        ],
      },
    ],
  },

  // ── milestone-complete ──────────────────────────────────────────────────
  {
    contextFile: "/tmp/milestone-complete-context.json",
    agents: [
      {
        prefix: "milestone-learn",
        effects: [
          { type: "context-write", orchestrator: "milestone-complete", state: "learned" },
        ],
      },
      {
        prefix: "milestone-prune",
        effects: [
          { type: "context-write", orchestrator: "milestone-complete", state: "pruned" },
        ],
      },
      {
        prefix: "milestone-shadow",
        effects: [
          { type: "context-write", orchestrator: "milestone-complete", state: "scanned" },
        ],
      },
      {
        prefix: "milestone-archive",
        effects: [
          { type: "context-write", orchestrator: "milestone-complete", state: "archived" },
        ],
      },
      {
        prefix: "milestone-finalize",
        effects: [
          { type: "context-write", orchestrator: "milestone-complete", state: "finalized" },
        ],
      },
    ],
  },

  // ── lu (checked last -- sub-orchestrators run WITHIN lu) ────────────────
  {
    contextFile: "/tmp/lu-context.json",
    agents: [
      {
        prefix: "cognition",
        effects: [
          { type: "transition", event: "START" },
          { type: "transition", event: "PREFLIGHT_COMPLETE" },
        ],
      },
      // NOTE: classify-* is SKIPPED -- ROUTE_COMPLETE needs complexity data
      // from classify output. Kept in template.
      {
        prefix: "discuss-",
        effects: [
          { type: "transition", event: "DISCUSS_COMPLETE" },
        ],
      },
      {
        prefix: "plan-",
        excludePrefixes: ["plan-review-", "plan-revise-"],
        effects: [
          { type: "transition", event: "PLAN_COMPLETE" },
        ],
      },
      // NOTE: harness-* is SKIPPED -- can't know if harness passed from
      // PostToolUse alone. Kept in template.
      {
        prefix: "verify-",
        excludePrefixes: ["verify-route"],
        effects: [
          { type: "transition", event: "VERIFY_PASSED" },
        ],
      },
      {
        prefix: "learn-",
        excludePrefixes: ["learn-route"],
        effects: [
          { type: "transition", event: "LEARN_COMPLETE" },
        ],
      },
    ],
  },
];

// ─── Matching ───────────────────────────────────────────────────────────────

/**
 * Check if an agent name matches a mapping entry.
 *
 * Uses startsWith for prefix matching. If excludePrefixes are defined,
 * the agent name must NOT start with any of them.
 */
const matchesAgent = (agentName: string, mapping: AgentMapping): boolean => {
  if (!agentName.startsWith(mapping.prefix)) return false;

  if (mapping.excludePrefixes) {
    for (const exclude of mapping.excludePrefixes) {
      if (agentName.startsWith(exclude)) return false;
    }
  }

  return true;
};

/**
 * Find the side-effects for a given agent name across all orchestrators.
 *
 * Returns the first match found in priority order, or null if no match.
 */
const findEffects = (agentName: string): readonly SideEffect[] | null => {
  for (const orchestrator of ORCHESTRATOR_MAPPINGS) {
    if (!existsSync(orchestrator.contextFile)) continue;

    for (const mapping of orchestrator.agents) {
      if (matchesAgent(agentName, mapping)) {
        return mapping.effects;
      }
    }
  }

  return null;
};

// ─── Effect Execution ───────────────────────────────────────────────────────

/**
 * Fire a state transition via luca-bridge.
 * Silently swallows all errors.
 */
const fireTransition = (event: string): void => {
  try {
    Bun.spawnSync(["luca-bridge", "transition", `--event=${event}`], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: projectDir(),
    });
  } catch {
    // Never fail -- fire-and-forget
  }
};

/**
 * Fire a context write via context-cli.
 * Silently swallows all errors.
 */
const fireContextWrite = (orchestrator: string, state: string): void => {
  try {
    const cliPath = `${projectDir()}/src/skills/__schemas/context-cli.ts`;
    Bun.spawnSync(
      ["bun", cliPath, "write", orchestrator, JSON.stringify({ current_state: state })],
      {
        stdout: "pipe",
        stderr: "pipe",
        cwd: projectDir(),
      },
    );
  } catch {
    // Never fail -- fire-and-forget
  }
};

/**
 * Execute all side-effects for a matched agent.
 */
const executeEffects = (effects: readonly SideEffect[]): void => {
  for (const effect of effects) {
    if (effect.type === "transition") {
      fireTransition(effect.event);
    } else if (effect.type === "context-write") {
      fireContextWrite(effect.orchestrator, effect.state);
    }
  }
};

// ─── Main ───────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  try {
    const data = await readStdinJson();

    // Only act on Agent tool invocations
    if (!data || data.tool_name !== "Agent") return exitSuccess();

    // Extract agent name from tool_input.name
    const toolInput = data.tool_input as Record<string, unknown> | undefined;
    const agentName = toolInput?.name;
    if (typeof agentName !== "string" || agentName.length === 0) return exitSuccess();

    // Find and execute mapped side-effects
    const effects = findEffects(agentName);
    if (!effects) return exitSuccess();

    executeEffects(effects);
  } catch {
    // Hook must NEVER fail -- swallow all errors
  }

  return exitSuccess();
};

await main();
