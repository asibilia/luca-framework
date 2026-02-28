/**
 * Shared singleton subagent registry for Pi extensions.
 *
 * Provides a central registry that tracks all spawned subagents across
 * extensions (luca-subagents.ts, luca-purpose-gating.ts, luca-teams.ts).
 * When multiple extensions import this module, Bun's module cache ensures
 * they share the same instance.
 *
 * Source: src/hooks/pi-extensions/__helpers/subagent-registry.ts
 */
import { createRegistry } from "./registry";

/** Subagent status lifecycle. */
export type SubagentStatus = "running" | "completed" | "failed" | "aborted";

/** Tracked state for a running or completed subagent. */
export interface SubagentEntry {
  id: string;
  agent: string;
  task: string;
  status: SubagentStatus;
  /** Captured output (last N chars) */
  output: string;
  /** Captured stderr */
  stderr: string;
  /** Process exit code (-1 while running) */
  exitCode: number;
  /** Accumulated usage stats */
  usage: {
    turns: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  };
  /** Model used by subagent */
  model: string | undefined;
  /** Timestamp when created */
  createdAt: number;
  /** Timestamp when completed */
  completedAt: number | undefined;
  /** Reference to the child process (not serialized) */
  process: import("child_process").ChildProcess | undefined;
  /** Session directory for continue support */
  sessionDir: string | undefined;
  /** Source extension that spawned this subagent */
  source?: string;
}

/** Singleton subagent registry shared across all extensions. */
export const subagentRegistry = createRegistry<SubagentEntry>("subagents");

/** Counter state for generating unique subagent IDs. */
let idCounter = 0;

/**
 * Generate a unique subagent ID with a prefix and agent name.
 *
 * @param prefix - ID prefix (e.g., "sub", "bg", "team")
 * @param agent - Agent name to include in the ID
 * @returns Unique subagent identifier
 */
export function nextSubagentId(prefix: string, agent: string): string {
  idCounter++;
  return `${prefix}-${idCounter}-${agent}`;
}

/**
 * Reset the subagent registry and ID counter.
 * Used on session_start to clean up stale state.
 */
export function resetSubagentRegistry(): void {
  subagentRegistry.clear();
  idCounter = 0;
}
