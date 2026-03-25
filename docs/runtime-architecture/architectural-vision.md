# Architectural Vision: Typed Workflow Engine + Pluggable Adapters

**Date:** 2026-03-19
**Status:** Proposed
**Prerequisite reading:** [Mastra Evaluation](./mastra-evaluation.md)

## The Reframe

Luca today is a **compiler**. The evolution is to become a **compiler + runtime**, where the runtime is Luca's own — lightweight, Bun-native, and IDE-agnostic. The compiler remains one of several adapters.

## Vision Statement

> Luca becomes a typed workflow engine with pluggable execution adapters, where Claude Code's markdown format is one adapter among many — and the DAG definition is the single source of truth that all adapters compile from.

## Five Sweet Spots

These are the specific areas where Mastra-inspired ideas can be adopted natively without taking on an external dependency.

### 1. Typed DAG Workflow Engine (Highest Impact)

**Problem:** The `lu.skill.ts` orchestrator is 1,597 lines of prose describing workflow steps in natural language. No static analysis, no replay, no visualization, no type safety between steps.

**Solution:** A typed DAG engine as a new core domain (`src/workflow/`). Workflow steps are defined as typed objects with Zod-validated input/output schemas. The prose orchestrator becomes a compilation output of the DAG — Claude Code still reads the prose, but it's generated from typed steps rather than hand-written.

**Key insight:** The DAG is the source of truth. The markdown orchestrator prompt is a compilation output of the DAG, not the other way around.

See [DAG Workflow Engine](./dag-workflow-engine.md) for the full design.

### 2. Adapter Architecture (IDE Independence)

**Problem:** Luca targets only Claude Code. The compiler emits `.claude/` artifacts. If developers move to another IDE, their configuration doesn't follow.

**Solution:** Refactor the compiler into pluggable adapters. Each adapter implements `executeStep()`, `compileAgent()`, and `compileSkill()`. The Claude adapter does what Luca does today. New adapters (API, Cursor, etc.) enable new execution environments.

**Key insight:** The adapter pattern already exists implicitly — `SupportedFormat = "CLAUDE" | "PLUGIN"` is the seed. This makes it explicit and extensible.

See [Adapter Architecture](./adapter-architecture.md) for the full design.

### 3. Agent Evaluation Framework

**Problem:** Tests are removed (`no-tests.md`). Luca has no way to systematically evaluate agent quality — does lu-router classify correctly? Does cognitive pre-flight improve output? Does convergence detection halt at the right time?

**Solution:** A parallel evaluation system designed for agent quality measurement, not unit testing. Eval cases define inputs, expected behaviors, and quality metrics. They run against the API adapter (not Claude Code), making them fast, deterministic, and CI-friendly.

```
src/eval/
├── __schemas/eval.schemas.ts
├── __helpers/
│   ├── eval-runner.ts
│   ├── eval-reporter.ts
│   └── eval-comparator.ts
└── index.ts
```

### 4. Development Studio (Lightweight)

**Problem:** Testing an agent change requires exiting Claude Code, running `build:all` manually (which crashes Claude Code), then restarting. The feedback loop is 5+ minutes.

**Solution:** A lightweight Bun-native dev server (`packages/luca-studio/`) that visualizes and tests Luca workflows. Not Mastra Studio — much smaller scope. Renders the workflow DAG as an interactive graph, lets you browse agent definitions, run evals, and inspect state machine transitions.

### 5. Typed Step Contracts

**Problem:** Agents invoke each other via string-interpolated markdown prompts. No compile-time verification that the target agent exists, the prompt has the right fields, or flags are well-formed. Errors discovered 30 minutes into autonomous pipeline runs.

**Solution:** Zod schemas defining the contract between each workflow step. The DAG engine validates these at step boundaries. If `discuss` produces output that doesn't satisfy `plan`'s input schema, the error is caught immediately.

## What This Preserves

These capabilities remain unchanged:

| Luca Differentiator                                               | Status                                             |
| ----------------------------------------------------------------- | -------------------------------------------------- |
| MuninnDB cognitive memory (brain trees, engrams, two-vault model) | Preserved — no replacement                         |
| Complexity routing (5 levels, 7 presets, 40+ agents)              | Preserved — feeds into DAG step configuration      |
| Compiler pipeline (TS → markdown)                                 | Preserved as the Claude adapter                    |
| Functional architecture (no classes, factory functions)           | Preserved — DAG engine uses the same patterns      |
| Hook system (16 IDE lifecycle scripts)                            | Preserved — adapter-specific                       |
| Rule system (.claude/rules/\*.md)                                 | Preserved — adapter-specific                       |
| Domain architecture (T0-T3 tiers, entity isolation)               | Extended with new `workflow` and `adapter` domains |

## What This Replaces

| Current                                                       | Replaced By                                 |
| ------------------------------------------------------------- | ------------------------------------------- |
| Prose orchestrator (lu.skill.ts sections describing workflow) | Typed DAG definition that compiles to prose |
| String-interpolated Task/Skill calls in markdown              | Typed step contracts with Zod schemas       |
| Hard-coded `.claude/` output                                  | Pluggable adapter system                    |
| Manual agent testing (exit → build → restart → observe)       | Luca Studio + eval framework                |

## Domain Architecture Impact

New domains added to the tier system:

| Domain                  | Tier             | Archetype          | Purpose                                                                                                    |
| ----------------------- | ---------------- | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `src/workflow/`         | T1 Core          | B (Core Domain)    | DAG engine, step definitions, execution loop. Adapter interface (`Adapter` type) lives here.               |
| `src/adapters/`         | T3 Build         | C (Infrastructure) | Pluggable execution adapter implementations (Claude, API, Cursor). Terminal — imported by nothing in src/. |
| `src/eval/`             | T1 Core          | B (Core Domain)    | Agent evaluation framework                                                                                 |
| `packages/luca-studio/` | Separate package | —                  | Dev server for visualization and testing                                                                   |

Import direction: `workflow` sits at T1 and defines the `Adapter` interface. `adapters` sits at T3 (like `compilers`) and implements that interface — it consumes T0-T1 but is not imported by other src/ domains. Adapter selection uses dependency injection at the CLI entry point, not direct imports. The existing compiler domain becomes a thin wrapper around the Claude adapter.
