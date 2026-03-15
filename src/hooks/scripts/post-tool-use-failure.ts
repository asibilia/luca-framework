/**
 * post-tool-use-failure — PostToolUseFailure observation hook.
 *
 * Fires after a tool call fails. Records error patterns as MuninnDB
 * pitfall candidates for lu-learner to promote in the next learning
 * capture cycle.
 *
 * Uses a per-tool-name throttle to avoid flooding on repeated failures
 * (same tool_name + error_message pattern only recorded once per 5 minutes).
 *
 * Always exits 0 — async hook, non-blocking.
 *
 * @module post-tool-use-failure
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";

import { z } from "zod";

import {
  parseHookInput,
  exitSuccess,
  projectHash,
} from "../__helpers/hook-io.ts";
import { resolveVault } from "../__helpers/vault.ts";
import { writeMuninnEngram } from "../__helpers/muninn.ts";

// ─── Input Schema ─────────────────────────────────────────────────────────────

const PostToolUseFailureInputSchema = z.object({
  tool_name: z.string().default("unknown"),
  error_message: z.string().default(""),
  command: z.string().default(""),
});

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  // Parse the failure payload with schema validation (best-effort)
  const data = await parseHookInput(PostToolUseFailureInputSchema);

  // If payload is empty or unparseable, exit 0 silently
  if (!data) {
    return exitSuccess();
  }

  // Extract failure details (Zod defaults ensure no undefined values)
  const toolName = data.tool_name;
  const errorMessage = data.error_message;
  const command = data.command;

  // Skip if no meaningful error information
  if (!errorMessage && !toolName) {
    return exitSuccess();
  }

  // --- Per-tool-name throttle (5-minute TTL) ---
  // Hash the tool_name + error_message to create a unique key
  const hash = projectHash();
  const patternHash = createHash("sha256")
    .update(`${toolName}:${errorMessage}`)
    .digest("hex")
    .slice(0, 12);
  const throttleFile = `/tmp/.luca-tool-failure-${hash}-${patternHash}-ts`;
  const throttleSeconds = 300;

  if (existsSync(throttleFile)) {
    try {
      const lastRecorded = parseInt(
        readFileSync(throttleFile, "utf-8").trim(),
        10,
      );
      const now = Math.floor(Date.now() / 1000);
      if (now - lastRecorded < throttleSeconds) {
        return exitSuccess();
      }
    } catch {
      // Can't read throttle file — continue
    }
  }

  // Update throttle timestamp
  writeFileSync(throttleFile, String(Math.floor(Date.now() / 1000)));

  // --- Construct pitfall candidate and write to MuninnDB ---
  const truncatedError = errorMessage.slice(0, 300);
  const truncatedCommand = command ? command.slice(0, 200) : "N/A";

  try {
    const vault = await resolveVault();
    const pitfallContent = `Tool ${toolName} failed: ${truncatedError}. Command: ${truncatedCommand}`;

    writeMuninnEngram({
      vault,
      concept: `session:tool-failure-${Date.now()}`,
      content: pitfallContent,
      type: "observation",
      tags: ["session", "tool-failure", "pitfall-candidate"],
    });
  } catch {
    // MuninnDB write failed — never throw from hook
  }

  return exitSuccess();
};

await main();
