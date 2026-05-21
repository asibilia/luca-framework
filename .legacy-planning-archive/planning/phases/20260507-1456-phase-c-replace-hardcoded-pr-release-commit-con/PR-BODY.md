# feat(mastracode): v11.7.0 Phase C — PR/Release/Commit Conventions Consult Preferences

## Description

This PR replaces luca-framework-specific PR/release/commit conventions hardcoded in rules, skills, and instruction files with `projectPreferences.consult-section()` calls. The schema is extended additively with 9 new optional fields, all canonical preferences are seeded to `.planning/preferences.json`, and the foundational pattern is: **framework-distributed files ask for conventions at runtime; they never prescribe.**

## Closes

This phase completes the 3-todo project-preferences initiative:
- #26 Phase A: Foundation + tool + skill + sentinel
- #27 Phase B: Branching policy refactor (consult preferences for branch strategy)
- #28 Phase C: PR/release/commit conventions (this PR)

Combined into single atomic PR #230 to prevent broken intermediate states.

## Changes

### Schema Extension (additive, non-breaking)

**New optional fields in `ProjectPreferencesSchema`:**

**PrSection:**
- `titleTemplate?: string` — preferred format when present; `titleFormat` retained for backward compat
- `titleExamples?: string[]` — example titles conforming to template (max 5)
- `forbidden?: { pattern: RegexSource, reason: string }[]` — title patterns to reject (max 10)
- `bodyTemplate?: string` — PR description template
- `draftByDefault?: boolean` — open PRs as draft by default

**CommitsSection:**
- `types?: string[]` — allowed commit-message `type:` values (governs `type:` slot; distinct from `branching.types` which governs branch-name prefix)
- `trailers?: { coAuthor: boolean, issueRef: string }` — footer conventions
- `subjectMaxLength?: number` — max length for commit subject (20–200)

**TrackerSection:**
- `linkFormat?: string` — how to format issue references (e.g., `Closes #{issue}`)

### Prose Changes

**`rules/pr-title-format.md`** — consult `pr` + `tracker` sections; no hardcoded luca-framework scopes; graceful-degradation for non-tool modes

**`skills/gh-prepare/SKILL.md`** — single `consult` call; bump from `release.versionBump[type]`; `--draft` conditional on `pr.draftByDefault`

**`src/instructions/finalize.md`** — Step 5a added `consult-section(pr)`; Step 5b.3 title from prefs, issue ref from `tracker.linkFormat`

**`src/instructions/execute.md`** — Step 6 pre-commit added `consult-section(commits)`; trailers + types/scopes from prefs

**`commands/gh-pr-address.md`** — consultation ref added

### Seeding & MuninnDB

- `.planning/preferences.json` committed with canonical field names + extended fields
- Canonical MuninnDB memory evolved (ULID preserved)
- `plan` mode now registered with `['consult', 'consult-section']`

### Tests

- Extended schema roundtrip parse (all 9 new fields)
- New mode-coverage test (all modes have ≥consult-section)
- New no-luca-leak grep test (3 patterns, 19 files, 0 matches)

## Verification

| Criterion | Status |
|-----------|--------|
| Waves complete | ✅ PASS |
| Verification gate | ✅ PASS |
| tsc | ✅ PASS (0 errors) |
| bun test | ✅ PASS (206 tests) |
| Postmortem gate | ✅ PASS |
| Shadow scan | ✅ 0 findings |

## Review Summary

2 review iterations during execution; all MUST-FIX resolved; APPROVED on iteration 2.

## Known Limitations

- `{version}` token resolved at runtime via `recall` (documented in finalize.md Step 5a)
- Schema extension non-breaking; all new fields optional
- `consult-section(fallback: true)` returns schema defaults if unseeded

## Postmortem

See `.planning/phases/20260507-1456-phase-c-replace-hardcoded-pr-release-commit-con/POSTMORTEM.md`.
