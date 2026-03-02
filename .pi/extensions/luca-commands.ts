/**
 * Luca Commands Extension for Pi
 *
 * Registers user-facing slash commands for quick Luca workflow status
 * access, interactive model/complexity pickers, and keyboard shortcuts.
 * Commands are visible in the Pi command palette and triggered by the
 * user manually. They do NOT appear in the LLM's tool list.
 *
 * Commands registered:
 * - /status: Current phase, complexity, memory indicators
 * - /track: Active subagent count and status summary
 * - /verify: Last harness verification result
 * - /todos: Pending phase todos from .planning/
 * - /subagents: Detailed subagent table
 * - /safety: Safety gate mode and recent audit entries
 * - /switch-model: Interactive model picker (haiku/sonnet/opus)
 * - /set-complexity: Interactive complexity level picker
 * - /config: Interactive config toggle picker
 *
 * Keyboard shortcuts:
 * - Ctrl+Shift+S: /status
 * - Ctrl+Shift+V: /verify
 * - Ctrl+Shift+T: /track
 * - Ctrl+Shift+M: /switch-model
 *
 * Source: src/hooks/pi-extensions/luca-commands.ts
 * Deployed to: .pi/extensions/luca-commands.ts
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, basename } from "path";

import { selectSafe } from "./__helpers/dialogs";
import { notifySafe } from "./__helpers/notify";
import {
  readStateAsMap,
  readComplexity,
  writeComplexity,
  readStateContext,
} from "./__helpers/state-bridge";
import { subagentRegistry } from "./__helpers/subagent-registry";
import type { PiExtensionAPI, PiExtensionContext } from "./__types/pi-context";

/**
 * Format a status summary from the state bridge map.
 *
 * Pulls Phase, Complexity, Milestone, and Status fields from
 * the state context to produce a concise status string.
 *
 * @param state - Key-value state map from readStateAsMap
 * @returns Formatted status summary string
 */
function formatStatusSummary(state: Record<string, string>): string {
  const fields: string[] = [];

  const mappings = [
    { label: "Phase", key: "current_phase" },
    { label: "Milestone", key: "current_milestone" },
    { label: "Complexity", key: "complexity" },
    { label: "Oversight", key: "oversight" },
  ];

  for (const { label, key } of mappings) {
    const value = state[key] ?? state[label.toLowerCase()];
    if (value && value !== "undefined") {
      fields.push(`${label}: ${value}`);
    }
  }

  return fields.length > 0 ? fields.join(" | ") : "No workflow state found";
}

/**
 * Pi extension: Slash commands, interactive dialogs, and keyboard shortcuts.
 *
 * Registers 9 commands and 4 keyboard shortcuts for Luca workflow
 * interaction. All state reads go through the state bridge (state.json
 * primary, STATE.md fallback).
 *
 * @param pi - Pi ExtensionAPI instance
 */
export default function lucaCommands(pi: PiExtensionAPI) {
  const cwd = process.cwd();
  const planningDir = join(cwd, ".planning");

  // Guard: registerCommand is optional in PiExtensionAPI — bail if unavailable
  if (!pi.registerCommand) return;

  // ─── Command: /status ─────────────────────────────────

  pi.registerCommand("status", {
    description: "Show Luca workflow status (phase, complexity, memory)",
    handler: async (_args: any, ctx: PiExtensionContext) => {
      const state = readStateAsMap(cwd);
      if (state.error) {
        notifySafe(
          ctx,
          "No workflow state found -- run /lu to initialize",
          "warn",
        );
        return;
      }

      const summary = formatStatusSummary(state);
      notifySafe(ctx, summary, "info");
    },
  });

  // ─── Command: /track ──────────────────────────────────

  pi.registerCommand("track", {
    description: "Show active subagent count and status summary",
    handler: async (_args: any, ctx: PiExtensionContext) => {
      const agents = subagentRegistry.values();
      if (agents.length === 0) {
        notifySafe(
          ctx,
          "No subagents running. The LLM can spawn background agents via luca_subagent_create.",
          "info",
        );
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
    handler: async (_args: any, ctx: PiExtensionContext) => {
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
    handler: async (_args: any, ctx: PiExtensionContext) => {
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
    handler: async (_args: any, ctx: PiExtensionContext) => {
      const agents = subagentRegistry.values();
      if (agents.length === 0) {
        notifySafe(
          ctx,
          "No subagents tracked. Ask the LLM to spawn a background subagent, or use /track for a quick status check.",
          "info",
        );
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
    handler: async (_args: any, ctx: PiExtensionContext) => {
      notifySafe(
        ctx,
        "Safety info: use luca_list_safety_rules tool for full details",
        "info",
      );
    },
  });

  // ─── Command: /switch-model (interactive) ─────────────

  pi.registerCommand("switch-model", {
    description: "Switch the active model (haiku/sonnet/opus)",
    handler: async (_args: any, ctx: PiExtensionContext) => {
      const selected = await selectSafe(ctx, "Select model", [
        { label: "Haiku (fast)", value: "haiku" },
        { label: "Sonnet (balanced)", value: "sonnet" },
        { label: "Opus (capable)", value: "opus" },
      ]);

      if (!selected) {
        notifySafe(ctx, "Model switch cancelled", "info");
        return;
      }

      if (pi.setModel) {
        pi.setModel(selected);
        notifySafe(ctx, `Model switched to ${selected}`, "info");
      } else {
        notifySafe(ctx, "pi.setModel not available in this Pi version", "warn");
      }
    },
  });

  // ─── Command: /set-complexity (interactive) ───────────

  pi.registerCommand("set-complexity", {
    description: "Set task complexity level (TRIVIAL..CRITICAL)",
    handler: async (_args: any, ctx: PiExtensionContext) => {
      const current = readComplexity(cwd);

      const selected = await selectSafe(
        ctx,
        `Current: ${current}. Select new level`,
        [
          { label: "TRIVIAL (1 file, low risk)", value: "TRIVIAL" },
          { label: "SIMPLE (2-3 files, low-med risk)", value: "SIMPLE" },
          { label: "MODERATE (3-5 files, med risk)", value: "MODERATE" },
          { label: "COMPLEX (5-10 files, high risk)", value: "COMPLEX" },
          { label: "CRITICAL (10+ files, architectural)", value: "CRITICAL" },
        ],
      );

      if (!selected) {
        notifySafe(ctx, "Complexity change cancelled", "info");
        return;
      }

      const result = await writeComplexity(cwd, selected);
      if (result.success) {
        notifySafe(ctx, `Complexity set to ${selected}`, "info");
      } else {
        notifySafe(ctx, `Failed: ${result.error}`, "error");
      }
    },
  });

  // ─── Command: /config (interactive) ───────────────────

  pi.registerCommand("config", {
    description: "View and toggle common workflow config settings",
    handler: async (_args: any, ctx: PiExtensionContext) => {
      const stateCtx = readStateContext(cwd);
      const workflow = stateCtx?.workflow_config ?? {};

      const items = [
        `UAT: ${workflow.uat_required !== false ? "enabled" : "disabled"}`,
        `Code review: ${workflow.code_review !== false ? "enabled" : "disabled"}`,
        `Verifier: ${workflow.verifier !== false ? "enabled" : "disabled"}`,
        `Learning: ${workflow.capture_learnings !== false ? "enabled" : "disabled"}`,
      ];

      notifySafe(ctx, `Config: ${items.join(" | ")}`, "info");
    },
  });

  // ─── Keyboard Shortcuts ───────────────────────────────

  if (pi.registerKeybinding) {
    pi.registerKeybinding("ctrl+shift+s", {
      description: "Show Luca status",
      handler: async (_ctx: PiExtensionContext) => {
        pi.executeCommand?.("status");
      },
    });

    pi.registerKeybinding("ctrl+shift+v", {
      description: "Show last verification",
      handler: async (_ctx: PiExtensionContext) => {
        pi.executeCommand?.("verify");
      },
    });

    pi.registerKeybinding("ctrl+shift+t", {
      description: "Show subagent tracking",
      handler: async (_ctx: PiExtensionContext) => {
        pi.executeCommand?.("track");
      },
    });

    pi.registerKeybinding("ctrl+shift+m", {
      description: "Switch model",
      handler: async (_ctx: PiExtensionContext) => {
        pi.executeCommand?.("switch-model");
      },
    });
  }
}
