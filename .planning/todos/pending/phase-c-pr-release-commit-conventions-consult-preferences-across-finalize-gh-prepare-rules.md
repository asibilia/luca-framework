---
title: "Phase C — PR / release / commit conventions: consult preferences across finalize, gh-prepare, rules"
area: pipeline
created: 2026-05-07
priority: high
source: design-discussion
---

## Task

Phase C — PR / release / commit conventions: consult preferences across finalize, gh-prepare, rules

## Goal

Remove luca-framework's release/PR/commit conventions from prescriptive code/rules/skills. Replace with consultations of `project_preferences.{pr,release,commits}` from MuninnDB. Ensures the framework doesn't leak its own conventions to consumer projects.

**Depends on Phase A** (foundation) and **Phase B** (validates the consult pattern works in practice).

## Background — The Leak

Audit found these luca-framework-specific conventions hardcoded:

- `packages/luca-mastracode/rules/pr-title-format.md:14-16` — title format `type(scope): <version> #issue description`, scopes `framework|mastracode|studio|config|docs|repo`. **Ships to every consumer of luca-mastracode**, forcing them to use luca-framework's release format.
- `packages/luca-mastracode/skills/gh-prepare/SKILL.md:100` — `feat → minor, fix/chore/refactor → patch` bump-level mapping. Prescriptive.
- `packages/luca-mastracode/skills/gh-prepare/SKILL.md:137` — PR title template hardcoded.
- `packages/luca-mastracode/src/instructions/finalize.md:298` — version+title format hardcoded.

## Deliverables

### 1. Rewrite `rules/pr-title-format.md`

Convert from prescriptive (current: dictates `feat|fix|...`, scopes, format) to **consultative** (always reads `projectPreferences.consult-section('pr')`). New body:

```
**Before creating any PR**, consult project preferences:

  projectPreferences.consult-section('pr')

Apply: pr.titleTemplate, pr.forbidden patterns, pr.scopeFromPackagePath logic.
Use pr.titleExamples to validate output format.

If preferences missing, invoke luca-init skill before proceeding.

**Never** create a PR without consulting preferences first.
```

No project-specific format anywhere in the rule. luca-framework's format remains in *its own* preferences memory, retrieved at runtime.

### 2. Update `gh-prepare` skill

`packages/luca-mastracode/skills/gh-prepare/SKILL.md` — replace hardcoded sections:

- Branch hygiene step: read `branching.fallback.template` from preferences (not hardcoded `<type>/<slug>`).
- Changeset bump: read `release.bumpMapping` (not hardcoded `feat→minor, fix→patch`).
- PR title: read `pr.titleTemplate` + `pr.titleExamples` (not hardcoded).
- PR body: read `pr.bodyTemplate` (not hardcoded "what-why-how-testplan").
- Draft default: read `pr.draftByDefault`.

Single `projectPreferences.consult` call at skill start, reuse across all sections.

### 3. Update `finalize.md` instructions

Replace ad-hoc release-conventions recall in steps 5a, 5b.1, 5b.2:

```
# Before:
mcp__muninn__muninn_recall(context: ["release checklist", "PR title format", ...])

# After:
projectPreferences.consult-section('pr')
projectPreferences.consult-section('release')
```

Remove duplicated vault-resolution boilerplate (`Vault from .planning/config.json → muninn.vault, fallback "default"`) — `projectPreferences` resolves vault internally.

### 4. Update `execute.md` pre-commit recall

Step 0 of executor wave (`execute.md:376-387`) currently does ad-hoc commit-conventions recall. Replace with:

```
projectPreferences.consult-section('commits')
```

Apply `commits.types`, `commits.scopes`, `commits.subjectMaxLength`, `commits.trailers` to the wave's commit messages.

### 5. Update `commands/gh-pr-address.md`

Line 128 references "conventional commit message" prescriptively. Replace with consultation reference.

### 6. Vault-resolution helper

Audit found 8+ duplicated occurrences of `Vault from .planning/config.json → muninn.vault, fallback "default"` boilerplate across instructions. After Phase C lands, all consultations go through `projectPreferences` which handles vault resolution internally. Remove the boilerplate from instructions where it's no longer needed (replaced by tool calls that handle it).

## Files Touched

- `packages/luca-mastracode/rules/pr-title-format.md` — rewrite
- `packages/luca-mastracode/skills/gh-prepare/SKILL.md` — consultative refactor
- `packages/luca-mastracode/src/instructions/finalize.md` — replace ad-hoc recalls
- `packages/luca-mastracode/src/instructions/execute.md` — replace pre-commit recall
- `packages/luca-mastracode/commands/gh-pr-address.md` — consultation ref
- `packages/luca-mastracode/commands/milestone-new.md` — audit for hardcoded conventions
- `packages/luca-mastracode/commands/repo-cleanup.md` — audit for hardcoded conventions

## Acceptance Criteria

1. No luca-framework-specific scopes (`framework|mastracode|studio|...`) appear anywhere in `rules/`, `skills/`, or `src/instructions/`. They live ONLY in luca-framework's preferences memory.
2. `rules/pr-title-format.md` works correctly when consumed by a project with totally different PR conventions (no leak).
3. `gh-prepare` skill produces correct PR title for luca-framework (matches existing `feat(scope): vX.Y.Z #N description` format) by reading from preferences, not hardcoded values.
4. Removing the seeded preferences memory and re-running gh-prepare triggers the auto-init skill (no silent fallback to luca-framework defaults).
5. Vault-resolution boilerplate count in instructions drops by ≥80%.
6. Pre-commit recall in `execute.md` uses structured `projectPreferences.consult-section('commits')` instead of free-form `muninn_recall`.

## Risk: Backward Compatibility

Existing repos using luca-framework that haven't seeded preferences will hit auto-init on first PR/commit. Mitigation: Phase A's auto-init flow is interactive and probes the repo to suggest sensible defaults, so existing repos get a smooth one-time setup rather than a hard break.

## Reference

- `01KR1BMR4M1M6MR496C80KC6WS` — luca-framework's seeded preferences (target schema)
