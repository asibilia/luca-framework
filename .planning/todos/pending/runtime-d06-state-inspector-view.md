---
title: "Runtime D06: State machine inspector view"
area: tooling
created: 2026-03-24
source: docs/runtime-architecture/research/dev-studio.md
depends_on: [D01, D02, D03]
phase: runtime-d
estimated_files: 2
---

## Context

The state machine inspector shows live workflow state: current state badge, context inspector (collapsible JSON tree), and event log table. Updates live via WebSocket. Reuses Elk.js DAG rendering for a mini state diagram at the top.

## Task

### 1. Create `packages/luca-studio/src/views/state/state.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Luca Studio - State Inspector</title>
  <link rel="stylesheet" href="/styles.css">
  <style>
    .state-layout {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .state-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--studio-border);
      display: flex;
      align-items: center;
      gap: 16px;
      flex-shrink: 0;
    }
    .state-badge {
      display: inline-block;
      padding: 4px 14px;
      border-radius: 12px;
      font-family: var(--studio-font);
      font-size: 14px;
      font-weight: 600;
      background: var(--studio-accent);
      color: var(--studio-bg);
    }
    .state-ws-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--studio-error);
    }
    .state-ws-indicator.connected {
      background: var(--studio-success);
    }
    .state-ws-label {
      font-family: var(--studio-font);
      font-size: 12px;
      color: color-mix(in srgb, var(--studio-text) 60%, transparent);
    }
    .state-panels {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
      overflow: hidden;
    }
    .state-context-panel {
      border-right: 1px solid var(--studio-border);
      overflow-y: auto;
      padding: 16px 20px;
    }
    .state-events-panel {
      overflow-y: auto;
      padding: 16px 20px;
    }
    .state-panel-title {
      font-family: var(--studio-font);
      font-size: 14px;
      font-weight: 600;
      color: var(--studio-text);
      margin: 0 0 12px;
    }
    /* JSON tree viewer */
    .json-tree {
      font-family: var(--studio-font);
      font-size: 12px;
      line-height: 1.6;
      color: var(--studio-text);
    }
    .json-key {
      color: var(--studio-accent);
    }
    .json-string {
      color: var(--studio-success);
    }
    .json-number {
      color: var(--studio-warning);
    }
    .json-boolean {
      color: #cba6f7;
    }
    .json-null {
      color: color-mix(in srgb, var(--studio-text) 40%, transparent);
    }
    .json-toggle {
      cursor: pointer;
      user-select: none;
    }
    .json-toggle::before {
      content: "\25B6";
      display: inline-block;
      margin-right: 4px;
      font-size: 9px;
      transition: transform 0.15s;
    }
    .json-toggle.open::before {
      transform: rotate(90deg);
    }
    .json-children {
      display: none;
      padding-left: 16px;
    }
    .json-children.visible {
      display: block;
    }
    /* Event log table */
    .events-table {
      width: 100%;
      border-collapse: collapse;
      font-family: var(--studio-font);
      font-size: 12px;
    }
    .events-table th {
      text-align: left;
      padding: 6px 8px;
      border-bottom: 2px solid var(--studio-border);
      color: color-mix(in srgb, var(--studio-text) 60%, transparent);
      font-weight: 500;
      position: sticky;
      top: 0;
      background: var(--studio-bg);
    }
    .events-table td {
      padding: 5px 8px;
      border-bottom: 1px solid var(--studio-border);
      color: var(--studio-text);
      vertical-align: top;
    }
    .events-table tr:hover td {
      background: var(--studio-surface);
    }
    .event-type-badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 11px;
      background: var(--studio-surface);
      border: 1px solid var(--studio-border);
    }
  </style>
</head>
<body>
  <div class="studio-layout">
    <nav class="studio-nav">
      <div class="studio-logo">Luca Studio</div>
      <a href="/" class="studio-nav-item">Home</a>
      <a href="/dag" class="studio-nav-item">DAG</a>
      <a href="/agents" class="studio-nav-item">Agents</a>
      <a href="/state" class="studio-nav-item active">State</a>
      <a href="/evals" class="studio-nav-item">Evals</a>
    </nav>
    <main class="studio-main">
      <div class="state-layout">
        <div class="state-header">
          <span>Current State:</span>
          <span class="state-badge" id="state-badge">loading...</span>
          <div class="state-ws-indicator" id="ws-indicator"></div>
          <span class="state-ws-label" id="ws-label">disconnected</span>
        </div>
        <div class="state-panels">
          <div class="state-context-panel">
            <h3 class="state-panel-title">Workflow Context</h3>
            <div class="json-tree" id="context-tree">Loading...</div>
          </div>
          <div class="state-events-panel">
            <h3 class="state-panel-title">Event Log</h3>
            <table class="events-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                  <th>From</th>
                  <th>To</th>
                </tr>
              </thead>
              <tbody id="events-body"></tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  </div>
  <script src="/shared.js"></script>
  <script src="/state-inspector.js"></script>
</body>
</html>
```

### 2. Create `packages/luca-studio/src/public/state-inspector.js`

```javascript
/**
 * State machine inspector client-side logic for Luca Studio.
 *
 * Fetches state snapshot from /api/state, renders context as collapsible JSON tree,
 * displays event log, and maintains WebSocket connection for live updates.
 */

// ---------------------------------------------------------------------------
// JSON tree renderer
// ---------------------------------------------------------------------------

/**
 * Render a JavaScript value as a collapsible JSON tree.
 *
 * @param {*} value - The value to render
 * @param {string} key - The property key (empty for root)
 * @param {number} depth - Current nesting depth
 * @returns {string} HTML string for the JSON tree node
 */
function renderJsonTree(value, key, depth) {
  var keyHtml = key ? '<span class="json-key">' + escapeHtml(key) + "</span>: " : "";

  if (value === null || value === undefined) {
    return "<div>" + keyHtml + '<span class="json-null">null</span></div>';
  }
  if (typeof value === "string") {
    return "<div>" + keyHtml + '<span class="json-string">"' + escapeHtml(value) + '"</span></div>';
  }
  if (typeof value === "number") {
    return "<div>" + keyHtml + '<span class="json-number">' + value + "</span></div>";
  }
  if (typeof value === "boolean") {
    return "<div>" + keyHtml + '<span class="json-boolean">' + value + "</span></div>";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "<div>" + keyHtml + '<span class="json-null">[]</span></div>';
    }
    var arrayId = "json-" + depth + "-" + (key || "root") + "-" + Math.random().toString(36).slice(2, 6);
    var html = '<div><span class="json-toggle open" onclick="toggleJsonNode(this)">' +
      keyHtml + "Array(" + value.length + ")</span>";
    html += '<div class="json-children visible" id="' + arrayId + '">';
    for (var i = 0; i < value.length && i < 100; i++) {
      html += renderJsonTree(value[i], String(i), depth + 1);
    }
    if (value.length > 100) {
      html += '<div class="json-null">... ' + (value.length - 100) + " more items</div>";
    }
    html += "</div></div>";
    return html;
  }

  if (typeof value === "object") {
    var keys = Object.keys(value);
    if (keys.length === 0) {
      return "<div>" + keyHtml + '<span class="json-null">{}</span></div>';
    }
    var objId = "json-" + depth + "-" + (key || "root") + "-" + Math.random().toString(36).slice(2, 6);
    var isOpen = depth < 2;
    var objHtml = '<div><span class="json-toggle' + (isOpen ? " open" : "") +
      '" onclick="toggleJsonNode(this)">' + keyHtml + "Object {" + keys.length + "}</span>";
    objHtml += '<div class="json-children' + (isOpen ? " visible" : "") + '" id="' + objId + '">';
    for (var k = 0; k < keys.length; k++) {
      objHtml += renderJsonTree(value[keys[k]], keys[k], depth + 1);
    }
    objHtml += "</div></div>";
    return objHtml;
  }

  return "<div>" + keyHtml + '<span class="json-string">' + escapeHtml(String(value)) + "</span></div>";
}

/**
 * Toggle a JSON tree node's children visibility.
 */
function toggleJsonNode(el) {
  el.classList.toggle("open");
  var children = el.nextElementSibling;
  if (children) children.classList.toggle("visible");
}
// Expose to inline onclick handlers
window.toggleJsonNode = toggleJsonNode;

// ---------------------------------------------------------------------------
// Event log rendering
// ---------------------------------------------------------------------------

/**
 * Render event log entries into the events table.
 *
 * @param {Array} events - Array of event log entries
 */
function renderEventLog(events) {
  var tbody = document.getElementById("events-body");
  var html = "";

  // Render in reverse chronological order
  for (var i = events.length - 1; i >= 0; i--) {
    var evt = events[i];
    var time = evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : "--";
    html += "<tr>";
    html += "<td>" + escapeHtml(time) + "</td>";
    html += '<td><span class="event-type-badge">' + escapeHtml(evt.event_type) + "</span></td>";
    html += "<td>" + escapeHtml(evt.from_state || "--") + "</td>";
    html += "<td>" + escapeHtml(evt.to_state || "--") + "</td>";
    html += "</tr>";
  }

  if (events.length === 0) {
    html = '<tr><td colspan="4" style="text-align:center;color:var(--studio-text);opacity:0.5;">No events recorded</td></tr>';
  }

  tbody.innerHTML = html;
}

// ---------------------------------------------------------------------------
// WebSocket connection
// ---------------------------------------------------------------------------

var ws = null;
var wsReconnectTimer = null;

/**
 * Establish WebSocket connection for live state updates.
 */
function connectWebSocket() {
  var protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(protocol + "//" + location.host + "/ws/state");

  ws.onopen = function () {
    document.getElementById("ws-indicator").classList.add("connected");
    document.getElementById("ws-label").textContent = "connected";
  };

  ws.onmessage = function (evt) {
    try {
      var data = JSON.parse(evt.data);
      if (data.type === "state-change" || data.state) {
        // Refresh state display
        loadState();
      }
    } catch (e) {
      // Ignore malformed messages
    }
  };

  ws.onclose = function () {
    document.getElementById("ws-indicator").classList.remove("connected");
    document.getElementById("ws-label").textContent = "disconnected";
    // Reconnect after 3 seconds
    wsReconnectTimer = setTimeout(connectWebSocket, 3000);
  };

  ws.onerror = function () {
    ws.close();
  };
}

// ---------------------------------------------------------------------------
// State loading
// ---------------------------------------------------------------------------

/**
 * Load state data from API and update the UI.
 */
async function loadState() {
  try {
    var response = await fetch("/api/state");
    var data = await response.json();

    // Update state badge
    document.getElementById("state-badge").textContent = data.current_state || "unknown";

    // Render context tree
    document.getElementById("context-tree").innerHTML = renderJsonTree(data.context, "", 0);

    // Render event log
    renderEventLog(data.event_log || []);
  } catch (err) {
    document.getElementById("state-badge").textContent = "error";
    document.getElementById("context-tree").innerHTML =
      '<span class="json-null">Failed to load state: ' + err.message + "</span>";
  }
}

/**
 * HTML-escape a string.
 */
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

loadState();
connectWebSocket();
```

## Verification

```bash
# TypeScript compiles
cd packages/luca-studio && bunx --bun tsc --noEmit

# Start server, navigate to http://localhost:4040/state
# Expected: Current state badge shows state from .planning/state.json
# Expected: Context panel shows collapsible JSON tree
# Expected: Event log table shows entries from session-ledger.jsonl
# Expected: WebSocket indicator shows green when connected
# Expected: JSON tree nodes are expandable/collapsible
```

## Notes

- The JSON tree renderer auto-expands the first 2 levels for immediate visibility, with deeper levels collapsed.
- Arrays are capped at 100 items to prevent DOM explosion on large context objects.
- WebSocket auto-reconnects after 3 seconds on disconnect. This handles server restarts during development.
- The event log displays in reverse chronological order (newest first).
- The WebSocket handler in D02's server.ts sends a stub message on connect. D09 will wire it to real state machine updates.
