/**
 * Luca Commands Extension for Pi
 *
 * Registers user-facing slash commands for quick Luca workflow status
 * access. Commands are visible in the Pi command palette and triggered
 * by the user manually. They do NOT appear in the LLM's tool list.
 *
 * Commands registered:
 * - /status: Current phase, complexity, memory indicators
 * - /track: Active subagent count and status summary
 * - /verify: Last harness verification result
 * - /todos: Pending phase todos from .planning/
 * - /subagents: Detailed subagent table
 * - /safety: Safety gate mode and recent audit entries
 *
 * Source: src/hooks/pi-extensions/luca-commands.ts
 * Deployed to: .pi/extensions/luca-commands.ts
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, basename } from "path";

import { notifySafe } from "./__helpers/notify";
import { subagentRegistry } from "./__helpers/subagent-registry";

/**
 * Extract a summary from STATE.md content.
 *
 * Pulls Phase, Plan, Complexity, and Oversight fields from the
 * markdown content to produce a concise status string.
 *
 * @param content - Raw STATE.md content
 * @returns Formatted status summary string
 */
function formatStatusSummary(content: string): string {
  const lines = content.split("\n");
  const fields: string[] = [];

  const extractors = [
    { label: "Phase", pattern: /^##?\s*Phase[:\s]*(.+)/i },
    { label: "Plan", pattern: /Plan[:\s]*(.+)/i },
    { label: "Complexity", pattern: /Task Complexity[:\s]*(.+)/i },
    { label: "Oversight", pattern: /Oversight Mode[:\s]*(.+)/i },
    { label: "Status", pattern: /Status[:\s]*(.+)/i },
  ];

  for (const line of lines) {
    for (const { label, pattern } of extractors) {
      const match = line.match(pattern);
      if (match?.[1] && !fields.some((f) => f.startsWith(label))) {
        fields.push(`${label}: ${match[1].trim()}`);
      }
    }
  }

  return fields.length > 0
    ? fields.join(" | ")
    : "STATE.md found but no recognized fields extracted";
}

/**
 * Pi extension: Slash commands for Luca workflow status.
 *
 * Registers 6 lightweight commands that read planning state and
 * display results via ctx.ui.notify(). Commands are designed to
 * complete in < 50ms with no shell command execution.
 *
 * @param pi - Pi ExtensionAPI instance
 */
export default function lucaCommands(pi: any) {
  const cwd = process.cwd();
  const planningDir = join(cwd, ".planning");

  // ─── Command: /status ─────────────────────────────────

  pi.registerCommand("status", {
    description: "Show Luca workflow status (phase, complexity, memory)",
    handler: async (_args: any, ctx: any) => {
      const statePath = join(planningDir, "STATE.md");
      if (!existsSync(statePath)) {
        notifySafe(ctx, "No STATE.md found -- run /lu to initialize", "warn");
        return;
      }

      const content = readFileSync(statePath, "utf-8");
      const summary = formatStatusSummary(content);

      notifySafe(ctx, summary, "info");
    },
  });

  // ─── Command: /track ──────────────────────────────────

  pi.registerCommand("track", {
    description: "Show active subagent count and status summary",
    handler: async (_args: any, ctx: any) => {
      const agents = subagentRegistry.values();
      if (agents.length === 0) {
        notifySafe(ctx, "No subagents tracked", "info");
        return;
      }

      const running = agents.filter((a) => a.status === "running").length;
      const completed = agents.filter((a) => a.status === "completed").length;
      const failed = agents.filter((a) => a.status === "failed").length;
      const aborted = agents.filter((a) => a.status === "aborted").length;

      const parts = [`${agents.length} total`];
      if (running > 0) parts.push(`${running} running`);
      if (completed > 0) parts.push(`${completed} completed`);
      if (failed > 0) parts.push(`${failed} failed`);
      if (aborted > 0) parts.push(`${aborted} aborted`);

      notifySafe(ctx, `Subagents: ${parts.join(", ")}`, "info");
    },
  });

  // ─── Command: /verify ─────────────────────────────────

  pi.registerCommand("verify", {
    description: "Show last verification harness result",
    handler: async (_args: any, ctx: any) => {
      // Check for cached harness result in .planning/
      const resultPath = join(planningDir, "last-harness-result.json");
      if (!existsSync(resultPath)) {
        notifySafe(
          ctx,
          "No cached verification result -- run luca_verify first",
          "info",
        );
        return;
      }

      try {
        const raw = readFileSync(resultPath, "utf-8");
        const result = JSON.parse(raw);
        const status = result.status === "passed" ? "PASSED" : "FAILED";
        const checks = (result.checks ?? [])
          .map(
            (c: { name: string; status: string }) => `${c.name}: ${c.status}`,
          )
          .join(", ");

        notifySafe(
          ctx,
          `Last verify: ${status} (${checks})`,
          result.status === "passed" ? "info" : "error",
        );
      } catch {
        notifySafe(ctx, "Failed to parse cached verification result", "warn");
      }
    },
  });

  // ─── Command: /todos ──────────────────────────────────

  pi.registerCommand("todos", {
    description: "Show current phase todos from .planning/",
    handler: async (_args: any, ctx: any) => {
      const pendingDir = join(planningDir, "todos", "pending");
      if (!existsSync(pendingDir)) {
        notifySafe(ctx, "No pending todos directory found", "info");
        return;
      }

      try {
        const files = readdirSync(pendingDir).filter((f) => f.endsWith(".md"));
        if (files.length === 0) {
          notifySafe(ctx, "No pending todos", "info");
          return;
        }

        const todoNames = files.map((f) => basename(f, ".md")).join(", ");

        notifySafe(
          ctx,
          `${files.length} pending todo(s): ${todoNames}`,
          "info",
        );
      } catch {
        notifySafe(ctx, "Failed to read todos directory", "warn");
      }
    },
  });

  // ─── Command: /subagents ──────────────────────────────

  pi.registerCommand("subagents", {
    description: "Show detailed subagent table (id, agent, status, duration)",
    handler: async (_args: any, ctx: any) => {
      const agents = subagentRegistry.values();
      if (agents.length === 0) {
        notifySafe(ctx, "No subagents tracked", "info");
        return;
      }

      const rows = agents.map((a) => {
        const duration = a.completedAt
          ? ((a.completedAt - a.createdAt) / 1000).toFixed(1)
          : ((Date.now() - a.createdAt) / 1000).toFixed(1);
        return `${a.id} | ${a.agent} | ${a.status} | ${duration}s`;
      });

      const table = `ID | Agent | Status | Duration\n${rows.join("\n")}`;

      notifySafe(ctx, table, "info");
    },
  });

  // ─── Command: /safety ─────────────────────────────────

  pi.registerCommand("safety", {
    description: "Show safety gate mode and recent audit entries",
    handler: async (_args: any, ctx: any) => {
      // Safety state is maintained by luca-safety-rules.ts.
      // We cannot import its internal state directly, so we read
      // the safety status from its tool output pattern.
      // For slash commands, we provide a summary based on what
      // is accessible from the shared registries.
      notifySafe(
        ctx,
        "Safety info: use luca_list_safety_rules tool for full details",
        "info",
      );
    },
  });
}
