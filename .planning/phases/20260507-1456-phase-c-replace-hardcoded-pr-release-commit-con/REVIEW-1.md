# Code Review — Wave 1 (Phase C closure)

**Date**: 2026-05-07
**Complexity**: COMPLEX
**Review Iteration**: 0 / 2

## Context

Phase C ("replace hardcoded PR/release/commit conventions with `projectPreferences.consult-section` calls; remove vault-resolution boilerplate") completed both planned waves. Verification result wave 3 (closure marker) is PASS, convergence resolved. This review is a final sanity audit before handing off to finalize.

Prior review iterations during execution already found and fixed:
- Wave 1 review: `luca-init/SKILL.md` corruption (write_file append bug) — fixed
- Wave 2 review: 4 MUST-FIX (gh-prepare destructuring, finalize body template, `{version}` token guidance, `--draft` conditional) + SHOULD-FIX cluster — all fixed

## Requirements Coverage

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Schema extended additively (9 new optional fields) | MET | `project-preferences.ts` PrSection/CommitsSection/TrackerSection extended; 29 schema tests pass |
| `plan` mode registered with consult/consult-section | MET | `tool-manifest.ts` + `preferences-mode-coverage.test.ts` (all modes covered) |
| `.planning/preferences.json` committed for luca-framework | MET | File tracked; `loadProjectPreferences()` returns extended payload |
| Canonical MuninnDB memory evolved (not re-created) | MET | `muninn_evolve` on `01KR1BMR4M1M6MR496C80KC6WS` preserves ULID + provenance |
| `pr-title-format.md` consults preferences (no hardcoded scopes) | MET | Rule body uses `consult-section(pr)` + `consult-section(tracker)`; plan-mode graceful-degradation present |
| `gh-prepare/SKILL.md` consults preferences for bump rules + draft | MET | Single `consult` call; bump from `release.versionBump`; `--draft` conditional on `pr.draftByDefault` |
| `finalize.md` title + body templates from preferences | MET | Step 5a/5b.3 use `prefs.titleTemplate ?? prefs.titleFormat`, `prefs.bodyTemplate`, `tracker.linkFormat` |
| `execute.md` pre-commit consults commits preferences | MET | Step 6 calls `consult-section(commits)` BEFORE type enumeration; `commits.types ?? branching.types` fallback; historical recall preserved |
| `commands/gh-pr-address.md` references commit conventions consultation | MET | Consultation ref added |
| No-leak grep test active | MET | `no-luca-leak.test.ts` scans 19 files, 3 anchored patterns, allowlists fixtures, passes |
| Permission-coverage test enforces all modes have ≥consult-section | MET | `preferences-mode-coverage.test.ts` (10 tests) |

## Automated Checks

| Check | Status |
|-------|--------|
| tsc | pass (0 errors) |
| bun-test | pass (0 errors, 206/206 tests per latest execute log) |
| convergence | resolved |

## Code Review Findings

### MUST-FIX (0)

None. All blocking issues from prior in-flight review iterations were resolved.

### SHOULD-FIX (1)

- **[dx]** `gh-prepare/SKILL.md` `{version}` token source guidance is implicit
  - File: `packages/luca-mastracode/skills/gh-prepare/SKILL.md` (Step 3 region)
  - The skill leaves `{version}` resolution to runtime recall ("recall release conventions") rather than spelling out: read from `package.json` `version` field, or compute from the changeset bump target. Acceptable because the mode reminder explicitly instructs the agent to recall release conventions before PR creation, and the package context makes the source unambiguous. Defer to a follow-up doc-polish todo if it surfaces in real PRs.

### NOTE (2)

- **[arch]** `consult` (no section) returns the full preferences object; `consult-section` returns one section. Both are now used in the codebase. Pattern is consistent — single consult when multiple sections are needed in one flow (gh-prepare), section-scoped when only one slice is used (rules, finalize Step 5a). Healthy.
- **[simplification]** `pr.titleFormat` retained alongside `pr.titleTemplate` for backward compat. Once all consumers migrate to `titleTemplate`, `titleFormat` can be deprecated. Tracked implicitly via JSDoc precedence note ("preferred when present").

## Verdict

**CLEAN**

Phase C achieves goal: all hardcoded luca-framework PR/release/commit conventions have been moved behind `projectPreferences.consult-section` calls. Schema extended additively. Canonical memory evolved in place. No-leak grep test active and passing. All tests green, tsc clean. Ready for finalize.
