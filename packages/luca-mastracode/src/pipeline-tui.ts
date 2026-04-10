/**
 * Pipeline TUI helpers — presentation-layer utilities for rendering
 * pipeline progress inside <system-reminder> boxes in MastraTUI.
 *
 * Extracted from index.ts to keep the orchestration entrypoint focused
 * on wiring and make these pure functions independently testable.
 */

import { triageMode }    from "./modes/triage.js";
import { researchMode }  from "./modes/research.js";
import { architectMode } from "./modes/architect.js";
import { executeMode }   from "./modes/execute.js";
import { reviewMode }    from "./modes/review.js";
import { finalizeMode }  from "./modes/finalize.js";

// ---------------------------------------------------------------------------
// Canonical pipeline step registry (display-oriented)
// ---------------------------------------------------------------------------

/**
 * Ordered pipeline steps with display labels derived from mode config objects.
 *
 * This is the canonical ordered list for TUI display purposes.
 * See also: PIPELINE_ORDER in `tools/workflow-state.ts` (transition map)
 * and BARE_TO_NAMESPACED in `luca-store.ts` (historical migration map).
 */
export const PIPELINE_STEPS_ORDERED = [
  { id: triageMode.id,     label: triageMode.name },
  { id: researchMode.id,   label: researchMode.name },
  { id: architectMode.id,  label: architectMode.name },
  { id: executeMode.id,    label: executeMode.name },
  { id: reviewMode.id,     label: reviewMode.name },
  { id: finalizeMode.id,   label: finalizeMode.name },
] satisfies ReadonlyArray<{ id: string; label: string }>;

/** Union type of all pipeline step mode IDs (e.g. "luca:1-triage"). */
export type PipelineStepId = (typeof PIPELINE_STEPS_ORDERED)[number]["id"];

// ---------------------------------------------------------------------------
// Progress header
// ---------------------------------------------------------------------------

/**
 * Build a two-line progress header for use inside <system-reminder> boxes.
 *
 * Line 1: "ARCHITECT MODE  ·  Step 3 of 6"
 * Line 2: "✓ Triage  ✓ Research  → Architect  ○ Execute  ○ Review  ○ Finalize"
 *
 * Labels are derived from mode config .name fields (e.g. "luca: Execute") with the
 * "luca: " prefix stripped for compact display.
 */
export function buildPipelineProgressHeader(modeId: PipelineStepId | string): string {
  const currentIndex = PIPELINE_STEPS_ORDERED.findIndex((s) => s.id === modeId);
  if (currentIndex === -1) return "";

  const step = PIPELINE_STEPS_ORDERED[currentIndex]!;

  // Strip "luca: " prefix for compact display labels (e.g. "luca: Execute" → "Execute")
  const short = (s: { label: string }) => s.label.replace(/^luca: /, '');

  const line1 = `${short(step).toUpperCase()} MODE  ·  Step ${currentIndex + 1} of ${PIPELINE_STEPS_ORDERED.length}`;

  const line2 = PIPELINE_STEPS_ORDERED.map((s, i) => {
    if (i < currentIndex) return `✓ ${short(s)}`;
    if (i === currentIndex) return `→ ${short(s)}`;
    return `○ ${short(s)}`;
  }).join("  ");

  return `${line1}\n${line2}`;
}

// ---------------------------------------------------------------------------
// System-reminder wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap a message body in <system-reminder> tags so MastraTUI renders it
 * as an amber-bordered SystemReminderComponent.
 *
 * Only `</system-reminder>` sequences are escaped in the body — this
 * prevents premature tag closure while preserving angle-bracket notation
 * in LLM instruction content (e.g. `targetMode: "<luca:2-research|...>"`).
 * Full XML-encoding is intentionally NOT applied.
 */
export function wrapInSystemReminder(body: string): string {
  // Escape only the sequence that would close the tag prematurely.
  const safe = body.replace(/<\/system-reminder>/gi, "<\\/system-reminder>");
  return `<system-reminder>\n${safe}\n</system-reminder>`;
}
