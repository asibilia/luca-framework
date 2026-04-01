# Luca Framework Documentation

Start here, then go deeper into the areas relevant to your work.

## Onboarding

| Doc                                              | Purpose                                    |
| ------------------------------------------------ | ------------------------------------------ |
| [getting-started.md](getting-started.md)         | Prerequisites, installation, core concepts |
| [global-installation.md](global-installation.md) | Global npm install and per-project setup   |
| [troubleshooting.md](troubleshooting.md)         | Common issues and fixes                    |

## Architecture

[architecture-overview.md](architecture-overview.md) is the gateway document. For subsystem deep-dives:

| Doc                                                                              | Purpose                                                          |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [architecture/agent-framework.md](architecture/agent-framework.md)               | Agent hierarchy, teams, orchestration flow                       |
| [architecture/dag-engine.md](architecture/dag-engine.md)                         | DAG workflow engine design and schemas                           |
| [architecture/adapter-architecture.md](architecture/adapter-architecture.md)     | Multi-IDE adapter system (Claude, Cursor, Windsurf, VSCode, API) |
| [architecture/memory-system.md](architecture/memory-system.md)                   | MuninnDB integration, dual-vault model, context management       |
| [architecture/workflow-orchestration.md](architecture/workflow-orchestration.md) | 10-step v2 pipeline (as-built)                                   |

## Diagrams

Visual references for key systems:

| Doc                                                                | Purpose                                               |
| ------------------------------------------------------------------ | ----------------------------------------------------- |
| [diagrams/workflow-overview.md](diagrams/workflow-overview.md)     | Full lifecycle from project-new to milestone-complete |
| [diagrams/agent-orchestration.md](diagrams/agent-orchestration.md) | How skills spawn agents and chain together            |
| [diagrams/cognition-flow.md](diagrams/cognition-flow.md)           | Two-tier memory and cognitive pre-flight              |
| [diagrams/complexity-gates.md](diagrams/complexity-gates.md)       | Complexity levels and model routing                   |

## Decisions

Architecture Decision Records (ADRs):

| Doc                                                                                          | Date       | Summary                                               |
| -------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------- |
| [decisions/orchestrator-context-pruning.md](decisions/orchestrator-context-pruning.md)       | 2026-03-06 | Prune sub-agent output to prevent context degradation |
| [decisions/session-lock-bypass.md](decisions/session-lock-bypass.md)                         | 2026-03-06 | Sub-agents bypass session lock via env var            |
| [decisions/backlog-integration-decisions.md](decisions/backlog-integration-decisions.md)     | 2026-03-24 | v2 phase ordering and DAG coexistence                 |
| [decisions/behavioral-equivalence-criteria.md](decisions/behavioral-equivalence-criteria.md) | 2026-03-24 | Compiled prose must match hand-written behavior       |
| [decisions/workflow-v2-canonical.md](decisions/workflow-v2-canonical.md)                     | 2026-03-22 | Cross-section conflict resolution for v2 design       |

## Guides

| Doc                                                      | Purpose                                                   |
| -------------------------------------------------------- | --------------------------------------------------------- |
| [guides/coding-standards.md](guides/coding-standards.md) | TypeScript conventions, build commands, project structure |
| [guides/content-style.md](guides/content-style.md)       | Voice, tone, and content formatting                       |
| [guides/skill-naming.md](guides/skill-naming.md)         | Skill naming conventions and domain patterns              |

## Research

Foundational knowledge that informed Luca's design:

| Doc                                                                          | Purpose                                   |
| ---------------------------------------------------------------------------- | ----------------------------------------- |
| [research/1.anti-slop.md](research/1.anti-slop.md)                           | Managing AI agents in production          |
| [research/2.agent-design-patterns.md](research/2.agent-design-patterns.md)   | Agent orchestration patterns              |
| [research/3.domain-specific-memory.md](research/3.domain-specific-memory.md) | Graph + vector hybrid memory              |
| [research/anti-step-skipping.md](research/anti-step-skipping.md)             | Why LLMs skip steps and how to prevent it |

## Other

| Doc                                          | Purpose                                         |
| -------------------------------------------- | ----------------------------------------------- |
| [generation-system.md](generation-system.md) | Build pipeline and TypeScript-to-IDE conversion |
| [scouting/README.md](scouting/README.md)     | Article intelligence pipeline overview          |

## Archive

Historical docs (completed designs, superseded specs, phase research) are in [archive/](archive/README.md). These are preserved for reference but no longer actively maintained.

---

_Update this index when adding or moving docs._
