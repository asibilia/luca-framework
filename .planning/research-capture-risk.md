# Research Capture — Risk

**Subagent**: researcher (returned narration only; supplemented)
**Perspective**: risk
**Timestamp**: 2026-05-05

## Findings

### Risk Matrix (top 10, ranked)

| # | Risk | Severity | Confidence | Mitigation |
|---|---|---|---|---|
| 1 | **Hardcoded path string missed** in one of 42 files → artifact silently writes to root, finalize blocks lock release | HIGH | HIGH | Single chokepoint helper `phasePath()`; comprehensive grep + tests; finalize stragglers report |
| 2 | **Slug derivation produces unsafe string** (path traversal `../`, null bytes, absolute path fragments) | HIGH | HIGH | Use `sanitizeVaultName()` pattern: lowercase, alphanum+dash only, collapse, trim. Never trust raw intent. |
| 3 | **Slug collision under concurrent runs** | MED | MED | Pipeline lock already serializes runs (one active at a time). Collision = same logical phase reattempted, append `-2/-3` only when prior dir non-empty. |
| 4 | **In-flight run at upgrade**: state has no phaseSlug → consumers crash | HIGH | HIGH | Helper falls back to root when `phaseSlug === undefined`. Tested by writing migration helper. |
| 5 | **Re-entry into pipeline** (re-research / re-execute) — does phaseSlug stay stable? | MED | MED | Compute slug at `start-phase` once; persist; never recompute mid-phase. |
| 6 | **Slug mutation via plan edit** — ROADMAP phase name changes between architect and execute → slug changes → orphaned artifacts | MED | LOW | Freeze slug at first start-phase. Document immutability invariant. |
| 7 | **manageRoadmap bypasses writePlanningFile** — direct fs write means new helper won't apply unless manageRoadmap also updated | MED | HIGH | Update manageRoadmap.ts to use `ROADMAP_PATH()` from helper. ROADMAP stays at root. |
| 8 | **repoCleanup flat-only scan** — capture files under phases/ won't be cleaned by `cleanup-artifacts` | MED | HIGH | Update `repo-cleanup.ts:165-166` to recurse `phases/*/` looking for `-capture-` patterns. |
| 9 | **finalize stragglers detector false positive** — runtime files (luca-state.json, lock, JSONL) at root must NOT trigger lock-hold | HIGH | HIGH | Whitelist runtime files explicitly. Define stragglers regex carefully (markdown phase artifacts only). |
| 10 | **Migration helper run during active pipeline** — moves files out from under in-flight phase | HIGH | MED | Migration helper acquires pipeline lock or refuses if active lock exists. |

### Failure Modes

- **phaseSlug missing in luca-state.json** (post-upgrade old run): consumers crash if they assume defined. Helper signature accepts `string | undefined` → falls back to root.
- **phaseSlug present but dir doesn't exist**: `phasePath()` calls `mkdirSync({recursive:true})` — non-issue.
- **User edits phaseSlug manually**: only impacts that one run; no cascade.
- **Symlinks / case-insensitive macOS FS**: lowercase slugs avoid case collisions.
- **Path containment**: `write-planning-file.ts:60-64` already uses `resolved.startsWith(planningDir+sep)` — extends naturally to phase dirs.

### Test Coverage Gaps

- Existing tests TBD — not yet inspected.
- **Need:** unit tests for new `phase-paths.ts` (slug derivation, path resolution, fallback behavior, sanitization).
- **Need:** integration tests for full pipeline with phaseSlug present.
- **Need:** finalize stragglers detector tests (whitelist correctness).

### Security Checklist

- ✅ Slug sanitization (alphanum+dash) prevents path traversal
- ✅ Existing containment check in writePlanningFile extends to phase subdirs
- ✅ Null byte rejection already in place
- ⚠ Migration helper: validate target slug before moving files (don't move into `..` or `/etc`)

### Empty-phase Handling

Finalize verification: scan `.planning/` root for **session artifact patterns** only (whitelist of filenames or extensions). Runtime files (luca-state.json, .luca-lock.json, *.jsonl) are explicitly cross-phase and excluded.

### Backward Compat Strategy

1. New runs: triage/start-phase computes phaseSlug → all phases use it
2. Old runs (state lacks phaseSlug): `phaseDir(undefined)` returns planningRoot → flat layout preserved → finalize uses lenient mode (skip stragglers check) when `phaseSlug` absent
3. Migration helper: separate one-shot CLI for users who want to retroactively organize stale `.planning/` content
