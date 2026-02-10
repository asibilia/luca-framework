# Luca Framework

The AI-native developer productivity framework for structured, autonomous engineering.

## Overview

Luca Framework provides the scaffolding, state management, and cognitive patterns needed for AI agents to work autonomously within a repository. It bridges the gap between raw LLM capabilities and professional engineering workflows.

## Key Features

- **Structured Planning**: Hierarchical planning from Roadmap to atomic Tasks.
- **State Management**: Persistent `STATE.md` and `WORKING.md` for session continuity.
- **Autonomous Execution**: Atomic Git commits per task with automatic deviation handling.
- **Enterprise Readiness**: Built-in security posture, audit trails, and procurement documentation.

## Installation

```bash
bun x create-luca
```

## Core Workflow

1. **Initialize**: `luca init`
2. **Plan**: Create structured `PLAN.md` files in `.planning/phases/`
3. **Execute**: Open a plan in your IDE and use the `/lu` command
4. **Learn**: Automatic extraction of findings to `MEMORY.md`

## Security

Security is a core pillar of the Luca Framework. We ensure that AI-driven development doesn't compromise your organization's security posture.

### Security Posture

- **Local-First**: All core logic and state reside in your local repository.
- **Auditability**: Every action is traceable through atomic Git commits and execution summaries.
- **Supply Chain**: Minimal, pinned dependencies with automated vulnerability scanning.
- **Transparency**: Clear documentation of data handling and privacy principles.

## License

MIT
