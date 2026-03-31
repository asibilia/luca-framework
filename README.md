# Luca Framework

The zero-friction framework for building structured AI coding agents.

## Overview

Luca is a lightweight framework designed to help developers build, manage, and execute structured AI coding tasks. It bridges the gap between high-level planning and atomic code execution, providing a robust workflow for AI-driven development.

## Key Features

- **🚀 Zero-Friction Scaffolding**: Get started in seconds with `create-luca`.
- **📋 Structured Planning**: Define work in `PLAN.md` files with clear objectives and tasks.
- **🤖 Atomic Execution**: Execute tasks with automatic commits and deviation handling.
- **🔄 Smart Updates**: Keep your project structure up-to-date with non-destructive updates.
- **🛠️ Extensible Adapters**: Integrate with GitHub, Jira, and more.

## Quickstart

### 1. Initialize a new project

```bash
mkdir my-agent-project && cd my-agent-project
bunx create-luca
```

### 2. Install dependencies

```bash
bun install
```

### 3. Create your first plan

Luca projects use a `.planning/` directory to manage state and plans.

```bash
# Example structure
.planning/
  phases/
    01-foundation/
      01-01-PLAN.md
```

### 4. Execute a plan

Open a plan file in your IDE and use the `/lu` command to execute it. Luca plans are designed to be executed through your AI-powered IDE (Cursor, Claude Code, etc.) rather than a standalone CLI command.

## Documentation

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture/agent-framework.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Coding Standards](docs/guides/coding-standards.md)

## Upgrade

To update your project to the latest Luca framework version:

```bash
bunx luca update
```

## License

MIT
