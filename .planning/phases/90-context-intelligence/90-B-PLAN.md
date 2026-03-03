---
id: 90-B
title: "Expand pre-flight context hydration"
phase: 90
wave: 1
complexity: MODERATE
---

# 90-B: Expand Pre-Flight Context Hydration

## Objective

Improve first-pass accuracy by pre-hydrating the cognitive pre-flight with deterministic, codebase-specific context before agent execution begins. Currently pre-flight loads BRAIN.md, MEMORY.md, and WORKING.md but lacks targeted codebase intelligence (file tree, test files, git history, import graph) that would reduce initial exploration overhead and improve plan quality.

## Context

@src/memory/**schemas/memory.schemas.ts -- WorkingMemory schemas including `memory_recall` and `session_info` sections
@src/memory/**helpers/working-memory.ts -- parseWorkingMemory(), addSection() for structured WORKING.md updates
@src/context/**schemas/context.schemas.ts -- ContextDocumentSet with plan_content, brain_summary, git_diff fields
@src/context/**helpers/context-assembler.ts -- assembles context docs per tier/isolation
@src/hooks/scripts/session-start.sh -- current session init (creates BRAIN.md, MEMORY.md, WORKING.md, config.json)
@src/complexity/\_\_schemas/complexity.schemas.ts -- complexity levels gate pre-flight depth
@src/rules/general/complexity-gating.rule.ts -- cognitive pre-flight: "Lite" vs "Full" by complexity

**Current pre-flight flow:**

1. Session starts -> `session-start.sh` creates/validates `.planning/` files
2. Agent reads BRAIN.md (project identity), MEMORY.md (long-term learnings), WORKING.md (session memory)
3. Agent begins work with only these three context sources
4. Agent must manually explore the codebase to understand structure, tests, and recent changes

**Gap:** Between step 2 and step 3, there is no deterministic context gathering. The agent wastes early context exploring directory structure, finding test files, and understanding recent changes -- all things that could be pre-computed in <5 seconds.

**Stripe precedent:** Stripe pre-populates context by deterministically running relevant tools before agent execution, giving agents a "situational awareness" snapshot without LLM calls.

## Tasks

### Task 1: Design the pre-flight hydration schema

**Goal:** Define a Zod schema for the hydration snapshot that captures file tree, test mapping, git history, and import graph.

**Files:** `src/context/__schemas/context.schemas.ts` (extend with new schema)

**Steps:**

1. Add a `PreFlightSnapshot` schema to `context.schemas.ts` with the following fields:
   - `file_tree`: Array of directory entries (path, type, depth) for the target area
   - `test_files`: Array of test file paths that cover the target area
   - `recent_commits`: Array of recent commits (hash, subject, files_changed) touching the target area
   - `import_graph`: Record of file -> imported modules for the target files
   - `generated_at`: ISO 8601 timestamp
   - `target_path`: The directory/file that was analyzed
   - `depth`: How deep the analysis went (configurable by complexity)
2. Add a `HydrationConfig` schema for controlling depth:
   - `max_tree_depth`: How many levels deep to list (default: 3)
   - `max_commits`: How many recent commits to include (default: 10)
   - `include_import_graph`: Whether to compute imports (default: true for MODERATE+, false for TRIVIAL/SIMPLE)
   - `include_test_discovery`: Whether to find related tests (default: true)

**Verification:**

- [ ] Schema validates with sample data
- [ ] Types infer correctly with `z.infer`
- [ ] `bunx --bun tsc --noEmit` passes

### Task 2: Implement file tree snapshot

**Goal:** Create a fast bun script that lists the directory tree of a target area, respecting .gitignore.

**Files:** `src/context/__helpers/hydration-snapshot.ts` (new file)

**Steps:**

1. Create `hydrationSnapshot()` function that accepts a target path and config
2. Use `Bun.spawn` to run `git ls-tree -r --name-only HEAD <path>` for .gitignore-aware file listing
3. Parse output into structured `file_tree` entries with path, type (file/dir), and depth
4. Limit to `max_tree_depth` levels from the target path
5. Performance target: <1 second for typical project areas

**Example output:**

```typescript
{
  file_tree: [
    { path: "src/rules/__schemas/rule.schemas.ts", type: "file", depth: 2 },
    { path: "src/rules/__helpers/create-rule.ts", type: "file", depth: 2 },
    { path: "src/rules/general/", type: "dir", depth: 1 },
    // ...
  ],
  // ...
}
```

**Verification:**

- [ ] Returns correct file tree for `src/rules/`
- [ ] Respects .gitignore (no node_modules, dist/)
- [ ] Completes in <1 second
- [ ] Handles non-existent paths gracefully

### Task 3: Implement test file discovery

**Goal:** Find test files that cover a target area using naming conventions and directory structure.

**Files:** `src/context/__helpers/hydration-snapshot.ts` (add to same file)

**Steps:**

1. Add `discoverTestFiles()` function that accepts a target path
2. Strategy 1: Find `__tests__/` directories that mirror the target path structure
3. Strategy 2: Find `*.test.ts` / `*.spec.ts` files adjacent to or within the target path
4. Strategy 3: Search `__tests__/` at the repo root for files matching the target domain name
5. Use `Bun.spawn` with `git ls-files` for fast, .gitignore-aware search
6. Return deduplicated array of test file paths

**Example:** Target `src/rules/` should discover:

- `__tests__/packages/luca-framework/rules/` test files
- Any `src/rules/**/*.test.ts` files

**Verification:**

- [ ] Discovers test files for known domains (rules, memory, context)
- [ ] No false positives from unrelated test directories
- [ ] Handles domains with no tests gracefully (empty array)

### Task 4: Implement recent git history extraction

**Goal:** Extract the last N commits touching a target area for change awareness.

**Files:** `src/context/__helpers/hydration-snapshot.ts` (add to same file)

**Steps:**

1. Add `recentGitHistory()` function that accepts a target path and max count
2. Use `Bun.spawn` to run `git log --oneline --format="%H|%s|%ai" -n <max> -- <path>`
3. Parse output into structured commit entries (hash, subject, date)
4. Optionally include files changed per commit via `git diff-tree --no-commit-id --name-only -r <hash>`
5. Performance target: <2 seconds for 10 commits

**Example output:**

```typescript
{
  recent_commits: [
    {
      hash: "06ce1f9",
      subject: "feat(repo): #40 team-based roadmap creation tool",
      date: "2026-03-02T10:30:00-05:00",
      files_changed: ["src/skills/general/roadmap.skill.ts", "..."]
    },
    // ...
  ],
}
```

**Verification:**

- [ ] Returns correct commit history for target path
- [ ] Handles empty git history (new repo) gracefully
- [ ] Completes in <2 seconds for 10 commits

### Task 5: Implement import graph extraction

**Goal:** Map which modules the target files depend on for dependency awareness.

**Files:** `src/context/__helpers/hydration-snapshot.ts` (add to same file)

**Steps:**

1. Add `extractImportGraph()` function that accepts an array of target file paths
2. For each `.ts` file, read it and extract `import` statements using a simple regex (not a full parser -- speed over accuracy)
3. Resolve `~/` path aliases to `src/` relative paths
4. Return a record mapping each file to its imports
5. Gate this behind `include_import_graph` config (skip for TRIVIAL/SIMPLE)
6. Performance target: <2 seconds for a typical domain (10-20 files)

**Example output:**

```typescript
{
  import_graph: {
    "src/rules/__helpers/create-rule.ts": [
      "src/shared/__helpers/format",
      "src/shared/__helpers/deep-freeze",
      "src/rules/__schemas/rule.schemas"
    ],
    // ...
  },
}
```

**Verification:**

- [ ] Correctly extracts imports from TypeScript files
- [ ] Resolves `~/` alias
- [ ] Handles non-TypeScript files gracefully (skip)
- [ ] Performance within budget

### Task 6: Wire hydration into pre-flight workflow

**Goal:** Integrate the hydration snapshot into the cognitive pre-flight flow so agents receive it in WORKING.md's `session_info` section.

**Files:** `src/context/__helpers/hydration-snapshot.ts` (add orchestrator), `src/memory/__helpers/working-memory.ts` (use addSection)

**Steps:**

1. Add `generatePreFlightSnapshot()` orchestrator that calls all four sub-functions and combines results
2. Accept a `HydrationConfig` that controls depth based on complexity level
3. Map complexity levels to config:
   - TRIVIAL: file tree only (depth 2), no imports, 5 commits
   - SIMPLE: file tree (depth 2), test discovery, 5 commits, no imports
   - MODERATE: file tree (depth 3), test discovery, 10 commits, imports
   - COMPLEX/CRITICAL: file tree (depth 4), test discovery, 15 commits, imports
4. Format snapshot as concise markdown for inclusion in WORKING.md `session_info` section
5. Total execution time budget: <5 seconds for MODERATE complexity

**Integration point:** The snapshot should be invokable from:

- Skills that run cognitive pre-flight (lu.skill.ts, phase-execute, etc.)
- The session-start hook (lightweight version for immediate availability)

**Verification:**

- [ ] `generatePreFlightSnapshot("src/rules/")` returns a complete snapshot
- [ ] Snapshot formatted as readable markdown fits within ~2000 tokens
- [ ] Complexity gating produces correct config for each level
- [ ] Total execution time <5 seconds for MODERATE
- [ ] `bun test` passes
- [ ] `bunx --bun tsc --noEmit` passes

### Task 7: Add unit tests

**Goal:** Write tests for all hydration functions.

**Files:** `__tests__/packages/luca-framework/context/hydration-snapshot.test.ts` (new file)

**Steps:**

1. Test `fileTreeSnapshot()` with known directory
2. Test `discoverTestFiles()` with known domain
3. Test `recentGitHistory()` with known path
4. Test `extractImportGraph()` with known files
5. Test `generatePreFlightSnapshot()` end-to-end
6. Test complexity-to-config mapping
7. Test error handling (non-existent paths, empty repos)

**Verification:**

- [ ] All tests pass with `bun test`
- [ ] Edge cases covered (empty dirs, no git, no tests)
- [ ] No flaky tests (deterministic assertions)

## Success Criteria

- [ ] `generatePreFlightSnapshot(targetPath)` produces a structured snapshot with file tree, test files, git history, and import graph
- [ ] Execution time <5 seconds for typical project directories at MODERATE complexity
- [ ] Complexity gating controls hydration depth (TRIVIAL gets minimal, COMPLEX gets full)
- [ ] Snapshot is formatted as concise markdown suitable for WORKING.md injection
- [ ] All hydration functions have unit tests
- [ ] `bun test` passes
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] No new dependencies added (uses only Bun built-ins and git CLI)
