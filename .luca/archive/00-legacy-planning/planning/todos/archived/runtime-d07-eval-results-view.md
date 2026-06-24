---
title: "Runtime D07: Eval results view with drill-down"
area: tooling
created: 2026-03-24
source: docs/runtime-architecture/research/dev-studio.md
depends_on: [D01, D02, D03]
phase: runtime-d
estimated_files: 2
---

## Context

The eval results view displays harness output as a summary bar and results table with drill-down to individual error details. Auto-refreshes when new eval results appear via SSE `eval-complete` event.

## Task

### 1. Create `packages/luca-studio/src/views/evals/evals.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Luca Studio - Eval Results</title>
    <link rel="stylesheet" href="/styles.css" />
    <style>
      .evals-layout {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .evals-summary {
        display: flex;
        gap: 16px;
        padding: 16px 20px;
        border-bottom: 1px solid var(--studio-border);
        flex-shrink: 0;
        align-items: center;
      }
      .evals-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 8px 20px;
        background: var(--studio-surface);
        border-radius: 6px;
        font-family: var(--studio-font);
      }
      .evals-stat-value {
        font-size: 28px;
        font-weight: 700;
        line-height: 1;
      }
      .evals-stat-label {
        font-size: 11px;
        color: color-mix(in srgb, var(--studio-text) 60%, transparent);
        margin-top: 4px;
      }
      .evals-stat-value.pass {
        color: var(--studio-success);
      }
      .evals-stat-value.fail {
        color: var(--studio-error);
      }
      .evals-stat-value.skip {
        color: var(--studio-warning);
      }
      .evals-stat-value.total {
        color: var(--studio-accent);
      }
      .evals-filter {
        margin-left: auto;
        display: flex;
        gap: 6px;
        align-items: center;
        font-family: var(--studio-font);
        font-size: 13px;
      }
      .evals-filter select {
        padding: 4px 8px;
        background: var(--studio-surface);
        border: 1px solid var(--studio-border);
        border-radius: 4px;
        color: var(--studio-text);
        font-family: var(--studio-font);
        font-size: 12px;
      }
      .evals-content {
        flex: 1;
        display: flex;
        overflow: hidden;
      }
      .evals-table-wrapper {
        flex: 1;
        overflow-y: auto;
        padding: 0 20px 20px;
      }
      .evals-table {
        width: 100%;
        border-collapse: collapse;
        font-family: var(--studio-font);
        font-size: 13px;
      }
      .evals-table th {
        text-align: left;
        padding: 10px 12px;
        border-bottom: 2px solid var(--studio-border);
        color: color-mix(in srgb, var(--studio-text) 60%, transparent);
        font-weight: 500;
        position: sticky;
        top: 0;
        background: var(--studio-bg);
      }
      .evals-table td {
        padding: 8px 12px;
        border-bottom: 1px solid var(--studio-border);
        color: var(--studio-text);
      }
      .evals-table tr {
        cursor: pointer;
      }
      .evals-table tr:hover td {
        background: var(--studio-surface);
      }
      .evals-table tr.selected td {
        background: color-mix(
          in srgb,
          var(--studio-accent) 10%,
          var(--studio-bg)
        );
      }
      .status-badge {
        display: inline-block;
        padding: 2px 10px;
        border-radius: 10px;
        font-size: 12px;
        font-weight: 600;
      }
      .status-badge.pass {
        background: color-mix(in srgb, var(--studio-success) 20%, transparent);
        color: var(--studio-success);
      }
      .status-badge.fail {
        background: color-mix(in srgb, var(--studio-error) 20%, transparent);
        color: var(--studio-error);
      }
      .status-badge.skip {
        background: color-mix(in srgb, var(--studio-warning) 20%, transparent);
        color: var(--studio-warning);
      }
      .evals-detail {
        width: 400px;
        border-left: 1px solid var(--studio-border);
        overflow-y: auto;
        padding: 16px 20px;
        display: none;
        flex-shrink: 0;
      }
      .evals-detail.visible {
        display: block;
      }
      .evals-detail h3 {
        margin: 0 0 12px;
        font-size: 16px;
        color: var(--studio-accent);
        font-family: var(--studio-font);
      }
      .error-item {
        padding: 8px;
        margin-bottom: 8px;
        background: var(--studio-surface);
        border-radius: 4px;
        border-left: 3px solid var(--studio-error);
        font-family: var(--studio-font);
        font-size: 12px;
      }
      .error-item .error-file {
        color: var(--studio-accent);
        margin-bottom: 4px;
      }
      .error-item .error-message {
        color: var(--studio-text);
        line-height: 1.4;
      }
      .evals-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 200px;
        color: color-mix(in srgb, var(--studio-text) 50%, transparent);
        font-family: var(--studio-font);
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
        <a href="/state" class="studio-nav-item">State</a>
        <a href="/evals" class="studio-nav-item active">Evals</a>
      </nav>
      <main class="studio-main">
        <div class="evals-layout">
          <div class="evals-summary" id="evals-summary">
            <div class="evals-stat">
              <span class="evals-stat-value total" id="stat-total">-</span
              ><span class="evals-stat-label">Total</span>
            </div>
            <div class="evals-stat">
              <span class="evals-stat-value pass" id="stat-passed">-</span
              ><span class="evals-stat-label">Passed</span>
            </div>
            <div class="evals-stat">
              <span class="evals-stat-value fail" id="stat-failed">-</span
              ><span class="evals-stat-label">Failed</span>
            </div>
            <div class="evals-stat">
              <span class="evals-stat-value skip" id="stat-skipped">-</span
              ><span class="evals-stat-label">Skipped</span>
            </div>
            <div class="evals-filter">
              <label>Filter:</label>
              <select id="evals-filter-select">
                <option value="all">All</option>
                <option value="pass">Pass only</option>
                <option value="fail">Fail only</option>
                <option value="skip">Skip only</option>
              </select>
            </div>
          </div>
          <div class="evals-content">
            <div class="evals-table-wrapper">
              <table class="evals-table">
                <thead>
                  <tr>
                    <th>Check Type</th>
                    <th>Status</th>
                    <th>Duration</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody id="evals-body"></tbody>
              </table>
            </div>
            <div class="evals-detail" id="evals-detail"></div>
          </div>
        </div>
      </main>
    </div>
    <script src="/shared.js"></script>
    <script src="/eval-viewer.js"></script>
  </body>
</html>
```

### 2. Create `packages/luca-studio/src/public/eval-viewer.js`

```javascript
/**
 * Eval results viewer client-side logic for Luca Studio.
 *
 * Fetches eval results from /api/evals, renders summary stats and results table,
 * handles row click for error detail drill-down, and listens for SSE eval-complete events.
 */

var allResults = [];
var currentFilter = "all";

/**
 * Load eval results from API and render.
 */
async function loadEvals() {
  try {
    var response = await fetch("/api/evals");
    var data = await response.json();

    // Update summary stats
    document.getElementById("stat-total").textContent = data.total_checks;
    document.getElementById("stat-passed").textContent = data.passed;
    document.getElementById("stat-failed").textContent = data.failed;
    document.getElementById("stat-skipped").textContent = data.skipped;

    allResults = data.results || [];
    renderResults();
  } catch (err) {
    document.getElementById("evals-body").innerHTML =
      '<tr><td colspan="4"><div class="evals-empty">Failed to load: ' +
      err.message +
      "</div></td></tr>";
  }
}

/**
 * Render the results table with current filter applied.
 */
function renderResults() {
  var tbody = document.getElementById("evals-body");
  var filtered = allResults;

  if (currentFilter !== "all") {
    filtered = allResults.filter(function (r) {
      return r.status === currentFilter;
    });
  }

  if (filtered.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="4"><div class="evals-empty">No results</div></td></tr>';
    return;
  }

  var html = "";
  for (var i = 0; i < filtered.length; i++) {
    var r = filtered[i];
    var durationStr =
      r.duration_ms > 0 ? (r.duration_ms / 1000).toFixed(1) + "s" : "--";
    html += '<tr data-idx="' + allResults.indexOf(r) + '">';
    html += "<td>" + escapeHtml(r.check_type) + "</td>";
    html +=
      '<td><span class="status-badge ' +
      r.status +
      '">' +
      r.status.toUpperCase() +
      "</span></td>";
    html += "<td>" + durationStr + "</td>";
    html += "<td>" + r.error_count + "</td>";
    html += "</tr>";
  }
  tbody.innerHTML = html;

  // Attach click handlers
  var rows = tbody.querySelectorAll("tr");
  for (var j = 0; j < rows.length; j++) {
    rows[j].addEventListener("click", function () {
      var idx = parseInt(this.getAttribute("data-idx"), 10);
      showResultDetail(idx);
      // Highlight selected row
      var allRows = document.querySelectorAll(".evals-table tbody tr");
      for (var k = 0; k < allRows.length; k++)
        allRows[k].classList.remove("selected");
      this.classList.add("selected");
    });
  }
}

/**
 * Show error detail for a selected result row.
 *
 * @param {number} idx - Index into allResults
 */
function showResultDetail(idx) {
  var result = allResults[idx];
  if (!result) return;

  var panel = document.getElementById("evals-detail");
  var html =
    "<h3>" +
    escapeHtml(result.check_type) +
    " - " +
    result.status.toUpperCase() +
    "</h3>";

  if (result.errors && result.errors.length > 0) {
    for (var i = 0; i < result.errors.length; i++) {
      var err = result.errors[i];
      html += '<div class="error-item">';
      if (err.file_path) {
        html += '<div class="error-file">' + escapeHtml(err.file_path);
        if (err.line !== null && err.line !== undefined) html += ":" + err.line;
        html += "</div>";
      }
      html +=
        '<div class="error-message">' + escapeHtml(err.message) + "</div>";
      html += "</div>";
    }
  } else {
    html +=
      '<div class="evals-empty" style="height:auto;padding:20px;">No errors</div>';
  }

  panel.innerHTML = html;
  panel.classList.add("visible");
}

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Filter change
document
  .getElementById("evals-filter-select")
  .addEventListener("change", function () {
    currentFilter = this.value;
    renderResults();
    document.getElementById("evals-detail").classList.remove("visible");
  });

// Initialize
loadEvals();
```

## Verification

```bash
# TypeScript compiles
cd packages/luca-studio && bunx --bun tsc --noEmit

# Start server, navigate to http://localhost:4040/evals
# Expected: Summary bar shows total/passed/failed/skipped counts
# Expected: Results table shows check results with status badges
# Expected: Click row -> detail panel shows error list with file paths
# Expected: Filter dropdown narrows results
```

## Notes

- If no harness result files exist in `.planning/`, the view shows zeros and an empty table. This is expected before any harness runs.
- The SSE auto-refresh (listening for `eval-complete` events) requires D09 to be complete. Until then, manual page reload works.
- Error detail shows file paths and line numbers when available, making it easy to locate issues.
