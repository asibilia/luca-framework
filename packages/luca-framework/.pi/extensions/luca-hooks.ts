/**
 * Luca Hooks Extension for Pi (native implementation).
 *
 * Pi-native extension that implements all 9 hook behaviors directly in
 * TypeScript using pi.on() events. Replaces the auto-generated shell
 * bridge that caused Pi deprecation warnings and unnecessary indirection.
 *
 * Shell scripts in src/hooks/scripts/ remain untouched — Claude Code
 * and Cursor still use them via their respective hook systems.
 *
 * Source: src/hooks/pi-extensions/luca-hooks.ts
 * Deployed to: .pi/extensions/luca-hooks.ts
 */
import type { PiExtensionAPI, PiExtensionContext } from "./__types/pi-context";
import {
  handlePostEditFormat,
  handlePostEditTypecheck,
  handlePreCommitGate,
  handlePreCommitDriftCheck,
  handleContextCheckThrottled,
  handleSnapshotSync,
  handleContextMonitor,
  handleSessionPersist,
  handleSessionStart,
} from "./__helpers/hook-handlers";

/**
 * Pi extension: Luca lifecycle hooks.
 *
 * Registers pi.on() handlers for formatting, type-checking, pre-commit
 * gates, context monitoring, state sync, and session management.
 *
 * @param pi - Pi ExtensionAPI instance
 */
export default function lucaHooks(pi: PiExtensionAPI): void {
  const cwd = process.cwd();

  // ─── post-edit-format: Format files after edit/write ────────────────
  pi.on("tool_execution_end", async (event: any) => {
    if (!["edit", "write"].includes(event.toolName || "")) return;
    handlePostEditFormat(event.input?.file_path || "", cwd);
  });

  // ─── post-edit-typecheck: Type-check after TS edits ─────────────────
  pi.on("tool_execution_end", async (event: any) => {
    if (!["edit", "write"].includes(event.toolName || "")) return;
    const msg = handlePostEditTypecheck(event.input?.file_path || "", cwd);
    // Async error reporting — no blocking
    if (msg && pi.sendMessage) {
      pi.sendMessage(
        { content: msg, display: true },
        { deliverAs: "followUp" },
      );
    }
  });

  // ─── pre-commit-gate: Block commits on test/typecheck failure ───────
  pi.on("tool_call", async (event: any) => {
    if (!["bash"].includes(event.toolName || "")) return;
    const cmd = event.input?.command || "";
    if (!/\bgit\s+commit\b|bun\s+run\s+commit/.test(cmd)) return;
    return handlePreCommitGate(cmd, cwd);
  });

  // ─── pre-commit-drift-check: Block commits on output drift ──────────
  pi.on("tool_call", async (event: any) => {
    if (!["bash"].includes(event.toolName || "")) return;
    const cmd = event.input?.command || "";
    if (!/\bgit\s+commit\b|bun\s+run\s+commit/.test(cmd)) return;
    return handlePreCommitDriftCheck(cmd, cwd);
  });

  // ─── context-check-throttled: Async context monitor ─────────────────
  pi.on("tool_execution_end", async (_event: any, ctx: PiExtensionContext) => {
    const msg = handleContextCheckThrottled(cwd, ctx);
    if (msg && pi.sendMessage) {
      pi.sendMessage(
        { content: msg, display: true },
        { deliverAs: "followUp" },
      );
    }
  });

  // ─── snapshot-sync: Sync STATE.md from state machine ────────────────
  pi.on("tool_execution_end", async () => {
    handleSnapshotSync(cwd);
  });

  // ─── context-monitor: Context usage check on shutdown ───────────────
  pi.on("session_shutdown", async (_event: any, ctx: PiExtensionContext) => {
    const msg = handleContextMonitor(cwd, ctx);
    if (msg && pi.sendMessage) {
      pi.sendMessage(
        { content: msg, display: true },
        { deliverAs: "followUp" },
      );
    }
  });

  // ─── session-persist: Save session state on shutdown ────────────────
  pi.on("session_shutdown", async (event: any) => {
    handleSessionPersist(cwd, event.reason);
  });

  // ─── session-start: Initialize Luca session ─────────────────────────
  pi.on("session_start", async () => {
    const msg = handleSessionStart(cwd);
    if (msg && pi.sendMessage) {
      pi.sendMessage(
        { content: msg, display: true },
        { deliverAs: "followUp" },
      );
    }
  });
}
