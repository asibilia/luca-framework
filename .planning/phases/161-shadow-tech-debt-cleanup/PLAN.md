---
phase: 161
plan: 1
type: feature
autonomous: false
wave: 1
depends_on: []
---

# Phase 161 Plan 1: Shadow Tech Debt Cleanup System

## Objective

Build an automated detection and cleanup system for AI-session debris — orphaned temp scripts, misplaced domain files, scattered tool artifacts, dead exports, and stale planning artifacts. The system introduces a new scanning agent (`lu-shadow-scanner`), an interactive orchestration skill (`/shadow-cleanup`), Zod schemas for structured scan output, and workflow integration at two phase boundaries.

This plan is organized into two waves to respect the T0→T2 dependency ordering: schemas and registries land first so the agent and skill can import from them cleanly.

## Context

@src/shared/**schemas/tribunal.schemas.ts — pattern for a new shared schema file
@src/shared/index.ts — barrel to extend with shadow-scanner exports
@src/agents/**helpers/build-agent-registry.ts — where lu-shadow-scanner is registered
@src/agents/general/lu-router.agent.ts — agent config pattern to follow
@src/skills/**helpers/build-skill-registry.ts — where shadow-cleanup is registered
@src/skills/general/phase-discuss.skill.ts — skill config pattern with disable-model-invocation
@src/complexity/**helpers/model-routing.ts — FAST_PROMOTED preset and MODEL_ROUTING_TABLE location
@src/skills/general/phase-execute.skill.ts — integration point for Step 10.6
@src/skills/general/milestone-complete.skill.ts — integration point for Step 0.7
@.planning/config.json — config file to receive shadow_debt section
@.planning/phases/161-shadow-tech-debt-cleanup/161-CONTEXT.md — all design decisions

---

## Wave 1 — T0 Foundation: Schemas + Registry Wiring

### Task 1.1 — Create shadow-scanner schemas

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/shared/__schemas/shadow-scanner.schemas.ts` with three Zod schemas:

**`ShadowFindingSchema`** — per-finding record:

```typescript
z.object({
  category: z.enum([
    "orphaned-temp-script",
    "misplaced-file",
    "tool-artifact",
    "dead-export",
    "stale-planning-artifact",
  ]),
  severity: z.enum(["critical", "high", "medium", "low"]),
  file_path: z.string(),
  description: z.string(),
  recommendation: z.string(),
  auto_fixable: z.boolean().default(false),
});
```

**`ShadowScanReportSchema`** — full scan output:

```typescript
z.object({
  scan_mode: z.enum(["quick", "standard", "full"]),
  categories_scanned: z.array(z.number().int().min(1).max(5)),
  findings: z.array(ShadowFindingSchema).default([]),
  summary: z.object({
    total: z.number().int().default(0),
    critical: z.number().int().default(0),
    high: z.number().int().default(0),
    medium: z.number().int().default(0),
    low: z.number().int().default(0),
  }),
  scanned_at: z.string(), // ISO timestamp
});
```

**`ShadowDebtConfigSchema`** — config section shape:

```typescript
z.object({
  enabled: z.boolean().default(true),
  phase_scan_mode: z.enum(["quick", "standard", "full"]).default("quick"),
  milestone_scan_mode: z.enum(["quick", "standard", "full"]).default("full"),
  block_milestone_on_critical: z.boolean().default(true),
  allowlist: z
    .array(z.string())
    .default(["scripts/", ".planning/", "docs/", "packages/"]),
  denylist_patterns: z
    .array(z.string())
    .default([
      "test-*.ts",
      "debug-*.ts",
      "check-*.ts",
      "fix-*.ts",
      "temp-*",
      "tmp-*",
      "scratch-*",
    ]),
  known_good_script_dirs: z
    .array(z.string())
    .default(["scripts/", "src/hooks/scripts/", ".claude/hooks/"]),
  known_artifact_dirs: z
    .array(z.string())
    .default([".playwright-cli", ".next", ".turbo", ".cache", "coverage"]),
});
```

Export all three schemas plus their inferred types. Follow the JSDoc comment pattern from `tribunal.schemas.ts`.

**Files to create:**

- `src/shared/__schemas/shadow-scanner.schemas.ts`

**Verification:**

- File exists and `bunx --bun tsc --noEmit` passes
- All three schemas export correctly with no type errors

---

### Task 1.2 — Export schemas from shared barrel

**Type:** auto
**TDD:** false
**Depends on:** 1.1

Add a `Shadow Scanner Schemas` section to `src/shared/index.ts`, exporting the three schemas and their inferred types. Follow the section comment style already present in the barrel (e.g., `// ─── Tribunal Schemas ──`).

```typescript
// ─── Shadow Scanner Schemas ────────────────────────────────────────────────────

export {
  ShadowFindingSchema,
  ShadowScanReportSchema,
  ShadowDebtConfigSchema,
} from "./__schemas/shadow-scanner.schemas";
export type {
  ShadowFinding,
  ShadowScanReport,
  ShadowDebtConfig,
} from "./__schemas/shadow-scanner.schemas";
```

**Files to modify:**

- `src/shared/index.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Schemas are importable via `~/shared`

---

### Task 1.3 — Add lu-shadow-scanner to model routing table

**Type:** auto
**TDD:** false
**Depends on:** none

In `src/complexity/__helpers/model-routing.ts`, add `"lu-shadow-scanner"` to `MODEL_ROUTING_TABLE` using the `FAST_PROMOTED` preset. Place it alphabetically among the other `lu-*` entries.

```typescript
"lu-shadow-scanner": FAST_PROMOTED,
```

This gives the agent: fast at TRIVIAL/SIMPLE/MODERATE/COMPLEX, balanced at CRITICAL.

**Files to modify:**

- `src/complexity/__helpers/model-routing.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Entry is in alphabetical order with other `lu-*` agents

---

### Task 1.4 — Add shadow_debt section to config.json

**Type:** auto
**TDD:** false
**Depends on:** none

Add the `shadow_debt` top-level key to `.planning/config.json`, placed after the `muninn` section:

```json
"shadow_debt": {
  "enabled": true,
  "phase_scan_mode": "quick",
  "milestone_scan_mode": "full",
  "block_milestone_on_critical": true,
  "allowlist": ["scripts/", ".planning/", "docs/", "packages/"],
  "denylist_patterns": [
    "test-*.ts", "debug-*.ts", "check-*.ts", "fix-*.ts",
    "temp-*", "tmp-*", "scratch-*"
  ],
  "known_good_script_dirs": [
    "scripts/", "src/hooks/scripts/", ".claude/hooks/"
  ],
  "known_artifact_dirs": [
    ".playwright-cli", ".next", ".turbo", ".cache", "coverage"
  ]
}
```

Note: `.cursor/hooks/` is intentionally absent (removed in Phase 159).

**Files to modify:**

- `.planning/config.json`

**Verification:**

- JSON is valid (`bun -e "JSON.parse(require('fs').readFileSync('.planning/config.json','utf8'))"`)
- All keys from `ShadowDebtConfigSchema` are present

---

## Wave 2 — T2 Entity: Agent + Skill + Workflow Integration

### Task 2.1 — Create lu-shadow-scanner agent

**Type:** checkpoint:human-verify
**TDD:** false
**Depends on:** 1.1, 1.2, 1.3

Create `src/agents/general/lu-shadow-scanner.agent.ts` following the `createAgent` pattern from `lu-router.agent.ts`.

**Frontmatter:**

```typescript
{
  name: "lu-shadow-scanner",
  description: "Scans the repository for AI-session debris: orphaned temp scripts, misplaced files, tool artifacts, dead exports, and stale planning artifacts. Outputs a structured ShadowScanReport.",
  tools: ["Read", "Glob", "Grep", "Bash"],
  color: "yellow",
  cognition: {
    default_tier: "T1",
    promotable_to: "T2",
    memory_tags: ["shadow-debt", "repo-structure"],
  },
  context: {
    default_tier: "T1",
    promotable_to: "T2",
    isolation: "none",
  },
  background_spawnable: true,
  purpose: "auditor",
  allowed_contexts: ["any"],
}
```

**Sections to include:**

1. **`role`** — Agent is spawned by `/shadow-cleanup` or workflow hooks. Outputs structured `ShadowScanReport` JSON. Reads `shadow_debt` config from `.planning/config.json`. Respects `shadow-debt:kept` MuninnDB entries to avoid re-flagging user-approved files.

2. **`scan_modes`** — Three modes:
   - `quick`: Categories 1 + 3 (orphaned scripts + tool artifacts)
   - `standard`: Categories 1 + 2 + 3 + 5 (adds misplaced files + stale planning artifacts)
   - `full`: All 5 categories (adds dead export analysis)

   Scan depth maps by complexity: TRIVIAL/SIMPLE → quick, MODERATE → standard, COMPLEX/CRITICAL → full (or `phase_scan_mode` from config).

3. **`detection_logic`** — Per-category detection instructions:
   - **Cat 1 — Orphaned Temp Scripts**: Glob `test-*.ts`, `debug-*.ts`, `check-*.ts`, `fix-*.ts`, `temp-*`, `tmp-*`, `scratch-*` at all depths. Flag `.ts`/`.js` at repo root except `index.ts`. Check files outside known-good script dirs. Flag files with `// temporary`, `// TODO: remove`, `// debug` in first 5 lines.
   - **Cat 2 — Misplaced Files**: Glob domain roots for `.ts` files other than `index.ts`. Entity dirs for files not matching `{name}.{type-singular}.ts`. Schema files outside `__schemas/`. Helper files outside `__helpers/`.
   - **Cat 3 — Tool Artifacts**: Glob for `.playwright-cli/`, stray `node_modules/` subdirs (outside root), `coverage/` outside root, `.next/`, `.turbo/`, `.cache/`, `package-lock.json` or `yarn.lock` alongside `bun.lock`, `.env.local` files.
   - **Cat 4 — Dead Exports**: Grep import graph for `.ts` files unreferenced by any other file. Skip entry points, config files, barrel `index.ts` files, and `__schemas/`/`__helpers/` files.
   - **Cat 5 — Stale Planning Artifacts**: Read `.planning/todos/pending/` files. Cross-reference `.planning/ROADMAP.md` to find phases marked complete (✓). Flag pending todos whose phase is marked done. Recommend `move` to `.planning/todos/done/`.

4. **`muninn_integration`** — Before flagging a file, recall `shadow-debt:kept:{filepath}` from MuninnDB. If a kept entry exists, skip the finding. After scan, output summary engram concept as `metric:shadow-debt-phase-{N}`.

5. **`output_format`** — Return a `ShadowScanReport` JSON object matching `ShadowScanReportSchema`. Always end with the structured JSON block so callers can parse it reliably.

6. **`success_criteria`** — Checklist: config loaded, scan mode determined, MuninnDB kept-list recalled, each enabled category scanned, findings deduplicated, report JSON emitted.

**Files to create:**

- `src/agents/general/lu-shadow-scanner.agent.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Agent file follows `createAgent` pattern (compare structure to `lu-router.agent.ts`)
- All 5 detection categories are present in sections

---

### Task 2.2 — Register lu-shadow-scanner in agent registry

**Type:** auto
**TDD:** false
**Depends on:** 2.1

In `src/agents/__helpers/build-agent-registry.ts`:

1. Add import (alphabetically among other `lu-*` general agent imports):

```typescript
import { luShadowScannerAgent } from "../general/lu-shadow-scanner.agent";
```

2. Add registry entry (alphabetically among other `lu-*` entries):

```typescript
"lu-shadow-scanner": () => luShadowScannerAgent,
```

**Files to modify:**

- `src/agents/__helpers/build-agent-registry.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Import and entry are in alphabetical order

---

### Task 2.3 — Create shadow-cleanup skill

**Type:** checkpoint:human-verify
**TDD:** false
**Depends on:** 1.1, 1.2, 2.1, 2.2

Create `src/skills/general/shadow-cleanup.skill.ts` following the `createSkill` pattern from `phase-discuss.skill.ts`.

**Frontmatter:**

```typescript
{
  name: "shadow-cleanup",
  description: "Detect and interactively clean up AI-session debris: orphaned scripts, misplaced files, tool artifacts, dead exports, and stale planning artifacts.",
  "disable-model-invocation": true,
}
```

**Sections to include:**

1. **`main`** — Skill overview and argument signature:

   ```
   /shadow-cleanup [--quick|--full] [--fix] [--dry-run] [--category=<1-5>]
   ```

   - Default mode: `standard` (Categories 1+2+3+5)
   - `--quick`: Categories 1+3 only
   - `--full`: All 5 categories
   - `--dry-run`: Report only, no deletions or moves
   - `--fix`: Auto-apply fixable findings without interactive prompt
   - `--category=N`: Run only the specified category (1-5)

2. **`vault_resolution`** — Read `muninn.vault` from `.planning/config.json`. Set REPO_VAULT and DEFAULT_VAULT per standard Luca pattern.

3. **`execution_flow`** — Steps:
   - Step 1: Read and validate `shadow_debt` config from `.planning/config.json`. Parse with `ShadowDebtConfigSchema`.
   - Step 2: Determine scan mode from flags (--quick → quick, --full → full, else standard).
   - Step 3: Spawn `lu-shadow-scanner` via Task with mode, complexity, and config.
   - Step 4: Parse returned `ShadowScanReport`.
   - Step 5: Display findings banner:

     ```
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      Luca ► SHADOW DEBT SCAN RESULTS
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     Mode: {scan_mode} | Categories: {list} | Found: {total}

     CRITICAL ({n}) | HIGH ({n}) | MEDIUM ({n}) | LOW ({n})
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     ```

   - Step 6: If `--dry-run` or no findings → exit after display.
   - Step 7: If `--fix` → auto-apply all `auto_fixable: true` findings. Report actions taken.
   - Step 8: Interactive mode (default) — present each finding in severity order. For each: `[F] Fix | [K] Keep (add to MuninnDB allowlist) | [S] Skip | [A] Fix all remaining`. On Keep: store `shadow-debt:kept:{filepath}` in MuninnDB.
   - Step 9: Store scan metric in MuninnDB: `metric:shadow-debt-scan-{timestamp}` with finding counts.

4. **`success_criteria`** — Checklist: config loaded, scanner spawned and returned valid report, findings displayed, user actions processed or auto-fix applied, MuninnDB metric stored.

**Files to create:**

- `src/skills/general/shadow-cleanup.skill.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Skill follows `createSkill` pattern (compare structure to `phase-discuss.skill.ts`)
- All three modes (quick/standard/full) are documented
- Interactive flow covers [F/K/S/A] actions

---

### Task 2.4 — Register shadow-cleanup in skill registry

**Type:** auto
**TDD:** false
**Depends on:** 2.3

In `src/skills/__helpers/build-skill-registry.ts`:

1. Add import (near other `shadow*` or `s*` general skill imports):

```typescript
import { shadowCleanupSkill } from "../general/shadow-cleanup.skill";
```

2. Add registry entry:

```typescript
"shadow-cleanup": () => shadowCleanupSkill,
```

**Files to modify:**

- `src/skills/__helpers/build-skill-registry.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes

---

### Task 2.5 — Integrate shadow scan into phase-execute (Step 10.6)

**Type:** auto
**TDD:** false
**Depends on:** 2.1

Read `src/skills/general/phase-execute.skill.ts` to locate Step 10 (checkpoint cleanup) area. Insert Step 10.6 after checkpoint cleanup and before the final commit step.

**Step 10.6 content to add:**

````
## Step 10.6 — Shadow Debt Advisory Scan

Skip if `shadow_debt.enabled` is false in `.planning/config.json`.

Always runs at every complexity level. Scan depth varies by complexity:
- TRIVIAL/SIMPLE: quick (Categories 1+3)
- MODERATE: standard (Categories 1+2+3+5)
- COMPLEX/CRITICAL: per `shadow_debt.phase_scan_mode` config (default: full)

Spawn `lu-shadow-scanner` with determined mode:

```bash
SHADOW_ENABLED=$(cat .planning/config.json | bun -e "const c=JSON.parse(await Bun.stdin.text()); console.log(c.shadow_debt?.enabled ?? true)" 2>/dev/null || echo "true")
SCAN_MODE=$(...)  # resolve per complexity
````

If `SHADOW_ENABLED` is false, log "Shadow scan skipped (disabled in config)" and continue.

If findings exist, display summary banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► SHADOW DEBT ADVISORY ({n} findings: {c} critical, {h} high)
 Run /shadow-cleanup to review and fix.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Advisory only — never blocks phase completion. Store metric:
`metric:shadow-debt-phase-{phase_number}` in MuninnDB.

```

**Files to modify:**
- `src/skills/general/phase-execute.skill.ts`

**Verification:**
- `bunx --bun tsc --noEmit` passes
- Step 10.6 is clearly labeled and placed after Step 10 (checkpoint cleanup)
- Step is advisory (non-blocking) — phase continues regardless of findings

---

### Task 2.6 — Integrate shadow scan into milestone-complete (Step 0.7)
**Type:** auto
**TDD:** false
**Depends on:** 2.1

Read `src/skills/general/milestone-complete.skill.ts` to locate the stale memory pruning step (Step 0.x range). Insert Step 0.7 after stale memory pruning and before archival.

**Step 0.7 content to add:**

```

## Step 0.7 — Pre-Archive Shadow Debt Gate

Run full shadow scan before milestone archival. This step catches debris
accumulated across all phases in the milestone.

```bash
SHADOW_ENABLED=$(cat .planning/config.json | bun -e "const c=JSON.parse(await Bun.stdin.text()); console.log(c.shadow_debt?.enabled ?? true)" 2>/dev/null || echo "true")
BLOCK_ON_CRITICAL=$(cat .planning/config.json | bun -e "const c=JSON.parse(await Bun.stdin.text()); console.log(c.shadow_debt?.block_milestone_on_critical ?? true)" 2>/dev/null || echo "true")
```

Spawn `lu-shadow-scanner` with `full` mode.

If no CRITICAL findings: continue to archival.

If CRITICAL findings exist AND `block_milestone_on_critical` is true, display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► SHADOW DEBT GATE — {n} CRITICAL findings before milestone archive
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{findings list}

Actions:
  [F] Fix now — run /shadow-cleanup --full --fix
  [S] Skip    — note findings in milestone archive and proceed
  [A] Abort   — halt milestone completion
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Store metric: `metric:shadow-debt-milestone-v{version}` in MuninnDB.

```

**Files to modify:**
- `src/skills/general/milestone-complete.skill.ts`

**Verification:**
- `bunx --bun tsc --noEmit` passes
- Step 0.7 is clearly labeled and placed before archival
- [F/S/A] options are present for CRITICAL findings

---

## Verification

After all tasks complete:

1. **Type check:** `bunx --bun tsc --noEmit` — must pass with zero errors
2. **Drift check:** `bun run check:drift` — validates that compiled outputs under `dist/plugin/` include entries for `lu-shadow-scanner` and `shadow-cleanup`
3. **Schema check:** Confirm `ShadowScanReportSchema`, `ShadowFindingSchema`, `ShadowDebtConfigSchema` are importable from `~/shared`
4. **Registry check:** Confirm `lu-shadow-scanner` appears in agent registry and `shadow-cleanup` in skill registry
5. **Config check:** Confirm `shadow_debt` section is valid JSON in `.planning/config.json`
6. **Build:** User runs `bun run build:all` outside Claude Code session (per no-crash rule)

## Success Criteria

- `bunx --bun tsc --noEmit` passes with zero errors
- `bun run check:drift` passes (after build:all)
- `lu-shadow-scanner` agent compiles and exports correctly
- `shadow-cleanup` skill compiles and exports correctly
- `shadow_debt` config section is present and valid in `.planning/config.json`
- Phase-execute contains Step 10.6 (advisory, non-blocking)
- Milestone-complete contains Step 0.7 (pre-archive gate with [F/S/A] options)
- Model routing table has `lu-shadow-scanner` → FAST_PROMOTED

## Output Specification

**New files (3):**
- `src/shared/__schemas/shadow-scanner.schemas.ts`
- `src/agents/general/lu-shadow-scanner.agent.ts`
- `src/skills/general/shadow-cleanup.skill.ts`

**Modified files (7):**
- `src/shared/index.ts` — shadow-scanner barrel exports
- `src/agents/__helpers/build-agent-registry.ts` — lu-shadow-scanner registration
- `src/skills/__helpers/build-skill-registry.ts` — shadow-cleanup registration
- `src/complexity/__helpers/model-routing.ts` — FAST_PROMOTED entry for lu-shadow-scanner
- `src/skills/general/phase-execute.skill.ts` — Step 10.6 advisory scan
- `src/skills/general/milestone-complete.skill.ts` — Step 0.7 pre-archive gate
- `.planning/config.json` — shadow_debt section
```
