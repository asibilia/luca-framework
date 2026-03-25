---
title: "Runtime D05: Agent browser view with tree navigation"
area: tooling
created: 2026-03-24
source: docs/runtime-architecture/research/dev-studio.md
depends_on: [D01, D02, D03]
phase: runtime-d
estimated_files: 2
---

## Context

The agent browser lets developers browse all agent definitions, view their configuration, and preview compiled output side-by-side with the TypeScript source. Uses a collapsible tree sidebar grouped by directory (luca/, general/).

## Task

### 1. Create `packages/luca-studio/src/views/agents/agents.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Luca Studio - Agents</title>
    <link rel="stylesheet" href="/styles.css" />
    <style>
      .agents-layout {
        display: flex;
        flex: 1;
        overflow: hidden;
      }
      .agents-sidebar {
        width: 260px;
        min-width: 200px;
        border-right: 1px solid var(--studio-border);
        overflow-y: auto;
        padding: 12px 0;
        background: var(--studio-bg);
      }
      .agents-sidebar-search {
        padding: 0 12px 12px;
      }
      .agents-sidebar-search input {
        width: 100%;
        padding: 6px 10px;
        background: var(--studio-surface);
        border: 1px solid var(--studio-border);
        border-radius: 4px;
        color: var(--studio-text);
        font-family: var(--studio-font);
        font-size: 13px;
        outline: none;
      }
      .agents-sidebar-search input:focus {
        border-color: var(--studio-accent);
      }
      .agents-group-header {
        padding: 6px 12px;
        font-family: var(--studio-font);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: color-mix(in srgb, var(--studio-text) 50%, transparent);
        cursor: pointer;
        user-select: none;
      }
      .agents-group-header:hover {
        color: var(--studio-text);
      }
      .agents-group-header::before {
        content: "\25B6";
        display: inline-block;
        margin-right: 6px;
        font-size: 9px;
        transition: transform 0.15s;
      }
      .agents-group-header.expanded::before {
        transform: rotate(90deg);
      }
      .agents-group-list {
        display: none;
      }
      .agents-group-list.visible {
        display: block;
      }
      .agent-item {
        display: block;
        padding: 5px 12px 5px 28px;
        font-family: var(--studio-font);
        font-size: 13px;
        color: var(--studio-text);
        text-decoration: none;
        cursor: pointer;
        border-left: 2px solid transparent;
      }
      .agent-item:hover {
        background: var(--studio-surface);
      }
      .agent-item.selected {
        background: var(--studio-surface);
        border-left-color: var(--studio-accent);
        color: var(--studio-accent);
      }
      .agent-item .agent-compiled-badge {
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        margin-left: 6px;
        vertical-align: middle;
      }
      .agent-item .agent-compiled-badge.has-output {
        background: var(--studio-success);
      }
      .agent-item .agent-compiled-badge.no-output {
        background: var(--studio-warning);
      }
      .agents-main {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .agents-detail {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
      }
      .agents-detail-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: color-mix(in srgb, var(--studio-text) 50%, transparent);
        font-family: var(--studio-font);
        font-size: 14px;
      }
      .agent-card {
        max-width: 900px;
      }
      .agent-card h2 {
        margin: 0 0 8px;
        font-size: 22px;
        color: var(--studio-accent);
        font-family: var(--studio-font);
      }
      .agent-card .agent-desc {
        color: var(--studio-text);
        font-family: var(--studio-font);
        font-size: 14px;
        margin-bottom: 16px;
        line-height: 1.5;
      }
      .agent-meta-grid {
        display: grid;
        grid-template-columns: 140px 1fr;
        gap: 6px 12px;
        margin-bottom: 20px;
        font-family: var(--studio-font);
        font-size: 13px;
      }
      .agent-meta-label {
        color: color-mix(in srgb, var(--studio-text) 60%, transparent);
      }
      .agent-meta-value {
        color: var(--studio-text);
      }
      .agent-code-panels {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-top: 16px;
      }
      .agent-code-panel {
        background: var(--studio-bg);
        border: 1px solid var(--studio-border);
        border-radius: 6px;
        overflow: hidden;
      }
      .agent-code-panel-header {
        padding: 8px 12px;
        background: var(--studio-surface);
        font-family: var(--studio-font);
        font-size: 12px;
        color: color-mix(in srgb, var(--studio-text) 70%, transparent);
        border-bottom: 1px solid var(--studio-border);
      }
      .agent-code-panel pre {
        padding: 12px;
        margin: 0;
        overflow: auto;
        max-height: 500px;
        font-family: var(--studio-font);
        font-size: 12px;
        line-height: 1.5;
        color: var(--studio-text);
        white-space: pre-wrap;
        word-break: break-word;
      }
    </style>
  </head>
  <body>
    <div class="studio-layout">
      <nav class="studio-nav">
        <div class="studio-logo">Luca Studio</div>
        <a href="/" class="studio-nav-item">Home</a>
        <a href="/dag" class="studio-nav-item">DAG</a>
        <a href="/agents" class="studio-nav-item active">Agents</a>
        <a href="/state" class="studio-nav-item">State</a>
        <a href="/evals" class="studio-nav-item">Evals</a>
      </nav>
      <main class="studio-main">
        <div class="agents-layout">
          <div class="agents-sidebar" id="agents-sidebar">
            <div class="agents-sidebar-search">
              <input
                type="text"
                id="agent-search"
                placeholder="Filter agents..."
              />
            </div>
            <div id="agents-tree"></div>
          </div>
          <div class="agents-main">
            <div class="agents-detail" id="agents-detail">
              <div class="agents-detail-empty">
                Select an agent from the sidebar
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
    <script src="/shared.js"></script>
    <script src="/agent-browser.js"></script>
  </body>
</html>
```

### 2. Create `packages/luca-studio/src/public/agent-browser.js`

```javascript
/**
 * Agent browser client-side logic for Luca Studio.
 *
 * Fetches agent list from /api/agents, builds tree sidebar,
 * handles agent selection and detail display.
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

var allAgents = [];
var currentAgentName = null;

// ---------------------------------------------------------------------------
// Sidebar tree building
// ---------------------------------------------------------------------------

/**
 * Build the sidebar tree from agent list data.
 *
 * @param {Array} agents - Array of agent summary objects from /api/agents
 * @param {string} filterText - Filter string for searching
 */
function buildAgentTree(agents, filterText) {
  var tree = document.getElementById("agents-tree");
  tree.innerHTML = "";

  // Group by group name
  var groups = {};
  for (var i = 0; i < agents.length; i++) {
    var agent = agents[i];
    if (
      filterText &&
      agent.name.toLowerCase().indexOf(filterText.toLowerCase()) === -1
    ) {
      continue;
    }
    var group = agent.group || "ungrouped";
    if (!groups[group]) groups[group] = [];
    groups[group].push(agent);
  }

  var groupNames = Object.keys(groups).sort();
  for (var g = 0; g < groupNames.length; g++) {
    var groupName = groupNames[g];
    var groupAgents = groups[groupName];

    // Group header
    var header = document.createElement("div");
    header.className = "agents-group-header expanded";
    header.textContent = groupName + " (" + groupAgents.length + ")";
    header.addEventListener(
      "click",
      (function (h) {
        return function () {
          h.classList.toggle("expanded");
          var list = h.nextElementSibling;
          if (list) list.classList.toggle("visible");
        };
      })(header),
    );
    tree.appendChild(header);

    // Group list
    var list = document.createElement("div");
    list.className = "agents-group-list visible";

    for (var a = 0; a < groupAgents.length; a++) {
      var agentData = groupAgents[a];
      var item = document.createElement("div");
      item.className = "agent-item";
      if (agentData.name === currentAgentName) item.className += " selected";
      item.setAttribute("data-agent-name", agentData.name);

      item.innerHTML =
        agentData.name +
        '<span class="agent-compiled-badge ' +
        (agentData.has_compiled_output ? "has-output" : "no-output") +
        '"></span>';

      item.addEventListener(
        "click",
        (function (name) {
          return function () {
            selectAgent(name);
          };
        })(agentData.name),
      );

      list.appendChild(item);
    }

    tree.appendChild(list);
  }
}

// ---------------------------------------------------------------------------
// Agent selection and detail display
// ---------------------------------------------------------------------------

/**
 * Select an agent and show its detail in the main panel.
 *
 * @param {string} agentName - Name of the agent to display
 */
async function selectAgent(agentName) {
  currentAgentName = agentName;

  // Update sidebar selection
  var items = document.querySelectorAll(".agent-item");
  for (var i = 0; i < items.length; i++) {
    items[i].classList.remove("selected");
    if (items[i].getAttribute("data-agent-name") === agentName) {
      items[i].classList.add("selected");
    }
  }

  // Fetch agent detail
  var detail = document.getElementById("agents-detail");
  detail.innerHTML = '<div class="agents-detail-empty">Loading...</div>';

  try {
    var response = await fetch("/api/agents/" + encodeURIComponent(agentName));
    var data = await response.json();

    if (data.error) {
      detail.innerHTML =
        '<div class="agents-detail-empty">Agent not found</div>';
      return;
    }

    var html = '<div class="agent-card">';
    html += "<h2>" + escapeHtml(data.name) + "</h2>";
    html +=
      '<div class="agent-desc">' + escapeHtml(data.description) + "</div>";

    // Metadata grid
    html += '<div class="agent-meta-grid">';
    html += '<span class="agent-meta-label">Group</span>';
    html +=
      '<span class="agent-meta-value">' + escapeHtml(data.group) + "</span>";
    html += '<span class="agent-meta-label">File</span>';
    html +=
      '<span class="agent-meta-value">' +
      escapeHtml(data.file_path.split("/src/")[1] || data.file_path) +
      "</span>";
    html += '<span class="agent-meta-label">Compiled</span>';
    html +=
      '<span class="agent-meta-value">' +
      (data.has_compiled_output ? "Yes" : "No") +
      "</span>";

    if (data.tool_strategy) {
      html += '<span class="agent-meta-label">Tool Strategy</span>';
      html +=
        '<span class="agent-meta-value">' +
        escapeHtml(data.tool_strategy) +
        "</span>";
    }

    if (data.model_routing) {
      html += '<span class="agent-meta-label">Model Routing</span>';
      html += '<span class="agent-meta-value">';
      var routingKeys = Object.keys(data.model_routing);
      for (var r = 0; r < routingKeys.length; r++) {
        if (r > 0) html += ", ";
        html += routingKeys[r] + ": " + data.model_routing[routingKeys[r]];
      }
      html += "</span>";
    }
    html += "</div>";

    // Source vs compiled panels
    html += '<div class="agent-code-panels">';

    // Source panel
    html += '<div class="agent-code-panel">';
    html += '<div class="agent-code-panel-header">Source (TypeScript)</div>';
    html +=
      "<pre>" +
      escapeHtml(data.source_content || "Source not available") +
      "</pre>";
    html += "</div>";

    // Compiled panel
    html += '<div class="agent-code-panel">';
    html += '<div class="agent-code-panel-header">Compiled (Markdown)</div>';
    html +=
      "<pre>" +
      escapeHtml(data.compiled_content || "No compiled output yet") +
      "</pre>";
    html += "</div>";

    html += "</div>"; // agent-code-panels
    html += "</div>"; // agent-card

    detail.innerHTML = html;
  } catch (err) {
    detail.innerHTML =
      '<div class="agents-detail-empty">Failed to load: ' +
      err.message +
      "</div>";
  }
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

async function initAgents() {
  try {
    var response = await fetch("/api/agents");
    var data = await response.json();
    allAgents = data.agents || [];
    buildAgentTree(allAgents, "");

    // Search filter
    var searchInput = document.getElementById("agent-search");
    searchInput.addEventListener("input", function () {
      buildAgentTree(allAgents, searchInput.value);
    });

    // Check if URL has agent name (e.g., /agents/lu-router)
    var pathParts = window.location.pathname.split("/");
    if (pathParts.length > 2 && pathParts[2]) {
      selectAgent(decodeURIComponent(pathParts[2]));
    }
  } catch (err) {
    document.getElementById("agents-tree").innerHTML =
      '<div style="padding:12px;color:var(--studio-error);">Failed to load agents: ' +
      err.message +
      "</div>";
  }
}

initAgents();
```

## Verification

```bash
# TypeScript compiles
cd packages/luca-studio && bunx --bun tsc --noEmit

# Start server, navigate to http://localhost:4040/agents
# Expected: Sidebar tree shows agents grouped by luca/ and general/
# Expected: Each agent has a green (compiled) or orange (not compiled) dot
# Expected: Click agent -> detail panel with metadata and source/compiled side-by-side
# Expected: Search filter narrows agent list
# Expected: URL /agents/lu-router auto-selects that agent
```

## Notes

- The search filter is client-side for simplicity -- all agents are loaded in a single API call.
- The source/compiled side-by-side uses a CSS grid with two equal columns. On narrow screens this will overflow -- acceptable for a dev tool.
- The compiled badge (green dot / orange dot) gives instant visual feedback on which agents have been compiled.
- Agent detail uses simple regex-extracted metadata from D03's data layer. For a richer display, the implementing agent could parse the TypeScript AST, but that is not required for MVP.
