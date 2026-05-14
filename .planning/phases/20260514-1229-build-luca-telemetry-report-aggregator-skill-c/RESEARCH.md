# Research: Telemetry Batch — Aggregator Skill + 8 Cluster Fixes

## Summary

Telemetry foundation (PR #239) is mature: appendTelemetry fail-safe, finiteOrNull/clampTokens helpers, namespace-import spy pattern, open TelemetryKind union. The 9-todo batch splits into: **#43 aggregator skill** (NEW skill template available — mirror memory-audit/SKILL.md), **#44 janitor** (zero implementation, simple renameSync best-effort), **#45 record-recall + #46 review-iteration + #29 outcome enum** (additive schema extensions), **#10 subagent durationMs** (architecturally unfixable real-time — re-scope into aggregator), **#11 correlationId audit** (false-green tests, need PR #247-style scoped regions on 4 files), **#17 trivial doc fix**, **#18 already closed by PR #247**.

## Scope

### Files affected (by todo)

**#43 aggregator (NEW files)**
- `packages/luca-mastracode/skills/luca-telemetry-report/SKILL.md`
- `packages/luca-mastracode/commands/luca-telemetry-report.md`

**#44 janitor**
- MOD `src/tools/workflow-state.ts` reset-pipeline case (best-effort archive)
- MOD `src/util/phase-paths.ts` add `TELEMETRY_ARCHIVE_PATH(runId)` + `TELEMETRY_ARCHIVE_DIR()`
- MOD `src/shadow-scanner.ts` planning_root_dirs += 'archive' (or telemetry covers it)

**#45 record-recall**
- MOD `src/tools/workflow-state.ts` (new action: schema + switch case + flat schema mirror)
- MOD `src/state/telemetry.ts` TelemetryKind union += 'recall.hit', 'recall.miss'
- MOD `src/tools/tool-manifest.ts` allowlist 'record-recall' for 6 modes
- MOD instruction files: triage.md, architect.md, execute.md, review.md, finalize.md (NOT research.md — zero recall callsites)

**#46 review-iteration convergence**
- MOD `src/state/luca-store.ts` add `reviewStartedAt?: string`
- MOD `src/state/state.ts` lucaStateSchema include reviewStartedAt
- MOD `src/tools/workflow-state.ts` save-review-results extension (perspectives array) + switch-mode set reviewStartedAt + reset-pipeline + re-enter-pipeline clear
- MOD `src/state/telemetry.ts` TelemetryKind += 'review.iteration'
- MOD `src/instructions/review.md` save-review-results call with perspectives

**#10 subagent durationMs (re-scoped)**
- Absorbed into #43 aggregator — compute `Date.parse(complete.ts) - Date.parse(invoke.ts)` as fallback when orchestrator durationMs null

**#11 correlationId format audit**
- MOD `src/instructions/execute.md`, `architect.md`, `research.md`, `finalize.md` if any use compact-ISO or `<ts>` placeholder
- MOD `src/__tests__/subagent-telemetry-prose.test.ts` add PR #247-style scoped region tests for each spawn-site file

**#17 finalize vault hardcode**
- MOD `src/instructions/finalize.md` line ~52 (doc fix only)

**#18 already closed** — verify PR #247 covers; no work needed unless gap found

**#29 outcome enum**
- MOD `src/tools/workflow-state.ts` recordSubagentAction schema += `outcome` enum in meta (NOT top-level — v:1 schema locked)
- MOD shared-prefix.ts usage instruction (optional outcome field in `<!-- usage -->` comment)

### High fan-in files
- `src/tools/workflow-state.ts` — 4 todos touch it
- `src/state/telemetry.ts` — 3 todos touch it
- `src/instructions/*.md` — 5 files touched across #11, #17, #45, #46

### Out of scope
- harness/ — read-only
- skills/* except new luca-telemetry-report — preserve existing memory-audit/luca-init
- Existing telemetry corpus migration — none exists yet (lazy-created)

## Architecture

### TelemetryRecord v:1 LOCKED (telemetry.ts:89-112)
- 11 typed top-level fields + `meta: Record<string, unknown>` bag
- TelemetryKind union OPEN (`string & {}` fallback) — new kinds zero-change
- Rule: **add to meta, never top-level** for v:1 compatibility

### workflow-state.ts canonical patterns
- Flat z.object input schema (Anthropic API requires `{type:"object"}`)
- Per-action strict z.object via `parseAction(schema, raw)` L508-519
- `WORKFLOW_STATE_ACTIONS` const array L281-297 — extend FIRST when adding action
- `durationMs` always in overrides (3rd arg), never in meta
- Pre-mutation context capture before state writes
- Post-await merged writes for timestamps (PR #240 pattern)

### Subagent durationMs reality
- NO `run-subagent.ts`, NO in-process Map
- Orchestrator LLM captures `const ts = Date.now()` + computes `Date.now() - ts` post-return
- Real CPU time NOT recoverable orchestrator-side
- Aggregator fallback: `Date.parse(complete.ts) - Date.parse(invoke.ts)` from JSONL

### reviewStartedAt — does NOT exist
- Zero matches in codebase
- Add following currentModeStartedAt pattern (luca-store.ts:109-120)
- Lifecycle: set in switch-mode AFTER await (luca:5-review only), clear in reset-pipeline + re-enter-pipeline

### Aggregator skill template (skills/memory-audit/SKILL.md)
- YAML frontmatter → scope guard → forbidden-tools fence → canonical rules → arguments + pre-flight validation → state file schema → 7 numbered steps → failure modes
- Reports under `.planning/telemetry/reports/<ISO>.md`
- Streaming pattern: enumerate JSONL → per-file readTelemetry → aggregate in-memory → write report

## Patterns

### New action schema template (record-recall, mirror record-subagent)
```typescript
const recordRecallAction = z.object({
    action: z.literal('record-recall'),
    query: z.string().min(1).max(512).regex(/^[^\r\n\t]+$/, 'no CR/LF/tab'),
    resultCount: z.number().int().nonnegative().nullable().optional(),
    verifiedCount: z.number().int().nonnegative().nullable().optional(),
    vault: z.string().max(64).regex(/^[a-z0-9_-]+$/).optional(),
    mode: z.string().max(64).regex(/^[a-z0-9:_-]+$/).optional(),
    durationMs: z.number().nullable().optional(),
})
```
Kind dispatch: `resultCount > 0 → recall.hit`, else `recall.miss`. verifiedCount clamped to `Math.min(verifiedCount, resultCount)`.

### Test patterns
- Namespace import + `spyOn(fs, ...)` for ESM compatibility
- `beforeEach`: `mockClear().mockReturnValue(undefined)`
- Lettered sub-tests (a)–(h) for action variants
- Region-scoped prose tests with negative assertions:
```typescript
const step4Region = content.slice(startIdx, nextHeadingIdx)
expect(step4Region).toContain('const ts = Date.now()')
expect(step4Region).not.toMatch(/<ts>/)
expect(step4Region).not.toMatch(/\d{10,}/) // hardcoded epoch
```
- Fence-split regression test: split on triple-backtick, filter odd indices, assert directive NOT inside

### Skill structure (luca-telemetry-report)
Mirror memory-audit/SKILL.md (~250 lines):
1. YAML frontmatter
2. Scope guard FIRST
3. `<!-- forbidden-tools-list-start/end -->` block (forbids workflowState, muninn_remember, write_file outside reports/)
4. Step 1: Pre-flight arg validation (--runs N default 10, --since ISO regex `^\d{4}-\d{2}-\d{2}`, --vault regex `^[a-z0-9_-]+$`)
5. Step 2: Enumerate JSONL (`find .planning/telemetry -maxdepth 1 -name '*.jsonl'`)
6. Step 3+4 merged: Streaming aggregation (read → parse → bucket by kind/run/mode)
7. Step 5: Compute durationMs fallback (orchestrator value > ts gap)
8. Step 6: Write 6-section markdown to `.planning/telemetry/reports/<ISO>.md`
9. Step 7: Summary stdout

6 report sections: run inventory, mode durations, subagent costs (incl. durationMs fallback), recall stats, review convergence, cross-run trends.

### Anti-patterns
- ❌ z.discriminatedUnion (Anthropic API rejects)
- ❌ ISO/UUID correlationIds (use `<role>-${Date.now()}`)
- ❌ write_file on existing files (corruption confirmed multi-session) — use Python read→modify→write
- ❌ named-import spyOn (ESM bindings immutable) — use `import * as fs`

## Dependencies

### Telemetry corpus
- `.planning/telemetry/` does NOT exist yet — first appendTelemetry creates lazily
- Zero JSONL files anywhere
- Aggregator MUST handle existsSync false → empty report, no throw

### Versions (root catalog)
- `zod`: ^4.3.6 — uses `z.iso.datetime()` natively
- `@mastra/core`: ^1.31.0
- No peer dep issues

### Tool manifest gap
- `record-recall` absent from ALL 6 pipeline modes — needs adding
- `record-subagent` already in research mode (brief claim was stale)
- Triage gets `record-recall` for Step 1.5 lookup (1 callsite at L70)

### muninn_recall callsites (research.md has 0)
- triage(1), research(0), architect(2), execute(2), review(1), finalize(3)
- Prose for record-recall NOT needed in research.md

### shared-prefix.ts
- `<!-- usage -->` instruction at line 27
- Budget <400 tokens — do NOT bloat
- New protocol prose belongs in mode instruction files

## Risks

### Ranked (highest first)

| # | Todo | Severity | Issue | Mitigation |
|---|------|----------|-------|-----------|
| 1 | #10 | 🔴 BLOCKER | Architecturally unfixable real-time | **Re-scope**: compute at aggregator from ts gap; absorb into #43 |
| 2 | #46 | 🔴 HIGH | reviewStartedAt absent from schema | Add to LucaWorkflowState + state.ts + reset/re-enter clears + finiteOrNull guard |
| 3 | #44 | 🟠 HIGH | Zero impl; ENOENT on archive dir | Best-effort try/catch around renameSync + mkdirSync({recursive:true}) before |
| 4 | #43 | 🟠 HIGH | Memory blow on large corpus; readdirSync throws on absent dir | existsSync guard; streaming aggregation |
| 5 | #45 | 🟡 MEDIUM | Schema max-length tightness; vault regex | Match record-subagent caps (.max(512)/.max(64)); CWE-117 regex on query |
| 6 | #11 | 🟡 MEDIUM | False-green tests on 4 spawn-site files | PR #247-style scoped region + negative assertions per file |
| 7 | #29 | 🟡 MEDIUM | Backward compat | Put `outcome` in meta, NOT top-level (v:1 locked); aggregator handles both |
| 8 | #17 | 🟢 LOW | Trivial doc fix | One-line update |
| 9 | #18 | ✅ CLOSED | Already resolved by PR #247 | Verify regression tests cover both reviewer-dx + reviewer-simpl perspectives |

### Cross-cutting
- **Branch wrong**: `fix/review-outer-reviewer-fanout-success-false` — fresh branch off main required
- **write_file corruption confirmed multi-session** — use Python read→modify→write for any existing file edits
- **ESM named-import spy ineffective** — all new tests use namespace import
- **shadow-scanner.ts**: planning_root_dirs already covers 'telemetry'; verify 'reports' subdir handling

### Security
- Path traversal: assertValidRunId enforces strict regex — janitor MUST call before constructing paths
- Log injection: record-recall query field MUST have `[^\r\n\t]+` regex + sanitizeLogMessage in return message
- meta JSON.stringify neutralizes CR/LF — safe

## Recommendations

### For Architect
1. **Re-scope #10**: absorb into #43 aggregator skill as named column "durationMs (orchestrator | ts-gap fallback)". Close #10 as standalone.
2. **Verify #18 closed**: check PR #247 regression tests cover both reviewer-dx + reviewer-simpl. If yes, mark done without code change.
3. **Wave ordering** (suggested):
   - Wave 1: foundation (#46 reviewStartedAt schema, #45 record-recall schema, #29 outcome in meta, #44 janitor) — all touch workflow-state.ts
   - Wave 2: prose (#11 correlationId audit, #17 finalize vault, #45 mode instruction prose, #46 review.md perspectives)
   - Wave 3: NEW aggregator skill (#43) — depends on Wave 1 kinds being in TelemetryKind union
   - Wave 4: tests (region-scoped prose, lettered action sub-tests, janitor best-effort, aggregator zero-corpus)
4. **TelemetryKind additions**: `recall.hit`, `recall.miss`, `review.iteration` — add to union string literal for IDE autocomplete (Zod accepts any string anyway).
5. **Fresh branch**: `feat/telemetry-batch-completion` off main. Single PR with all 9 (or split #43 aggregator into separate PR if reviewer prefers).

### Aggregator skill design points
- Step 2 directory enumeration must use `existsSync(TELEMETRY_DIR()) || return empty-report`
- Streaming: process one JSONL at a time, aggregate counters, never load full corpus
- Report filename: `report-YYYY-MM-DDTHH-MM-SS-mmmZ.md` (system time, dashes for colons)
- Forbidden-tools fence: muninn_remember/forget/evolve/state/consolidate + workflowState (read-only skill)
- 6 report sections (run inventory, mode durations, subagent costs, recall stats, review convergence, cross-run trends)

## Open Questions

1. **#29 outcome enum placement**: `meta.outcome` (v:1 safe) vs new top-level field (v:2 break)? Recommendation: meta — aggregator handles old/new mixed records.
2. **#10 standalone close vs absorb**: confirm with user that re-scoping into aggregator is acceptable, or split as separate "subagent timing precision" todo deferred indefinitely.
3. **#18 verification needed**: read PR #247 final diff to confirm both reviewer-dx + reviewer-simpl perspectives covered, OR include drive-by reinforcement in this batch.
4. **Janitor scope**: archive on `reset-pipeline` only, or also on `re-enter-pipeline`? Latter mid-pipeline may be unwanted (current run's data is still live).
5. **Aggregator state file**: needed for resumable cursor (memory-audit pattern) or stateless (single-shot read-aggregate-write)? Recommendation: stateless. Cursor only useful if corpus grows beyond memory.
