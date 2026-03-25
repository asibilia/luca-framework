# Runtime Architecture Evolution

Documentation for Luca's architectural evolution from a prompt compiler to a typed workflow engine with pluggable execution adapters.

## Background

In March 2026, a strategic evaluation was conducted on whether Luca should adopt [Mastra.ai](https://mastra.ai/) as a runtime framework. A panel of product, architecture, and DX analysts concluded that wholesale adoption would be a paradigm mismatch, but identified several Mastra-inspired ideas worth adopting natively.

The result is a "borrow the ideas, not the dependency" approach: Luca evolves its own architecture to address the valid concerns (IDE lock-in, prose-based orchestration, feedback loop, evaluation gaps) without taking on an external framework dependency.

## Documents

| Document                                          | Description                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| [Mastra Evaluation](./mastra-evaluation.md)       | Full analysis of Mastra.ai — cases for and against adoption        |
| [Architectural Vision](./architectural-vision.md) | The sweet-spot architecture: typed DAG engine + pluggable adapters |
| [DAG Workflow Engine](./dag-workflow-engine.md)   | Design for the typed workflow engine replacing prose orchestration |
| [Adapter Architecture](./adapter-architecture.md) | Pluggable execution adapters for IDE independence                  |
| [Roadmap](./roadmap.md)                           | Phased implementation plan                                         |

## Key Decision

**Decision:** Do not adopt Mastra as a dependency. Instead, build Luca's own lightweight runtime layer that captures the best ideas (typed DAGs, runtime portability, evaluation, visual tooling) while preserving Luca's differentiators (MuninnDB cognitive memory, complexity routing, compiler pipeline, functional architecture).

**Rationale:** See [Mastra Evaluation](./mastra-evaluation.md) for the full analysis.

## One-Sentence Vision

> Luca becomes a **typed workflow engine with pluggable execution adapters**, where Claude Code's markdown format is one adapter among many — and the DAG definition is the single source of truth that all adapters compile from.
