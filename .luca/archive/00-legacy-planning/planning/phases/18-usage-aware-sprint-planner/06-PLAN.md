---
id: 18-06
title: Skill Integration & Technical Review
phase: 18-usage-aware-sprint-planner
wave: 4
delivers: PLAN-07 (verification), PLAN-06 (integration)
depends_on:
  - 18-01
  - 18-02
  - 18-03
  - 18-04
  - 18-05
tasks: 6
---

# Plan 18-06: Skill Integration & Technical Review

## Objective

Wire together all Phase 18 components into the end-to-end planning pipeline: create the `/lu-plan-session` skill that invokes the PM agent, implement the todo file parser that reads pending todos from disk, integrate code-architect review of session plans, run end-to-end integration testing, and perform learning capture. This plan completes Phase 18 by delivering the full planning workflow from backlog parse to reviewed session plan.

## Context

- **Types from Plan 18-01:** `src/planner/types.ts` (TodoMetadata, SessionPlan, WSJFScoredItem)
- **Scoring from Plan 18-02:** `src/planner/scoring.ts` (scoreItem, rankByWSJF)
- **Scheduler from Plan 18-03:** `src/planner/scheduler.ts` (scheduleSession)
- **PM Agent from Plan 18-04:** `src/agents/general/lu-pm-planner.agent.ts` (compiled to .claude/agents/ and .cursor/agents/)
- **Weekly planner from Plan 18-05:** `src/planner/weekly.ts` (distributeWeekly)
- **Cost model from Plan 18-05:** `src/planner/cost-model.ts` (buildCostTable, formatCostTableForMemory)
- **18-CONTEXT.md Decision 4:** Backlog source is direct .planning/todos/pending/\*.md file reads
- **18-CONTEXT.md Decision 5:** Session plan output is ordered todo list with metadata + Mermaid gantt
- **18-CONTEXT.md Decision 12:** code-architect reviews session plan (technical review gate)
- **Result envelope:** `src/context/result-envelope.ts` (ResultEnvelope for PM agent output)
- **Existing skill pattern:** Skills are Claude Code/Cursor markdown files with instructions for invoking agents
- **Todo file format (from research):** YAML frontmatter (title, area, created, source) + markdown body

## Design Decisions Applied

1. **Todo parser is a utility function** (functional API reuse): `parseTodos()` in `src/planner/todo-parser.ts` -- reads files, extracts YAML frontmatter, returns TodoMetadata[]
2. **Skill is a markdown file** (existing pattern): `/lu-plan-session` is a skill in `.claude/skills/` that invokes the lu-pm-planner agent
3. **code-architect review** (18-CONTEXT.md Decision 12): The skill passes the PM agent's session plan to code-architect for technical validation
4. **End-to-end flow** (integration): parse todos -> score -> schedule -> PM agent -> code-architect review -> output plan
5. **Learning capture** (always-on step): Update STATE.md, ROADMAP.md, REQUIREMENTS.md, MEMORY.md per Luca workflow

## Files

### Create

- `src/planner/todo-parser.ts` -- Todo file parsing utility
- `src/planner/todo-parser.test.ts` -- Tests for todo parser
- `.claude/skills/lu-plan-session/SKILL.md` -- Session planning skill definition

### Modify

- `src/planner/index.ts` -- Add todo-parser exports
- `.planning/WORKING.md` -- Update with Phase 18 completion status
- `.planning/STATE.md` -- Mark Phase 18 requirements satisfied (if exists)

## Tasks

### Task 1: Create src/planner/todo-parser.ts -- Todo File Parser

**Goal:** Implement a utility that reads pending todo markdown files from `.planning/todos/pending/`, extracts YAML frontmatter, and returns typed TodoMetadata objects.

**File:** `src/planner/todo-parser.ts` (new)

**Functions to implement:**

**1. `parseYamlFrontmatter(content: string): Record<string, string>`**

```typescript
import type { TodoMetadata } from "./types";
import { todoMetadataSchema } from "./types";

/**
 * Parse YAML frontmatter from a markdown file.
 *
 * Extracts key-value pairs between --- delimiters at the start of a file.
 * Simple parser that handles single-line string values only (no nested YAML).
 *
 * @param content - Full file content
 * @returns Record of frontmatter key-value pairs
 */
export function parseYamlFrontmatter(content: string): Record<string, string> {
  const lines = content.split("\n");
  const result: Record<string, string> = {};

  if (lines[0]?.trim() !== "---") return result;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "---") break;

    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      result[key] = value;
    }
  }

  return result;
}
```

**2. `extractBody(content: string): string`**

```typescript
/**
 * Extract the markdown body content after YAML frontmatter.
 *
 * @param content - Full file content
 * @returns Body content after the closing --- delimiter, trimmed
 */
export function extractBody(content: string): string {
  const lines = content.split("\n");

  if (lines[0]?.trim() !== "---") return content.trim();

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      return lines
        .slice(i + 1)
        .join("\n")
        .trim();
    }
  }

  return content.trim();
}
```

**3. `parseSingleTodo(filePath: string, content: string): TodoMetadata | null`**

```typescript
/**
 * Parse a single todo markdown file into TodoMetadata.
 *
 * Extracts YAML frontmatter and body, then validates against the schema.
 * Returns null if the file cannot be parsed or is missing required fields.
 *
 * @param filePath - Path to the todo file
 * @param content - File content
 * @returns Parsed TodoMetadata, or null if invalid
 */
export function parseSingleTodo(
  filePath: string,
  content: string,
): TodoMetadata | null {
  const frontmatter = parseYamlFrontmatter(content);
  const body = extractBody(content);

  const raw = {
    title: frontmatter.title,
    area: frontmatter.area,
    created: frontmatter.created,
    source: frontmatter.source,
    file_path: filePath,
    body,
  };

  const result = todoMetadataSchema.safeParse(raw);
  return result.success ? result.data : null;
}
```

**4. `parseTodos(pendingDir?: string): Promise<TodoMetadata[]>`**

```typescript
/**
 * Read and parse all pending todo files from a directory.
 *
 * Globs for *.md files in the pending directory, reads each one,
 * parses YAML frontmatter, and returns an array of valid TodoMetadata.
 * Files that fail parsing are silently skipped.
 *
 * @param pendingDir - Path to the pending todos directory (default: ".planning/todos/pending")
 * @returns Array of parsed TodoMetadata items
 */
export async function parseTodos(
  pendingDir: string = ".planning/todos/pending",
): Promise<TodoMetadata[]> {
  const { readdir } = await import("node:fs/promises");
  const todos: TodoMetadata[] = [];

  try {
    const files = await readdir(pendingDir);
    const mdFiles = files.filter((f) => f.endsWith(".md"));

    for (const fileName of mdFiles) {
      const filePath = `${pendingDir}/${fileName}`;
      const file = Bun.file(filePath);

      if (await file.exists()) {
        const content = await file.text();
        const parsed = parseSingleTodo(filePath, content);
        if (parsed) {
          todos.push(parsed);
        }
      }
    }
  } catch {
    // Directory may not exist or be empty -- return empty array
  }

  return todos;
}
```

**CLI entry point:**

```typescript
/**
 * CLI entry point for todo parsing.
 *
 * Usage:
 *   bun run src/planner/todo-parser.ts parse
 *   bun run src/planner/todo-parser.ts parse --dir=.planning/todos/pending
 *
 * Outputs JSON array of TodoMetadata to stdout.
 */
if (import.meta.main) {
  const getArg = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const arg = Bun.argv.find((a) => a.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : undefined;
  };

  const dir = getArg("dir") ?? ".planning/todos/pending";
  const todos = await parseTodos(dir);
  console.log(JSON.stringify(todos, null, 2));
}
```

### Task 2: Create src/planner/todo-parser.test.ts

**Goal:** Tests for todo file parsing utilities.

**File:** `src/planner/todo-parser.test.ts` (new)

Write tests covering:

1. **parseYamlFrontmatter:**
   - Parses valid frontmatter with 4 fields (title, area, created, source)
   - Returns empty object for content without frontmatter
   - Returns empty object for content with only one ---
   - Handles values containing colons (e.g., URLs)
   - Trims whitespace from keys and values

2. **extractBody:**
   - Returns body content after closing ---
   - Returns full content if no frontmatter present
   - Returns empty string for file with only frontmatter and no body
   - Trims leading/trailing whitespace from body

3. **parseSingleTodo:**
   - Parses a complete valid todo file
   - Returns null for file missing required fields
   - Returns null for file without frontmatter
   - Includes file_path in output
   - Includes body content

4. **parseTodos (integration):**
   - Reads files from the actual .planning/todos/pending/ directory
   - Returns TodoMetadata[] with correct count
   - Each item has required fields populated
   - Handles empty directory gracefully (returns [])
   - Handles missing directory gracefully (returns [])

**Test fixtures:** Use inline string fixtures for unit tests. For integration test, use the actual `.planning/todos/pending/` directory (which already has files). Guard integration tests with a check that the directory exists.

### Task 3: Wire End-to-End Integration

**Goal:** Verify the full pipeline works: parse todos -> score -> schedule -> generate session plan.

This task creates an integration test that exercises the entire planning pipeline without invoking the PM agent (which requires LLM access). The test validates that the utility functions compose correctly.

**File:** `src/planner/integration.test.ts` (new)

Write an integration test:

```typescript
import { describe, test, expect } from "bun:test";
import { parseTodos } from "./todo-parser";
import { scoreItem, rankByWSJF } from "./scoring";
import { scheduleSession } from "./scheduler";
import { distributeWeekly } from "./weekly";
import { buildCostTable, formatCostTableForMemory } from "./cost-model";

describe("planner integration", () => {
  test("end-to-end: parse -> score -> schedule -> plan", async () => {
    // Step 1: Parse todos
    const todos = await parseTodos();
    expect(todos.length).toBeGreaterThan(0);

    // Step 2: Score each todo (using mock WSJF inputs since we can't invoke LLM)
    const scored = todos.map((todo, i) =>
      scoreItem({
        todo_path: todo.file_path,
        title: todo.title,
        area: todo.area,
        business_value: Math.min(10, 5 + i),
        time_criticality: Math.min(10, 3 + i),
        risk_reduction: Math.min(10, 2 + i),
        complexity: i % 2 === 0 ? "MODERATE" : "SIMPLE",
        dependency_free: i !== 0, // First item has dependency
      }),
    );

    // Step 3: Rank by WSJF
    const ranked = rankByWSJF(scored);
    expect(ranked.length).toBe(scored.length);
    // Verify descending WSJF order
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].wsjf_score).toBeLessThanOrEqual(
        ranked[i - 1].wsjf_score,
      );
    }

    // Step 4: Schedule session
    const session = scheduleSession(ranked);
    expect(session.items.length).toBeGreaterThan(0);
    expect(session.rationale).toBeTruthy();
    expect(session.generated_at).toBeTruthy();

    // Step 5: Verify quality zones assigned
    for (const item of session.items) {
      expect(item.assigned_zone).toBeDefined();
    }

    // Step 6: Verify Mermaid gantt generated
    if (session.items.length > 0) {
      expect(session.mermaid_gantt).toBeTruthy();
      expect(session.mermaid_gantt).toContain("gantt");
    }
  });

  test("end-to-end: parse -> score -> weekly plan", async () => {
    const todos = await parseTodos();
    if (todos.length === 0) return; // Skip if no todos

    const scored = todos.map((todo, i) =>
      scoreItem({
        todo_path: todo.file_path,
        title: todo.title,
        area: todo.area,
        business_value: 5,
        time_criticality: 5,
        risk_reduction: 5,
        complexity: "MODERATE",
        dependency_free: true,
      }),
    );

    const weekly = distributeWeekly(scored, 3);
    expect(weekly.sessions_planned).toBeLessThanOrEqual(3);
    expect(weekly.allocation.needle_movers).toBe(60);
    expect(weekly.total_effort_points).toBeGreaterThanOrEqual(0);
  });

  test("cost table builds and formats correctly", () => {
    const table = buildCostTable();
    expect(Object.keys(table)).toHaveLength(5);

    const formatted = formatCostTableForMemory(table);
    expect(formatted).toContain("TRIVIAL");
    expect(formatted).toContain("CRITICAL");
    expect(formatted).toContain("Estimated %");
  });
});
```

### Task 4: Create .claude/skills/lu-plan-session/SKILL.md -- Session Planning Skill

**Goal:** Create the `/lu-plan-session` skill that provides the user-facing entry point for session planning. This skill invokes the lu-pm-planner agent, receives the session plan via ResultEnvelope, and presents it to the user.

**File:** `.claude/skills/lu-plan-session/SKILL.md` (new)

Create the skill file following existing skill patterns (e.g., `.claude/skills/lu-execute-phase/SKILL.md`). The skill should:

1. **Trigger:** User invokes `/lu-plan-session` (optionally with `--sessions=N` for weekly planning)
2. **Pre-flight:** Load cognitive context (BRAIN.md, MEMORY.md relevant planner entries, WORKING.md)
3. **Parse todos:** Run `bun run src/planner/todo-parser.ts parse` to get pending TodoMetadata[]
4. **Invoke PM agent:** Spawn lu-pm-planner sub-agent with parsed todos as input context
   - PM agent infers BV/TC/RR for each todo from context (ROADMAP.md, dependency graph, todo metadata)
   - PM agent calls scoring and scheduling utilities
   - PM agent returns ResultEnvelope containing SessionPlan
5. **Technical review (optional):** If enabled in config, pass session plan to code-architect for review
   - code-architect checks: dependency ordering, effort estimates, hidden blockers
   - Review result appended to session plan rationale
6. **Present plan:** Display the session plan to the user with:
   - Ordered task list with quality zones
   - Mermaid gantt chart
   - Big Rock callout
   - Rationale summary
7. **Save plan (optional):** Write session plan to `.planning/session-plans/` for reference

**Skill structure template:**

```markdown
---
description: Plan the next AI coding session using WSJF prioritization
command: lu-plan-session
arguments:
  - name: sessions
    description: Number of sessions to plan (1=single session, >1=weekly plan)
    required: false
---

# /lu-plan-session

Plan the next AI coding session by analyzing pending todos, scoring them with WSJF,
and scheduling a Big Rock First + WSJF tail session plan.

## Steps

### Step 0: Cognitive Pre-Flight

[Load BRAIN.md, selective MEMORY.md recall for planner patterns, initialize WORKING.md]

### Step 1: Parse Pending Todos

[Read .planning/todos/pending/\*.md, extract YAML frontmatter, return TodoMetadata[]]

### Step 2: Invoke PM Agent

[Spawn lu-pm-planner with todo list + ROADMAP.md + dependency context]
[Agent infers WSJF inputs, scores, schedules, returns ResultEnvelope<SessionPlan>]

### Step 3: Technical Review (if config.workflow.planner_review enabled)

[Pass session plan to code-architect for dependency/effort/blocker review]

### Step 4: Present Session Plan

[Display ordered list, gantt chart, Big Rock highlight, rationale]

### Step 5: Weekly Planning (if --sessions > 1)

[Run distributeWeekly for multi-session planning with 60/25/10/5 allocation]
```

### Task 5: Update barrel exports and documentation

**Goal:** Add todo-parser exports to the planner module barrel and ensure all Phase 18 modules are properly exported.

**File:** `src/planner/index.ts` (modify)

Add these exports after the cost-model exports:

```typescript
// Todo file parsing
export {
  parseYamlFrontmatter,
  extractBody,
  parseSingleTodo,
  parseTodos,
} from "./todo-parser";
```

Verify the final index.ts exports all functions from all 5 utility modules:

- types.ts: All schemas and types
- defaults.ts: All default constants
- scoring.ts: computeWSJF, effortFromComplexity, rankByWSJF, scoreItem
- scheduler.ts: selectBigRock, estimateContextCost, assignQualityZone, scheduleSession, generateMermaidGantt
- weekly.ts: classifyBucket, partitionIntoBuckets, distributeWeekly
- cost-model.ts: getColdStartCost, createCostEstimate, calibrateCost, buildCostTable, formatCostTableForMemory
- todo-parser.ts: parseYamlFrontmatter, extractBody, parseSingleTodo, parseTodos

### Task 6: Learning Capture & State Updates

**Goal:** Update planning artifacts to reflect Phase 18 completion.

**File:** `.planning/WORKING.md` (modify)

Add Phase 18 completion entry:

```markdown
## Phase 18: Usage-Aware Sprint Planner -- Complete

### Delivered

- PLAN-01: Session planner reads pending todos and produces ordered task list
- PLAN-02: Quality-zone-aware scheduling (peak/good/degrading/stop zones)
- PLAN-03: WSJF scoring (business_value + time_criticality + risk_reduction) / effort
- PLAN-04: Big Rock First strategy
- PLAN-05: Weekly planner with 60/25/10/5 allocation
- PLAN-06: Token cost estimation model with MEMORY.md calibration
- PLAN-07: PM agent is read-only (least privilege separation)

### New Module: src/planner/

- types.ts: 11 Zod schemas (quality zones, WSJF, session/weekly plans, cost estimates, config)
- defaults.ts: EFFORT_MAP, zone boundaries, weekly allocation, cold-start costs
- scoring.ts: computeWSJF, effortFromComplexity, rankByWSJF, scoreItem
- scheduler.ts: selectBigRock, scheduleSession, assignQualityZone, generateMermaidGantt
- weekly.ts: classifyBucket, partitionIntoBuckets, distributeWeekly
- cost-model.ts: getColdStartCost, createCostEstimate, calibrateCost, buildCostTable
- todo-parser.ts: parseYamlFrontmatter, parseSingleTodo, parseTodos

### New Agent: lu-pm-planner

- First read-only agent archetype in Luca framework
- Cognition T2 / Context T1->T2 / Warm isolation
- Tools: Read, Glob, Grep, WebFetch only (no Write, Edit, Bash)
- Produces ResultEnvelope with session plan, does not write files

### Patterns Discovered

- Read-only agent archetype: output-only via ResultEnvelope, orchestrator writes
- WSJF as universal prioritization: works for both session and weekly planning
- Big Rock First + WSJF tail: simple but effective scheduling heuristic
- Cold-start cost model: default estimates calibrated over time via MEMORY.md
```

**File:** `.planning/STATE.md` (modify, if exists)

Update current phase/status to reflect Phase 18 completion.

**Candidate MEMORY.md entries:**

1. **Pattern: Read-only agent archetype** -- Output-only agents produce ResultEnvelope but cannot modify files. Use warm isolation + restricted tools list. First implementation: lu-pm-planner.
2. **Pattern: WSJF scoring** -- (BV + TC + RR) / effort provides a single priority number. Use Fibonacci-like effort proxy from complexity levels. Scores > 5 = critical priority.
3. **Pattern: Big Rock First** -- Always start sessions with highest-impact dependency-free task during peak quality zone. Simple heuristic, high effectiveness.
4. **Decision: 60/25/10/5 weekly allocation** -- Balanced approach: most effort on needle movers, meaningful quick wins, some maintenance, small reserve for surprises.
5. **Pattern: Cold-start cost estimation** -- Default context % estimates per complexity level. Calibrate with exponential moving average from actual observations. Store in MEMORY.md for cross-session persistence.

## Verification Criteria

- [ ] `.claude/skills/lu-plan-session/SKILL.md` exists and follows skill template pattern
- [ ] Skill file includes steps for: cognitive pre-flight, todo parsing, PM agent invocation, technical review, plan presentation
- [ ] `src/planner/todo-parser.ts` compiles with zero type errors
- [ ] `bun test src/planner/todo-parser.test.ts` passes all tests
- [ ] `bun test src/planner/integration.test.ts` passes all tests
- [ ] `bun run src/planner/todo-parser.ts parse` outputs valid JSON array of TodoMetadata
- [ ] `parseYamlFrontmatter` correctly extracts title, area, created, source
- [ ] `parseSingleTodo` returns null for invalid files
- [ ] `parseTodos` reads actual .planning/todos/pending/ directory
- [ ] Integration test exercises full pipeline: parse -> score -> rank -> schedule
- [ ] Integration test verifies quality zone assignment
- [ ] Integration test verifies Mermaid gantt generation
- [ ] Weekly plan integration test produces valid multi-session plan
- [ ] Cost table integration test builds and formats correctly
- [ ] `src/planner/index.ts` exports all functions from all 5 utility modules
- [ ] `.planning/WORKING.md` updated with Phase 18 completion status
- [ ] `bunx --bun tsc --noEmit` passes with zero errors across all files
- [ ] `bun test src/planner/` passes all tests (types, defaults, scoring, scheduler, weekly, cost-model, todo-parser, integration)
