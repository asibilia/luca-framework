# Workflow Canvas: Product Pitch

> **Author:** Product Lead (AI agent)
> **Date:** 2026-03-25
> **Status:** Approved — incorporated into main spec

---

## 1. User Personas

**Persona A -- The Solo AI Builder (Primary)**
A developer who builds and iterates on agentic workflows using Luca. They already define agents, skills, rules, and hooks in TypeScript, compile them to markdown, and run them through Claude Code or Cursor. They understand the domain model but lose mental context when workflows grow beyond 10-15 steps. They want to _see_ their workflow, not grep through skill files to trace execution order. They are already using Luca Studio for entity editing, memory inspection, and pipeline visualization.

**Persona B -- The Workflow Tinkerer**
A technically capable user who wants to experiment with agentic workflows without writing TypeScript definitions from scratch. They think in terms of "this skill feeds into that agent, which triggers this hook." They want to drag, connect, and configure -- then hit Play and watch it run. They are comfortable with JSON and prompt engineering but do not want to learn the Luca compiler pipeline to get started.

**Persona C -- The Prompt Engineer (Stretch)**
A non-developer who designs prompts and agent behaviors. They need a visual interface to understand how their prompts fit into the larger workflow. They configure node properties (model selection, metadata, body text) but do not write code. This persona is Phase 2+ -- the MVP does not need to fully serve them, but the architecture should not exclude them.

## 2. Core Value Proposition

**Why visual?** Because agentic workflows are directed graphs, and humans reason about graphs spatially, not textually. The current Luca pipeline page already proves this -- users immediately understand the workflow topology when they see it as a React Flow canvas. But the current pipeline page is _read-mostly_. You can view the DAG, select nodes, and inspect configuration, but you cannot author new workflows from scratch, execute them, or see results inline.

**Why now?** Three reasons:

1. **The infrastructure is 80% built.** Luca Studio already has React Flow v12, custom node types (agent, skill, gate, stage-group), edge styles, auto-layout, a step config panel, dirty tracking, save/discard, and Jotai state management. The pipeline page is a functional canvas editor. The gap is: execution, hook nodes, action/control-flow nodes, and the "run" button.

2. **The competitive window is open.** Langflow and Flowise target LangChain users. n8n targets automation. ElevenLabs targets voice pipelines. Nobody builds a visual workflow editor for _agentic development frameworks_ -- the Luca domain (skills with input/output links, hooks with output-only links, agent team references, complexity gating, cognitive memory). This is a defensible niche.

3. **The existing text-based workflow is hitting a ceiling.** As Luca workflows grow past 15-20 steps with conditional gates, loop actions, and multi-agent teams, the YAML/JSON/TypeScript representation becomes hard to reason about. Visual editing is not a luxury -- it is a scaling requirement.

**What pain does this solve?**

- "I cannot see how my agents connect to my skills" -- solved by spatial layout with typed edges
- "I have to read 5 files to understand execution order" -- solved by a single canvas view
- "I want to test a workflow change without a full build:all cycle" -- solved by inline execution
- "I do not know what this workflow costs to run" -- solved by token/cost display per execution

## 3. Competitive Analysis

| Product                        | Strengths                                                                                                                             | Weaknesses                                                                                                   | What We Steal                                                                                | What We Avoid                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **UE5 Blueprints**             | Beautiful node rendering. Typed pins with color coding. Zoom-to-fit. Exec flow (white wire) vs data flow (colored wires) distinction. | Overwhelming for non-game-devs. Too many node types. Complex property panels.                                | Exec vs data flow visual distinction. Typed, colored connection handles. Zoom/minimap UX.    | Complexity. We have 4 node types, not 400.            |
| **n8n**                        | Clean card-based nodes. Inline test execution per node. Credential management. Error highlighting on nodes.                           | Generic automation focus. No domain-specific node types. Webhook-centric. No concept of "model" or "tokens." | Per-node test execution. Error state on nodes (red border + message). Inline output preview. | Generic "HTTP Request" nodes. We are domain-specific. |
| **ElevenLabs Workflow Editor** | Gorgeous dark UI. Smooth animations. Clean edge routing. Real-time streaming output. Model selection per node.                        | Voice-pipeline specific. Limited control flow. No branching/loops.                                           | Dark aesthetic. Model selector in node config. Streaming output panel. Clean edge routing.   | Single-domain limitation.                             |
| **Langflow**                   | LangChain integration. Component marketplace. Playground mode.                                                                        | Tied to LangChain abstractions. Clunky UI. Slow.                                                             | Playground/test mode concept.                                                                | LangChain coupling. Sluggish UX.                      |
| **Flowise**                    | Easy setup. Chat-flow paradigm.                                                                                                       | Limited to chatbot flows. No general workflow support.                                                       | Nothing specific.                                                                            | Chat-only paradigm.                                   |

**Our differentiation:** We are not building a generic workflow tool. We are building a visual editor for _Luca's domain model_ -- skills with typed I/O, hooks that trigger on lifecycle events, agents with cognition tiers and model routing, action nodes with conditional logic, and the entire complexity gating system. No competitor has this.

## 4. Key User Flows

### Flow 1: Create a New Workflow

1. User clicks "New Workflow" on the canvas (or from Home page)
2. Canvas opens with an empty grid and a floating "Add Node" button (or right-click context menu)
3. User names the workflow via an inline title field at the top
4. Auto-saved as draft. No explicit "create" step.

### Flow 2: Add and Connect Nodes

1. User clicks "+" or right-clicks canvas -> selects node type (Skill, Hook, Action)
2. Node appears at click position (or center viewport if via toolbar)
3. User drags from an output handle to another node's input handle
4. Edge snaps with animated confirmation. Invalid connections (e.g., hook-to-hook) are rejected with a subtle shake
5. Auto-layout available via toolbar button (already implemented in `auto-layout.ts`)

### Flow 3: Configure a Skill Node

1. User clicks a skill node -> detail panel slides in from right (already implemented: `StepConfigPanel`)
2. Panel shows: Name, Type, Description, Model selector, Metadata (key-value editor), Body (markdown/prompt editor with CodeMirror -- already in codebase)
3. Changes are tracked via dirty atoms (already implemented), saved via SaveBar (already implemented)

### Flow 4: Configure a Hook Node

1. User clicks hook node -> detail panel shows: Name, Event type (from `CANONICAL_EVENTS`), Tool filter, Command filter, Script reference or inline prompt, Timeout
2. Hook nodes only have output handles (they trigger, they are not triggered)

### Flow 5: Add an Action Node (Control Flow)

1. User selects "Action" from add menu -> sub-menu: Loop, Conditional, Parallel, Delay
2. Loop node shows: iterations count, exit condition field (supports `{{variable}}` template syntax)
3. Conditional node shows: condition expression, true/false output handles
4. These are the "glue" between skill/hook nodes

### Flow 6: Run a Test

1. User clicks "Play" button in canvas toolbar
2. Provider selector dropdown: Vercel AI SDK (cloud), BYOK (enter API key), Ollama (local)
3. Execution starts. Nodes light up in sequence as they execute (green border pulse)
4. Failed nodes show red border + error badge
5. Results panel opens at bottom: output text, token usage breakdown (prompt/completion/total), cost estimate based on model pricing
6. Each node's output is inspectable by clicking the node during/after execution

### Flow 7: Iterate

1. User reviews results, clicks a node to modify its prompt/config
2. Re-runs. Diff view available: "What changed since last run?"
3. Cost comparison: "This run cost $0.12 vs $0.18 last time"

## 5. MVP Scope (Ruthless Cut)

### Phase 1 -- MVP: Visual Authoring (ships first)

What is IN:

- Skill nodes with full config panel (extends existing `SkillNode` + `StepConfigPanel`)
- Hook nodes with output-only handles and event config
- Edge connections with validation (no cycles -- `hasCycle` already exists in `dag-validation.ts`)
- Auto-layout (already built)
- Save/discard with dirty tracking (already built)
- Serialization to/from a workflow JSON format (new, but builds on existing `WorkflowTopologyResponse` schema)
- Canvas toolbar: zoom, fit, minimap toggle, layout toggle, add node (mostly built)
- Right-click context menu on canvas and nodes
- Dark theme (already the default in Studio)

What is OUT of Phase 1:

- Execution engine (no Play button yet)
- Action/control-flow nodes (no loops, conditionals)
- Agent team references
- Token/cost tracking
- Provider selection
- Version history
- Templates/presets
- Import/export
- Collaboration

### Phase 2 -- Execution Engine

- Play button with provider selection (Vercel AI SDK, BYOK, Ollama)
- Sequential execution through the DAG
- Node execution state visualization (pending/running/success/error)
- Results panel with output, tokens, cost
- Per-node output inspection
- Error recovery: retry single node, skip node, abort run

### Phase 3 -- Control Flow and Advanced Features

- Action nodes: Loop, Conditional, Parallel, Delay
- Agent team references: `{{AgentTeam({ id: AGENT_TEAM })}}`
- Conditional edges (edge labels with conditions)
- Workflow templates/presets (starter workflows for common patterns)
- Version history (diff between workflow versions)
- Import/export (JSON, and potentially compile to Luca TypeScript definitions)

### Phase 4 -- Polish and Scale

- Real-time collaboration (SpacetimeDB v2 makes this natural)
- Workflow marketplace / sharing
- Performance profiling per node
- A/B testing: run two workflow variants, compare results
- Workflow-level variables and secrets management

## 6. Success Metrics

| Metric                           | Target (90 days post-launch)                             | Why It Matters                                      |
| -------------------------------- | -------------------------------------------------------- | --------------------------------------------------- |
| **Workflows created**            | 50+ unique workflows                                     | Adoption signal                                     |
| **Nodes per workflow (avg)**     | 8+                                                       | Proves users build real workflows, not toy examples |
| **Test runs per workflow (avg)** | 5+ (Phase 2)                                             | Proves iteration loop works                         |
| **Time to first node**           | < 30 seconds                                             | Canvas must feel instant and obvious                |
| **Time to first run**            | < 3 minutes (Phase 2)                                    | End-to-end flow must be fast                        |
| **Save rate**                    | 80%+ of started workflows are saved                      | Low abandonment                                     |
| **Return rate**                  | 60%+ of users who create a workflow return within 7 days | Sticky feature                                      |
| **Canvas session duration**      | 10+ minutes average                                      | Users are engaged, not bouncing                     |

## 7. Missing Pieces the Founder Has Not Thought Of

### 7A. Error Recovery UX (Critical)

When a node fails during execution, what happens? The user needs: (a) a clear error message on the node, (b) the ability to retry just that node, (c) the option to skip it and continue, (d) the ability to edit the node config and retry without re-running the entire workflow. This is the difference between a toy and a tool. n8n does this well. We must match it.

### 7B. Workflow-Level Variables and Context

Nodes need to pass data to each other. The `{{variable}}` syntax in action node conditions implies a variable system, but it is not defined. Questions: Where do variables come from? Are they scoped to the workflow run? Can a skill node's output populate a variable for downstream nodes? This is the data-flow layer -- distinct from the execution-flow layer. It needs a schema.

### 7C. The "Compile to Luca" Bridge

Users who build workflows visually will eventually want to export them as Luca TypeScript definitions (skills, agents, hooks in `src/`). And users who have existing TypeScript definitions will want to import them into the canvas. This bidirectional bridge (visual <-> code) is the killer feature that separates us from every competitor. It should be designed in Phase 1 even if it ships in Phase 3.

### 7D. Undo/Redo

The entity editor already has `jotai-history` for undo/redo on entity drafts. The canvas needs the same. Users will drag nodes, delete connections, and want to Cmd+Z. This is table stakes.

### 7E. Keyboard Shortcuts

Power users will want: Tab to cycle nodes, Delete to remove selected, Cmd+D to duplicate, Cmd+G to group, Space+drag to pan. The existing pipeline canvas has basic keyboard support. It needs to be comprehensive.

### 7F. Node Grouping / Subflows

As workflows grow, users will want to collapse a group of nodes into a named subflow (like UE5's "Collapse to Function"). This is Phase 3+ but the data model should support it from day one.

### 7G. Validation Before Execution

Before hitting Play, the canvas should validate: Are all required fields filled? Are there disconnected nodes? Are there cycles? Is a model selected for every skill node that needs one? Show warnings inline on nodes (yellow border) and block execution until errors (red) are resolved.

### 7H. Offline / Local-First

The canvas should work offline-first: save to local state immediately, sync to SpacetimeDB when connected.

### 7I. Template Marketplace (The Growth Engine)

"Start with a template" is how non-technical users onboard. Ship 5-10 starter templates with Phase 2.

### 7J. The Cognitive Memory Integration

This is Luca's unique advantage that no competitor has. The workflow canvas should be able to: (a) recall relevant patterns/pitfalls from MuninnDB when the user configures a node, (b) learn from successful workflow executions (store as `pattern:*` engrams), (c) suggest improvements based on past runs. This is the "magical" differentiator.

## Relevant Existing Files

- `packages/luca-studio/app/pipeline/page.tsx` -- existing canvas page
- `packages/luca-studio/components/workflow/` -- 20+ existing canvas components
- `packages/luca-studio/lib/workflow-types.ts` -- Zod schemas for nodes, edges, topology
- `packages/luca-studio/stores/pipeline-atoms.ts` -- Jotai atoms for canvas state
- `packages/luca-studio/lib/dag-validation.ts` -- cycle detection (hasCycle)
- `packages/luca-studio/components/workflow/add-step-menu.tsx` -- existing add-step UI
- `src/skills/__schemas/skill.schemas.ts` -- skill domain model
- `src/hooks/__schemas/hook.schemas.ts` -- hook domain model with CANONICAL_EVENTS
- `src/agents/__schemas/agent.schemas.ts` -- agent domain model
