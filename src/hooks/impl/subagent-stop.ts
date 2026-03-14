/**
 * subagent-stop — SubagentStop observation hook.
 *
 * Fires after a subagent completes. Captures a summary of what the
 * subagent did as a session observation in MuninnDB.
 *
 * Always exits 0 — async hook, non-blocking.
 *
 * @module subagent-stop
 */

import { readStdinJson, exitSuccess } from "./__helpers/hook-io.ts";
import { resolveVault } from "./__helpers/vault.ts";
import { writeMuninnEngram } from "./__helpers/muninn.ts";

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  // Drain stdin and parse the stop event payload (best-effort)
  const data = await readStdinJson();

  // If payload is empty or unparseable, exit 0 silently (no write)
  if (!data) {
    return exitSuccess();
  }

  // Extract summary or output from the payload
  const subagentId = (data.subagent_id as string) || "unknown";
  const summary = (data.summary as string) || "";
  const output = (data.output as string) || "";
  const toolCallsCount = data.tool_calls_count;

  // Only write if there's meaningful content
  const contentSource = summary || output;
  if (!contentSource) {
    return exitSuccess();
  }

  // Truncate content to 500 chars
  const truncatedContent = contentSource.slice(0, 500);
  const toolsUsed =
    typeof toolCallsCount === "number" ? String(toolCallsCount) : "unknown";

  try {
    const vault = await resolveVault();
    const engramContent = `Subagent ${subagentId} completed. Summary: ${truncatedContent}. Tools used: ${toolsUsed}`;

    writeMuninnEngram({
      vault,
      concept: `session:observation-subagent-${Date.now()}`,
      content: engramContent,
      type: "observation",
      tags: ["session", "observation", "subagent-stop"],
    });
  } catch {
    // MuninnDB write failed — never throw from hook
  }

  return exitSuccess();
};

await main();
