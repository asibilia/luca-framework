---
phase: 3
plan: 2
type: feature
autonomous: false
wave: 2
depends_on: [1]
---

# Phase 03 Plan 2: Memory Migration & Brain Tree Split

## Objective

Migrate luca-framework-specific memories from the `default` MuninnDB vault to the project-specific `luca-framework` vault, then split the unified brain tree into a project brain (repo vault) and user brain (default vault). This plan is entirely MCP-driven -- no TypeScript code changes. All operations use MuninnDB MCP tools at runtime.

This plan depends on PLAN-01 (init-vault) having already configured `.planning/config.json` with the `muninn.vault` field pointing to the `luca-framework` vault.

> **CRITICAL SAFETY:** Before ANY mutation (recreate, soft-delete, forget), the default vault MUST be exported as a recovery point. This is a non-negotiable prerequisite.

## Context

Read these files for migration classification heuristic and brain tree structure:

- @.planning/phases/03-multi-vault-migration/03-CONTEXT.md (classification heuristic, brain tree split structure, safety requirements)
- @.planning/phases/03-multi-vault-migration/03-RESEARCH.md (MCP call patterns, brain tree JSON examples, batch size limits)
- @src/skills/general/seed-memory.skill.ts (brain tree structure example with muninn_remember_tree)

## Tasks

### 1. Export Default Vault (Safety Net)

**Type:** checkpoint:human-verify
**TDD:** false
**Depends on:** none

Export the entire default vault before any mutation. This creates a recovery point.

**Actions:**

1. Call `mcp__muninn__muninn_export_graph` with `vault: "default"` to get the full vault export
2. Save the export output to `.planning/migration/default-vault-export-{date}.json`
3. Verify the export file exists and contains data (non-empty)

**Checkpoint reason:** The user must confirm the export looks reasonable before proceeding with destructive operations.

**Verification:**

- Export file exists at `.planning/migration/default-vault-export-{date}.json`
- File is non-empty and contains valid JSON-LD or GraphML data
- User has confirmed the export looks complete

### 2. Recall and Classify Memories

**Type:** auto
**TDD:** false
**Depends on:** 1

Recall all memories from the default vault and classify each as repo-specific or cross-cutting.

**Actions:**

1. Call `mcp__muninn__muninn_recall` with `vault: "default"`, `mode: "deep"`, and broad context phrases like `["luca-framework", "project", "session", "milestone", "phase", "architecture", "pattern", "pitfall", "preference", "decision"]`
2. Call multiple times with different context phrases to ensure comprehensive coverage
3. Classify each memory using the heuristic from CONTEXT.md:

**Move to luca-framework vault (repo-specific):**

- Concept starts with `session:` (session history)
- Concept starts with `v3.`, `v4.`, or contains milestone version references
- Concept contains "luca-framework", "observer", "spacetimedb"
- Type is "event" with project-specific content (phase results, milestone completions)
- Project identity engram (`luca-framework project identity`)
- Architecture/implementation engrams specific to this codebase

**Keep in default vault (cross-cutting):**

- Concept starts with `pitfall:` (general tool pitfalls -- UNLESS content is luca-framework-specific)
- Concept starts with `preference:` (user preferences)
- Concept starts with `procedure:` (workflow procedures)
- Concept starts with `pattern:` where content is framework-agnostic
- User profile/role information
- Workflow process decisions (e.g., complexity gating rework decision)

**Ambiguous cases:** Keep in default vault (conservative).

4. Output a classification summary: count of memories to migrate vs. keep

**Verification:**

- All memories from default vault have been recalled
- Each memory has a classification (migrate or keep)
- Classification summary is output with counts

### 3. Recreate Repo-Specific Memories in Project Vault

**Type:** auto
**TDD:** false
**Depends on:** 2

Recreate all repo-specific memories in the `luca-framework` vault using batch operations.

**Actions:**

1. Read the vault name from `.planning/config.json` (muninn.vault field) -- do NOT hardcode "luca-framework"
2. For each batch of up to 50 classified-as-migrate memories, call `mcp__muninn__muninn_remember_batch` with `vault: <config vault name>` and the memory data
3. Each batch memory should preserve: concept, content, type (if available), confidence
4. Track which memories were successfully recreated

**Important constraints:**

- Batch size maximum: 50 per `muninn_remember_batch` call
- Do NOT hardcode vault name -- read from config
- Preserve original concept names

**Verification:**

- All classified-as-migrate memories have been recreated in the project vault
- `mcp__muninn__muninn_recall` on the project vault returns the migrated memories
- Original concept names are preserved

### 4. Rebuild Entity Relationships in Project Vault

**Type:** auto
**TDD:** false
**Depends on:** 3

Rebuild relationships between migrated memories using `muninn_link`.

**Actions:**

1. For memories that had entity relationships in the default vault (e.g., milestone -> phase results, session -> decisions), recreate those links in the project vault
2. Use `mcp__muninn__muninn_link` with `vault: <config vault name>`, `source_id`, `target_id`, and appropriate `relation` types
3. Focus on high-value relationships: milestone completions linked to their phase results, sessions linked to their learnings

**Verification:**

- Key entity relationships are recreated in the project vault
- `mcp__muninn__muninn_traverse` on key entities shows linked memories

### 5. Create Project Brain Tree in Repo Vault

**Type:** auto
**TDD:** false
**Depends on:** 3

Create the project-specific brain tree in the `luca-framework` vault using `muninn_remember_tree` (atomic parent-child creation).

**Actions:**

Call `mcp__muninn__muninn_remember_tree` with:

```json
{
  "vault": "<config vault name>",
  "root": {
    "concept": "brain:project-identity",
    "content": "luca-framework is a developer tooling monorepo for agentic development. Stack: TypeScript + Markdown, Bun runtime, MCP integration. Architecture: orchestrator/sub-agent model with MuninnDB memory system. Source of truth is src/ directory, compiled via bun run build:all to .claude/ + .cursor/ (generated, never edit directly). Key modules: memory system (MuninnDB), workflow engine (skills/agents/verification/learning), git integration (Jira -> GitHub Issue -> Branch -> PR), observer dashboard (Next.js).",
    "type": "project_identity",
    "summary": "Project identity and conventions for luca-framework"
  },
  "children": [
    {
      "concept": "brain:stack",
      "content": "TypeScript, Bun (runtime + package manager + test runner), Zod (schema-first parsing), lodash (safe operations), XState v5 (state machine), MuninnDB (semantic graph memory via MCP), Next.js 15 (observer dashboard). Functional patterns only -- no classes. Bun APIs preferred over Node.js equivalents.",
      "type": "project_stack"
    },
    {
      "concept": "brain:architecture",
      "content": "13 src/ domains across 4 dependency tiers: T0 Foundation (shared, complexity), T1 Core (context, planner, harness, iteration, observability, interop), T2 Entity (agents, skills, rules -- parallel, never cross-import), T3 Build (compilers, hooks). Barrel-only index.ts files. No flat files at domain root. Entity domains have registries.",
      "type": "project_architecture"
    },
    {
      "concept": "brain:conventions",
      "content": "Kebab-case file naming. Schema-first parsing (Zod). API snake_case, internal camelCase. Lodash over built-in Array methods. Individual lodash imports. Mandatory JSDoc documentation. No test files (temporarily removed). Generated output dirs: .claude/, .cursor/, .pi/ -- never edit directly. Source in src/, build via bun run build:all.",
      "type": "project_conventions"
    },
    {
      "concept": "brain:workflow",
      "content": "Spec-driven development: Plan (PLAN.md) -> Execute (lu-executor) -> Verify (harness + lu-verifier) -> Learn (lu-learner). Cognitive pre-flight loads MuninnDB context before operations. Bridge CLI (luca-bridge) provides typed state access with STATE.md fallback. Git workflow: Jira ticket -> GitHub issue -> feature branch -> PR. Complexity gating: 5 levels (TRIVIAL/SIMPLE/MODERATE/COMPLEX/CRITICAL) control model tier selection.",
      "type": "project_workflow"
    }
  ]
}
```

Use `muninn_remember_tree` (NOT individual `muninn_remember` calls) to preserve parent-child relationships atomically.

**Verification:**

- `mcp__muninn__muninn_recall_tree` with `vault: <config vault name>` and `id: "brain:project-identity"` returns the full tree with all 4 children
- All children are linked to the root

### 6. Create User Brain Tree in Default Vault

**Type:** auto
**TDD:** false
**Depends on:** none (parallel with tasks 3-5, but sequenced after task 2)

Create the user-specific brain tree in the `default` vault using `muninn_remember_tree`.

**Actions:**

Call `mcp__muninn__muninn_remember_tree` with:

```json
{
  "vault": "default",
  "root": {
    "concept": "brain:user-identity",
    "content": "Solo developer + AI workflow. The user is the visionary/product owner; AI is the builder. No teams, stakeholders, ceremonies. Ship fast + learn. Memory-driven optimization.",
    "type": "user_identity",
    "summary": "User preferences and development style"
  },
  "children": [
    {
      "concept": "brain:user-role",
      "content": "Visionary and product owner. Sets direction, makes architectural decisions, reviews AI output. AI agents handle execution, verification, and learning. Solo workflow optimized for speed and quality.",
      "type": "user_role"
    },
    {
      "concept": "brain:user-preferences",
      "content": "Bun over npm/yarn. Lodash over built-in array/object methods. Zod schemas for all validation (schema-first). Functional programming only -- no classes. Kebab-case file names. Mandatory documentation. API payloads use snake_case. MuninnDB for all memory storage (never local auto memory).",
      "type": "user_preferences"
    },
    {
      "concept": "brain:user-tools",
      "content": "MuninnDB for semantic graph memory (vault-based isolation). Claude Code and Cursor IDE for development. GitHub for engineering tracking. Jira for product tracking (read-only from engineering). PostHog for analytics.",
      "type": "user_tools"
    },
    {
      "concept": "brain:user-communication",
      "content": "No emojis in code or agent output. Clear, concise communication. Mandatory documentation for all new functionality. Intent-first responses -- think about what the user actually needs, not just what they asked.",
      "type": "user_communication"
    }
  ]
}
```

**Verification:**

- `mcp__muninn__muninn_recall_tree` with `vault: "default"` and `id: "brain:user-identity"` returns the full tree with all 4 children
- All children are linked to the root

### 7. Soft-Delete Old Brain Tree from Default Vault

**Type:** checkpoint:human-verify
**TDD:** false
**Depends on:** 5, 6

Soft-delete the old unified `brain:project-identity` tree from the default vault. This is safe because:

- The project brain has been recreated in the repo vault (Task 5)
- The user brain is a new tree in default vault (Task 6)
- Soft-deletes are recoverable via `muninn_restore`

**Actions:**

1. Call `mcp__muninn__muninn_forget` with `vault: "default"` and `id` of the old `brain:project-identity` root
2. Call `mcp__muninn__muninn_forget` for each child of the old brain tree (`brain:stack`, `brain:architecture`, `brain:conventions`, `brain:workflow`)
3. Verify the old tree is no longer returned by `muninn_recall_tree`

**Checkpoint reason:** Deleting the brain tree is a significant operation. The user should confirm that both the project brain (repo vault) and user brain (default vault) are correctly populated before deleting the old tree.

**Verification:**

- Old `brain:project-identity` tree is no longer returned from default vault recall
- `mcp__muninn__muninn_list_deleted` with `vault: "default"` shows the soft-deleted brain tree entries
- New project brain tree in repo vault is intact
- New user brain tree in default vault is intact

### 8. Soft-Delete Migrated Memories from Default Vault

**Type:** auto
**TDD:** false
**Depends on:** 3, 7

Soft-delete the original copies of migrated memories from the default vault. Only delete memories that were successfully recreated in the project vault (Task 3).

**Actions:**

1. For each memory that was successfully recreated in the project vault, call `mcp__muninn__muninn_forget` with `vault: "default"` and the memory's `id`
2. Skip any memories that failed to recreate (keep originals as safety net)
3. Output summary: count of soft-deleted vs. retained

**Verification:**

- Migrated memories are soft-deleted from default vault
- Non-migrated (cross-cutting) memories remain in default vault
- `mcp__muninn__muninn_list_deleted` shows the soft-deleted entries
- Project vault contains all migrated memories (spot-check 3-5 key memories)

## Verification

Overall verification for this plan:

1. Default vault export exists at `.planning/migration/default-vault-export-{date}.json`
2. Project vault (`luca-framework`) contains:
   - All migrated repo-specific memories
   - Project brain tree (`brain:project-identity` + children)
   - Entity relationships between migrated memories
3. Default vault contains:
   - All cross-cutting memories (pitfalls, patterns, preferences)
   - User brain tree (`brain:user-identity` + children)
   - No repo-specific memories (soft-deleted)
   - No old unified brain tree (soft-deleted)
4. Both brain trees are retrievable via `muninn_recall_tree`
5. Soft-deleted items are recoverable via `muninn_restore` if needed

## Success Criteria

- Clean vault separation: repo-specific in `luca-framework` vault, cross-cutting in `default` vault
- Brain tree split complete: project brain in repo vault, user brain in default vault
- Safety net: full vault export exists for recovery
- All soft-deletes are recoverable
- Zero data loss (all memories are either in their new location or preserved in the export)

## Output Specification

- Created: `.planning/migration/default-vault-export-{date}.json` (vault backup)
- MuninnDB state changes:
  - `luca-framework` vault: populated with migrated memories + project brain tree
  - `default` vault: cross-cutting memories + user brain tree (repo-specific memories soft-deleted)
