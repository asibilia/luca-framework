# Phase 1 Context: IDE Adapters (E01 + E02 + E03)

## Decisions

### 1. Adapter Interface Reconciliation [auto-resolved]

The todo specs (written before v6.0.0 implementation) reference `compileHooks()` and `validate()` methods that do NOT exist on the actual `Adapter` type in `src/adapters/__schemas/adapter.schemas.ts`.

**Actual Adapter interface:**

- `compileAgent(agent: BaseAgent) => string | Record<string, unknown>`
- `compileSkill(skill: BaseSkill) => string | Record<string, unknown>`
- `compileRule?(rule: BaseRule) => string | Record<string, unknown>`
- `executeStep?(step, context) => Promise<AdapterStepResult>` (optional, API-only)
- `emit(outputDir: string) => Promise<EmitResult>`
- `detect(projectRoot: string) => boolean`

**Decision:** Follow the EXISTING Adapter interface. Do NOT modify it.

- Hook compilation is internal to each adapter's `emit()` method
- Validation logic lives as a standalone helper per adapter (not on the interface)
- The `emit()` method handles: compile all entities + write all files + return EmitResult
- Each adapter subdirectory can have internal helpers (e.g., `compile-hooks.ts`, `compile-rules.ts`) that are called by `emit()`

### 2. Shared Character Budget Utility [auto-resolved]

Windsurf needs `enforceCharacterBudget()` for rules (12K) and workflows (12K). VS Code may need truncation for agent profiles (30K).

**Decision:** Create `src/adapters/__helpers/character-budget.ts` as a shared utility.

- Exported function: `enforceCharacterBudget(content: string, maxChars: number, sourcePath: string): string`
- Used by Windsurf adapter (rules, workflows) and VS Code adapter (agent profiles)
- Cursor adapter does NOT need it (no character limits documented)

### 3. Registration Pattern [auto-resolved]

**Decision:** Follow the existing pattern in `src/adapters/__helpers/register-builtins.ts`.

- Add `import { createCursorAdapter } from "../cursor";` etc.
- Register each new adapter via `registerAdapter()`
- DETECTION_ORDER in adapter-registry.ts already includes entries for cursor, windsurf, vscode

### 4. Build Pipeline [auto-resolved]

**Decision:** Each adapter's `emit()` is called by the existing compilation pipeline. The `bun run build:all` script already iterates registered adapters. New adapters are automatically included once registered.

- No changes to build scripts needed beyond registration
- `check:drift` may need per-adapter output validation (defer to Phase 2 E04)

### 5. Internal File Structure Per Adapter [auto-resolved]

Each adapter follows the Claude adapter pattern:

```
src/adapters/{ide}/
├── {ide}-adapter.ts      # Main adapter implementing Adapter interface
├── index.ts              # Barrel export
└── (optional helpers)    # compile-rules.ts, compile-hooks.ts, etc.
```

The Claude adapter has separate emitter files (agent-emitter.ts, skill-emitter.ts, rule-emitter.ts). New adapters MAY use a similar pattern if the compilation logic is complex enough to warrant separation, or keep it in a single file if simpler.

### 6. Hook Script Handling [auto-resolved]

**Decision:** Hook scripts (.sh files) are NOT rewritten per adapter. They use the same JSON stdio protocol across IDEs. Only the config format changes:

- Cursor: `.cursor/hooks.json` (same protocol as Claude)
- Windsurf: `.windsurf/hooks/README.md` + scripts (manual config, no project-level JSON)
- VS Code: `.github/hooks/{event}.json` (per-event JSON files)

Scripts are copied verbatim; only config/metadata files are adapter-specific.

## Scope Boundaries

- **IN SCOPE:** E01 (Cursor), E02 (Windsurf), E03 (VS Code) adapters + shared character budget utility
- **OUT OF SCOPE:** E04 compatibility report (Phase 2), build pipeline changes, new Adapter interface methods
- **DEFERRED:** Drift check expansion for new adapter output dirs (Phase 2 / future)

## Risk Notes

- Windsurf acquisition uncertainty: include `formatVersion` field for future-proofing
- VS Code hooks are Preview API: mark all hook output as unstable
- String transforms (rule compilation, event mapping) are hard to verify without tests — rely on typecheck + manual inspection
