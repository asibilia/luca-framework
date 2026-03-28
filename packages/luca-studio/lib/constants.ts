/**
 * Event type definitions with display metadata.
 */
export const EVENT_TYPES = {
  "session.start": { label: "Session Start", color: "event-session" },
  "session.end": { label: "Session End", color: "event-session" },
  "tool.pre": { label: "Tool Pre", color: "event-tool" },
  "tool.post": { label: "Tool Post", color: "event-tool" },
  "state.transition": { label: "State Transition", color: "event-state" },
  "harness.result": { label: "Harness Result", color: "event-harness" },
  "iteration.checkpoint": { label: "Iteration", color: "event-iteration" },
  "convergence.assessment": {
    label: "Convergence",
    color: "event-convergence",
  },
  "tribunal.result": { label: "Tribunal", color: "event-tribunal" },
  "memory.update": { label: "Memory Update", color: "event-memory" },
  "commit.complete": { label: "Commit", color: "event-commit" },
  "context.check": { label: "Context Check", color: "event-context" },
  "typecheck.pass": { label: "Typecheck Pass", color: "event-state" },
  "typecheck.fail": { label: "Typecheck Fail", color: "event-harness" },
  "tests.pass": { label: "Tests Pass", color: "event-state" },
  "tests.fail": { label: "Tests Fail", color: "event-harness" },
  "commit.blocked": { label: "Commit Blocked", color: "event-harness" },
  "commit.allowed": { label: "Commit Allowed", color: "event-commit" },
  "note.added": { label: "Note Added", color: "event-memory" },
  "phase.added": { label: "Phase Added", color: "event-state" },
  "note.consumed": { label: "Note Consumed", color: "event-commit" },

  // State machine event types
  START: { label: "Start", color: "event-session" },
  RESET: { label: "Reset", color: "event-state" },
  PREFLIGHT_COMPLETE: { label: "Pre-Flight Done", color: "event-state" },
  PHASE_STARTED: { label: "Phase Started", color: "event-state" },
  PHASE_COMPLETE: { label: "Phase Complete", color: "event-state" },
  VERIFY_PASSED: { label: "Verify Passed", color: "event-state" },
  VERIFY_FAILED: { label: "Verify Failed", color: "event-harness" },
  field_set: { label: "Field Set", color: "event-state" },
  ROUTE_COMPLETE: { label: "Route Complete", color: "event-state" },
  DISCUSS_COMPLETE: { label: "Discuss Complete", color: "event-state" },
  PLAN_COMPLETE: { label: "Plan Complete", color: "event-state" },
  COMMIT_COMPLETE: { label: "Commit Complete", color: "event-commit" },
  LEARN_COMPLETE: { label: "Learn Complete", color: "event-memory" },
} as const;

export type EventTypeName = keyof typeof EVENT_TYPES;

/**
 * Workflow state display metadata.
 */
export const WORKFLOW_STATES = {
  idle: { label: "Idle", color: "muted-foreground" },
  preflight: { label: "Pre-Flight", color: "info" },
  routing: { label: "Routing", color: "info" },
  discussing: { label: "Discussing", color: "accent" },
  planning: { label: "Planning", color: "accent" },
  executing: { label: "Executing", color: "warning" },
  verifying: { label: "Verifying", color: "info" },
  learning: { label: "Learning", color: "event-memory" },
  committing: { label: "Committing", color: "event-commit" },
  complete: { label: "Complete", color: "success" },
  paused: { label: "Paused", color: "muted-foreground" },
  suspended: { label: "Suspended", color: "warning" },
  failed: { label: "Failed", color: "destructive" },
} as const;

/**
 * Complexity level display metadata.
 */
export const COMPLEXITY_LEVELS = {
  TRIVIAL: { label: "Trivial", color: "muted-foreground", tier: "lightweight" },
  SIMPLE: { label: "Simple", color: "success", tier: "lightweight" },
  MODERATE: { label: "Moderate", color: "info", tier: "standard" },
  COMPLEX: { label: "Complex", color: "warning", tier: "thorough" },
  CRITICAL: { label: "Critical", color: "destructive", tier: "thorough" },
} as const;

/** Shape of a single navigation item. */
export type NavItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: string;
};

/** Shape of a navigation group containing items. */
export type NavGroup = {
  readonly label: string;
  readonly items: readonly NavItem[];
};

/**
 * Grouped navigation structure for the NavRail.
 *
 * Three groups: OBSERVE (monitoring), BUILD (pipeline authoring),
 * CONFIGURE (settings and configuration).
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "OBSERVE",
    items: [
      { href: "/", label: "Home", icon: "LayoutDashboard" },
      { href: "/sessions", label: "Sessions", icon: "Activity" },
      { href: "/memory", label: "Memory", icon: "Brain" },
    ],
  },
  {
    label: "BUILD",
    items: [
      { href: "/pipeline", label: "Pipeline", icon: "Workflow" },
      { href: "/agents", label: "Agents", icon: "Bot" },
      { href: "/skills", label: "Skills", icon: "Hexagon" },
      { href: "/rules", label: "Rules", icon: "Shield" },
    ],
  },
  {
    label: "CONFIGURE",
    items: [
      { href: "/config", label: "Config", icon: "SlidersHorizontal" },
      { href: "/settings", label: "Settings", icon: "Settings" },
    ],
  },
];

/**
 * Flat navigation items derived from NAV_GROUPS for backward compatibility.
 *
 * @deprecated Use NAV_GROUPS instead for grouped rendering. Will be removed in v9.0.0.
 */
export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap(
  (group) => group.items,
);

/**
 * Convergence status to CSS color token mapping.
 *
 * Used by iteration charts and timelines to color-code convergence
 * status badges and bars.
 */
export const CONVERGENCE_STATUS_COLORS: Record<string, string> = {
  improved: "success",
  stalled: "warning",
  regressed: "destructive",
} as const;

export const DEFAULT_PORT = 3456;

/**
 * Maps a singular entity type to its plural domain name.
 *
 * Used by components that need to translate UI-level entity types
 * (agent, skill, rule) to the API-level domain identifier (agents,
 * skills, rules).
 */
export const ENTITY_DOMAIN: Record<"agent" | "skill" | "rule", string> = {
  agent: "agents",
  skill: "skills",
  rule: "rules",
};

/**
 * File path prefixes that Studio considers "tracked" for git publish operations.
 *
 * These are the source directories and config files that Studio may edit.
 * Used by the git/publish route to separate Studio-tracked changes from
 * non-Studio changes.
 */
export const STUDIO_PATH_PREFIXES = [
  "src/agents/",
  "src/skills/",
  "src/rules/",
  ".planning/config.json",
];

/**
 * Base URL for the compilation sidecar process.
 *
 * The sidecar runs on a fixed port and handles entity compilation requests
 * proxied from the Studio API routes.
 */
export const SIDECAR_URL = "http://localhost:3457";

/**
 * Timeout (in milliseconds) for compilation requests to the sidecar.
 *
 * If the sidecar does not respond within this window, the proxy route
 * returns 504 Gateway Timeout.
 */
export const SIDECAR_TIMEOUT_MS = 30_000;
