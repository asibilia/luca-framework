---
title: Shadow Tech Debt Cleanup System
area: agents/skills/workflow
created: 2026-03-14
source: conversation
---

## Context

AI agents during development sessions create "shadow tech debt" -- orphaned temporary scripts, files placed in wrong directories, scattered tool artifacts (`.playwright-cli/`, stray `node_modules/`), and dead/unused code. This debt accumulates silently because it doesn't trigger type errors or test failures. The industry calls this "automation debt" (Dataiku) or "the debt AI agents leave behind" (JetBrains).

Luca already has `lu-repo-architect` for convention enforcement, but it lacks targeted detection of agent-generated debris and workflow integration to catch it before milestones ship.

Reference articles:

- https://www.dataiku.com/stories/blog/shadow-ai-agents-automation-debt
- https://thenewstack.io/jetbrains-names-the-debt-ai-agents-leave-behind/
- https://logz.io/blog/rise-shadow-ai-tech-debt-tsunami/

## Task

Build a dedicated shadow tech debt cleanup system with 3 new components and 4 integration points.

### Files to Create

| File                                             | Purpose                                          |
| ------------------------------------------------ | ------------------------------------------------ |
| `src/shared/__schemas/shadow-scanner.schemas.ts` | Zod schemas for findings, reports, config        |
| `src/agents/general/lu-shadow-scanner.agent.ts`  | Scanner agent with 4-category detection logic    |
| `src/skills/general/shadow-cleanup.skill.ts`     | Interactive `/shadow-cleanup` orchestrator skill |

### Files to Modify

| File                                             | Change                                              |
| ------------------------------------------------ | --------------------------------------------------- |
| `src/shared/index.ts`                            | Add barrel exports for shadow scanner schemas       |
| `src/agents/__helpers/build-agent-registry.ts`   | Register lu-shadow-scanner                          |
| `src/skills/__helpers/build-skill-registry.ts`   | Register shadow-cleanup                             |
| `src/complexity/__helpers/model-routing.ts`      | Add lu-shadow-scanner -> FAST_PROMOTED preset       |
| `src/skills/general/phase-execute.skill.ts`      | Add Step 10.6: shadow scan after checkpoint cleanup |
| `src/skills/general/milestone-complete.skill.ts` | Add Step 0.7: shadow debt gate before archival      |
| `.planning/config.json`                          | Add `shadow_debt` configuration section             |

### Detection Categories

**Category 1 -- Orphaned Temp Scripts** (quick + standard + full)

- Glob for `test-*.ts`, `debug-*.ts`, `check-*.ts`, `fix-*.ts`, `temp-*`, `tmp-*`, `scratch-*` at any depth
- Shell scripts outside `src/hooks/scripts/`, `scripts/`, `.claude/hooks/`, `.cursor/hooks/`
- `.ts`/`.js` files at repo root (only `index.ts` should be there)
- Files with `// temporary`, `// TODO: remove`, `// debug` comments at the top

**Category 2 -- Misplaced Files** (standard + full)

- `.ts` files in domain roots other than `index.ts` (per structural invariant)
- Entity files not matching `{name}.{type-singular}.ts` pattern in entity dirs
- Schema files outside `__schemas/`
- Helper files outside `__helpers/`

**Category 3 -- Scattered Tool Artifacts** (quick + standard + full)

- `.playwright-cli/` directories anywhere
- `node_modules/` in unexpected subdirectories
- `coverage/` directories outside root
- `.next/`, `.turbo/`, `.cache/`, `.parcel-cache/` in unexpected places
- Stray lock files (`package-lock.json`, `yarn.lock`) alongside `bun.lock`
- `.env.local`, `.env.*.local` files

**Category 4 -- Dead Exports & Unused Code** (full only)

- Files not imported by any other `.ts` file (Grep-based import graph)
- Empty barrel files (index.ts with 0 exports)
- Skip: files that are entry points, test fixtures, or config files

**Category 5 -- Stale Planning Artifacts** (standard + full)

- Pending todos (`.planning/todos/pending/`) whose corresponding roadmap phases are marked complete (✓)
- Suggested action: `move` to `.planning/todos/done/`
- Severity: `medium` (stale state, not harmful but misleading)
- Auto-fixable: `true` (safe to move to done/)

### Agent Design

- **Name**: `lu-shadow-scanner`
- **Purpose**: `auditor`
- **Tools**: `Read`, `Glob`, `Grep`, `Bash`
- **Cognition**: T1 (memory-reader) -> promotable to T2. Memory tags: `["shadow-debt", "repo-structure"]`
- **Context**: T1 -> T2, isolation: `none`
- **Background spawnable**: `true`
- **Model routing**: `FAST_PROMOTED` (fast everywhere, balanced at CRITICAL)
- **Output**: Structured JSON conforming to `ShadowScanReportSchema`
- **MuninnDB integration**: Recall past `shadow-debt:kept` entries to avoid re-flagging user-approved files

### Skill Design

- **Name**: `shadow-cleanup`
- **Orchestrator**: `"disable-model-invocation": true`
- **Arguments**: `[--quick|--full] [--fix] [--dry-run] [--category=<cat>]`
- Delegates to `lu-shadow-scanner`, displays structured report, supports auto-fix mode
- Stores findings in MuninnDB for trend tracking

### Workflow Integration

**Phase-Execute (Step 10.6)** -- after checkpoint cleanup, before final commit:

- Skip only if `shadow_debt.enabled` is false (explicit user opt-out)
- Always runs at every complexity level (complexity controls scan depth, not whether it runs -- per remove-complexity-step-gating principle)
- Scan depth varies by complexity: TRIVIAL/SIMPLE use `quick`, MODERATE uses `standard`, COMPLEX/CRITICAL use config `phase_scan_mode`
- Advisory only (non-blocking)
- Display summary banner if findings exist
- Store metric: `metric:shadow-debt-phase-{N}`

**Milestone-Complete (Step 0.7)** -- after stale memory pruning, before archival:

- Full scan, gates on critical findings if `block_milestone_on_critical` is true
- Options: [F] Fix now, [S] Skip (note in archive), [A] Abort
- Store metric: `metric:shadow-debt-milestone-v{version}`

### Config Schema

```json
{
  "shadow_debt": {
    "enabled": true,
    "phase_scan_mode": "quick",
    "milestone_scan_mode": "full",
    "block_milestone_on_critical": true,
    "allowlist": ["scripts/", ".planning/", "docs/", "packages/"],
    "denylist_patterns": [
      "test-*.ts",
      "debug-*.ts",
      "check-*.ts",
      "fix-*.ts",
      "temp-*",
      "tmp-*",
      "scratch-*"
    ],
    "known_good_script_dirs": [
      "scripts/",
      "src/hooks/scripts/",
      ".cursor/hooks/",
      ".claude/hooks/"
    ],
    "known_artifact_dirs": [
      ".playwright-cli",
      ".next",
      ".turbo",
      ".cache",
      "coverage"
    ]
  }
}
```

### Implementation Waves

1. **Wave 1**: Schemas in `src/shared/__schemas/shadow-scanner.schemas.ts` + barrel exports
2. **Wave 2**: Agent `lu-shadow-scanner` + registry + model routing
3. **Wave 3**: Skill `shadow-cleanup` + registry
4. **Wave 4**: Config section in `.planning/config.json`
5. **Wave 5**: Integration into phase-execute (Step 10.6) and milestone-complete (Step 0.7)
6. **Wave 6**: User runs `bun run build:all` outside Claude Code session

## Notes

- Scanner is an agent (not a hook) because it needs LLM judgment and multi-step repo-wide reasoning
- Complements lu-repo-architect without overlapping -- focused on AI-session debris specifically
- Full plan file at `.claude/plans/unified-noodling-glacier.md` has complete schema definitions and detailed integration points
- Per no-tests rule: verification uses `bunx --bun tsc --noEmit` and manual `/shadow-cleanup --quick` test
