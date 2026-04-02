/**
 * Session restore message builder.
 *
 * Queries MuninnDB for recent session observations and assembles the
 * "Context Restored" message shown at the start of a fresh session
 * (i.e. after /clear). Extracted from session-start main() for clarity.
 *
 * @module session-restore
 */

import { recallMuninnEngrams } from "./muninn.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

/** An engram returned from MuninnDB recall. */
interface RecalledEngram {
  concept?: string;
  content?: string;
  created_at?: string;
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Builds the context restore message for a post-clear session.
 *
 * Performs three MuninnDB recalls inline:
 *   1. Recent session observations (zone transitions)
 *   2. LLM-written session:observation-work summaries
 *   3. Relevant patterns and pitfalls for the active phase
 *
 * Returns an empty string if no recent observations exist or if any
 * MuninnDB call fails (fully best-effort).
 *
 * @param vault - MuninnDB vault to query
 * @returns The formatted restore message string, or "" if no context found
 *
 * @example
 * ```typescript
 * const msg = await buildRestoreMessage(vault);
 * if (msg) emitResult({ systemMessage: msg });
 * ```
 */
export const buildRestoreMessage = async (vault: string): Promise<string> => {
  // Query MuninnDB for recent session:observation-* engrams (within 30 min)
  const recentObservations = await recallMuninnEngrams(
    vault,
    "session:observation zone transition recent work",
    5,
  );

  // Filter to observations from the last 30 minutes
  const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
  const recentObs = recentObservations.filter((engram: RecalledEngram) => {
    if (!engram.created_at) return false;
    const created = new Date(engram.created_at).getTime();
    return created > thirtyMinAgo;
  });

  if (recentObs.length === 0) {
    return "";
  }

  // Parse the most recent observation for context
  let observationZone = "";
  let observationUsage = "";
  let observationBranch = "";
  let observationDiff = "";
  let observationPhase = "";

  try {
    const latestEngram = recentObs[0] as RecalledEngram;
    const latestContent = latestEngram?.content || "";
    const parsed = JSON.parse(latestContent);
    observationZone = parsed.zone || "";
    observationUsage = String(parsed.usage_percent ?? "");
    observationBranch = parsed.git_branch || "";
    observationDiff = parsed.git_diff_summary || "";
    observationPhase = parsed.phase_context || "";
  } catch {
    // Content not JSON — use raw
  }

  // Query for session:observation-work engrams (LLM-written summaries)
  const workObservations = await recallMuninnEngrams(
    vault,
    "session:observation-work current goal approach decisions",
    3,
  );
  const recentWork = workObservations.filter((engram: RecalledEngram) => {
    if (!engram.created_at) return false;
    const created = new Date(engram.created_at).getTime();
    return created > thirtyMinAgo;
  });

  let workSummary =
    "(LLM observation not recorded -- see git diff for recent changes)";
  const latestWork = recentWork[0] as RecalledEngram | undefined;
  if (recentWork.length > 0 && latestWork?.content) {
    workSummary = latestWork.content.slice(0, 2000);
  }

  // Query for relevant patterns and pitfalls (best-effort)
  let patternsSection = "(none recalled)";
  if (observationPhase) {
    try {
      const patterns = await recallMuninnEngrams(
        vault,
        `pattern pitfall ${observationPhase}`,
        3,
      );
      if (patterns.length > 0) {
        const patternItems = (patterns as RecalledEngram[])
          .slice(0, 3)
          .map((p) => {
            const concept = p.concept || "unknown";
            const content = (p.content || "").slice(0, 200);
            return `- **${concept}**: ${content}`;
          })
          .join("\n");
        patternsSection = patternItems;
      }
    } catch {
      // Pattern recall failed — use default
    }
  }

  return `[Context Restored] Fresh session — previous context cleared at ${observationUsage || "unknown"}%.

## Working Context (from MuninnDB observations)

- Branch: ${observationBranch || "(unknown)"}
- Phase context: ${observationPhase || "(unknown)"}
- Files in progress: ${observationDiff || "(none detected)"}
- Zone at clear: ${observationZone || "(unknown)"}

## Recent Session Observations

${workSummary}

## Recalled Patterns & Pitfalls

${patternsSection}

MuninnDB vault: ${vault} | Run /session-restore for deeper semantic recall.`;
};
