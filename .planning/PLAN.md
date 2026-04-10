# Plan: Pipeline Mode Permission Fixes

## Objective

Fix 4 permission gaps in Luca's pipeline mode system:
1. Create a new `writePlanningFile` tool so read-only modes can write `.planning/` files via `node:fs` (bypassing workspace write restrictions)
2. Grant `write_planning_file` to `luca:2-research` and `luca:5-review` modes
3. Grant `manage_todos: ['list', 'read']` to `luca:1-triage` mode
4. Expand `luca:2-research` `manage_todos` from `['add']` to `['list', 'read', 'add']`

## Context

### Current State
- Research and review modes are in `READ_ONLY_MODES` (index.ts:579), which strips workspace `write_file`/`string_replace_lsp` tools. But their instructions tell them to write `.planning/` capture files — they have no tool to do so.
- Triage mode references todo IDs in its analysis (triage.md:59) but has no `manage_todos` permission to read them.
- Research mode can `add` todos but cannot `list` or `read` them — an asymmetric gap that prevents it from checking existing todos before adding duplicates.

### Architecture
- **Layer 1** — `MODE_PERMISSIONS` (mode-permissions.ts): Maps mode IDs → tool→actions. `buildModeTools()` uses `createScopedTool()` to narrow Zod `action` enums.
- **Layer 2** — `READ_ONLY_MODES` (index.ts:579): Removes workspace write tools. Orthogonal to Layer 1 — custom tools using `node:fs` bypass this.
- **Tool registration pipeline**: create tool → register in `TOOL_REGISTRY` → export from `tools/index.ts` → add to `MODE_PERMISSIONS`. **CRITICAL**: `buildModeTools()` throws if `MODE_PERMISSIONS` references a tool not in `TOOL_REGISTRY`.

### Naming Convention
- Tool ID: `write-planning-file` (kebab-case)
- Registry key: `write_planning_file` (snake_case)
- Record key: `writePlanningFile` (camelCase)

### Decisions
| # | Decision | Choice |
|---|----------|--------|
| 1 | `writePlanningFile` actions | `write` and `read` only |
| 2 | Path restrictions | `.planning/` prefix enforced; reject `..` traversal; reject absolute paths |
| 3 | Mode grants | `luca:2-research` and `luca:5-review` get `['write', 'read']` |
| 4 | Research todos | Expand from `['add']` to `['list', 'read', 'add']` |
| 5 | Triage todos | New `manage_todos: ['list', 'read']` |
| 6 | Implementation pattern | Follow `manageRoadmapTool` — `node:fs` direct I/O |
| 7 | Instruction updates | Surgical one-line callouts referencing the new tool |

## Tasks

### Wave 1: Create the `writePlanningFile` tool

- [ ] **Task 1.1**: Create `packages/luca-mastracode/src/tools/write-planning-file.ts`
  - File: `packages/luca-mastracode/src/tools/write-planning-file.ts` (NEW)
  - Details:
    - `createTool()` with id `write-planning-file`
    - `inputSchema`: `action: z.enum(['write', 'read'])`, `path: z.string()` (relative to `.planning/`), `content: z.string().optional()` (required for write)
    - `outputSchema`: `success: z.boolean()`, `message: z.string()`, `content: z.string().optional()` (returned on read)
    - Security: use `path.resolve(process.cwd(), '.planning', userPath)` then verify `resolved.startsWith(path.join(process.cwd(), '.planning'))` — reject if false. Also reject if `userPath` starts with `/` (absolute paths). This is the canonical containment pattern, not just a string `..` check.
    - `write` action: runtime-validate that `content` is defined (Zod schema has it as `.optional()` for the `read` action). Use `mkdirSync(dirname(resolved), { recursive: true })` then `writeFileSync(resolved, content, 'utf-8')`.
    - `read` action: check `existsSync(resolved)` first — return `{ success: false, message: 'File not found: ...' }` if missing. Otherwise `readFileSync(resolved, 'utf-8')` and return content.
    - Imports: `createTool` from `@mastra/core/tools`, `{ readFileSync, writeFileSync, existsSync, mkdirSync }` from `node:fs`, `{ join, resolve, dirname }` from `node:path`, `{ z }` from `zod`
    - Follow `manageRoadmapTool` pattern for structure and error handling
  - Verify: `bunx --bun tsc --noEmit` passes (file compiles in isolation)

### Wave 2: Register and export the tool

- [ ] **Task 2.1**: Register `writePlanningFile` in `TOOL_REGISTRY`
  - File: `packages/luca-mastracode/src/tools/build-mode-tools.ts`
  - Details:
    - Add import: `import { writePlanningFileTool } from './write-planning-file.js';` (after line 14)
    - Add registry entry: `write_planning_file: { tool: writePlanningFileTool, record_key: 'writePlanningFile' },` (in `TOOL_REGISTRY` object, after line 38)
  - Verify: `bunx --bun tsc --noEmit` passes

- [ ] **Task 2.2**: Export from `tools/index.ts`
  - File: `packages/luca-mastracode/src/tools/index.ts`
  - Details:
    - Add: `export { writePlanningFileTool } from './write-planning-file.js';` (after line 10, with other tool exports)
  - Verify: `bunx --bun tsc --noEmit` passes

### Wave 3: Update mode permissions

- [ ] **Task 3.1**: Grant `write_planning_file: ['write', 'read']` to `luca:2-research`
  - File: `packages/luca-mastracode/src/tools/mode-permissions.ts`
  - Details: Add `write_planning_file: ['write', 'read'],` to the `"luca:2-research"` block (lines 42-45)
  - Verify: `bunx --bun tsc --noEmit` passes

- [ ] **Task 3.2**: Expand `luca:2-research` `manage_todos` from `['add']` to `['list', 'read', 'add']`
  - File: `packages/luca-mastracode/src/tools/mode-permissions.ts`
  - Details: Change line 44 from `manage_todos: ['add'],` to `manage_todos: ['list', 'read', 'add'],`
  - Verify: `bunx --bun tsc --noEmit` passes

- [ ] **Task 3.3**: Grant `manage_todos: ['list', 'read']` to `luca:1-triage`
  - File: `packages/luca-mastracode/src/tools/mode-permissions.ts`
  - Details: Add `manage_todos: ['list', 'read'],` to the `"luca:1-triage"` block (after line 40)
  - Verify: `bunx --bun tsc --noEmit` passes

- [ ] **Task 3.4**: Grant `write_planning_file: ['write', 'read']` to `luca:5-review`
  - File: `packages/luca-mastracode/src/tools/mode-permissions.ts`
  - Details: Add `write_planning_file: ['write', 'read'],` to the `"luca:5-review"` block (lines 57-62)
  - Verify: `bunx --bun tsc --noEmit` passes

### Wave 4: Update instruction files

- [ ] **Task 4.1**: Add `writePlanningFile` callout to research instructions
  - File: `packages/luca-mastracode/src/instructions/research.md`
  - Details:
    - At line 73 (after "Write each researcher's output to `.planning/research-capture-{dimension}.md`"), add a callout: `Use the **writePlanningFile** tool (action: "write") to create these files — workspace write tools are unavailable in research mode.`
    - At line 188, update the behavioral guideline to mention `writePlanningFile`: change the full line from `- **Read-only.** Never create, modify, or delete code files. You may only produce '.planning/RESEARCH.md'.` to `- **Read-only.** Never create, modify, or delete code files. You may only produce '.planning/' files via the **writePlanningFile** tool.` (preserves the read-only prefix)
  - Verify: File contains the new callouts (grep check)

- [ ] **Task 4.2**: Add `writePlanningFile` callout to review instructions
  - File: `packages/luca-mastracode/src/instructions/review.md`
  - Details:
    - At line 90 (after "Write each reviewer's output to `.planning/review-capture-{perspective}-{wave}.md`"), add a callout: `Use the **writePlanningFile** tool (action: "write") to create these files — workspace write tools are unavailable in review mode.`
    - At line 165 (after "Write the report to `.planning/REVIEW-{wave}.md`"), add a similar callout.
  - Verify: File contains the new callouts (grep check)

- [ ] **Task 4.3**: Add `manageTodos` guidance to triage instructions
  - File: `packages/luca-mastracode/src/instructions/triage.md`
  - Details:
    - At line 59 (the "Todo references" bullet), update to: `- **Todo references**: If the request mentions specific todo IDs (e.g., "todos #1-5"), use **manageTodos** (action: "list" or "read") to retrieve their details. Include relevant todo context in the intent summary for downstream modes.`
  - Verify: File contains the updated guidance (grep check)

## Verification

### Per-task
Each task includes a `bunx --bun tsc --noEmit` or grep verification.

### Full integration
1. **Type check**: `bunx --bun tsc --noEmit` — must pass with zero errors
2. **Manual smoke test**: Mode-switch into `luca:5-review`, confirm `writePlanningFile` tool is available with only `write` and `read` actions in the schema
4. **Permission audit** (manual): Verify final `mode-permissions.ts` contains:
   - `luca:1-triage` → `manage_todos: ['list', 'read']`
   - `luca:2-research` → `manage_todos: ['list', 'read', 'add']`, `write_planning_file: ['write', 'read']`
   - `luca:5-review` → `write_planning_file: ['write', 'read']`

## Metadata
- Estimated files: 7 (1 new, 6 modified)
- Scope: MEDIUM
- Waves: 4
- Critical ordering: Wave 1 (create tool) → Wave 2 (register + export) → Wave 3 (permissions) → Wave 4 (instructions)
