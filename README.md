# Luca Framework

A developer tooling monorepo for structured AI coding workflows.

## Overview

Luca orchestrates structured AI coding workflows on top of existing repos. It provides a CLI tool (`luca`) for initialization and diagnostics, and a custom Mastra Code harness (`luca-mastracode`) with pipeline modes, subagents, and specialized tools.

## Packages

| Package | Description |
| ------- | ----------- |
| `packages/luca-framework` | CLI tool — init, vault setup, MuninnDB management, diagnostics |
| `packages/luca-mastracode` | Custom Mastra Code distribution with 9 modes, 7 subagents, 6 tools |
| `packages/luca-studio` | Next.js UI for project visualization and configuration |

## Quickstart

### 1. Install dependencies

```bash
bun install
```

### 2. Initialize Luca

```bash
luca init          # Set up MuninnDB
luca vault:init    # Configure vault for your project
```

### 3. Run Mastra Code

```bash
bun run mastracode
```

Or use the `/lu` slash command within your IDE to execute pipeline workflows.

## Development

```bash
bun install              # Install dependencies
bun run build            # Build luca-framework
bun run mastracode       # Run mastracode harness
bunx --bun tsc --noEmit  # Type check
```

## Documentation

- [Getting Started](docs/getting-started.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Coding Standards](docs/guides/coding-standards.md)

## License

MIT
