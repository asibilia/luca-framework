/**
 * State bridge for Pi extensions.
 *
 * Provides TypeScript-native access to the Luca workflow state machine
 * via the `@alecsibilia/luca-framework/state` module. Pi extensions
 * import this helper to read/write workflow state, ensuring all state
 * mutations go through the typed state machine with proper validation.
 *
 * Read operations parse state.json synchronously for speed (model-routing
 * and other hot paths need synchronous access). Falls back to STATE.md
 * parsing when state.json is unavailable.
 *
 * Write operations use the persistence layer (loadPersistedActor,
 * persistActor) to ensure XState validates context changes, then
 * regenerate STATE.md via the snapshot module.
 *
 * Source: src/hooks/pi-extensions/__helpers/state-bridge.ts
 * Deployed to: .pi/extensions/__helpers/state-bridge.ts
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

import {
  loadPersistedActor,
  persistActor,
  stateExists,
  STATE_FILE_PATH,
  generateSnapshot,
  getAllowedEvents,
} from "@alecsibilia/luca-framework/state";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Path to STATE.md relative to project root. */
const STATE_MD_REL = ".planning/STATE.md";

/**
 * Allowlisted context fields that can be written via this bridge.
 *
 * Mirrors the SETTABLE_FIELDS list in the full bridge
 * (packages/luca-framework/src/state/bridge.ts).
 */
const SETTABLE_FIELDS = new Set([
  "current_milestone",
  "current_phase",
  "github_issue",
  "branch",
  "base_branch",
  "ticket_id",
  "oversight",
  "complexity",
  "memory_tags",
  "intuition_flags",
]);

// ─── Synchronous Read Operations ────────────────────────────────────────────
// These read state.json directly for speed. Used by model-routing and
// other synchronous callers that cannot await.

/**
 * Read the full state.json context object (synchronous).
 *
 * Parses state.json and returns the context field. Falls back to null
 * if state.json doesn't exist or is invalid.
 *
 * @param cwd - Project root directory
 * @returns Parsed context object, or null if unavailable
 *
 * @example
 * ```typescript
 * const ctx = readStateContext(process.cwd());
 * if (ctx) {
 *   console.log(ctx.complexity, ctx.current_phase);
 * }
 * ```
 */
export function readStateContext(cwd: string): Record<string, any> | null {
  const statePath = join(cwd, STATE_FILE_PATH);
  if (!existsSync(statePath)) return null;

  try {
    const raw = readFileSync(statePath, "utf-8");
    const state = JSON.parse(raw);
    return state?.context ?? null;
  } catch {
    return null;
  }
}

/**
 * Read a specific field from state.json context (synchronous).
 *
 * @param cwd - Project root directory
 * @param field - Context field name (e.g., "complexity", "current_phase")
 * @returns Field value, or undefined if not found
 */
export function readField(cwd: string, field: string): any {
  const context = readStateContext(cwd);
  if (!context) return undefined;
  return context[field];
}

/**
 * Read current complexity level from state.json (synchronous).
 *
 * Primary: reads from state.json context.complexity
 * Fallback: parses STATE.md for Task Complexity field
 * Default: "MODERATE" if both sources unavailable
 *
 * @param cwd - Project root directory
 * @returns Complexity level string (e.g., "SIMPLE", "MODERATE")
 */
export function readComplexity(cwd: string): string {
  const context = readStateContext(cwd);
  if (context?.complexity && typeof context.complexity === "string") {
    return context.complexity;
  }
  return readComplexityFromStateMd(cwd);
}

/**
 * Read the workflow state value from state.json (synchronous).
 *
 * @param cwd - Project root directory
 * @returns State value string, or "idle" if unavailable
 */
export function readStateValue(cwd: string): string {
  const statePath = join(cwd, STATE_FILE_PATH);
  if (!existsSync(statePath)) return "idle";

  try {
    const raw = readFileSync(statePath, "utf-8");
    const state = JSON.parse(raw);
    return typeof state?.value === "string" ? state.value : "idle";
  } catch {
    return "idle";
  }
}

/**
 * Read state as a flat key-value map for display purposes (synchronous).
 *
 * Primary: reads from state.json and flattens context
 * Fallback: parses STATE.md key-value pairs
 *
 * @param cwd - Project root directory
 * @returns Record of lowercase_underscore keys to string values
 */
export function readStateAsMap(cwd: string): Record<string, string> {
  const context = readStateContext(cwd);
  if (context) {
    const map: Record<string, string> = {};
    for (const [key, value] of Object.entries(context)) {
      if (value !== null && value !== undefined && typeof value !== "object") {
        map[key] = String(value);
      }
    }
    return map;
  }
  return parseStateMd(cwd);
}

// ─── Async Write Operations (via state machine) ────────────────────────────
// These use the XState persistence layer to ensure validated writes.

/**
 * Write a context field via the state machine persistence layer.
 *
 * Loads the persisted XState actor, mutates the context field in the
 * snapshot JSON, validates via Zod schema, persists back, and regenerates
 * STATE.md. This ensures state.json and STATE.md stay in sync.
 *
 * @param cwd - Project root directory
 * @param field - Context field name (must be in SETTABLE_FIELDS)
 * @param value - New value for the field
 * @returns Object with success status and optional error message
 *
 * @example
 * ```typescript
 * const result = await writeField(process.cwd(), "complexity", "MODERATE");
 * if (result.success) {
 *   console.log("Complexity updated to MODERATE");
 * }
 * ```
 */
export async function writeField(
  cwd: string,
  field: string,
  value: any,
): Promise<{ success: boolean; previous?: any; error?: string }> {
  // Validate field is allowlisted
  if (!SETTABLE_FIELDS.has(field)) {
    return {
      success: false,
      error: `Field "${field}" is not settable. Allowed: ${[...SETTABLE_FIELDS].join(", ")}`,
    };
  }

  // Check state exists
  if (!(await stateExists())) {
    return { success: false, error: "state.json not found" };
  }

  // Load the persisted state file directly for field mutation
  // (same approach as bridge.ts handleSetField — we mutate the JSON
  // directly rather than sending XState events, because SETTABLE_FIELDS
  // are simple context overrides, not state transitions)
  const statePath = join(cwd, STATE_FILE_PATH);
  let stateJson: any;
  try {
    const stateFile = Bun.file(statePath);
    stateJson = await stateFile.json();
  } catch {
    return { success: false, error: "state.json contains invalid JSON" };
  }

  if (!stateJson.context) {
    stateJson.context = {};
  }

  // Capture previous value
  const previous = stateJson.context[field];

  // Update context field and timestamp
  stateJson.context[field] = value;
  stateJson.context.last_transition_at = new Date().toISOString();

  // Write back state.json
  try {
    await Bun.write(statePath, JSON.stringify(stateJson, null, 2));
  } catch (err) {
    return {
      success: false,
      error: `Failed to write state.json: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Regenerate STATE.md from the persisted state via the snapshot module
  try {
    const loadResult = await loadPersistedActor();
    if (loadResult.success) {
      const snapshot = loadResult.data.getSnapshot();
      const allowed = getAllowedEvents(snapshot);

      // Read existing STATE.md for section preservation
      let existingContent: string | undefined;
      const mdPath = join(cwd, STATE_MD_REL);
      try {
        const mdFile = Bun.file(mdPath);
        if (await mdFile.exists()) {
          existingContent = await mdFile.text();
        }
      } catch {
        /* no existing STATE.md */
      }

      const markdown = generateSnapshot({
        state: String(snapshot.value),
        context: snapshot.context,
        existing_content: existingContent,
        allowed_events: allowed,
      });

      await Bun.write(mdPath, markdown);
    }
  } catch {
    // Non-fatal: state.json is already updated. STATE.md may be stale.
  }

  return { success: true, previous };
}

/**
 * Write complexity level via the state bridge.
 *
 * Convenience wrapper for writeField("complexity", level).
 * Validates the level is a known complexity value before writing.
 *
 * @param cwd - Project root directory
 * @param level - Complexity level (TRIVIAL, SIMPLE, MODERATE, COMPLEX, CRITICAL)
 * @returns Object with success status and optional error message
 */
export async function writeComplexity(
  cwd: string,
  level: string,
): Promise<{ success: boolean; previous?: string; error?: string }> {
  const VALID_LEVELS = ["TRIVIAL", "SIMPLE", "MODERATE", "COMPLEX", "CRITICAL"];
  const normalized = level.toUpperCase();

  if (!VALID_LEVELS.includes(normalized)) {
    return {
      success: false,
      error: `Invalid complexity "${level}". Valid: ${VALID_LEVELS.join(", ")}`,
    };
  }

  return writeField(cwd, "complexity", normalized);
}

// ─── STATE.md Fallback Parsing ──────────────────────────────────────────────

/**
 * Parse complexity from STATE.md (fallback when state.json unavailable).
 *
 * @param cwd - Project root directory
 * @returns Complexity level string, or "MODERATE" as default
 */
function readComplexityFromStateMd(cwd: string): string {
  const VALID_LEVELS = ["TRIVIAL", "SIMPLE", "MODERATE", "COMPLEX", "CRITICAL"];
  const mdPath = join(cwd, STATE_MD_REL);
  if (!existsSync(mdPath)) return "MODERATE";

  try {
    const content = readFileSync(mdPath, "utf-8");

    const boldMatch = content.match(/\*\*Task Complexity:\*\*\s*(\w+)/i);
    if (boldMatch?.[1]) {
      const level = boldMatch[1].toUpperCase();
      if (VALID_LEVELS.includes(level)) return level;
    }

    const simpleMatch = content.match(/Task Complexity:\s*(\w+)/i);
    if (simpleMatch?.[1]) {
      const level = simpleMatch[1].toUpperCase();
      if (VALID_LEVELS.includes(level)) return level;
    }
  } catch {
    /* non-fatal */
  }

  return "MODERATE";
}

/**
 * Parse STATE.md into a key-value map (fallback for readStateAsMap).
 *
 * @param cwd - Project root directory
 * @returns Record of normalized key-value pairs
 */
function parseStateMd(cwd: string): Record<string, string> {
  const mdPath = join(cwd, STATE_MD_REL);
  if (!existsSync(mdPath)) return { error: "STATE.md not found" };

  try {
    const content = readFileSync(mdPath, "utf-8");
    const state: Record<string, string> = {};

    for (const line of content.split("\n")) {
      const boldMatch = line.match(/^\*\*(.+?):\*\*\s*(.+)$/);
      if (boldMatch?.[1] && boldMatch[2]) {
        const key = boldMatch[1].trim().toLowerCase().replace(/\s+/g, "_");
        state[key] = boldMatch[2].trim();
        continue;
      }

      const simpleMatch = line.match(/^([A-Z][a-z ]+):\s*(.+)$/);
      if (simpleMatch?.[1] && simpleMatch[2]) {
        const key = simpleMatch[1].trim().toLowerCase().replace(/\s+/g, "_");
        state[key] = simpleMatch[2].trim();
      }
    }

    return state;
  } catch {
    return { error: "Failed to read STATE.md" };
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

export { SETTABLE_FIELDS };
