# Phase 148 Discussion Context: Custom Node Types & Edge Rendering

**Complexity:** SIMPLE
**Appetite:** Small (50,000 tokens, 40% context)

## Design Decisions

### Node Component Strategy

- One component per node_type (step, agent, skill, gate) for distinct visual appearance
- All receive `NodeProps<WorkflowNodeData>` from React Flow
- Registered via `nodeTypes` prop on `<ReactFlow>`

### Styling Approach

- Reuse existing shadcn Badge component for model tier badges
- Use CSS variables from globals.css (oklch dark theme tokens)
- Tailwind classes for layout, border, background
- Handle component from React Flow for connection points

### Edge Styling

- Use React Flow's built-in edge types with style overrides (no custom edge components needed)
- Differentiate via stroke color, dasharray, animation, and markerEnd
- Map edge_type to visual properties in a config object

### Color Palette

- Step nodes: `--primary` border, subtle background
- Agent nodes: Border color varies by model tier (fast=muted, balanced=info, capable=warning)
- Skill nodes: `--accent` border
- Gate nodes: `--warning` border with diamond/hexagon styling
