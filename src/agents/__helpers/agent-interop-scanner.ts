/**
 * Cross-agent interop scanner.
 *
 * Analyzes a set of agent configurations to find overlapping roles,
 * missing handoffs, and potential coordination gaps. Useful for
 * maintaining a clean agent registry as the framework grows.
 *
 * @module agents/agent-interop-scanner
 */
import filter from "lodash/filter";
import isEmpty from "lodash/isEmpty";

import type { AgentConfig } from "../__schemas/agent.schemas";

import type {
  InteropFinding,
  InteropReport,
} from "../__schemas/interop-scanner.schemas";

// ─── Scanner ─────────────────────────────────────────────────────────────────

/**
 * Known purpose categories that should exist in a well-formed agent registry.
 * If any are missing entirely, that's a gap.
 */
const EXPECTED_PURPOSES = [
  "researcher",
  "planner",
  "executor",
  "verifier",
  "reviewer",
] as const;

/**
 * Scan a set of agent configs for interop issues.
 *
 * Checks for:
 * - **Overlapping roles**: Multiple agents with same purpose and similar tools
 * - **Missing handoffs**: Purpose categories with no agents
 * - **Tool overlap**: Agents sharing many tools (potential confusion)
 * - **Missing tools**: Agents with no tools defined
 *
 * @param agents - Array of agent configurations to scan
 * @returns An InteropReport with findings
 *
 * @example
 * ```typescript
 * import { agentRegistry } from "~/agents";
 * const configs = Object.values(agentRegistry).map(fn => fn().config);
 * const report = scanAgentInterop(configs);
 * console.log(`Found ${report.overlap_count} overlaps, ${report.gap_count} gaps`);
 * ```
 */
export function scanAgentInterop(agents: AgentConfig[]): InteropReport {
  const findings: InteropFinding[] = [];

  // ─── Check for purpose category gaps ───────────────────────────────
  const purposes = agents
    .map((a) => a.frontmatter.purpose)
    .filter((p) => p !== undefined);
  const presentPurposes = new Set(purposes);

  for (const expected of EXPECTED_PURPOSES) {
    if (!presentPurposes.has(expected)) {
      findings.push({
        type: "gap",
        severity: "medium",
        description: `No agent with purpose "${expected}" found in the registry`,
        agents: [],
      });
    }
  }

  // ─── Check for overlapping purposes with similar tools ─────────────
  const byPurpose = new Map<string, AgentConfig[]>();
  for (const agent of agents) {
    const purpose = agent.frontmatter.purpose || "general";
    const existing = byPurpose.get(purpose) || [];
    existing.push(agent);
    byPurpose.set(purpose, existing);
  }

  for (const [purpose, group] of byPurpose.entries()) {
    if (group.length < 2) continue;

    // Check pairwise tool overlap within the same purpose
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const agentA = group[i];
        const agentB = group[j];
        if (!agentA || !agentB) continue;
        const toolsA = new Set(agentA.frontmatter.tools || []);
        const toolsB = new Set(agentB.frontmatter.tools || []);

        if (toolsA.size === 0 || toolsB.size === 0) continue;

        const intersection = filter(Array.from(toolsA), (t) => toolsB.has(t));
        const overlapRatio =
          intersection.length / Math.min(toolsA.size, toolsB.size);

        if (overlapRatio >= 0.8) {
          findings.push({
            type: "overlap",
            severity: "high",
            description: `Agents "${agentA.frontmatter.name}" and "${agentB.frontmatter.name}" share purpose "${purpose}" with ${Math.round(overlapRatio * 100)}% tool overlap`,
            agents: [agentA.frontmatter.name, agentB.frontmatter.name],
          });
        } else if (overlapRatio >= 0.5) {
          findings.push({
            type: "overlap",
            severity: "low",
            description: `Agents "${agentA.frontmatter.name}" and "${agentB.frontmatter.name}" share purpose "${purpose}" with ${Math.round(overlapRatio * 100)}% tool overlap`,
            agents: [agentA.frontmatter.name, agentB.frontmatter.name],
          });
        }
      }
    }
  }

  // ─── Check for agents with no tools ────────────────────────────────
  for (const agent of agents) {
    if (isEmpty(agent.frontmatter.tools)) {
      findings.push({
        type: "warning",
        severity: "low",
        description: `Agent "${agent.frontmatter.name}" has no tools defined`,
        agents: [agent.frontmatter.name],
      });
    }
  }

  // ─── Check for agents with no sections ─────────────────────────────
  for (const agent of agents) {
    if (isEmpty(agent.sections)) {
      findings.push({
        type: "warning",
        severity: "medium",
        description: `Agent "${agent.frontmatter.name}" has no sections defined`,
        agents: [agent.frontmatter.name],
      });
    }
  }

  // ─── Aggregate counts ──────────────────────────────────────────────
  const overlapCount = filter(findings, (f) => f.type === "overlap").length;
  const gapCount = filter(findings, (f) => f.type === "gap").length;
  const warningCount = filter(findings, (f) => f.type === "warning").length;

  return {
    agents_scanned: agents.length,
    findings,
    overlap_count: overlapCount,
    gap_count: gapCount,
    warning_count: warningCount,
    scanned_at: new Date().toISOString(),
  };
}
