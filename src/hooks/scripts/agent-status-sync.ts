/**
 * agent-status-sync — PreToolUse hook on Agent that updates the status bus.
 *
 * Maps Agent() names to human-readable pipeline step names and progress
 * positions, writing to .planning/.statusline.json so the statusline HUD
 * shows accurate "[skill] > [step] [progress]" during execution.
 *
 * Works alongside skill-status-enter (which sets the skill name) and
 * agent-transition-sync (which fires state transitions on completion).
 *
 * Always exits 0 — status bus writes must never fail visibly.
 *
 * @module agent-status-sync
 */

import { existsSync } from "node:fs";

import {
  readStdinJson,
  exitSuccess,
  projectDir,
  extractToolInput,
} from "../__helpers/hook-io.ts";
import { writeStatusBus, readStatusBus, STATUS_BUS_PATH } from "../../shared";

const AGENT_NAME_RE = /^[a-z0-9-]+$/;

// ─── Pipeline Step Mapping ──────────────────────────────────────────────────

/** Total major steps in the lu pipeline per phase */
const LU_PIPELINE_TOTAL = 8;

/**
 * Agent name prefix → [stepName, pipelinePosition].
 * Ordered longest-prefix-first for correct matching — shorter prefixes
 * like "plan-" must come AFTER longer ones like "plan-review-".
 *
 * Pipeline positions (1-8):
 *   1=preflight  2=configure  3=research  4=discuss
 *   5=planning   6=executing  7=verifying 8=learning
 */
const LU_STEP_MAP: ReadonlyArray<readonly [string, string, number]> = [
  // v2 research variants
  ["research-scope-", "research", 3],
  ["research-arch-", "research", 3],
  ["research-impl-", "research", 3],
  ["research-eco-", "research", 3],
  ["research-risk-", "research", 3],
  ["research-synth-", "research", 3],
  ["research-expand-", "research", 3],
  ["research-graduate-", "research", 3],
  // v2 research reviewers
  ["review-accuracy-", "research-review", 3],
  ["review-completeness-", "research-review", 3],
  ["review-actionability-", "research-review", 3],
  // Plan sub-types (before generic "plan-")
  ["plan-review-", "plan-review", 5],
  ["plan-revise-", "plan-revise", 5],
  ["plan-gaps-", "gap-plan", 6],
  // Execute sub-types (before generic "execute-")
  ["execute-gaps-", "gap-fix", 6],
  // Code review agents
  ["review-arch-", "reviewing", 7],
  ["review-dx-", "reviewing", 7],
  ["review-security-", "reviewing", 7],
  ["review-simplify-", "reviewing", 7],
  // Misc agents
  ["process-data-", "metrics", 8],
  ["milestone-", "milestone", 8],
  ["verify-route", "wrap-up", 8],
  ["learn-route", "wrap-up", 8],
  // Main step agents (shorter prefixes — MUST come after longer ones)
  ["cognition", "preflight", 1],
  ["classify", "routing", 2],
  ["configure", "configure", 2],
  ["backlog", "backlog", 2],
  ["discuss-", "discuss", 4],
  ["plan-", "planning", 5],
  ["execute-", "executing", 6],
  ["harness-", "harness", 7],
  ["fix-", "fixing", 7],
  ["verify-", "verifying", 7],
  ["learn-", "learning", 8],
];

/**
 * Extract phase number from agent name.
 * e.g., "execute-246" → 246, "plan-review-246-2" → 246, "cognition" → undefined
 */
const extractPhase = (agentName: string): number | undefined => {
  const match = agentName.match(/-(\d+)(?:-|$)/);
  if (!match?.[1]) return undefined;
  const num = parseInt(match[1], 10);
  return num > 0 && num < 1000 ? num : undefined;
};

/** Match agent name to pipeline step. Returns null if no match. */
const matchStep = (
  agentName: string,
): { step: string; position: number } | null => {
  for (const [prefix, step, position] of LU_STEP_MAP) {
    if (agentName === prefix || agentName.startsWith(prefix)) {
      return { step, position };
    }
  }
  return null;
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

    // Sanitize: only allow kebab-case alphanumeric agent names
    if (!AGENT_NAME_RE.test(agentName)) return exitSuccess();

    // Only update bus when lu orchestrator is active
    if (!existsSync("/tmp/lu-context.json")) return exitSuccess();

    // Match agent name to pipeline step
    const matched = matchStep(agentName);
    if (!matched) return exitSuccess();

    const phase = extractPhase(agentName);

    // Rescue existing skill value before writeStatusBus's stale guard can drop it.
    // Pass Number.MAX_SAFE_INTEGER to bypass TTL — we only want the skill field,
    // and agent-status-sync never writes its own skill value, so echoing what's
    // already on disk is always safe.
    const busPath = `${projectDir()}/${STATUS_BUS_PATH}`;
    let existingSkill =
      (await readStatusBus(busPath, Number.MAX_SAFE_INTEGER))?.skill ?? "";

    // Sidecar fallback: if the bus was cleared or never written, try /tmp/lu-skill.txt
    if (!existingSkill) {
      try {
        const sidecar = Bun.file("/tmp/lu-skill.txt");
        if (await sidecar.exists()) {
          const txt = (await sidecar.text()).trim();
          if (txt && /^[a-z0-9-]+$/.test(txt)) existingSkill = txt;
        }
      } catch {
        // ignore
      }
    }

    await writeStatusBus(
      {
        step: matched.step,
        wave_current: matched.position,
        wave_total: LU_PIPELINE_TOTAL,
        stage: "EXECUTING",
        ...(phase !== undefined && { phase }),
        ...(existingSkill ? { skill: existingSkill } : {}),
      },
      busPath,
    );
  } catch {
    // Hook must NEVER fail — swallow all errors
  }

  return exitSuccess();
};

await main();
