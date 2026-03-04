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

/**
 * Navigation items for the sidebar.
 */
export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/workflow", label: "Workflow", icon: "GitBranch" },
  { href: "/iterations", label: "Iterations", icon: "RefreshCw" },
  { href: "/harness", label: "Harness", icon: "Shield" },
  { href: "/planning", label: "Planning", icon: "ListTodo" },
  { href: "/memory", label: "Memory", icon: "Brain" },
  { href: "/tribunal", label: "Tribunal", icon: "Scale" },
  { href: "/agents", label: "Agents", icon: "Bot" },
  { href: "/notes", label: "Notes", icon: "StickyNote" },
] as const;

export const DEFAULT_PORT = 3456;
