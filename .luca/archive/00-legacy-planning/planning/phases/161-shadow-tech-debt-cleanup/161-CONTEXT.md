# Phase 161 Context: Shadow Tech Debt Cleanup System

## Decision 1: Scanner Agent Design [researched]

**Decision:** Create `lu-shadow-scanner` as a lightweight scanning agent in `src/agents/general/`. It detects 5 categories of AI-generated debris:

1. Orphaned temporary scripts (_.tmp.ts, _.bak.ts, debug-\*.ts)
2. Misplaced files (files in wrong domain directories per tier rules)
3. Tool artifacts (.playwright-cli/, stray node_modules/, .turbo/)
4. Dead exports and unused code (full import graph analysis — gate to COMPLEX+ or milestone scans)
5. Stale configuration entries (references to deleted files/paths)

The agent outputs a structured `ShadowScanReport` matching the schema.

## Decision 2: Skill Design [researched]

**Decision:** Create `/shadow-cleanup` skill in `src/skills/general/shadow-cleanup.skill.ts`. It orchestrates the scanner agent and presents findings interactively:

- `--quick` mode: Categories 1-3 only (fast, no import analysis)
- `--full` mode: All 5 categories (slower, full codebase scan)
- `--dry-run` mode: Report only, no deletions
- Interactive cleanup: present findings, user approves/skips each

## Decision 3: Workflow Integration [researched]

**Decision:** Two integration points:

1. **phase-execute Step 10.6**: Run shadow scan after phase checkpoint (advisory, non-blocking). Display banner with findings count. Gate: `shadow_debt.enabled` config flag.
2. **milestone-complete Step 0.7**: Run shadow scan before milestone archive. If CRITICAL findings, warn but don't block (milestone completion is the user's decision).

## Decision 4: Schema Location [researched]

**Decision:** New file `src/shared/__schemas/shadow-scanner.schemas.ts` containing:

- `ShadowScanReportSchema` — Zod schema for scan output
- `ShadowFindingSchema` — per-finding with category, severity, file path, recommendation
- `ShadowDebtConfigSchema` — config section schema

Export from `src/shared/index.ts` barrel.

## Decision 5: Model Routing [researched]

**Decision:** Add `lu-shadow-scanner` to the `FAST_PROMOTED` preset in `src/complexity/__helpers/model-routing.ts`. This means:

- TRIVIAL/SIMPLE/MODERATE/COMPLEX: fast (haiku) — scanning doesn't need deep reasoning
- CRITICAL: balanced (sonnet) — promoted for critical phases

## Decision 6: Config Section [researched]

**Decision:** Add `shadow_debt` section to `.planning/config.json`:

```json
{
  "shadow_debt": {
    "enabled": true,
    "quick_scan_categories": [1, 2, 3],
    "full_scan_categories": [1, 2, 3, 4, 5],
    "known_good_dirs": [".claude/hooks/", "dist/", "node_modules/"],
    "ignore_patterns": ["*.d.ts", "*.map"]
  }
}
```

Note: `.cursor/hooks/` is NOT included (removed in Phase 159).

## Scope

- 3 new files: schema, agent, skill
- 7 modified files: shared barrel, agent registry, skill registry, model routing, phase-execute skill, milestone-complete skill, config.json
- NO changes to existing hook infrastructure
- NO changes to observer

## Verification

- `bunx --bun tsc --noEmit` — validates new schemas, agent, skill compile
- `bun run check:drift` — validates compiled agent/skill outputs include new entries
