# Phase 141: Cross-Agent Interop Scanner

## Goal

Create new `src/interop/` domain at T1 (Core tier) for discovering agents across IDE directories (.claude/, .cursor/, .pi/, .gemini/, .codex/, .github/copilot/), normalizing to InteropAgentSummary, and wiring into the context assembler.

## Context

Projects increasingly have agents from multiple AI tools coexisting. This domain scans for non-Luca agent definitions, normalizes them, and informs routing to avoid spawning agents that duplicate existing non-Luca agents.

## Tasks

### Task 1: Create domain structure

```
src/interop/
├── __schemas/
│   └── interop.schemas.ts
├── __helpers/
│   ├── scanner.ts
│   └── normalizer.ts
└── index.ts
```

### Task 2: Define interop schemas

**File:** `src/interop/__schemas/interop.schemas.ts`

Create:

- `InteropAgentSummarySchema`: `name`, `source_tool` (enum: claude, cursor, gemini, codex, copilot, other), `file_path`, `capabilities` (string[]), `description`, `model_preference` (optional)
- `InteropScanResultSchema`: `agents` (InteropAgentSummary[]), `scan_paths` (string[]), `scan_duration_ms`, `tool_counts` (Record<string, number>)
- `InteropScanConfigSchema`: `scan_dirs` (string[], defaults to known IDE dirs), `include_patterns`, `exclude_patterns`

### Task 3: Implement scanner

**File:** `src/interop/__helpers/scanner.ts`

Create `scanForAgents(projectRoot: string, config?: InteropScanConfig): InteropScanResult` that:

1. Scans .claude/agents/, .cursor/agents/, .gemini/, .codex/, .github/copilot/ directories
2. Reads agent definition files (markdown with frontmatter)
3. Extracts name, description, capabilities from frontmatter/content
4. Returns structured scan result

### Task 4: Implement normalizer

**File:** `src/interop/__helpers/normalizer.ts`

Create `normalizeAgent(rawContent: string, sourceTool: string): InteropAgentSummary` that:

1. Parses frontmatter from agent definition files
2. Extracts capabilities from content sections
3. Normalizes to common InteropAgentSummary format
4. Handles different formats per tool (Claude uses YAML frontmatter, others may differ)

### Task 5: Wire into context assembler

**File:** `src/context/__helpers/context-assembler.ts`

Add optional `agent_summaries` field population:

1. Call `scanForAgents()` during context assembly
2. Populate `agent_summaries` field with discovered non-Luca agents
3. Only scan when context tier allows (MODERATE+)

### Task 6: Create barrel and register domain

**File:** `src/interop/index.ts`

Create barrel with re-exports. Update architecture docs:

- `.claude/rules/domain-architecture.md`: Add interop as T1 Core domain
- `.claude/rules/module-boundary.md`: Add interop to T1 tier

## Verification

- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `src/interop/` structure follows domain archetype B (Core)
- [ ] Scanner discovers agent files from known IDE directories
- [ ] Normalizer handles Claude-format agent definitions
- [ ] Context assembler populates agent_summaries when available
- [ ] No upward imports (interop is T1, imports only T0)
