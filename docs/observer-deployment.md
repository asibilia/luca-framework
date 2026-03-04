# Luca Observer Deployment Guide

Comprehensive guide for deploying and running the luca-observer dashboard -- a real-time observability interface for the Luca workflow framework.

## Overview

Luca Observer is a Next.js dashboard that reads the `.planning/` directory of any Luca-managed project and displays workflow state, event streams, iteration convergence, harness results, tribunal debates, memory files, and more. It is read-only: it never writes to `.planning/` (except for the Notes feature, which creates note files).

The observer provides:

- Real-time Server-Sent Events (SSE) feed of workflow events
- State machine visualization with transition logs
- Iteration convergence charts and budget gauges
- Harness verification results with parsed error details
- WSJF session planning tables with quality zone indicators
- Memory file viewer (BRAIN.md, MEMORY.md, WORKING.md)
- Tribunal debate findings, disagreements, and rebuttals
- Agent activity scorecards and invocation logs
- Developer notes queue with priority support

## Prerequisites

1. **Bun runtime** (v1.0+): The observer uses Bun as its runtime and package manager. Install from [bun.sh](https://bun.sh) if not already available.

2. **luca-framework monorepo**: The observer lives at `packages/luca-observer/` inside the luca-framework monorepo.

3. **A `.planning/` directory**: The target project must have a `.planning/` directory (created automatically by Luca workflows). The observer gracefully handles missing files, so a bare `.planning/` directory is sufficient to start.

## Quick Start

```bash
# From the luca-framework monorepo root
cd packages/luca-observer
bun install
bun run dev
```

Open http://localhost:3456 in your browser.

To observe a different project directory:

```bash
luca-observer --dir /path/to/your-project --open
```

## Development Mode

Development mode starts a Next.js dev server with hot module replacement:

```bash
cd packages/luca-observer
bun run dev
```

This runs `next dev --port 3456`. The server watches for file changes in the observer source and reloads automatically.

### Tailwind CSS Watch Mode

If you are editing styles, run the CSS watcher in a separate terminal:

```bash
bun run css:watch
```

This runs `@tailwindcss/cli` in watch mode, rebuilding `app/globals.css` from `tailwind/base.css` on every change.

### One-Time CSS Build

To build CSS without watching:

```bash
bun run css:dev    # Development (unminified)
bun run css:build  # Production (minified)
```

## Production Build

Build the observer for production deployment:

```bash
cd packages/luca-observer

# Build CSS first (minified)
bun run css:build

# Build Next.js production bundle
bun run build

# Start the production server
bun run start
```

The production server starts on port 3456 by default.

## CLI Reference

The observer includes a CLI binary at `packages/luca-observer/bin/luca-observer.js`:

```
luca-observer [options]
```

### Options

| Flag            | Short | Default           | Description                     |
| --------------- | ----- | ----------------- | ------------------------------- |
| `--port <port>` | `-p`  | `3456`            | Port to listen on               |
| `--open`        | `-o`  | `false`           | Auto-open browser after startup |
| `--dir <path>`  | `-d`  | Current directory | Project directory to observe    |
| `--help`        | `-h`  | --                | Show help message               |

### Examples

```bash
# Start on default port, observing current directory
luca-observer

# Custom port with browser auto-open
luca-observer --port 4000 --open

# Observe a different project
luca-observer -d /path/to/my-project -p 8080

# Show help
luca-observer --help
```

## Environment Variables

| Variable             | Default                   | Description                                              |
| -------------------- | ------------------------- | -------------------------------------------------------- |
| `LUCA_PROJECT_DIR`   | Current working directory | Root of the project whose `.planning/` directory to read |
| `LUCA_OBSERVER_PORT` | `3456`                    | Default port (overridden by `--port` flag)               |
| `LUCA_OBSERVER_DIR`  | Current working directory | Default project directory (overridden by `--dir` flag)   |

CLI flags take precedence over environment variables. Environment variables take precedence over built-in defaults.

## Project Directory Requirements

The observer reads the following files from the `.planning/` directory. All files are optional -- the dashboard shows empty states for missing data.

| File                             | Purpose                                             | Dashboard Page      |
| -------------------------------- | --------------------------------------------------- | ------------------- |
| `.planning/STATE.md`             | Workflow state snapshot (phase, complexity, branch) | Workflow, Dashboard |
| `.planning/state.json`           | Typed state machine state                           | Workflow            |
| `.planning/session-ledger.jsonl` | Event log with state transitions                    | Dashboard, Workflow |
| `.planning/harness-result.json`  | Latest harness verification result                  | Harness             |
| `.planning/checkpoints/*.json`   | Iteration checkpoint records                        | Iterations          |
| `.planning/session-plan.json`    | WSJF-scored session plan                            | Planning            |
| `.planning/tribunal-result.json` | Design Tribunal debate result                       | Tribunal            |
| `.planning/metrics.json`         | Aggregated session metrics                          | Dashboard           |
| `.planning/BRAIN.md`             | Project identity file                               | Memory              |
| `.planning/MEMORY.md`            | Long-term learning file                             | Memory              |
| `.planning/WORKING.md`           | Session working memory                              | Memory              |
| `.planning/notes/*.md`           | Pending developer notes                             | Notes               |
| `.planning/notes/done/*.md`      | Consumed developer notes                            | Notes               |

## Troubleshooting

### Port already in use

**Symptom:** `Error: listen EADDRINUSE :::3456`

**Solution:** Choose a different port:

```bash
luca-observer --port 3457
# or
LUCA_OBSERVER_PORT=3457 bun run dev
```

To find and kill the process using the port:

```bash
lsof -ti:3456 | xargs kill -9
```

### No data showing in dashboard

**Symptom:** All pages show empty states even though a workflow has run.

**Causes and fixes:**

1. **Wrong project directory**: Ensure the observer points at the correct project root. Pass `--dir /path/to/project` or set `LUCA_PROJECT_DIR`.

2. **Missing `.planning/` directory**: The target project needs a `.planning/` directory with at least one data file. Run a Luca workflow to generate these files.

3. **Files not yet created**: Some files (e.g., `harness-result.json`, `tribunal-result.json`) only appear after specific workflow phases execute. The dashboard shows placeholder states until data exists.

### SSE connection disconnected

**Symptom:** The "Live" indicator in the dashboard header turns red / shows "Disconnected".

**Causes and fixes:**

1. **Server stopped**: The Next.js dev server may have crashed. Check the terminal where `bun run dev` is running for errors and restart if needed.

2. **Network interruption**: The SSE connection auto-reconnects. If it does not, reload the browser page.

3. **Proxy/firewall interference**: If running behind a reverse proxy, ensure it does not buffer SSE responses. Set the `X-Accel-Buffering: no` header (the observer already sends this).

### CSS not loading

**Symptom:** The dashboard appears unstyled (plain HTML, no colors or layout).

**Causes and fixes:**

1. **CSS not built**: Run `bun run css:dev` to generate `app/globals.css` from `tailwind/base.css`.

2. **Watch mode not running**: In development, run `bun run css:watch` to auto-rebuild CSS on changes.

3. **Stale build**: Delete `.next/` and rebuild: `rm -rf .next && bun run dev`.

### TypeScript errors during build

**Symptom:** `bun run build` fails with type errors.

**Solution:** Run the type checker to see all errors:

```bash
bunx --bun tsc --noEmit
```

The observer uses strict TypeScript with path aliases (`~/*` maps to the package root). Ensure your IDE or editor resolves the `~/` alias correctly.

## Integration with Luca Workflow

The observer fits into the Luca development loop as a passive monitoring tool:

1. **Hooks emit events**: Luca's hook scripts (session-start, pre-commit-gate, context-check) emit structured events. These can be sent to the observer's `POST /api/events` endpoint to appear in the real-time feed.

2. **File-based data**: Most observer data comes from reading `.planning/` files on disk. The observer polls these files periodically (every 5-10 seconds depending on the hook) rather than requiring push-based integration.

3. **No framework dependency**: The observer does not import from `luca-framework` or `luca-state`. All types are mirrored locally in `lib/types.ts`. This keeps the observer independently deployable.

4. **Session lifecycle**: The observer tracks sessions via `session.start` and `session.end` events. Each session appears in the session selector, allowing you to filter the event feed by session.

5. **Read-only guarantee**: The observer never modifies workflow state, plans, or checkpoints. The only write operation is the Notes feature, which creates markdown files in `.planning/notes/`.
