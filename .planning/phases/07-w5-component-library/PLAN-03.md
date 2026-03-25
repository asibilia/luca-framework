---
phase: 7
plan: 3
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 7 Plan 3: Visualization Components (WorkflowNode, WorkflowEdge, ComplexityBadge)

## Objective

Build three custom React Flow components and a shared badge component for the Pipeline workflow editor. These replace the existing Observer-era workflow node components with the new Studio design spec (domain-colored left accents, status pills, overflow menus). The ComplexityBadge is a general-purpose component used across multiple pages.

## Context

@packages/luca-studio/components/workflow/ (new directory for WorkflowNode, WorkflowEdge)
@packages/luca-studio/components/shared/ (ComplexityBadge goes here alongside existing shared components)
@packages/luca-studio/components/workflow-editor/nodes/node-card.tsx (existing Observer node card -- reference for Handle patterns, will NOT be modified)
@packages/luca-studio/lib/constants.ts (COMPLEXITY_LEVELS with color metadata)
@docs/brainstorm/observer-studio-rework/3.ui-architecture.md (Node Design spec, Visualization Components)
@packages/luca-studio/package.json (@xyflow/react v12 already installed)

## Tasks

### 1. Create WorkflowNode component

**Type:** auto
**TDD:** false
**Depends on:** none

Build a custom React Flow node component at `packages/luca-studio/components/workflow/workflow-node.tsx`.

Requirements:

- "use client" directive (React Flow nodes need DOM)
- Implements React Flow's custom node interface (`NodeProps` from `@xyflow/react`)
- Node data shape (passed via React Flow's `data` prop):
  ```ts
  {
    label: string;           // step name
    icon: string;            // Lucide icon name
    domain: "planning" | "execution" | "verification" | "learning";
    modelTier: string;       // e.g., "balanced"
    agentCount: number;
    iterationBudget: number;
    status: "enabled" | "disabled" | "error";
    onOverflowAction?: (action: string) => void;
  }
  ```
- Visual layout matching the brainstorm spec:
  ```
  +------------------------------------------+
  |  [icon]  Step Name              [handle]  |
  |  ---------------------------------------- |
  |  Model tier: balanced    Agents: 3        |
  |  Budget: 2 iterations                     |
  |  ---------------------------------------- |
  |  [status pill]            [overflow menu] |
  +------------------------------------------+
  ```
- Fixed 280px width, variable height capped at ~120px
- Left border accent (2px) colored by domain:
  - planning: blue (`border-l-blue-500`)
  - execution: green (`border-l-green-500`)
  - verification: amber (`border-l-amber-500`)
  - learning: purple (`border-l-purple-500`)
- Status pill: small rounded badge showing status text
  - enabled: green background, "Enabled" text
  - disabled: muted background, "Disabled" text
  - error: red/destructive background, "Error" text
- Overflow menu (three-dot icon button) with actions: Edit, Duplicate, Delete, Enable/Disable toggle
- Selected state: `ring-2 ring-primary` (applied via React Flow's `selected` prop)
- Source and Target handles: top (target) and bottom (source) using React Flow Handle component
- Render Lucide icon dynamically based on `icon` string name

**Files to create/edit:**

- `packages/luca-studio/components/workflow/workflow-node.tsx`

**Verification:**

- Node renders at 280px width with correct domain-colored left border
- All data fields (step name, icon, model tier, agent count, budget) display correctly
- Status pill shows correct color and text for each status
- Overflow menu opens with action items on click
- Selected node shows ring-2 ring-primary outline
- Handles render at top and bottom for edge connections

### 2. Create WorkflowEdge component

**Type:** auto
**TDD:** false
**Depends on:** none

Build a custom React Flow edge component at `packages/luca-studio/components/workflow/workflow-edge.tsx`.

Requirements:

- "use client" directive
- Implements React Flow's custom edge interface (`EdgeProps` from `@xyflow/react`)
- Renders a smooth step or bezier path between source and target nodes
- Animated flow direction: CSS animation that moves a dash pattern along the path (use `strokeDasharray` + `strokeDashoffset` animation, or an SVG `animateMotion` circle)
- Direction indicator: small arrowhead or chevron at the midpoint or target end of the edge
- Edge data shape:
  ```ts
  {
    animated?: boolean;    // whether to show flow animation (default true)
    label?: string;        // optional edge label (e.g., "on success")
  }
  ```
- Edge styling:
  - Default: `stroke-muted-foreground/60`, 2px width
  - Selected/hovered: `stroke-primary`, slightly thicker
  - Label (if present): small badge at edge midpoint with muted background
- Support for connection drawing: the edge should work with React Flow's connection validation (acyclic constraint validation is handled at the React Flow config level, not in the edge component itself)
- Use React Flow's `getBezierPath` or `getSmoothStepPath` utility for path calculation

**Files to create/edit:**

- `packages/luca-studio/components/workflow/workflow-edge.tsx`

**Verification:**

- Edge renders a smooth path between connected nodes
- Flow direction animation plays continuously when animated=true
- Arrowhead/direction indicator visible on the edge
- Edge label renders at midpoint when provided
- Hover/selected state changes edge styling
- Edge is compatible with React Flow's interactive edge drawing

### 3. Create ComplexityBadge component

**Type:** auto
**TDD:** false
**Depends on:** none

Build a color-coded complexity badge at `packages/luca-studio/components/shared/complexity-badge.tsx`.

Requirements:

- "use client" directive (or can be server component if no interactivity -- prefer server)
- Props:
  - `level`: one of "TRIVIAL" | "SIMPLE" | "MODERATE" | "COMPLEX" | "CRITICAL"
  - Optional `size`: "sm" (default), "md", "lg" controlling padding and font size
  - Optional `showTier`: boolean (default false) -- when true, appends tier label (e.g., "MODERATE (standard)")
- Reads color and tier metadata from `COMPLEXITY_LEVELS` constant in `lib/constants.ts`
- Color mapping using existing constant metadata:
  - TRIVIAL: muted-foreground (gray)
  - SIMPLE: success (green)
  - MODERATE: info (blue)
  - COMPLEX: warning (amber)
  - CRITICAL: destructive (red)
- Visual: rounded badge with colored background (low opacity) and colored text
- Uses shadcn Badge component as base if appropriate, or Tailwind primitives
- Uppercase text for the level name

**Files to create/edit:**

- `packages/luca-studio/components/shared/complexity-badge.tsx`

**Verification:**

- Badge renders correct color for each of the 5 complexity levels
- Size variants display at appropriate dimensions
- showTier appends the tier label in parentheses
- Colors match the COMPLEXITY_LEVELS constant metadata
- Component works in both server and client contexts

### 4. Create workflow barrel export

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Create the barrel index file for the workflow components directory.

**Files to create/edit:**

- `packages/luca-studio/components/workflow/index.ts`

**Verification:**

- WorkflowNode and WorkflowEdge are re-exported from the barrel
- Import `{ WorkflowNode, WorkflowEdge } from "@/components/workflow"` resolves correctly

## Verification

- All components render without errors in a Next.js page
- `bunx --bun tsc --noEmit` passes with no type errors in the new files
- WorkflowNode and WorkflowEdge integrate with React Flow v12's custom node/edge APIs
- ComplexityBadge renders correct colors for all 5 levels
- No classes used -- functional components only
- All files follow kebab-case naming convention
- Components coexist with existing Observer workflow-editor components (no conflicts)

## Success Criteria

- WorkflowNode renders pipeline steps with domain coloring, status pills, and overflow menus matching the brainstorm spec
- WorkflowEdge provides animated directional flow between nodes
- ComplexityBadge is reusable across Pipeline, Agent, and Config pages
- Components are ready to compose into the Pipeline page in Phase 8
- Existing Observer workflow-editor components are untouched (new components live in separate `workflow/` directory)

## Output Specification

- `packages/luca-studio/components/workflow/workflow-node.tsx`
- `packages/luca-studio/components/workflow/workflow-edge.tsx`
- `packages/luca-studio/components/shared/complexity-badge.tsx`
- `packages/luca-studio/components/workflow/index.ts`
