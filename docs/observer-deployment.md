# Luca Observer Deployment Guide

Comprehensive guide for deploying and running the luca-observer dashboard -- a real-time observability interface for the Luca workflow framework.

## Overview

Luca Observer is a Next.js 15 dashboard that connects to a SpacetimeDB instance via WebSocket and displays real-time workflow state, event streams, iteration convergence, harness results, tribunal debates, memory files, cost tracking, and more. It is read-only: all data comes from SpacetimeDB table subscriptions.

The observer provides:

- Real-time WebSocket-based event feed (via SpacetimeDB subscriptions)
- Workflow state visualization with transition logs
- Iteration convergence charts and budget gauges
- Harness verification results with parsed error details
- WSJF session planning tables with quality zone indicators
- Memory file viewer (BRAIN, MEMORY, WORKING, PROCEDURES)
- Tribunal debate findings, disagreements, and rebuttals
- Cost tracking and token usage analytics
- Decision audit trail with rationale
- Developer notes queue

## Prerequisites

1. **Bun runtime** (v1.0+): The observer uses Bun as its runtime and package manager. Install from [bun.sh](https://bun.sh) if not already available.

2. **luca-framework monorepo**: The observer lives at `packages/luca-observer/` inside the luca-framework monorepo.

3. **SpacetimeDB**: A running SpacetimeDB instance with the `luca-observer` module published. See [architecture-overview.md](architecture-overview.md) for setup commands.

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

| Variable                         | Default                   | Description                                           |
| -------------------------------- | ------------------------- | ----------------------------------------------------- |
| `NEXT_PUBLIC_SPACETIMEDB_URI`    | `ws://localhost:3000`     | SpacetimeDB WebSocket URI for real-time subscriptions |
| `NEXT_PUBLIC_SPACETIMEDB_MODULE` | `luca-observer`           | SpacetimeDB module/database name                      |
| `LUCA_OBSERVER_PORT`             | `3456`                    | Default port (overridden by `--port` flag)            |
| `LUCA_PROJECT_DIR`               | Current working directory | Project root (used for local file fallback reads)     |

CLI flags take precedence over environment variables. Environment variables take precedence over built-in defaults.

## SpacetimeDB Setup

The observer requires a running SpacetimeDB instance with the `luca-observer` module published.

### Local Development

```bash
# Start SpacetimeDB locally
spacetime start

# Publish the module
spacetime publish luca-observer --module-path packages/luca-spacetime/spacetimedb

# Regenerate client bindings (after schema changes)
spacetime generate --lang typescript \
  --out-dir packages/luca-observer/module_bindings \
  --module-path packages/luca-spacetime/spacetimedb
```

### Data Sources

The observer reads all data from SpacetimeDB tables via WebSocket subscriptions. The framework writes to these tables via fire-and-forget HTTP reducer calls.

| SpacetimeDB Table     | Dashboard Page      | Purpose                                    |
| --------------------- | ------------------- | ------------------------------------------ |
| `workflow_state`      | Dashboard, Overview | Workflow state, phase, complexity          |
| `observer_events`     | Events              | Real-time event feed                       |
| `iteration_records`   | Iterations          | Per-iteration convergence data             |
| `harness_results`     | Harness             | Verification pass/fail results             |
| `session_plans`       | Plan                | WSJF-scored session plan                   |
| `tribunal_results`    | Tribunal            | Design Tribunal debate results             |
| `memory_files`        | Memory              | BRAIN, MEMORY, WORKING, PROCEDURES content |
| `cost_tracking`       | Cost                | Session cost aggregation                   |
| `token_usage`         | Cost                | Per-call token breakdown                   |
| `decision_logs`       | Decisions           | Decision audit trail                       |
| `metrics`             | Dashboard           | Aggregated session metrics                 |
| `notes`               | Notes               | Developer notes                            |
| `ledger_entries`      | Dashboard           | State transition log                       |
| `context_snapshots`   | Context             | Context window snapshots                   |
| `suspend_checkpoints` | (internal)          | Phase suspend/resume data                  |

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

1. **SpacetimeDB not running**: Ensure SpacetimeDB is running (`spacetime start`) and the module is published (`spacetime publish luca-observer --module-path packages/luca-spacetime/spacetimedb`).

2. **Wrong module name**: Check that `NEXT_PUBLIC_SPACETIMEDB_MODULE` matches the published module name (default: `luca-observer`).

3. **No data written yet**: Tables are empty until the framework writes to them. Run a Luca workflow to populate data, or seed test data via `curl` to reducer endpoints.

4. **Stale module bindings**: If you changed the SpacetimeDB schema, regenerate bindings with `spacetime generate` and restart the observer.

### WebSocket connection failed

**Symptom:** Console shows `WebSocket connection to 'ws://localhost:3000/v1/database/...' failed`.

**Causes and fixes:**

1. **SpacetimeDB not running**: Start it with `spacetime start`.

2. **Wrong URI**: Check `NEXT_PUBLIC_SPACETIMEDB_URI` points to the correct SpacetimeDB host (default: `ws://localhost:3000`).

3. **Wrong module name**: Check `NEXT_PUBLIC_SPACETIMEDB_MODULE` matches the published module name.

### DataView / deserialization errors

**Symptom:** Console shows `RangeError: Offset is outside the bounds of the DataView`.

**Cause:** Module bindings are out of date with the published schema.

**Solution:** Regenerate bindings and restart:

```bash
spacetime generate --lang typescript \
  --out-dir packages/luca-observer/module_bindings \
  --module-path packages/luca-spacetime/spacetimedb
# Then restart the observer
```

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

1. **Framework writes to SpacetimeDB**: The framework calls SpacetimeDB reducers via HTTP POST (fire-and-forget) through `observer-emitter.ts`. If SpacetimeDB is down, errors are silently swallowed — the framework continues operating without observability.

2. **Hooks emit events**: Luca's hook scripts emit events via `curl` to SpacetimeDB reducer endpoints (e.g., `POST /v1/database/luca-observer/call/ingest_event`).

3. **Observer subscribes via WebSocket**: The observer connects to SpacetimeDB via WebSocket and receives real-time table updates. No polling, no SSE — all data is push-based.

4. **No framework dependency**: The observer does not import from `luca-framework` or `luca-state`. All types come from auto-generated SpacetimeDB module bindings (`module_bindings/`).

5. **Read-only guarantee**: The observer never modifies workflow state, plans, or checkpoints. It only reads from SpacetimeDB table subscriptions.

For full architecture details, see [architecture-overview.md](architecture-overview.md).
