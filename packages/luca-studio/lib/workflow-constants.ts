/**
 * Shared visual constants for the workflow editor.
 *
 * Single source of truth for tier display configuration and node type
 * color mappings. Consumed by agent-node, workflow-sidebar, workflow-canvas
 * (minimap), and workflow-stats-bar.
 *
 * Avoids DRY violations by centralizing values that were previously
 * duplicated across multiple components.
 */

// -- Tier display config ------------------------------------------------------

/**
 * Visual configuration for each model tier.
 *
 * Used by agent-node (card accent) and workflow-sidebar (detail panel).
 *
 * - `label`: Human-readable name with model family
 * - `description`: Short explanation of the tier
 * - `variant`: Badge variant for shadcn/ui Badge component
 * - `borderClass`: Tailwind border class for card accent
 * - `dotColor`: Tailwind bg class for status dot
 * - `headerBg`: Tailwind bg class for card header background
 */
export const TIER_DISPLAY_CONFIG: Record<
  string,
  {
    label: string;
    description: string;
    variant: "default" | "secondary" | "outline";
    borderClass: string;
    dotColor: string;
    headerBg: string;
  }
> = {
  fast: {
    label: "Fast (Haiku)",
    description: "Lightweight model for quick tasks",
    variant: "outline",
    borderClass: "border-gray-500/40",
    dotColor: "bg-gray-400",
    headerBg: "bg-gray-500/10",
  },
  balanced: {
    label: "Balanced (Sonnet)",
    description: "Standard model for most tasks",
    variant: "secondary",
    borderClass: "border-sky-500/40",
    dotColor: "bg-sky-400",
    headerBg: "bg-sky-500/10",
  },
  capable: {
    label: "Capable (Opus)",
    description: "Deep analysis model for complex tasks",
    variant: "default",
    borderClass: "border-amber-500/40",
    dotColor: "bg-amber-400",
    headerBg: "bg-amber-500/10",
  },
};

// -- Node type colors ---------------------------------------------------------

/**
 * Color configuration for each workflow node type.
 *
 * Used by workflow-canvas (minimap `nodeColor` function needs hex) and
 * workflow-stats-bar (legend dots use Tailwind classes).
 *
 * - `hex`: Concrete hex color for SVG context (minimap)
 * - `tailwind`: Tailwind bg class for DOM context (stats bar dots)
 */
export const NODE_TYPE_COLORS: Record<
  string,
  { hex: string; tailwind: string }
> = {
  "stage-group": { hex: "#60a5fa", tailwind: "bg-blue-400" },
  agent: { hex: "#9ca3af", tailwind: "bg-gray-400" },
  gate: { hex: "#fbbf24", tailwind: "bg-amber-400" },
  skill: { hex: "#a78bfa", tailwind: "bg-violet-400" },
};

/** Fallback color for unknown node types. */
export const NODE_TYPE_COLOR_DEFAULT = {
  hex: "#6b7280",
  tailwind: "bg-gray-500",
};
