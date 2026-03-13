# Workflow System Architecture

Documentation for Luca's workflow orchestration system — covering the topology model, state machine, observer visualization, and the gaps between them.

## Documents

| Document                                               | Purpose                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| [topology-audit.md](topology-audit.md)                 | Audit of current topology vs actual agents/skills            |
| [state-machine-analysis.md](state-machine-analysis.md) | State machine architecture and its role in orchestration     |
| [systematization-gaps.md](systematization-gaps.md)     | Gaps between current architecture and config-driven workflow |
| [target-architecture.md](target-architecture.md)       | Proposed architecture for a unified workflow config system   |

## Context

The workflow editor in `packages/luca-observer` visualizes the Luca autopilot pipeline as a node graph. During the v4.3 redesign (stage containers + builder architecture), we discovered that the topology data is hardcoded and decoupled from the actual framework source code. This documentation captures the full audit and proposed path forward.
