/**
 * Domain-specific semantic validators for Luca Studio configuration.
 *
 * These validators enforce invariants that Zod schemas cannot express —
 * cross-field dependencies, graph properties, referential integrity, and
 * coverage guarantees. Each validator is a pure function that accepts
 * parsed data and returns a structured result.
 *
 * Designed to be composed into the validation pipeline via the
 * `SemanticValidator` type alias.
 *
 * @example
 * ```typescript
 * import { detectCycles, checkAgentRefs, type SemanticValidator } from "~/lib/semantic-validators";
 *
 * const validators: SemanticValidator[] = [
 *   (data) => detectCycles(data.steps),
 *   (data) => checkAgentRefs(data.config, data.knownAgents),
 * ];
 * ```
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Structured error returned by semantic validators.
 *
 * @property code    - Machine-readable error code (e.g. "CYCLE_DETECTED").
 * @property message - Human-readable description of the violation.
 * @property path    - Optional dot-path to the offending field.
 */
export type SemanticError = {
  code: string;
  message: string;
  path?: string;
};

/** Discriminated union returned by every semantic validator. */
export type SemanticResult =
  | { valid: true }
  | { valid: false; errors: SemanticError[] };

/**
 * Function signature for a composable semantic validator.
 *
 * The pipeline passes the fully-parsed data object to each validator.
 * Validators that need only a subset should destructure or project
 * internally.
 */
export type SemanticValidator = (data: unknown) => SemanticResult;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pass: SemanticResult = { valid: true };

function fail(errors: SemanticError[]): SemanticResult {
  return { valid: false, errors };
}

// ---------------------------------------------------------------------------
// 1. Cycle Detection
// ---------------------------------------------------------------------------

/** Minimal step shape expected by `detectCycles`. */
export type WorkflowStep = {
  id: string;
  dependsOn?: string[];
};

/**
 * Detect cycles in a directed acyclic graph of workflow steps.
 *
 * Uses iterative depth-first search with a three-colour (white/grey/black)
 * marking scheme. Reports every back-edge found so the caller can display
 * all cycles, not just the first.
 *
 * @param steps - Array of workflow steps with dependency edges.
 * @returns `{ valid: true }` when acyclic, or errors listing each cycle edge.
 *
 * @example
 * ```typescript
 * const result = detectCycles([
 *   { id: "a", dependsOn: ["b"] },
 *   { id: "b", dependsOn: ["a"] },
 * ]);
 * // => { valid: false, errors: [{ code: "CYCLE_DETECTED", ... }] }
 * ```
 */
export function detectCycles(steps: WorkflowStep[]): SemanticResult {
  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;

  const color = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const step of steps) {
    color.set(step.id, WHITE);
    adj.set(step.id, step.dependsOn ?? []);
  }

  const errors: SemanticError[] = [];

  for (const step of steps) {
    if (color.get(step.id) === WHITE) {
      // Iterative DFS using an explicit stack
      const stack: Array<{ node: string; index: number }> = [
        { node: step.id, index: 0 },
      ];
      color.set(step.id, GREY);

      while (stack.length > 0) {
        const frame = stack[stack.length - 1]!;
        const neighbours = adj.get(frame.node) ?? [];

        if (frame.index >= neighbours.length) {
          // All neighbours explored — mark black and pop
          color.set(frame.node, BLACK);
          stack.pop();
          continue;
        }

        const neighbour = neighbours[frame.index]!;
        frame.index++;

        const neighbourColor = color.get(neighbour);
        if (neighbourColor === GREY) {
          errors.push({
            code: "CYCLE_DETECTED",
            message: `Cycle detected: "${frame.node}" -> "${neighbour}" forms a back-edge`,
            path: `steps.${frame.node}.dependsOn`,
          });
        } else if (neighbourColor === WHITE) {
          color.set(neighbour, GREY);
          stack.push({ node: neighbour, index: 0 });
        }
        // BLACK neighbours are already fully explored — skip
      }
    }
  }

  return errors.length > 0 ? fail(errors) : pass;
}

// ---------------------------------------------------------------------------
// 2. Agent Reference Check
// ---------------------------------------------------------------------------

/**
 * Verify that all agent names referenced in a configuration exist in the
 * known agent registry.
 *
 * @param referencedAgents - Agent names found in the configuration.
 * @param knownAgents      - The set of agents that actually exist.
 * @returns `{ valid: true }` when all references resolve, or errors listing missing agents.
 *
 * @example
 * ```typescript
 * const result = checkAgentRefs(["lu-router", "ghost-agent"], ["lu-router", "lu-executor"]);
 * // => { valid: false, errors: [{ code: "UNKNOWN_AGENT", message: "..." }] }
 * ```
 */
export function checkAgentRefs(
  referencedAgents: string[],
  knownAgents: string[],
): SemanticResult {
  const known = new Set(knownAgents);
  const errors: SemanticError[] = [];

  for (const agent of referencedAgents) {
    if (!known.has(agent)) {
      errors.push({
        code: "UNKNOWN_AGENT",
        message: `Agent "${agent}" is referenced but does not exist in the registry`,
        path: `agents.${agent}`,
      });
    }
  }

  return errors.length > 0 ? fail(errors) : pass;
}

// ---------------------------------------------------------------------------
// 3. Checks Enabled Check
// ---------------------------------------------------------------------------

/** Minimal check shape expected by `checkChecksEnabled`. */
export type CheckEntry = {
  name: string;
  enabled: boolean;
};

/**
 * Verify that at least one verification check type remains enabled.
 *
 * A configuration that disables every check type (test, typecheck, lint,
 * build) is almost certainly a mistake — it would make the verification
 * checks a no-op.
 *
 * @param checks - Array of verification check configurations.
 * @returns `{ valid: true }` when at least one check is enabled.
 *
 * @example
 * ```typescript
 * const result = checkChecksEnabled([
 *   { name: "test", enabled: false },
 *   { name: "typecheck", enabled: false },
 * ]);
 * // => { valid: false, errors: [{ code: "NO_CHECKS_ENABLED", ... }] }
 * ```
 */
export function checkChecksEnabled(checks: CheckEntry[]): SemanticResult {
  const hasEnabled = checks.some((c) => c.enabled);

  if (!hasEnabled) {
    return fail([
      {
        code: "NO_CHECKS_ENABLED",
        message:
          "All verification checks are disabled — at least one check type (test, typecheck, lint, build) must remain enabled",
        path: "harness.checks",
      },
    ]);
  }

  return pass;
}

// ---------------------------------------------------------------------------
// 4. Required Gates Check
// ---------------------------------------------------------------------------

/**
 * Verify that required gates are not removed or disabled.
 *
 * Certain gates (e.g. `confirm_project`, `confirm_phases`) are considered
 * safety-critical and must not be turned off without explicit override.
 *
 * @param gates         - The current gates configuration object (gate name -> enabled boolean).
 * @param requiredGates - Names of gates that must remain enabled.
 * @returns `{ valid: true }` when all required gates are present and enabled.
 *
 * @example
 * ```typescript
 * const result = checkRequiredGates(
 *   { confirm_project: false, confirm_phases: true },
 *   ["confirm_project", "confirm_phases"],
 * );
 * // => { valid: false, errors: [{ code: "REQUIRED_GATE_DISABLED", ... }] }
 * ```
 */
export function checkRequiredGates(
  gates: Record<string, boolean>,
  requiredGates: string[],
): SemanticResult {
  const errors: SemanticError[] = [];

  for (const gate of requiredGates) {
    if (!(gate in gates)) {
      errors.push({
        code: "REQUIRED_GATE_MISSING",
        message: `Required gate "${gate}" is missing from the configuration`,
        path: `gates.${gate}`,
      });
    } else if (!gates[gate]) {
      errors.push({
        code: "REQUIRED_GATE_DISABLED",
        message: `Required gate "${gate}" is disabled — this gate must remain enabled`,
        path: `gates.${gate}`,
      });
    }
  }

  return errors.length > 0 ? fail(errors) : pass;
}

// ---------------------------------------------------------------------------
// 5. Routing Coverage Check
// ---------------------------------------------------------------------------

/** The five complexity levels every agent row must cover. */
const COMPLEXITY_LEVELS = [
  "TRIVIAL",
  "SIMPLE",
  "MODERATE",
  "COMPLEX",
  "CRITICAL",
] as const;

/** Minimal routing row shape expected by `checkRoutingCoverage`. */
export type RoutingRow = {
  agent: string;
  levels: Record<string, string>;
};

/**
 * Verify that every agent row in the model routing table covers all five
 * complexity levels.
 *
 * A routing table with gaps means some agent/complexity combinations have
 * no model assignment, which would cause runtime resolution failures.
 *
 * @param rows - Array of routing rows, each mapping complexity level to model tier.
 * @returns `{ valid: true }` when every row covers TRIVIAL through CRITICAL.
 *
 * @example
 * ```typescript
 * const result = checkRoutingCoverage([
 *   { agent: "lu-router", levels: { TRIVIAL: "fast", SIMPLE: "fast" } },
 * ]);
 * // => { valid: false, errors: [{ code: "INCOMPLETE_ROUTING", ... }] }
 * ```
 */
export function checkRoutingCoverage(rows: RoutingRow[]): SemanticResult {
  const errors: SemanticError[] = [];

  for (const row of rows) {
    for (const level of COMPLEXITY_LEVELS) {
      if (!(level in row.levels) || !row.levels[level]) {
        errors.push({
          code: "INCOMPLETE_ROUTING",
          message: `Agent "${row.agent}" is missing model assignment for complexity level "${level}"`,
          path: `routing.${row.agent}.${level}`,
        });
      }
    }
  }

  return errors.length > 0 ? fail(errors) : pass;
}
