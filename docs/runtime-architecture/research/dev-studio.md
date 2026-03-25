# Research: Luca Studio -- Developer Workflow Visualization Tooling

**Domain:** Developer studio / workflow visualization for agentic development tooling
**Researched:** 2026-03-23
**Overall confidence:** HIGH (multiple sources cross-referenced, Bun docs verified, visualization libraries verified via GitHub)

---

## Executive Summary

Luca Studio is a lightweight Bun-native dev server that provides interactive visualization of Luca's workflow DAG, agent definitions, eval results, and state machine. The current feedback loop is broken: developers must exit Claude Code, run `build:all` manually, restart the session, and invoke `/lu` to observe changes. Studio eliminates this by providing a browser-based dashboard that hot-reloads on source changes.

The technology landscape strongly favors a **zero-framework** approach: Bun.serve() with vanilla HTML/CSS, Server-Sent Events for live reload, and Elk.js for DAG layout computation with SVG rendering. This keeps the dependency footprint minimal (~2 production deps: elkjs + xstate), aligns with Luca's Bun-first philosophy, and avoids the frontend framework churn that would make this tool a maintenance burden.

The key insight from research is that **Bun 1.3's fullstack dev server** (HTML imports as routes, built-in HMR, parameterized routes) is purpose-built for exactly this use case. Combined with SSE for browser-to-server live reload and WebSocket for state machine inspection, the entire server is achievable in ~300 lines of TypeScript with zero framework dependencies.

---

## 1. Server Architecture: Bun.serve()

### Recommendation: Bun.serve() with HTML imports (Bun 1.3+)

**Confidence: HIGH** -- Verified via official Bun documentation.

Bun 1.3 introduced first-class fullstack dev server support. HTML files become route entrypoints, with automatic bundling of `<script>` and `<link>` tags. This eliminates the need for Express, Hono, or any routing framework.

### Key Capabilities

| Feature             | Bun.serve() Support        | Notes                                         |
| ------------------- | -------------------------- | --------------------------------------------- |
| Static file serving | Native via `Bun.file()`    | Content-type auto-detection                   |
| Route handling      | Built-in (Bun 1.3+)        | Parameterized routes: `/api/agents/:name`     |
| WebSocket           | Native, same server        | `server.upgrade(req)` in fetch handler        |
| Server-Sent Events  | Manual via ReadableStream  | Standard pattern, well-documented             |
| Hot Module Reload   | Built-in with `--hot` flag | Server-side only; browser needs SSE bridge    |
| TypeScript          | Native execution           | No compilation step needed                    |
| HTML bundling       | Automatic                  | Bundles `<script>` and `<link>` in HTML files |

### Server Pattern

```typescript
Bun.serve({
  port: 4040,
  development: true, // Enables HMR, source maps, no minification
  routes: {
    "/": homepage, // HTML import
    "/dag": dagView, // HTML import
    "/agents": agentsView,
    "/state": stateView,
  },
  async fetch(req, server) {
    const url = new URL(req.url);

    // SSE for live reload
    if (url.pathname === "/__studio_reload") {
      return new Response(sseStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
    }

    // WebSocket for state machine inspection
    if (url.pathname === "/ws/state") {
      server.upgrade(req);
      return;
    }

    // API endpoints for data
    if (url.pathname.startsWith("/api/")) {
      return handleApi(req);
    }

    // Static files
    return new Response(Bun.file(`./studio/public${url.pathname}`));
  },
  websocket: {
    open(ws) {
      /* send current state snapshot */
    },
    message(ws, msg) {
      /* handle state queries */
    },
  },
});
```

### Browser Live Reload via SSE

The proven pattern for Bun hot-reload browser notification uses Server-Sent Events. When Bun's `--hot` mode re-executes the server module, top-level code sends a reload message to connected browsers.

```typescript
// Server-side: SSE endpoint
let clients: Set<ReadableStreamDefaultController> = new Set();
globalThis.__studio_clients?.forEach((c) => c.enqueue("data: reload\n\n"));
globalThis.__studio_clients = clients;

// Client-side: auto-refresh
new EventSource("/__studio_reload").onmessage = () => location.reload();
```

**Confidence: HIGH** -- Pattern verified via bun-html-live-reload package and official Bun docs.

### Sources

- [Bun Fullstack Dev Server](https://bun.com/docs/bundler/fullstack)
- [Bun Watch Mode](https://bun.com/docs/runtime/watch-mode)
- [Bun WebSocket Docs](https://bun.com/docs/runtime/http/websockets)
- [Hot Reload HTTP Server](https://bun.com/docs/guides/http/hot)
- [Live Reloading HTML with Bun](https://dev.to/aabccd021/live-reload-html-with-bun-55p5)
- [bun-html-live-reload](https://github.com/aabccd021/bun-html-live-reload)
- [Bun 1.3 Full-Stack Runtime](https://www.heise.de/en/news/Web-Development-Bun-1-3-Becomes-Full-Stack-JavaScript-Runtime-10759717.html)

---

## 2. DAG / Workflow Visualization

### Recommendation: Elk.js for layout + SVG rendering (no framework)

**Confidence: HIGH** -- Verified via GitHub repo, npm, and multiple integration examples.

### Options Evaluated

| Library      | Bundle Size                    | React Required | Interactive                       | DAG Layout                             | Recommendation                   |
| ------------ | ------------------------------ | -------------- | --------------------------------- | -------------------------------------- | -------------------------------- |
| **Elk.js**   | ~1.3MB (bundled, GWT-compiled) | No             | Rendering-agnostic (you build it) | Layered, stress, mrtree, radial, force | **USE THIS**                     |
| Dagre-d3     | ~150KB + D3 (~250KB)           | No             | Basic (D3 click handlers)         | Layered only                           | Good alternative                 |
| Cytoscape.js | ~350KB                         | No             | Yes (pan, zoom, click)            | Via dagre extension                    | Overkill for this use case       |
| d3-dag       | ~50KB + D3 (~250KB)            | No             | Manual (D3-based)                 | Sugiyama, Zherebko, Grid               | Light maintenance mode           |
| Mermaid.js   | ~1.5MB                         | No             | Limited (click links only)        | Auto (Dagre internally)                | Too heavy, limited interactivity |
| React Flow   | ~500KB                         | **Yes**        | Full (drag, zoom, minimap)        | Via Elk/Dagre extensions               | Requires React -- excluded       |
| Nice-DAG     | ~30KB                          | No             | Basic                             | Custom                                 | Low adoption, sparse docs        |
| vis.js       | ~600KB                         | No             | Yes                               | Hierarchical                           | Too heavy, general-purpose       |

### Why Elk.js

1. **Rendering-agnostic**: Elk.js computes positions only. You render with SVG, Canvas, or DOM -- no framework lock-in.
2. **Best layered layout**: The ELK "layered" algorithm is the gold standard for directed graphs with ports and inherent direction -- exactly what a workflow DAG needs.
3. **Web Worker support**: Layout computation runs in a Web Worker, preventing UI freezing on larger graphs.
4. **Multiple algorithms**: Layered for the main DAG, mrtree for agent hierarchies, stress for force-directed alternatives.
5. **Active maintenance**: Backed by Kiel University's KIELER project, actively maintained as of 2026.

### How It Works

```typescript
import ELK from "elkjs/lib/elk.bundled.js";

const elk = new ELK();

// Define graph from Luca's workflow states
const graph = {
  id: "root",
  layoutOptions: { "elk.algorithm": "layered", "elk.direction": "DOWN" },
  children: [
    { id: "idle", width: 120, height: 40, labels: [{ text: "idle" }] },
    {
      id: "preflight",
      width: 120,
      height: 40,
      labels: [{ text: "preflight" }],
    },
    { id: "routing", width: 120, height: 40, labels: [{ text: "routing" }] },
    // ... all workflow states
  ],
  edges: [
    { id: "e1", sources: ["idle"], targets: ["preflight"] },
    { id: "e2", sources: ["preflight"], targets: ["routing"] },
    // ... all transitions
  ],
};

// Compute layout (returns same structure with x, y coordinates added)
const layoutResult = await elk.layout(graph);

// Render to SVG using the computed positions
function renderToSvg(graph) {
  let svg = `<svg width="${graph.width}" height="${graph.height}">`;
  for (const node of graph.children) {
    svg += `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" />`;
    svg += `<text x="${node.x + 10}" y="${node.y + 25}">${node.labels[0].text}</text>`;
  }
  // ... edges with path data from sections
  svg += `</svg>`;
  return svg;
}
```

### Alternative: Mermaid for Quick Static Diagrams

Mermaid renders to static SVG from a text DSL. It supports click handlers and tooltips but cannot do drag-and-drop, live animation, or custom node rendering. Use Mermaid for **documentation-grade** static diagrams (e.g., embedded in PLAN.md), not for the interactive Studio DAG.

**Mermaid interactivity is limited to:**

- Clickable links (navigate to URL)
- Tooltips on hover
- No dynamic node addition/removal
- No custom node styling beyond CSS classes
- Security tradeoff: `securityLevel: 'loose'` required for click handlers

**Confidence: HIGH** -- Verified via Mermaid.js official docs and GitHub.

### Sources

- [Elk.js GitHub](https://github.com/kieler/elkjs)
- [Elk.js npm](https://www.npmjs.com/package/elkjs)
- [Elk.js DeepWiki: Layout Configuration](https://deepwiki.com/kieler/elkjs/5.3-layout-configuration)
- [Dagre-d3 GitHub](https://github.com/dagrejs/dagre-d3)
- [d3-dag GitHub](https://github.com/erikbrinkman/d3-dag)
- [Cytoscape.js](https://js.cytoscape.org/)
- [Mermaid.js GitHub](https://github.com/mermaid-js/mermaid)
- [Nice-DAG GitHub](https://github.com/eBay/nice-dag)
- [Building Interactive Flowcharts with Mermaid.js](https://haridornala.medium.com/building-interactive-flowcharts-with-mermaid-js-and-javascript-57ec27cdc63d)

---

## 3. State Machine Visualization

### Recommendation: Custom SVG rendering from XState machine definition (not Stately Inspector)

**Confidence: HIGH** -- Verified via Stately Inspector docs.

### Options Evaluated

| Tool                    | Approach                                                  | Self-Hostable  | XState Integration                   | Recommendation    |
| ----------------------- | --------------------------------------------------------- | -------------- | ------------------------------------ | ----------------- |
| **Custom SVG + Elk.js** | Read XState machine definition, render states/transitions | Yes (built-in) | Direct -- parse machine config       | **USE THIS**      |
| Stately Inspector       | External iframe/popup at stately.ai                       | No (SaaS)      | Native -- `createBrowserInspector()` | Not self-hostable |
| XState Visualizer       | Online tool at stately.ai/viz                             | No (SaaS)      | Paste code into visualizer           | Not embeddable    |

### Why Custom Over Stately Inspector

1. **Stately Inspector opens stately.ai**: The inspector defaults to `https://stately.ai/inspector`. While a `url` config option exists, there is no documented self-hosted mode. For a local dev tool, this is unacceptable.
2. **We already have the machine definition**: Luca's `workflowMachine` in `src/state/machine.ts` is an XState v5 machine. We can read its states and transitions directly to generate a graph for Elk.js.
3. **Live state highlighting**: By subscribing to the state machine actor, we can highlight the current state node and animate transitions in real-time.
4. **Deeper integration**: We can show context values, event history, and guard evaluations -- things the generic Stately Inspector does not expose.

### Implementation Pattern

```typescript
// Extract states and transitions from XState machine config
import { workflowMachine } from "../state/machine";

function extractGraph(machine) {
  const states = Object.keys(machine.config.states);
  const edges = [];

  for (const [stateName, stateConfig] of Object.entries(
    machine.config.states,
  )) {
    for (const [event, transitions] of Object.entries(stateConfig.on || {})) {
      const targets = Array.isArray(transitions)
        ? transitions.map((t) => t.target)
        : [transitions.target || transitions];
      for (const target of targets) {
        edges.push({ source: stateName, target, event });
      }
    }
  }

  return { states, edges };
}

// Feed into Elk.js for layout, render as SVG
// Highlight current state via WebSocket subscription to state machine
```

### Sources

- [Stately Inspector Docs](https://stately.ai/docs/inspector)
- [XState Visualizer](https://stately.ai/viz)
- [Stately Inspector Blog Post](https://stately.ai/blog/2024-01-15-stately-inspector)
- [XState Inspection and Visualization (DeepWiki)](https://deepwiki.com/statelyai/xstate/5.1-inspection-tools)

---

## 4. UI Design Patterns for Developer Dashboards

### Recommendation: Tab-based navigation, sidebar for entity browsing, properties panel for detail

**Confidence: HIGH** -- Verified via Evil Martians design pattern research and Nuxt DevTools architecture.

### Key Patterns from Industry Research

Based on Evil Martians' "5 Essential Design Patterns for Dev Tool UIs" and analysis of Vite DevTools, Nuxt DevTools, and Chrome DevTools:

| Pattern                | Application in Luca Studio                                   | Example                |
| ---------------------- | ------------------------------------------------------------ | ---------------------- |
| **Tabs**               | Primary navigation between views (DAG, Agents, Evals, State) | Chrome DevTools tabs   |
| **Navigation Sidebar** | Agent/skill browser with collapsible tree                    | VS Code Explorer       |
| **Properties Panel**   | Agent detail view, state context inspector                   | Figma properties panel |
| **Tables**             | Eval results viewer, ledger entries                          | GitHub Issues list     |
| **Toolbars**           | Action buttons (reload, filter, search)                      | VS Code toolbar        |

### Nuxt DevTools Architecture Lessons

Nuxt DevTools provides the closest architectural precedent:

1. **Modular views**: Each module contributes its own view panel. Studio should have modular view components.
2. **Extensibility**: A consistent UI kit ensures visual coherence. Use CSS custom properties for theming.
3. **Bidirectional RPC**: Vite DevTools uses a built-in RPC layer for server-client communication. Studio uses WebSocket for the same purpose.
4. **Progressive disclosure**: Start with overview, drill into detail. The DAG view shows the whole workflow; clicking a node shows agent details.

### Proposed View Architecture

```
+--------------------------------------------------+
| Luca Studio                    [Reload] [Filter]  |  <- Toolbar
+------+-------------------------------------------+
| DAG  | +---------------------------------------+ |
|------| |                                       | |  <- Main content area
|Agents| |   [Workflow DAG / State Machine /     | |
|------| |    Agent Detail / Eval Results]       | |
| Evals| |                                       | |
|------| |                                       | |
|State | +---------------------------------------+ |
|------| | Properties / Context / Detail Panel   | |  <- Detail panel (bottom)
|      | +---------------------------------------+ |
+------+-------------------------------------------+
```

**Views:**

1. **DAG View**: Interactive workflow DAG with state highlighting. Click node -> shows agent/step detail in bottom panel.
2. **Agents View**: Tree browser of all agents (luca/, general/) with compiled output preview (what gets emitted to .claude/).
3. **Evals View**: Table of eval results with pass/fail indicators, execution time, and drill-down to individual eval logs.
4. **State View**: Live state machine inspector showing current state, context values, event history, and transition log.

### CSS Architecture: No Framework, Custom Properties

```css
:root {
  --studio-bg: #1e1e2e;
  --studio-surface: #313244;
  --studio-text: #cdd6f4;
  --studio-accent: #89b4fa;
  --studio-success: #a6e3a1;
  --studio-error: #f38ba8;
  --studio-warning: #fab387;
  --studio-border: #45475a;
  --studio-font: "JetBrains Mono", "Fira Code", monospace;
}
```

A dark theme with Catppuccin-inspired colors is recommended for developer tools. CSS custom properties enable theming without a CSS framework.

### Sources

- [5 Essential Design Patterns for Dev Tool UIs (Evil Martians)](https://evilmartians.com/chronicles/keep-it-together-5-essential-design-patterns-for-dev-tool-uis)
- [6 Things Developer Tools Must Have in 2026 (Evil Martians)](https://evilmartians.com/chronicles/six-things-developer-tools-must-have-to-earn-trust-and-adoption)
- [Devs in Mind: How to Design Interfaces for Developer Tools (Evil Martians)](https://evilmartians.com/chronicles/devs-in-mind-how-to-design-interfaces-for-developer-tools)
- [Nuxt DevTools Introduction](https://nuxt.com/blog/introducing-nuxt-devtools)
- [Nuxt DevTools v1.0](https://nuxt.com/blog/nuxt-devtools-v1-0)
- [Vite DevTools](https://devtools.vite.dev/)
- [Intuit devtools-ds](https://github.com/intuit/devtools-ds)

---

## 5. File Watching and Incremental Rebuild

### Recommendation: `bun --hot` for server + targeted recompilation for source changes

**Confidence: MEDIUM** -- Bun hot mode is well-documented; incremental rebuild strategy is inference-based.

### File Watch Strategy

| Layer             | Mechanism                    | What It Watches             | What It Does                                 |
| ----------------- | ---------------------------- | --------------------------- | -------------------------------------------- |
| Server hot reload | `bun --hot studio/server.ts` | Studio server code          | Re-executes server module without restart    |
| Source watcher    | `fs.watch()` (Bun native)    | `src/` directory            | Triggers targeted recompilation + SSE reload |
| Browser refresh   | SSE EventSource              | `/__studio_reload` endpoint | `location.reload()` on message               |

### Avoiding build:all

The critical constraint is that `bun run build:all` crashes Claude Code. Studio must provide an alternative that recompiles only the changed domain.

**Targeted recompilation approach:**

```typescript
import { watch } from "fs";

// Watch src/ for changes
watch("src/", { recursive: true }, (event, filename) => {
  if (!filename) return;

  // Determine which domain changed
  const domain = filename.split("/")[0]; // agents, skills, rules, etc.

  // Run only the relevant compiler
  // Instead of build:all, run the specific domain compiler
  const result = Bun.spawnSync([
    "bun",
    `src/compilers/__helpers/compile-${domain}.ts`,
  ]);

  // Notify browser via SSE
  notifyClients("reload");
});
```

This avoids the full `build:all` pipeline. The Studio server watches `src/` and runs only the compiler for the changed domain.

### Bun Watch Internals

Bun uses OS-native filesystem watcher APIs:

- **macOS**: kqueue
- **Linux**: inotify
- **No polling**: Avoids CPU overhead of interval-based checking

The `--hot` flag provides soft reload (preserving process state and open connections), while `--watch` provides hard restart. For a dev server, `--hot` is preferred because it keeps WebSocket connections alive.

### Caveat: Hot Reload Limitations

Bun's hot reload documentation notes the implementation "isn't particularly optimized" -- it re-transpiles all code including unchanged files and runs synchronous garbage collection. For Studio's purposes (small codebase, dev-only tool), this is acceptable.

### Sources

- [Bun Watch Mode](https://bun.com/docs/runtime/watch-mode)
- [Hot Reload HTTP Server](https://bun.com/docs/guides/http/hot)
- [bun-hot-reload GitHub](https://github.com/yoshikouki/bun-hot-reload)
- [Bun Discussion: Watch/Hot Events](https://github.com/oven-sh/bun/discussions/10826)

---

## 6. Recommended Technology Stack

### Production Dependencies (minimal)

| Package  | Version | Purpose                | Size                  | Why                                                                   |
| -------- | ------- | ---------------------- | --------------------- | --------------------------------------------------------------------- |
| `elkjs`  | ^0.9.x  | DAG layout computation | ~1.3MB (GWT-compiled) | Best layered layout algorithm; framework-agnostic; Web Worker support |
| `xstate` | ^5.x    | Already in project     | Already installed     | State machine definition is the data source for visualization         |

**Total new dependencies: 1** (elkjs). XState is already in the project.

### Dev-Only / Built-In (no additional deps)

| Technology            | Purpose                              | Source                    |
| --------------------- | ------------------------------------ | ------------------------- |
| `Bun.serve()`         | HTTP server, WebSocket, static files | Bun runtime (built-in)    |
| `Bun.file()`          | Static file serving                  | Bun runtime (built-in)    |
| `fs.watch()`          | File system watching                 | Node.js compat (built-in) |
| Vanilla HTML/CSS/JS   | UI rendering                         | No framework              |
| SVG                   | Graph rendering                      | Browser-native            |
| Server-Sent Events    | Live reload notification             | Browser-native            |
| WebSocket             | State machine live updates           | Bun runtime (built-in)    |
| CSS Custom Properties | Theming                              | Browser-native            |

### Alternatives Considered and Rejected

| Alternative       | Why Rejected                                                                         |
| ----------------- | ------------------------------------------------------------------------------------ |
| React / Preact    | Adds framework dependency, build step complexity, maintenance burden                 |
| Hono / ElysiaJS   | Unnecessary abstraction over Bun.serve() for a simple dev tool                       |
| D3.js             | Large bundle (~250KB); only needed if we want fancy transitions -- SVG is sufficient |
| Mermaid.js        | 1.5MB bundle; limited interactivity; static rendering only                           |
| Cytoscape.js      | Overkill -- full graph analysis library when we only need layout + rendering         |
| Stately Inspector | SaaS dependency; not self-hostable; less customizable than custom rendering          |
| Tailwind CSS      | Build step dependency; CSS custom properties achieve the same result for a small UI  |

---

## 7. View-by-View Design

### 7.1 DAG View (Workflow Visualization)

**Purpose**: Show the Luca workflow as an interactive directed graph. Highlight current state, show transition history, click nodes for detail.

**Data source**: `src/state/machine.ts` -- extract states and transitions from XState machine config.

**Rendering approach**:

1. Parse XState machine definition to extract states, transitions, guards
2. Feed into Elk.js with `layered` algorithm, `DOWN` direction
3. Render computed positions as SVG `<rect>` (states) and `<path>` (edges)
4. Highlight current state with accent color via WebSocket subscription
5. Show transition labels (event names) on edges
6. Click node -> populate detail panel with state config, guards, actions

**Interactive features**:

- Current state highlighting (pulsing border)
- Transition animation (edge color flash on state change)
- Click node -> detail panel shows guards, actions, context
- Hover edge -> tooltip shows event name and guard conditions
- Zoom/pan via SVG viewBox manipulation

### 7.2 Agents View (Definition Browser)

**Purpose**: Browse all agent definitions, see their configuration, and preview compiled output.

**Data source**: `src/agents/` directory -- read `.agent.ts` files, parse exported definitions.

**Layout**:

- Left sidebar: collapsible tree of agents grouped by directory (luca/, general/)
- Main area: agent detail card showing name, model routing, description
- Bottom panel: compiled markdown preview (what gets emitted to `.claude/agents/`)

**Features**:

- Search/filter agents by name
- Show model routing tier (haiku/sonnet/opus) per complexity level
- Side-by-side: source definition vs. compiled output
- Diff view when source changes

### 7.3 Evals View (Results Viewer)

**Purpose**: Display evaluation results from harness runs and verification checks.

**Data source**: `.planning/` directory -- harness output JSON, verification results.

**Layout**:

- Table view with columns: check type, status (pass/fail), duration, error count
- Click row -> detail panel shows parsed errors, file locations, fix suggestions
- Filter by check type (test, typecheck, lint, build)
- Timeline view showing harness run history

### 7.4 State View (Machine Inspector)

**Purpose**: Live inspection of the workflow state machine -- current state, context values, event log.

**Data source**: State machine persistence files (`.planning/state.json`, `STATE.md`) + live WebSocket subscription.

**Layout**:

- Top: current state badge + state machine mini-diagram (reuses DAG rendering)
- Middle: context inspector (collapsible JSON tree of WorkflowContext)
- Bottom: event log table (chronological list of events/transitions)

**Features**:

- Live updates via WebSocket (state changes reflected immediately)
- Context diff on state change (highlight what changed)
- Event replay: click an event in the log to see the state at that point
- Ledger viewer: session ledger entries from `.planning/session-ledger.jsonl`

---

## 8. Architecture Patterns

### Pattern: Server-Rendered HTML with Client-Side Enhancement

Studio pages are server-rendered HTML with minimal client-side JavaScript for interactivity. No SPA routing, no client-side state management, no virtual DOM.

```
Browser Request -> Bun.serve() -> Read data from filesystem -> Render HTML -> Response
                                                                  |
                                                         SSE/WebSocket for live updates
```

This is the simplest possible architecture. Each page load reads current data from the filesystem (agent definitions, state machine, eval results) and renders a complete HTML page. WebSocket and SSE provide live updates without page reload.

### Pattern: Data Extraction Layer

A thin data extraction layer reads Luca's source files and produces JSON for the UI:

```typescript
// studio/data/agents.ts
export function getAgentDefinitions(): AgentSummary[] {
  // Read src/agents/**/*.agent.ts
  // Parse exported definitions
  // Return structured data
}

// studio/data/state.ts
export function getCurrentState(): WorkflowSnapshot {
  // Read .planning/state.json
  // Parse and return current state
}

// studio/data/evals.ts
export function getEvalResults(): EvalResult[] {
  // Read harness output from .planning/
  // Parse and return structured results
}
```

### Pattern: Progressive Enhancement

The base HTML is fully functional without JavaScript. JavaScript adds:

- Click handlers for node selection
- WebSocket connection for live state updates
- SVG pan/zoom
- Search/filter in agent browser

If JavaScript fails to load, the page still shows a static snapshot of the data.

### Anti-Pattern: SPA with Client-Side Routing

Do NOT build this as a single-page application. Each view (DAG, Agents, Evals, State) is its own HTML page served by Bun. Navigation is standard `<a>` links. This avoids:

- Client-side routing complexity
- State management libraries
- Build step for client bundle
- Hydration issues

---

## 9. Pitfalls and Warnings

### Pitfall 1: build:all Crashes Claude Code

**What goes wrong**: Running `bun run build:all` during a Claude Code session orphans processes and crashes the session.

**Prevention**: Studio must NEVER trigger `build:all`. Instead, use targeted recompilation of individual domains. The file watcher identifies which domain changed and runs only that domain's compiler.

**Detection**: If Studio starts spawning `build:all`, the developer's Claude Code session will freeze.

### Pitfall 2: Elk.js Bundle Size

**What goes wrong**: Elk.js's bundled version (`elk.bundled.js`) is ~1.3MB because it includes a GWT-compiled Java layout engine (not WASM as sometimes mislabeled).

**Prevention**: This is acceptable for a dev-only tool (not shipped to production). Lazy-load the Elk.js bundle only on the DAG view, not on every page. If main-thread blocking is an issue, use the Web Worker version (`elk-worker.js`) which loads asynchronously.

**Detection**: If page load exceeds 2 seconds, investigate bundle size.

### Pitfall 3: SSE Connection Limits

**What goes wrong**: Browsers limit concurrent SSE connections per domain (typically 6 in HTTP/1.1).

**Prevention**: Use a single SSE connection for all live reload notifications. Multiplex different event types (`reload`, `state-change`, `eval-complete`) on the same stream.

**Detection**: If multiple Studio tabs stop receiving updates, this is the cause.

### Pitfall 4: XState Machine Config Extraction

**What goes wrong**: XState v5 machine definitions use `setup()` which makes static analysis harder than XState v4's plain object configs.

**Prevention**: Import the machine module directly and traverse `machine.config.states`. This works because the machine definition is a pure data structure (no runtime side effects at import time). If the machine uses `createActor()` at import time, extract the config before actor creation.

**Detection**: If the DAG view shows incomplete states, the extraction logic is not traversing the config correctly.

### Pitfall 5: File Watcher Event Storms

**What goes wrong**: A single `build:all` or `bun run build` can trigger hundreds of file change events, each causing a browser reload.

**Prevention**: Debounce file watcher events (300ms delay). Only trigger reload after the last event in a burst.

**Detection**: If the browser flashes rapidly during builds, debouncing is insufficient.

---

## 10. Roadmap Implications

Based on this research, suggested implementation phases:

### Phase 1: Server Skeleton + DAG View (MVP)

- Set up Bun.serve() with static file serving
- Implement SSE live reload
- Extract state machine graph from XState config
- Elk.js layout computation
- SVG rendering of workflow DAG
- Current state highlighting via file system polling

**Rationale**: The DAG view provides the most immediate value -- understanding the workflow visually. Server skeleton enables all future views.

### Phase 2: Agent Browser

- File system scanner for `src/agents/` and `src/skills/`
- Agent definition parser (extract name, model routing, description)
- Compiled output preview (read from `.claude/agents/`)
- Tree navigation sidebar
- Source-vs-compiled diff view

**Rationale**: Second most valuable view. Understanding agent definitions and their compiled output is critical for the edit-observe loop.

### Phase 3: State Inspector + WebSocket

- WebSocket server for live state updates
- Context inspector (JSON tree viewer)
- Event log viewer
- Ledger browser (`session-ledger.jsonl`)
- State diff on transitions

**Rationale**: Requires WebSocket infrastructure. Builds on the DAG view (reuses state machine rendering) with live updates.

### Phase 4: Eval Results Viewer

- Harness output parser
- Results table with status indicators
- Error detail panel with file locations
- Historical results timeline
- Integration with harness runner

**Rationale**: Most value once the other views exist. Eval results are currently buried in log files.

### Phase 5: File Watcher + Targeted Recompilation

- `fs.watch()` on `src/` directory
- Domain detection from file path
- Targeted compiler execution (not build:all)
- SSE notification on recompilation complete
- Status indicator in UI

**Rationale**: This is the key differentiator that breaks the broken feedback loop. Deferred to Phase 5 because it requires understanding the compiler architecture deeply.

---

## 11. Confidence Assessment

| Area                       | Confidence | Notes                                                                                                               |
| -------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| Server (Bun.serve)         | HIGH       | Official docs verified; Bun 1.3 features confirmed                                                                  |
| DAG Visualization (Elk.js) | HIGH       | GitHub repo verified; API documented; multiple integration examples                                                 |
| State Machine Viz          | HIGH       | XState machine config is accessible; custom rendering straightforward                                               |
| UI Patterns                | HIGH       | Evil Martians research is authoritative; Nuxt DevTools architecture well-documented                                 |
| File Watching              | MEDIUM     | Bun --hot is documented; targeted recompilation strategy is inference-based, not verified                           |
| Targeted Recompilation     | LOW        | Assumes per-domain compilers exist and can run independently; needs validation against actual compiler architecture |
| SSE Live Reload            | HIGH       | Pattern verified via bun-html-live-reload package and official docs                                                 |

---

## 12. Open Questions

1. **Can individual domain compilers run independently?** The targeted recompilation strategy assumes `compile-agents.ts`, `compile-skills.ts`, etc. exist as standalone scripts. Need to verify this against the actual compiler architecture in `src/compilers/`.

2. **How large is the state machine graph?** Luca's workflow machine has ~13 states. With child machines (phase actor), the full graph may be larger. Need to verify Elk.js performance with the actual graph size.

3. **How to handle agent model routing visualization?** The complexity-routing table maps agents to model tiers per complexity level. Visualizing this as a matrix or heatmap in the agent browser would be valuable but adds UI complexity.

4. **Should Studio ship as a package or remain in-tree?** If Studio is useful beyond Luca development, it could become a standalone package. Initial recommendation: keep it in-tree under `packages/studio/` or `tools/studio/`.

5. **Port conflict handling?** Studio defaults to port 4040. Need a port selection strategy (env var, auto-increment, or `--port` flag) to avoid conflicts with other dev servers.

---

## Pre-Grooming Notes (Tooling Validation)

**Validated:** 2026-03-23
**Validator:** tooling-validator

### Verified Claims

- **Bun 1.3 fullstack dev server features (HTML imports, parameterized routes, HMR)** -- Verified. HTML imports as routes, parameterized routes (`:id`, wildcards), and built-in HMR are all confirmed. Note: HTML imports were introduced in Bun v1.2, with hot reloading and routing added in Bun v1.3. The minimum required version for full features is Bun v1.2.3+ (API endpoints + hot reload) or v1.2.17+ (ahead-of-time bundling). The `development: true` flag enables HMR by default. Source: [Bun Fullstack Dev Server](https://bun.com/docs/bundler/fullstack), [Bun 1.3 Blog](https://bun.com/blog/bun-v1.3)
- **Bun auto-bundling of `<script>` and `<link>` tags** -- Verified. Bun uses `HTMLRewriter` to scan HTML files, bundle referenced JS/TS/CSS, and rewrite with content-addressable hashed URLs. Source: [Bun Fullstack Docs](https://bun.com/docs/bundler/fullstack)
- **SSE pattern for browser live reload in Bun** -- Verified. The `bun-html-live-reload` package exists and uses SSE (not WebSocket) for one-way server-to-browser reload notifications. The default endpoint is `/__dev__/reload`. The pattern described in the document (EventSource + location.reload()) matches the package's implementation. Source: [bun-html-live-reload GitHub](https://github.com/aabccd021/bun-html-live-reload), [Bun SSE Guide](https://bun.com/docs/guides/http/sse)
- **Bun `--hot` vs `--watch` distinction** -- Verified. `--hot` provides soft reload (preserves process state, open connections), `--watch` provides hard restart. The document correctly recommends `--hot` for dev server use. Source: [Bun Watch Mode](https://bun.com/docs/runtime/watch-mode)
- **Bun `--hot` limitation ("not particularly optimized")** -- Verified. The documentation notes re-transpilation of all code and synchronous GC. Source: [Bun Hot Reload](https://bun.com/docs/guides/http/hot)
- **`fs.watch()` availability in Bun** -- Verified. Bun natively implements `fs.watch` with `recursive: true` support. Uses OS-native watcher APIs. Source: [Bun Watch Directory](https://bun.com/docs/guides/read-file/watch), [Bun fs.watch Reference](https://bun.com/reference/node/fs/watch)
- **Elk.js: rendering-agnostic, layered layout algorithm, Web Worker support, Kiel University backing** -- Verified. Elk.js computes layout positions only (no rendering). The layered algorithm is the primary layout. Web Workers are supported out of the box via `elk-worker.js`. The project is maintained by Kiel University's KIELER project. 2.5k GitHub stars. Source: [Elk.js GitHub](https://github.com/kieler/elkjs)
- **Elk.js: GWT-compiled Java (NOT WASM)** -- Verified. The library is compiled from ELK's Java codebase using Google Web Toolkit (GWT), producing JavaScript. It is NOT WebAssembly/WASM as the document incorrectly labels in several places. Source: [Elk.js GitHub README](https://github.com/kieler/elkjs/blob/master/README.md)
- **Stately Inspector: defaults to stately.ai, url config option exists** -- Verified. Default URL is `https://stately.ai/inspector`. A `url` configuration option exists. An `iframe` option is also available for embedding. Source: [Stately Inspector Docs](https://stately.ai/docs/inspector)
- **Mermaid.js interactivity limitations** -- Verified. Mermaid supports click handlers and tooltips but not drag-and-drop, dynamic node addition, or custom node rendering. `securityLevel: 'loose'` is required for click handlers. Source: [Mermaid.js Docs](https://mermaid.js.org/)

### Corrections

- **Elk.js bundle size: "~500KB (WASM)" is INCORRECT on two counts** -- (1) Elk.js is NOT WASM; it is GWT-compiled Java-to-JavaScript. (2) The actual bundled size (`elk.bundled.js`) is approximately **1.3MB minified** (~600KB for core + layered algorithms, ~100KB for remaining algorithms). The "~500KB" claim significantly understates the actual size. This appears in the comparison table (line 127), the tech stack table (line 433), and Pitfall 2 (line 615). Source: [Elk.js GitHub Issue #6](https://github.com/kieler/elkjs/issues/6), [Reaflow bundle size discussion](https://github.com/reaviz/reaflow/issues/224)
- **Stately Inspector: "Not self-hostable" is PARTIALLY INCORRECT** -- The Stately Inspector documentation exposes a `url` configuration option, meaning you can potentially point it to a different URL. However, there is no official self-hosted server distribution. The claim should read: "No official self-hosted server mode. The `url` option exists but Stately does not distribute a self-hostable server binary. Building a custom inspector against XState machine configs (as recommended) remains the better approach." Source: [Stately Inspector Docs](https://stately.ai/docs/inspector)
- **Bun 1.3 fullstack attribution** -- The document implies all fullstack features arrived in Bun 1.3. Actually, HTML imports were introduced in Bun 1.2; Bun 1.3 added HMR and routing. The minimum version for the described server pattern is Bun v1.2.3+. This is a minor accuracy issue but worth noting for version pinning. Source: [Bun Fullstack Docs](https://bun.com/docs/bundler/fullstack)
- **File watcher: document says "macOS: kqueue"** -- Bun documentation does not explicitly confirm kqueue for macOS vs FSEvents. The claim that Bun uses "OS-native filesystem watcher APIs" with "no polling" is directionally correct, but the specific API (kqueue vs FSEvents) is unverified. Minor issue.

### Unverified Claims

- **Elk.js: "Best layered layout" / "gold standard for directed graphs"** -- Subjective claim. Elk.js is well-regarded and the ELK layered algorithm is widely used, but "gold standard" is editorial. The algorithms are mature (academic origin, decade+ of development) but competing layouts exist (Dagre, Graphviz dot). Recommend: Soften to "widely regarded as excellent for layered DAG layout" or similar.
- **"~300 lines of TypeScript" for entire server** -- Could not verify without prototyping. Given the scope described (SSE, WebSocket, file watching, XState graph extraction, SVG rendering, multiple views, API endpoints), 300 lines seems optimistic. The server skeleton might be ~300 lines, but the full Studio with all four views, data extraction, and rendering is likely 1000-2000 lines. Recommend: Qualify as "server skeleton is ~300 lines; full Studio with views is larger."
- **Evil Martians "5 Essential Design Patterns for Dev Tool UIs"** -- The article title and source are cited but the specific patterns extracted were not verified against the original article. Recommend: Verify during implementation if specific patterns are referenced.

### Tooling Pitfalls

- **Elk.js 1.3MB bundle size impact**: For a dev-only tool this is acceptable (as the document notes), but it is 2.6x larger than claimed. If multiple Studio tabs are open, each loads 1.3MB. Consider lazy-loading the Elk.js bundle only on the DAG view, not on every page. The `elk-worker.js` approach (Web Worker + async WASM loading) would mitigate main-thread blocking.
- **Bun fullstack dev server maturity**: The Bun fullstack dev server (HTML imports, routes, HMR) was introduced relatively recently (v1.2-1.3). There are open issues on GitHub (e.g., [#25310](https://github.com/oven-sh/bun/issues/25310) -- console.warn not forwarded). For a dev-only tool this risk is manageable, but expect some rough edges.
- **SSE connection limit (6 per domain in HTTP/1.1)**: The document correctly identifies this pitfall (Pitfall 3). Additional mitigation: Bun.serve() supports HTTP/2 in recent versions, which removes this limit. Verify Bun HTTP/2 support for the Studio port before defaulting to HTTP/1.1.
- **XState v5 `setup()` extraction**: Pitfall 4 correctly flags this. XState v5 machines use `setup().createMachine()` which returns a machine object. The `machine.config` property is accessible but its structure differs from v4. Verify extraction logic against the actual `workflowMachine` definition in `src/state/machine.ts` before committing to the approach.

### Cost Analysis Notes

- **Zero ongoing cost**: Studio is a dev-only tool with no LLM API calls, no external service dependencies, and no paid library licenses. The only cost is development time.
- **Elk.js is free**: MIT licensed, no usage fees.
- **XState is already in the project**: No additional dependency cost.
- **Total new production dependencies: 1 (elkjs)** -- Confirmed. This is an exceptionally minimal footprint for a developer dashboard tool.

### Grooming Recommendations

1. **Fix Elk.js size and technology claims across the document**: Replace "~500KB (WASM)" with "~1.3MB (GWT-compiled)" in the comparison table, tech stack table, and Pitfall 2. This is factual and affects lazy-loading decisions.
2. **Qualify the "~300 lines" server estimate**: The server skeleton may be ~300 lines, but the full Studio with four views, data extraction layer, and SVG rendering is materially larger. Set accurate expectations for grooming estimation.
3. **Build-vs-buy recommendation remains strongly correct**: No existing tool covers this use case. Stately Inspector is not self-hostable as a server. React-based tools (React Flow) would add framework dependency. The zero-framework approach with Bun.serve() + Elk.js + vanilla HTML is the right call. The only dependency is elkjs, which is excellent for scope control.
4. **Consider Bun version pinning**: Document minimum Bun version (v1.2.3+ for fullstack features, v1.2.17+ for ahead-of-time bundling) to avoid confusion during setup.
5. **Add Elk.js lazy-loading to Phase 1 architecture**: Given the 1.3MB bundle size, lazy-load elkjs only on the DAG view route rather than including it in every page. This keeps the Agents, Evals, and State views fast to load.
6. **Validate targeted recompilation feasibility early**: The document rates this LOW confidence and it is a Phase 5 feature. Consider spiking on this in Phase 1 to validate the assumption that per-domain compilers can run independently, since this is the key differentiator for the broken feedback loop problem.
