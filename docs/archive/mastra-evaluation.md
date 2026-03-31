# Mastra.ai Evaluation

**Date:** 2026-03-19
**Status:** Decided — do not adopt as dependency
**Participants:** Product analyst, Architecture analyst, DX analyst

## What Is Mastra

[Mastra.ai](https://mastra.ai/) is a TypeScript-first AI agent framework from the Gatsby team (YC-backed). It reached v1.0 in January 2026 and has 1.77M monthly NPM downloads.

Core primitives:

- **Agents** — Autonomous entities with LLM reasoning loops, instructions, and tools
- **Workflows** — DAG-based step orchestration with branching and control flow
- **Memory** — Built-in conversation persistence with semantic retrieval
- **RAG** — Document ingestion, chunking, embedding, and retrieval pipeline
- **Tools** — First-class tool definitions with Zod-validated schemas
- **Multi-agent** — Supervisor pattern for coordinating multiple agents
- **Deployment** — Serverless-ready (Vercel, Lambda), integrates with Next.js/Hono/Express
- **Studio** — Visual IDE for testing and inspecting agent behavior

Used by Replit (Agent 3, improved task success 80% to 96%) and Marsh McLennan (75k employees).

## The Evaluation Question

Should Luca adopt Mastra as its runtime framework, replacing or augmenting the current compiler-based architecture?

---

## Case Against Adoption

### 1. Paradigm Mismatch

Luca is a **prompt compiler** — it generates markdown artifacts (`.claude/` directory) that Claude Code consumes. Agents are TypeScript config objects compiled to `.md` files via `createAgent().toClaudeFormat()`. The "execution" happens inside Claude Code's own runtime.

Mastra is a **runtime framework** — it makes LLM API calls directly, executes tool functions, and manages agent loops in its own process.

These paradigms cannot be merged. They can coexist as layers, but merging them would require rewriting every agent, skill, and rule to be a Mastra agent/tool — producing a fundamentally different product.

### 2. Concept Mapping Gap (~80% incompatible)

| Luca Concept                                         | Mastra Equivalent                | Mapping Quality                                                          |
| ---------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------ |
| AgentConfig → markdown compilation                   | Mastra Agent class               | Partial — Luca agents have cognition tiers, context tiers, model routing |
| SkillConfig → SKILL.md compilation                   | No equivalent                    | None — Mastra has no slash-command skill system                          |
| Rules → .claude/rules/\*.md                          | No equivalent                    | None — Mastra has no rule injection system                               |
| Hooks (16 shell scripts for IDE events)              | No equivalent                    | None — deeply Claude Code specific                                       |
| Complexity routing (5 levels, 7 presets, 40+ agents) | Simple per-agent model selection | None — Mastra has no complexity-dependent routing                        |
| Context tiers (T0-T3) + isolation modes              | No equivalent                    | None                                                                     |
| Cognition tiers + MuninnDB memory tags               | Basic memory per conversation    | None — MuninnDB's semantic graph is architecturally different            |
| Compiler pipeline (TS → markdown)                    | No equivalent                    | None — Mastra doesn't compile to static artifacts                        |
| State machine (XState-based, luca-bridge CLI)        | Mastra workflow state            | Partial                                                                  |
| Iteration/convergence detection                      | Retry logic only                 | Partial                                                                  |

### 3. Distribution Model Incompatibility

- **Luca:** `npm install -g @alecsibilia/luca-framework` → `luca vault:init` → generates `.claude/` artifacts
- **Mastra:** `npm install mastra` → import and write TypeScript agent code → deploy as server

These are not reconcilable without maintaining dual representations of every agent.

### 4. Identity Dilution

If Luca becomes "Mastra + Claude Code config generation," the natural question is: why not just use Mastra? Luca's moat is Claude Code nativeness + MuninnDB cognitive memory + complexity routing. None of these have Mastra equivalents.

### 5. Migration Estimate

3-6 months for feature parity, producing a fundamentally different product. Incremental migration is not feasible — the fundamental unit of work is different (compiled `.md` file vs. runtime TypeScript agent).

---

## Case For Adoption (Devil's Advocate)

### 1. Platform Risk Is Structural

The `.claude/` directory convention is not a public API. Anthropic can change the directory structure, markdown parsing semantics, or frontmatter schema at any time. Luca's entire compiler pipeline targets implementation details Anthropic never committed to stabilizing.

Mastra provides a portable runtime. If Mastra changes its API, you can fork it. If Anthropic changes `.claude/`, you have no recourse.

### 2. IDE Independence Is Existential

Cursor, Windsurf, VS Code Copilot agents, JetBrains AI — all gaining market share. Luca targets only Claude Code. If developers move to another IDE, their Luca configuration doesn't follow. Mastra agents run anywhere Node/Bun runs.

### 3. ~9,700 Lines of Hand-Rolled Infrastructure

- State machine: 5,838 lines
- Iteration/convergence: 2,601 lines
- Harness: 1,250 lines

All custom infrastructure that Mastra provides as tested, community-maintained primitives. All currently untested (tests intentionally removed per `no-tests.md`).

### 4. DAG Superiority Over Prose Orchestration

The `lu.skill.ts` orchestrator is 1,597 lines of markdown describing workflow steps as natural language. No static analysis, no replay, no visualization, no type safety between steps. Mastra's DAG engine models the same pipeline as typed, inspectable, replayable workflow steps.

### 5. Growth Ceiling

Luca can't run in CI/CD, can't support team workflows, can't deploy agents as services. The current architecture forecloses these directions permanently. Mastra provides the runtime for every growth path.

### 6. Feedback Loop Is Broken

Testing an agent change: edit TS → exit Claude Code → run build:all manually (crashes Claude Code) → restart session → invoke /lu → observe. Mastra Studio: edit → hot reload → visual inspect → playground. 5-minute ceremony vs 15-second cycle.

### 7. No Agent Evaluation

Luca can't systematically answer: Does lu-router classify correctly? Does cognitive pre-flight improve quality? Does convergence detection halt at the right time? Mastra provides structured evaluation frameworks.

---

## Decision: Borrow Ideas, Not Dependency

The panel unanimously recommended against wholesale adoption. However, several Mastra-inspired ideas are worth building natively:

| Mastra Idea              | Luca Action                                  |
| ------------------------ | -------------------------------------------- |
| DAG workflow engine      | Build typed DAG engine as new core domain    |
| Pluggable execution      | Adapter architecture for IDE independence    |
| Agent evaluation         | Lightweight eval framework for agent quality |
| Visual dev tooling       | Luca Studio (Bun.serve based)                |
| Type-safe step contracts | Zod schemas between workflow steps           |

See [Architectural Vision](./architectural-vision.md) for the full design.

## Sources

- [Mastra.ai Official Site](https://mastra.ai/)
- [Mastra GitHub Repository](https://github.com/mastra-ai/mastra)
- [Mastra Documentation](https://mastra.ai/docs)
- [Choosing a JavaScript Agent Framework — Mastra Blog](https://mastra.ai/blog/choosing-a-js-agent-framework)
- [Mastra on Y Combinator](https://www.ycombinator.com/companies/mastra)
