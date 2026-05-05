# Research: Pipeline Artifact Storage Refactor (`.planning/phases/<slug>/`)

## Summary

Refactor moves all session artifacts from top-level `.planning/` into per-phase subdirectory `.planning/phases/<phaseSlug>/`. Triage derives slug, persists in `luca-state.json`, all 6 pipeline phases (and their tools) consume it. Cross-phase state (`luca-state.json`, `ROADMAP.md`, `todos/`, JSONL audit logs, `runs/<runId>/`) stays at root. Finalize verifies cleanup; migration helper handles legacy repos.

**Mechanically feasible but high diffusion**: 42 files / 177 hardcoded `.planning/<file>` references in `packages/luca-mastracode/src/`. **No shared path-resolution helper exists.** Refactor must introduce one and migrate every consumer.

## Scope

**Core target:** `packages/luca-mastracode/src/`

**Tools that write to `.planning/`** (must route via helper):
- `write-planning-file.ts` — generic writer (lines 61-64 contain canonical `planningDir`)
- `manage-roadmap.ts:94-97` — direct `node:fs` bypass writes ROADMAP.md (stays at root, but bypass is debt)
- `pipeline-lock.ts:11`, `check-convergence.ts:11`, `confidence-journal.ts`, `run-postmortem.ts`, `run-rules.ts`, `repo-cleanup.ts:165-166`, `manage-todos.ts:82`, `claim-verifier.ts:31,69`, `verification-result.ts`, `session-ledger.ts`, `workflow-state.ts:312,318`

**State modules:** `state/luca-store.ts:18`, `state/session-ledger.ts:26-31`, `state/verification-result.ts:79`, `state/confidence-journal.ts`, `state/todos.ts:59`

**Instruction `.md` prompts** (LLM cannot import constants — text-update needed): `instructions/{triage,research,architect,execute,review,finalize,build}.md`

**Subagents:** `subagents/shadow-scanner.ts:23,41` (config.json reads — root, no change)

**Docs:** `AGENTS.md`, `CLAUDE.md`, `docs/getting-started.md`, `docs/troubleshooting.md`, package READMEs

**Blast radius: HIGH** — diffuse string literals, no abstraction, instruction prompts can't be DRY'd.

## Architecture

**Current (no abstraction):** Every module computes `join(process.cwd(), '.planning', ...)` independently.

**Proposed:** New module `packages/luca-mastracode/src/util/phase-paths.ts`:

```typescript
planningRoot(): string                                 // .planning/
slugifyPhaseName(name: string): string                 // "Phase 1: Setup" → "phase-1-setup"
parseTicketId(intent: string): string | null           // extract PT-11089 etc.
deriveSlug(intent: string, phaseName?: string): string // ticket-id-kebab OR YYYYMMDD-HHmm-kebab
phaseDir(slug?: string): string                        // root if slug undef, else phases/<slug>/
phasePath(filename: string, slug?: string): string     // mkdir + join
const STATE_PATH, LOCK_PATH, ROADMAP_PATH, TODOS_ROOT, LEDGER_PATH, RUNS_ROOT
```

**`luca-state.json` schema** (luca-store.ts:51-103) is **extensible** (`[key:string]: unknown`). Adding `currentPhaseSlug?: string` is non-breaking. Existing fields `planFile?`, `roadmapFile?` already store path strings — same indirection pattern.

**Run vs Phase** (orthogonal):
- `runId` (`run_<ts>_<rand>`): pipeline invocation; stamps JSONL; `runs/<runId>/` archive
- `phaseSlug`: ROADMAP delivery unit within a run; multiple per run

**Slug derivation point:** Per issue #220, **triage** derives slug. But ROADMAP phases (and thus per-phase slugs) only exist after architect runs. Decision needed: one slug per *session* (derived from intent at triage time) vs one slug per *ROADMAP phase* (derived at start-phase time).

→ **Recommendation:** **Session-scoped slug** at triage. Single phaseSlug per pipeline invocation captures all artifacts for that session. Multi-phase ROADMAP runs share the slug (artifacts namespaced by filename: `REVIEW-1.md`, `REVIEW-2.md` etc.). This matches issue #220 wording: triage derives slug, all phases use it.

## Patterns

**Reusable:** `packages/luca-framework/src/utils/vault-setup.ts:108` `sanitizeVaultName()` — exact slug semantics needed (lowercase, non-alphanum→dash, collapse, trim). Either re-export or copy.

**Missing:** No ticket-ID parser. Add `parseTicketId(intent: string)` regex `/\b([A-Z]{2,}-\d+)\b/`.

**Missing:** No date format helper. Native `Date` works:
`${YYYY}${MM}${DD}-${HH}${mm}` via `getFullYear()/padStart(2,'0')`.

**fs:** Native `node:fs` sync APIs. `mkdirSync({recursive:true})` standard.

**State field naming:** camelCase. Existing: `currentPhase`, `currentPhaseName`, `currentWave`. **New:** `currentPhaseSlug` (consistent prefix).

**Tool error pattern:** `{success: bool, message: string}`. Catch fs errors via `code` (EACCES/EPERM/EISDIR/ENOENT).

## Dependencies

**Cross-package:** luca-mastracode depends on @luca-framework (vault-setup reusable). luca-studio likely reads luca-state.json and todos/ for UI but probably not phase artifacts (verify).

**Config:** `.planning/config.json` (per-repo; **stays at root**) read by triage.md, finalize.md, shadow-scanner.ts.

**Skills coupling:** `.mastracode/skills/gh-prepare/` likely references PR-BODY.md / POSTMORTEM.md. `.mastracode/skills/gh-issue-triage/` references `.planning/todos/` (root, no change).

**MCP tools:** All defined via `@mastra/core/tools` `createTool()`. Schema changes propagate to tool descriptors automatically.

**gitignore:** Verify `.planning/phases/` handling (likely covered by existing `.planning/` ignore).

## Risks

**Top 5 (severity × confidence):**

1. **Hardcoded path string missed** in one of 42 files → artifact writes to root → finalize stragglers detector blocks lock release. **HIGH/HIGH.** Mitigation: chokepoint helper, exhaustive grep, test fixture asserting no `.planning/<KNOWN-ARTIFACT>` literals remain in src/.
2. **Unsafe slug** (path traversal) from raw intent. **HIGH/HIGH.** Mitigation: reuse `sanitizeVaultName()` pattern; alphanum+dash only.
3. **Finalize stragglers false positives** — `luca-state.json`, lock, JSONL files at root are valid runtime state, not stragglers. **HIGH/HIGH.** Mitigation: explicit whitelist of root-permitted filenames + extensions.
4. **In-flight runs at upgrade** lack phaseSlug → consumers must tolerate undefined. **HIGH/HIGH.** Mitigation: `phasePath(file, undefined) === planningRoot/file` fallback. Finalize lenient when slug absent.
5. **manageRoadmap fs bypass** — must update separately or path helper won't catch it. **MED/HIGH.** Mitigation: explicit task to refactor manageRoadmap.

**Other risks (med):** slug instability across re-entry; concurrent migration helper vs active pipeline (lock check); repoCleanup flat-only scan; instruction `.md` prompts have hardcoded strings.

## Recommendations

**For Architect:**

1. **Create helper module first** (`util/phase-paths.ts`) — single source of truth.
2. **Add `currentPhaseSlug` field** to LucaWorkflowState; populate in `save-triage-results` action.
3. **Slug derivation algorithm:**
   ```
   1. Try parseTicketId(intent) → "PT-11089"
   2. Append slugify(short-intent up to ~40 chars)
   3. If no ticket: prefix YYYYMMDD-HHmm + slugify(short-intent)
   4. Sanitize result via vault-setup pattern
   5. Check `.planning/phases/<slug>/` collision; append `-2/-3` if occupied
   ```
4. **Migrate consumers in topological order:** writePlanningFile → state modules → tools → instructions. Each consumer accepts optional slug from state, falls back to root.
5. **Finalize stragglers detector:** whitelist `luca-state.json`, `.luca-lock.json`, `config.json`, `ROADMAP.md`, `todos/`, `*.jsonl`, `runs/`, `phases/`, `config.json` at root. Anything else = straggler.
6. **Migration helper** `luca archive-loose` (or new tool action): scan root for stragglers, derive retro slug from latest state, move files. Refuse if pipeline lock active.
7. **Documentation updates:** `AGENTS.md`, `CLAUDE.md`, instructions, package README.
8. **Test plan:** unit tests for phase-paths (slug, sanitization, collision); integration test for full pipeline with slug present; integration test with `phaseSlug` undefined (legacy compat); finalize stragglers detector tests.
9. **Phased rollout:** ship in waves — (W1) helper + state field; (W2) writer/state migration; (W3) tools; (W4) instructions + docs; (W5) migration helper + finalize detector.

## Open Questions

1. **Session-slug vs phase-slug** — Issue #220 says "triage derives phaseSlug". Is one slug per pipeline session sufficient (recommended), or one per ROADMAP phase? Multi-phase ROADMAPs would produce e.g. `phases/PT-11089-feature-x/` with `REVIEW-1.md`, `REVIEW-2.md` namespaced by filename. **Recommend: session-scoped.**
2. **Slug immutability** — once written to state, never recompute. Confirm with architect.
3. **runs/<runId>/ vs phases/<slug>/** — both per-session. Should `runs/<runId>/` move under `phases/<slug>/runs/<runId>/` (issue #220 ASCII tree shows this) or stay at root? Issue's tree shows it nested under phase. **Recommend: nest under phase.**
4. **luca-studio coupling** — does Studio render phase artifacts? If yes, needs slug-aware paths.
5. **Skills** — gh-prepare PR body. Does it cite POSTMORTEM.md path? Update if so.

## Quality Self-Assessment

- **Accuracy:** Architecture findings verified against actual file:line references. Patterns/scope/deps/risk supplemented from primary-agent grep where subagents returned only progress narration.
- **Completeness:** All 5 dimensions covered. Open questions explicitly flagged.
- **Actionability:** Concrete helper module proposal, ordered rollout, slug algorithm spec, test plan.

**Status:** GRADUATE — pass on all 3 dimensions. Iteration 1/N. No additional research needed; remaining unknowns are architect decisions.
