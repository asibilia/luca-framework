---
title: "Runtime D11: Layout shell, navigation, and CSS theme"
area: tooling
created: 2026-03-24
source: docs/runtime-architecture/research/dev-studio.md
depends_on: [D01]
phase: runtime-d
estimated_files: 2
---

## Context

The shared layout shell provides consistent navigation, styling, and structure across all Studio views. Uses Catppuccin-inspired dark theme with CSS custom properties. No CSS framework -- all vanilla CSS. Every view page includes this stylesheet and navigation structure.

## Task

### 1. Create `packages/luca-studio/src/public/styles.css`

The global stylesheet with CSS custom properties for theming, layout shell styles, and shared component styles.

```css
/**
 * Luca Studio — Global styles
 *
 * Catppuccin-inspired dark theme using CSS custom properties.
 * No CSS framework. All views include this stylesheet.
 *
 * Color palette based on Catppuccin Mocha:
 * https://github.com/catppuccin/catppuccin
 */

/* ---------------------------------------------------------------------------
   CSS Custom Properties (Theme)
   --------------------------------------------------------------------------- */

:root {
  --studio-bg: #1e1e2e;
  --studio-surface: #313244;
  --studio-text: #cdd6f4;
  --studio-text-muted: #6c7086;
  --studio-accent: #89b4fa;
  --studio-success: #a6e3a1;
  --studio-error: #f38ba8;
  --studio-warning: #fab387;
  --studio-border: #45475a;
  --studio-font:
    "JetBrains Mono", "Fira Code", "Cascadia Code", "SF Mono", monospace;
  --studio-font-sans:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --studio-nav-width: 56px;
  --studio-transition: 0.15s ease;
}

/* ---------------------------------------------------------------------------
   Reset & Base
   --------------------------------------------------------------------------- */

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  height: 100%;
  background: var(--studio-bg);
  color: var(--studio-text);
  font-family: var(--studio-font);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

a {
  color: var(--studio-accent);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

/* Scrollbar styling (WebKit) */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--studio-bg);
}

::-webkit-scrollbar-thumb {
  background: var(--studio-border);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--studio-text-muted);
}

/* ---------------------------------------------------------------------------
   Layout Shell
   --------------------------------------------------------------------------- */

.studio-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* ---------------------------------------------------------------------------
   Left Navigation Sidebar
   --------------------------------------------------------------------------- */

.studio-nav {
  width: var(--studio-nav-width);
  min-width: var(--studio-nav-width);
  background: color-mix(in srgb, var(--studio-bg) 85%, black);
  border-right: 1px solid var(--studio-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  gap: 2px;
  overflow: hidden;
}

.studio-logo {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  font-family: var(--studio-font);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--studio-accent);
  padding: 12px 0 16px;
  user-select: none;
}

.studio-nav-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 36px;
  border-radius: 6px;
  font-family: var(--studio-font);
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--studio-text-muted);
  text-decoration: none;
  transition:
    background var(--studio-transition),
    color var(--studio-transition);
}

.studio-nav-item:hover {
  background: var(--studio-surface);
  color: var(--studio-text);
  text-decoration: none;
}

.studio-nav-item.active {
  background: var(--studio-surface);
  color: var(--studio-accent);
}

/* ---------------------------------------------------------------------------
   Main Content Area
   --------------------------------------------------------------------------- */

.studio-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--studio-bg);
}

/* ---------------------------------------------------------------------------
   Shared Component Styles
   --------------------------------------------------------------------------- */

/* Badges */
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-family: var(--studio-font);
  font-size: 11px;
  font-weight: 600;
}

.badge-accent {
  background: color-mix(in srgb, var(--studio-accent) 20%, transparent);
  color: var(--studio-accent);
}

.badge-success {
  background: color-mix(in srgb, var(--studio-success) 20%, transparent);
  color: var(--studio-success);
}

.badge-error {
  background: color-mix(in srgb, var(--studio-error) 20%, transparent);
  color: var(--studio-error);
}

.badge-warning {
  background: color-mix(in srgb, var(--studio-warning) 20%, transparent);
  color: var(--studio-warning);
}

/* Cards */
.card {
  background: var(--studio-surface);
  border: 1px solid var(--studio-border);
  border-radius: 8px;
  padding: 16px;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid var(--studio-border);
  background: var(--studio-surface);
  color: var(--studio-text);
  font-family: var(--studio-font);
  font-size: 12px;
  cursor: pointer;
  transition:
    background var(--studio-transition),
    border-color var(--studio-transition);
}

.btn:hover {
  background: color-mix(
    in srgb,
    var(--studio-surface) 80%,
    var(--studio-accent)
  );
  border-color: var(--studio-accent);
}

/* Code blocks */
.code-block {
  background: var(--studio-bg);
  border: 1px solid var(--studio-border);
  border-radius: 6px;
  padding: 12px;
  font-family: var(--studio-font);
  font-size: 12px;
  line-height: 1.6;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Empty states */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--studio-text-muted);
  font-family: var(--studio-font);
  text-align: center;
}

.empty-state-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
}

.empty-state-desc {
  font-size: 13px;
  max-width: 400px;
}
```

### 2. Create `packages/luca-studio/src/views/index.html`

The homepage / navigation shell that links to all views.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Luca Studio</title>
    <link rel="stylesheet" href="/styles.css" />
    <style>
      .home-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px;
      }
      .home-title {
        font-family: var(--studio-font);
        font-size: 32px;
        font-weight: 700;
        color: var(--studio-accent);
        margin-bottom: 8px;
      }
      .home-subtitle {
        font-family: var(--studio-font);
        font-size: 14px;
        color: var(--studio-text-muted);
        margin-bottom: 40px;
      }
      .home-grid {
        display: grid;
        grid-template-columns: repeat(2, 280px);
        gap: 16px;
        max-width: 600px;
      }
      .home-card {
        display: flex;
        flex-direction: column;
        padding: 20px;
        background: var(--studio-surface);
        border: 1px solid var(--studio-border);
        border-radius: 8px;
        text-decoration: none;
        color: var(--studio-text);
        transition:
          border-color var(--studio-transition),
          transform var(--studio-transition);
      }
      .home-card:hover {
        border-color: var(--studio-accent);
        transform: translateY(-2px);
        text-decoration: none;
      }
      .home-card-title {
        font-family: var(--studio-font);
        font-size: 16px;
        font-weight: 600;
        color: var(--studio-accent);
        margin-bottom: 8px;
      }
      .home-card-desc {
        font-family: var(--studio-font);
        font-size: 13px;
        color: var(--studio-text-muted);
        line-height: 1.5;
      }
      .home-footer {
        margin-top: 40px;
        font-family: var(--studio-font);
        font-size: 12px;
        color: var(--studio-text-muted);
      }
      .home-footer a {
        color: var(--studio-accent);
      }
    </style>
  </head>
  <body>
    <div class="studio-layout">
      <nav class="studio-nav">
        <div class="studio-logo">Luca Studio</div>
        <a href="/" class="studio-nav-item active">Home</a>
        <a href="/dag" class="studio-nav-item">DAG</a>
        <a href="/agents" class="studio-nav-item">Agents</a>
        <a href="/state" class="studio-nav-item">State</a>
        <a href="/evals" class="studio-nav-item">Evals</a>
      </nav>
      <main class="studio-main">
        <div class="home-content">
          <h1 class="home-title">Luca Studio</h1>
          <p class="home-subtitle">
            Development visualization tooling for the Luca framework
          </p>
          <div class="home-grid">
            <a href="/dag" class="home-card">
              <span class="home-card-title">Workflow DAG</span>
              <span class="home-card-desc"
                >Interactive visualization of the Luca workflow pipeline as a
                directed graph. Click nodes for state details.</span
              >
            </a>
            <a href="/agents" class="home-card">
              <span class="home-card-title">Agent Browser</span>
              <span class="home-card-desc"
                >Browse all agent definitions. View source code, compiled
                output, and model routing configuration.</span
              >
            </a>
            <a href="/state" class="home-card">
              <span class="home-card-title">State Inspector</span>
              <span class="home-card-desc"
                >Live state machine visualization. Inspect workflow context,
                view event log, and watch transitions.</span
              >
            </a>
            <a href="/evals" class="home-card">
              <span class="home-card-title">Eval Results</span>
              <span class="home-card-desc"
                >View harness check results. Drill into errors with file paths
                and line numbers.</span
              >
            </a>
          </div>
          <div class="home-footer">
            <p>
              Local dev tool. No production deployment.
              <a href="https://github.com/alecsibilia/luca-framework"
                >Luca Framework</a
              >
            </p>
          </div>
        </div>
      </main>
    </div>
    <script src="/shared.js"></script>
  </body>
</html>
```

## Verification

```bash
# CSS file exists and is valid
ls packages/luca-studio/src/public/styles.css

# Homepage exists
ls packages/luca-studio/src/views/index.html

# Start server, navigate to http://localhost:4040/
# Expected: Dark theme with Catppuccin colors
# Expected: Left sidebar navigation with Home, DAG, Agents, State, Evals
# Expected: Homepage shows 4 cards linking to each view
# Expected: Active nav item is highlighted blue
# Expected: Cards have hover effect (border color change + lift)
# Expected: Custom scrollbars (thin, dark themed)

# Navigate to each view
# Expected: Consistent navigation sidebar across all pages
# Expected: Active nav item matches current page
# Expected: All text uses JetBrains Mono / monospace font
# Expected: Dark background (#1e1e2e), surface (#313244), blue accent (#89b4fa)
```

## Notes

- The navigation sidebar uses a narrow (56px) vertical layout with abbreviated text. This maximizes the main content area. The "Luca Studio" logo text is rotated vertically.
- CSS custom properties enable future theme switching (e.g., light mode) without touching any component styles.
- The `color-mix()` CSS function is used for transparency effects (hover states, muted text). It is supported in all modern browsers.
- The stylesheet includes shared component classes (`.badge`, `.card`, `.btn`, `.code-block`, `.empty-state`) that views can use without duplicating styles.
- The homepage is intentionally simple: a grid of 4 cards linking to each view. No complex dashboard -- each view has its own dedicated page.
- WebKit scrollbar styling is included for Chrome/Safari/Edge. Firefox uses system scrollbar styling which is acceptable.
