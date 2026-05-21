---
phase: 3
plan: 1
type: feature
autonomous: false
wave: 1
depends_on: []
---

# Phase 3 Plan 1: TypeScript Round-Trip Utilities

## Objective

Build the read/write path for TypeScript entity files so that Luca Studio can extract structured config data from `.agent.ts`, `.skill.ts`, and `.rule.ts` source files, allow editing, and write valid TypeScript back with zero-diff round-trip fidelity across all 129 entity files.

> Appetite: Large (200000 tokens remaining of 200000 ceiling)

## Context

@.planning/phases/03-w2-high-risk-infrastructure/03-CONTEXT.md
@.planning/todos/pending/studio-w2-ts-round-trip.md
@docs/brainstorm/observer-studio-rework/4.technical-architecture.md (TypeScript Round-Trip Problem section)
@docs/brainstorm/observer-studio-rework/7.research-entity-editing.md (R3)
@src/agents/**schemas/agent.schemas.ts
@src/skills/**schemas/skill.schemas.ts
@src/rules/**schemas/rule.schemas.ts
@src/agents/**helpers/create-agent.ts
@src/agents/**helpers/cold-isolation-block.ts
@src/agents/**helpers/research-reviewer-shared-sections.ts

## Tasks

### 1. Create the read path — extractConfigFromSource()

**Type:** auto
**TDD:** false
**Depends on:** none

Build `packages/luca-studio/lib/ts-round-trip.ts` with the core read function. This function takes a TypeScript source string and a domain identifier (`agents` | `skills` | `rules`), extracts the config object literal via targeted regex, evaluates it in a controlled context, and parses it with the appropriate Zod schema (`AgentConfigSchema`, `SkillConfigSchema`, `RuleConfigSchema`).

Key implementation details:

- Regex targets the pattern `const {camelCaseName}Config: {Type}Config = {` through to the matching close `};`
- Must handle nested braces in object literals (brace-depth counting, not simple regex)
- For the 8 agents with `${CONSTANT}` interpolation imports (`COLD_ISOLATION_BLOCK`, `RESEARCH_REVIEWER_COLD_ISOLATION`, `RESEARCH_REVIEWER_SCORING`, `RESEARCH_REVIEWER_OUTPUT_CONTRACT`), the read path must resolve these constants by importing their actual values and substituting them before parsing
- Return a typed result: `{ success: true, config: AgentConfig | SkillConfig | RuleConfig, metadata: { varName, domain, imports } }` or `{ success: false, error: string }`
- Extract metadata: variable name (camelCase), import statements, shared constant names used

**Files to create/edit:**

- `packages/luca-studio/lib/ts-round-trip.ts` (new)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Manually verify extraction against 2-3 known agent files (one with shared constants, one without)

### 2. Create the write path — generateEntitySource()

**Type:** auto
**TDD:** false
**Depends on:** 1

Build the serialization side in the same file. This function takes a validated config object, domain, and metadata (from the read path), and produces a complete TypeScript source string.

Key implementation details:

- `serializeSectionContent(content: string, constantMap?: Map<string, string>)`: the core serializer that converts a section content string back to a TypeScript template literal expression
  - Escapes backticks: `` ` `` becomes `` \` ``
  - Escapes `${` sequences: `${` becomes `\${` (to prevent template literal interpolation)
  - BUT preserves `${CONSTANT_NAME}` references for the 8 agents — must compare against the known constant map and emit the interpolation expression instead of escaped text
  - The `constantMap` maps constant names to their string values, used to detect which parts of content match a constant and should be emitted as `${CONSTANT_NAME}` rather than inline text
- `serializeConfig(config, domain, metadata)`: serializes the full config object to TypeScript object literal syntax
  - Frontmatter properties use standard JSON-like serialization
  - Section `content` values use backtick template literals via `serializeSectionContent()`
  - Section `title` and `order` use standard string/number serialization
  - Handles optional fields (omits undefined values)
- `generateEntitySource(config, domain, metadata)`: assembles the complete file
  - JSDoc comment (from metadata or generated)
  - Import statements (factory function, type, and shared constants if applicable)
  - Config variable declaration with proper TypeScript type annotation
  - Export statement with factory call

**Files to create/edit:**

- `packages/luca-studio/lib/ts-round-trip.ts` (extend)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Round-trip a simple agent (no shared constants): read -> write -> string comparison

### 3. Build the shared constant registry

**Type:** auto
**TDD:** false
**Depends on:** 1

Create a registry that maps constant names to their source file paths and values. This is needed by both the read path (to resolve interpolations) and the write path (to detect constant-originating content and emit `${CONSTANT}` references).

The 8 agents that use interpolation:

- `code-architect`, `code-simplifier`, `dx-advocate`, `performance-auditor`, `security-auditor` — use `COLD_ISOLATION_BLOCK` from `~/agents/__helpers/cold-isolation-block`
- `lu-completeness-reviewer`, `lu-accuracy-reviewer`, `lu-actionability-reviewer` — use `RESEARCH_REVIEWER_COLD_ISOLATION`, `RESEARCH_REVIEWER_SCORING`, `RESEARCH_REVIEWER_OUTPUT_CONTRACT` from `~/agents/__helpers/research-reviewer-shared-sections`

Implementation:

- Define a `SharedConstantRegistry` type: `Record<string, { importPath: string, value: string }>`
- Populate by importing the actual constant values from source
- Export as a frozen registry for consumption by read/write paths

**Files to create/edit:**

- `packages/luca-studio/lib/shared-constant-registry.ts` (new)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Registry contains all 4 constant names with correct values

### 4. Wire up the file-level read/write API

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3

Create file-level convenience functions that handle the full lifecycle:

- `readEntityFile(filePath: string)`: reads the file from disk, detects domain from file extension (`.agent.ts`, `.skill.ts`, `.rule.ts`), calls `extractConfigFromSource()`, returns parsed config + metadata
- `writeEntityFile(filePath: string, config, metadata)`: calls `generateEntitySource()`, writes atomically (write to `.tmp` sibling, then rename into place)
- `roundTripEntityFile(filePath: string)`: reads, then writes to a temp path, returns diff status (for verification)

Also add domain detection logic: determine domain from file path pattern (`src/agents/` -> agents, etc.) or from file extension suffix.

**Files to create/edit:**

- `packages/luca-studio/lib/ts-round-trip.ts` (extend with file I/O functions)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `roundTripEntityFile()` on a standard agent produces zero diff

### 5. Round-trip verification gate — all 129 entity files

**Type:** checkpoint:human-verify
**TDD:** false
**Depends on:** 4

This is the mandatory acceptance gate. Run the round-trip verification against all 129 entity files:

1. Discover all entity files via glob: `src/agents/**/*.agent.ts`, `src/skills/**/*.skill.ts`, `src/rules/**/*.rule.ts`
2. For each file: read original source -> `extractConfigFromSource()` -> `generateEntitySource()` -> write to temp directory
3. Diff original vs generated for each file
4. Report: pass count, fail count, per-file diff details for failures
5. Special attention: individually verify the 8 interpolation agents produce zero diffs

Create a verification script at `packages/luca-studio/scripts/verify-round-trip.ts` that runs this gate and produces structured output.

**Success criteria:** 129/129 files produce zero diffs. No exceptions.

**Files to create/edit:**

- `packages/luca-studio/scripts/verify-round-trip.ts` (new)

**Verification:**

- Run `bun packages/luca-studio/scripts/verify-round-trip.ts`
- All 129 files pass (zero diffs)
- The 8 interpolation agents specifically confirmed in output
- Type check passes: `bunx --bun tsc --noEmit`

## Verification

1. `bunx --bun tsc --noEmit` passes for all new/modified files
2. Round-trip verification script passes 129/129 with zero diffs
3. The 8 `${CONSTANT}` interpolation agents preserve their expressions through the round trip
4. Generated TypeScript files are syntactically valid (parseable by TypeScript compiler)

## Success Criteria

- `extractConfigFromSource()` correctly parses all 3 entity types (agents, skills, rules)
- `generateEntitySource()` produces valid TypeScript for all 3 entity types
- `serializeSectionContent()` correctly handles: escaped backticks, escaped `${}`, real `${CONSTANT}` interpolation, regex patterns, XML-like tags, nested markdown
- 129/129 round-trip zero-diff verification passes
- All 8 interpolation agents preserve `${CONSTANT_NAME}` references (not inlined, not escaped)

## Output Specification

- `packages/luca-studio/lib/ts-round-trip.ts` — Core read/write utilities
- `packages/luca-studio/lib/shared-constant-registry.ts` — Shared constant name-to-value registry
- `packages/luca-studio/scripts/verify-round-trip.ts` — Round-trip verification gate script
