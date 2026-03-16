/**
 * muninn-context-recall — UserPromptSubmit context injection hook.
 *
 * Fires before each user message is processed (synchronously). Recalls
 * relevant MuninnDB memories from both the repo vault and the default
 * vault, then injects them as `additionalContext` so the AI has
 * continuous access to project identity, patterns, decisions, and pitfalls.
 *
 * Must be `async: false` (synchronous) — `additionalContext` is only
 * processed from sync hooks. Uses a 60-second throttle to avoid
 * hammering MuninnDB on rapid prompts. Always exits 0 — this hook
 * must never block the user's prompt.
 *
 * @module muninn-context-recall
 */

import {
  readStdinJson,
  emitResult,
  exitSuccess,
  projectHash,
  guardDedup,
  checkThrottle,
  recordThrottle,
} from "../__helpers/hook-io.ts";
import { resolveVault } from "../__helpers/vault.ts";
import {
  recallMuninnEngrams,
  type MuninnRecalledEngram,
} from "../__helpers/muninn.ts";

// ─── Dedup guard ─────────────────────────────────────────────────────────────
// Prevents double-firing when hook is registered at both global and project level.
guardDedup("muninn-context-recall");

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  const hash = projectHash();

  // --- 60-second throttle to avoid hammering MuninnDB ---
  const throttleFile = `/tmp/.luca-muninn-recall-${hash}-ts`;
  if (checkThrottle(throttleFile, 60)) {
    return exitSuccess();
  }

  // Record throttle before doing work (even if recall fails, avoid retrying)
  recordThrottle(throttleFile);

  // --- Read user prompt from stdin ---
  const stdinData = await readStdinJson();
  const userMessage =
    typeof stdinData?.user_message === "string" ? stdinData.user_message : "";

  // Build recall context string from user prompt (first 200 chars)
  const contextString =
    userMessage.length > 0
      ? userMessage.slice(0, 200)
      : "project context patterns decisions";

  // --- Dual-vault recall ---
  const repoVault = await resolveVault();

  const [repoEngrams, defaultEngrams] = await Promise.all([
    recallMuninnEngrams(repoVault, contextString, 3),
    recallMuninnEngrams("default", contextString, 3),
  ]);

  // --- Combine, deduplicate, and take top 5 ---
  const combined = [...repoEngrams, ...defaultEngrams];
  if (combined.length === 0) {
    return exitSuccess();
  }

  // Deduplicate by concept (keep highest score per concept)
  const conceptMap = new Map<string, MuninnRecalledEngram>();
  for (const engram of combined) {
    const concept = engram.concept ?? "unknown";
    const existing = conceptMap.get(concept);
    if (!existing || (engram.score ?? 0) > (existing.score ?? 0)) {
      conceptMap.set(concept, engram);
    }
  }

  // Sort by score descending, take top 5
  const deduped = [...conceptMap.values()];
  deduped.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const top = deduped.slice(0, 5);

  if (top.length === 0) {
    return exitSuccess();
  }

  // --- Format as readable context ---
  const sections = top.map((engram) => {
    const concept = engram.concept ?? "unknown";
    const content = engram.content ?? "";
    return `### ${concept}\n${content}`;
  });

  const formattedMemories = `## Recalled Memories (MuninnDB)\n\n${sections.join("\n\n")}`;

  // --- Emit additionalContext ---
  emitResult({
    hookSpecificOutput: {
      additionalContext: formattedMemories,
    },
  });

  return exitSuccess();
};

await main().catch(() => {
  // Silently exit on any unhandled error — never block the user's prompt
  process.exit(0);
});
