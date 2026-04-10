# Context — Pipeline Permission Fixes: writePlanningFile Tool + Triage Todos + Audit Gaps

## Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | **`writePlanningFile` actions** | `write` and `read` only | `write` covers creating/overwriting capture files and final reports. `read` lets modes re-read their own captures when OM compresses context (instructions explicitly say "re-read from .planning/…"). No `append` — all writes are full-file overwrites per the instruction patterns. No `list` — modes use workspace `find_files` (read-only, not blocked). Keeping the action set minimal reduces attack surface. |
| 2 | **Path restrictions** | `.planning/` prefix enforced; reject `..` traversal; reject absolute paths | The tool must ONLY write inside `.planning/`. This is the security boundary that justifies bypassing `READ_ONLY_MODES`. Reject paths containing `..` or starting with `/` to prevent escape. Normalize to `join(cwd, '.planning', relativePath)`. |
| 3 | **Which modes get `write_planning_file`** | `luca:2-research` (`['write', 'read']`) and `luca:5-review` (`['write', 'read']`) | These are the two read-only pipeline modes whose instructions explicitly require writing `.planning/` files. Architect (`luca:3-architect`) is NOT in `READ_ONLY_MODES` so it already has workspace `write_file` — no need. Triage, discuss, execute, finalize either don't write planning files or already have write access. |
| 4 | **Research `manage_todos` expansion** | Expand from `['add']` to `['list', 'read', 'add']` | Research instruction §"Knowledge Capture & Backlog Handoff" creates todos from discoveries. But without `list`/`read`, research can't check for duplicates or read existing todo context before adding. The `luca:discuss` mode already proves `['list', 'read']` is the safe read pattern. Adding these to research's existing `['add']` is a minimal, safe expansion. |
| 5 | **Triage `manage_todos` access** | Add `manage_todos: ['list', 'read']` | Triage instruction §Step 1 references todo IDs ("Downstream modes will assign them via manageTodos"). Triage needs to read referenced todos to understand scope. Same proven read-only pattern as `luca:discuss`. |
| 6 | **Tool implementation pattern** | Follow `manageRoadmapTool` pattern: `node:fs` direct I/O, action-based Zod schema, `createTool()` | `manageRoadmapTool` already proves the pattern of a custom tool using `writeFileSync`/`readFileSync` to bypass workspace read-only restrictions. Same approach: `createTool()` with `z.enum(['write', 'read'])` action field, compatible with `createScopedTool()`. |
| 7 | **Tool naming convention** | snake_case key `write_planning_file`, camelCase record key `writePlanningFile`, kebab-case tool id `write-planning-file` | Matches existing convention: `manage_todos` → `manageTodos` → `manage-todos`, `manage_roadmap` → `manageRoadmap` → `manage-roadmap`. |
| 8 | **Instruction file updates** | Add brief tool-usage callouts in research.md and review.md where they reference writing capture files | Modes currently say "Write each researcher's output to `.planning/research-capture-{dimension}.md`" without specifying HOW. Add a one-line callout: "Use `writePlanningFile(action: "write", …)` to create these files." Minimal — don't restructure instructions. |

## Constraints

- **`buildModeTools()` throws on unregistered tools** — the new tool MUST be registered in `TOOL_REGISTRY` before any mode references it in `MODE_PERMISSIONS`
- **`createScopedTool()` requires `action` field in `z.object` input schema** — the new tool must follow the action-based pattern
- **Read-only modes cannot use workspace `write_file`** — the whole point of this tool is to provide a safe, scoped alternative via `node:fs`
- **TypeScript strict mode** — the codebase uses strict TypeScript; tool must have proper types and Zod schemas
- **Existing tests** — `mode-permissions.test.ts` or similar may need updating if they validate the permission manifest
- **Tool sequencing** — import in `build-mode-tools.ts` must happen before `TOOL_REGISTRY` references the tool

## Scope

### In Scope
- New `write-planning-file.ts` tool with `write` and `read` actions
- `TOOL_REGISTRY` entry in `build-mode-tools.ts`
- `MODE_PERMISSIONS` updates: add `write_planning_file` to `luca:2-research` and `luca:5-review`
- `MODE_PERMISSIONS` updates: add `manage_todos: ['list', 'read']` to `luca:1-triage`
- `MODE_PERMISSIONS` updates: expand `luca:2-research` `manage_todos` from `['add']` to `['list', 'read', 'add']`
- Export from `tools/index.ts`
- Instruction file callouts in `research.md` and `review.md` for tool usage
- Instruction file callout in `triage.md` for `manageTodos` read access

### Out of Scope
- Modifying `READ_ONLY_MODES` set or workspace tool config in `index.ts` — the new tool intentionally bypasses this layer
- Adding `writePlanningFile` to non-read-only modes (architect, execute, finalize already have `write_file`)
- Adding `writePlanningFile` to `luca:discuss` or `plan` — they don't write `.planning/` files
- Restructuring instruction files beyond adding tool-usage callouts
- Changes to `createScopedTool()` — it already handles the pattern we need
- `repo_cleanup` permissions — confirmed correct during audit (finalize has `'*'`)

## Preferences

- **Minimal tool surface**: Only `write` and `read` actions. Don't add `list`, `delete`, `append` unless a concrete instruction requires them.
- **Fail-safe path validation**: Reject anything outside `.planning/` at the tool level, not just by convention. Use `path.resolve()` + `startsWith()` check.
- **Consistent error shape**: Return `{ success: boolean, message: string }` matching `manageRoadmapTool` output pattern.
- **Auto-create `.planning/` directory**: Use `mkdirSync({ recursive: true })` like `manageRoadmapTool` does — don't fail if directory doesn't exist.
- **UTF-8 only**: All `.planning/` files are markdown text. No binary support needed.
- **Instruction updates should be surgical**: One-line additions near existing "Write to .planning/…" instructions. Don't rewrite paragraphs.

## Open Questions

- **None** — all decisions resolved via full-auto defaults based on codebase patterns and instruction analysis.
